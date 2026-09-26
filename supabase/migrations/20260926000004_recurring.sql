-- M3: recurring expenses (templates, reminders, daily generation).

create table public.recurring_templates (
  id                 uuid primary key default gen_random_uuid(),
  household_id       uuid not null references public.households (id) on delete cascade,
  kind               text not null default 'expense' check (kind in ('expense', 'refund')),
  amount_cents       bigint not null check (amount_cents > 0),
  payer_id           uuid not null references public.profiles (id),
  category_id        uuid references public.categories (id) on delete set null,
  note               text not null default '',
  split_type         text not null default 'shared'
                       check (split_type in ('personal', 'shared', 'custom', 'for_other')),
  payer_share_cents  bigint,
  frequency          text not null check (frequency in ('weekly', 'monthly', 'yearly')),
  every              int  not null default 1 check (every between 1 and 52),
  mode               text not null default 'auto' check (mode in ('auto', 'reminder')),
  start_date         date not null,            -- anchor of the schedule
  end_date           date,                     -- optional last date
  occurrences        int  not null default 0,  -- occurrences already generated since start_date
  next_due           date not null,            -- maintained by trigger
  paused             boolean not null default false,
  created_by         uuid not null default auth.uid() references public.profiles (id),
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now(),
  constraint template_custom_share_valid check (
    (split_type = 'custom' and payer_share_cents between 0 and amount_cents)
    or (split_type <> 'custom' and payer_share_cents is null)
  ),
  check (end_date is null or end_date >= start_date)
);
create index on public.recurring_templates (household_id, next_due);
create index on public.recurring_templates (payer_id);
create index on public.recurring_templates (category_id);
create index on public.recurring_templates (created_by);

alter table public.entries
  add column recurring_template_id uuid references public.recurring_templates (id) on delete set null;
create index on public.entries (recurring_template_id);

-- Reminders waiting for the real amount (mode = 'reminder', or 'auto' falling inside a closed month).
create table public.pending_recurring (
  id                      uuid primary key default gen_random_uuid(),
  household_id            uuid not null references public.households (id) on delete cascade,
  template_id             uuid not null references public.recurring_templates (id) on delete cascade,
  due_date                date not null,
  suggested_amount_cents  bigint not null,
  status                  text not null default 'pending' check (status in ('pending', 'done', 'skipped')),
  entry_id                uuid references public.entries (id) on delete set null,
  created_at              timestamptz not null default now(),
  unique (template_id, due_date)
);
create index on public.pending_recurring (household_id, status);
create index on public.pending_recurring (entry_id);

-- ─── Schedule math ──────────────────────────────────────────

-- Date of occurrence number n (0 = start). Month arithmetic clamps to month end (Jan 31 + 1 month = Feb 28),
-- and is always computed from the start so a 31st doesn't drift to the 28th forever.
create function private.recurring_occurrence(p_start date, p_frequency text, p_every int, p_n int) returns date
language sql immutable set search_path = '' as $$
  select case p_frequency
    when 'weekly'  then p_start + (p_n * p_every * 7)
    when 'monthly' then (p_start + make_interval(months => p_n * p_every))::date
    when 'yearly'  then (p_start + make_interval(years => p_n * p_every))::date
  end
$$;

create function private.recurring_set_next_due() returns trigger
language plpgsql set search_path = '' as $$
begin
  new.next_due = private.recurring_occurrence(new.start_date, new.frequency, new.every, new.occurrences);
  new.updated_at = now();
  return new;
end $$;

create trigger recurring_templates_next_due
  before insert or update on public.recurring_templates
  for each row execute function private.recurring_set_next_due();

-- ─── Generation ─────────────────────────────────────────────

create function private.process_household_recurring(p_household uuid, p_today date) returns int
language plpgsql security definer set search_path = '' as $$
declare
  t public.recurring_templates;
  v_count int := 0;
  v_guard int;
  v_closed boolean;
begin
  for t in
    select * from public.recurring_templates
    where household_id = p_household and not paused and next_due <= p_today
      and (end_date is null or next_due <= end_date)
    for update skip locked
  loop
    v_guard := 0;
    while t.next_due <= p_today and (t.end_date is null or t.next_due <= t.end_date) and v_guard < 500 loop
      v_closed := t.split_type <> 'personal' and exists (
        select 1 from public.periods
        where household_id = t.household_id and month = date_trunc('month', t.next_due)::date
      );
      if t.mode = 'auto' and not v_closed then
        insert into public.entries (household_id, kind, amount_cents, date, payer_id, category_id, note,
                                    split_type, payer_share_cents, recurring_template_id, created_by)
        values (t.household_id, t.kind, t.amount_cents, t.next_due, t.payer_id, t.category_id, t.note,
                t.split_type, t.payer_share_cents, t.id, t.created_by);
      else
        insert into public.pending_recurring (household_id, template_id, due_date, suggested_amount_cents)
        values (t.household_id, t.id, t.next_due, t.amount_cents)
        on conflict (template_id, due_date) do nothing;
      end if;
      v_count := v_count + 1;
      v_guard := v_guard + 1;
      t.occurrences := t.occurrences + 1;
      t.next_due := private.recurring_occurrence(t.start_date, t.frequency, t.every, t.occurrences);
    end loop;
    update public.recurring_templates set occurrences = t.occurrences where id = t.id;
  end loop;
  return v_count;
end $$;

-- Called by the app on start. The client passes its local date; it is clamped to ±1 day of the server's.
create function public.process_recurring(p_today date default current_date) returns int
language plpgsql security definer set search_path = '' as $$
declare
  v_household uuid := private.my_household_id();
begin
  if v_household is null then return 0; end if;
  return private.process_household_recurring(
    v_household, least(greatest(p_today, current_date - 1), current_date + 1));
end $$;

-- Called daily by pg_cron for every household.
create function private.process_all_recurring() returns int
language plpgsql security definer set search_path = '' as $$
declare
  h uuid;
  v_total int := 0;
begin
  for h in select id from public.households loop
    v_total := v_total + private.process_household_recurring(h, current_date);
  end loop;
  return v_total;
end $$;

revoke execute on function private.recurring_occurrence(date, text, int, int), private.recurring_set_next_due(),
  private.process_household_recurring(uuid, date), private.process_all_recurring() from public, anon, authenticated;
revoke execute on function public.process_recurring(date) from public, anon;
grant execute on function public.process_recurring(date) to authenticated;

-- ─── RLS ────────────────────────────────────────────────────

alter table public.recurring_templates enable row level security;
alter table public.pending_recurring enable row level security;

-- Same privacy as entries: personal templates are visible only to their payer.
create policy "read templates" on public.recurring_templates
  for select to authenticated
  using (household_id = (select private.my_household_id())
         and (split_type <> 'personal' or payer_id = (select auth.uid())));
create policy "insert templates" on public.recurring_templates
  for insert to authenticated
  with check (household_id = (select private.my_household_id())
              and private.is_household_member(payer_id, household_id)
              and (split_type <> 'personal' or payer_id = (select auth.uid())));
create policy "update templates" on public.recurring_templates
  for update to authenticated
  using (household_id = (select private.my_household_id())
         and (split_type <> 'personal' or payer_id = (select auth.uid())))
  with check (household_id = (select private.my_household_id())
              and private.is_household_member(payer_id, household_id)
              and (split_type <> 'personal' or payer_id = (select auth.uid())));
create policy "delete templates" on public.recurring_templates
  for delete to authenticated
  using (household_id = (select private.my_household_id())
         and (split_type <> 'personal' or payer_id = (select auth.uid())));

-- Pending reminders follow the visibility of their template (RLS applies inside the subquery).
create policy "pending via template" on public.pending_recurring
  for all to authenticated
  using (household_id = (select private.my_household_id())
         and exists (select 1 from public.recurring_templates t where t.id = template_id))
  with check (household_id = (select private.my_household_id())
              and exists (select 1 from public.recurring_templates t where t.id = template_id));

alter publication supabase_realtime add table public.recurring_templates, public.pending_recurring;

-- ─── Daily job ──────────────────────────────────────────────
create extension if not exists pg_cron with schema pg_catalog;
grant usage on schema cron to postgres;
select cron.schedule('process-recurring', '0 3 * * *', $$select private.process_all_recurring()$$);
