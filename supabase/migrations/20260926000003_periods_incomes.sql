-- M2: monthly incomes, closed periods (months), split ratio settings.

-- Fixed ratio: `fixed_ratio` is the share borne by `fixed_ratio_profile_id`.
alter table public.households
  add column fixed_ratio_profile_id uuid references public.profiles (id) on delete set null;

-- Net income per person per month (first day of month).
create table public.monthly_incomes (
  household_id  uuid not null references public.households (id) on delete cascade,
  profile_id    uuid not null references public.profiles (id) on delete cascade,
  month         date not null check (extract(day from month) = 1),
  income_cents  bigint not null check (income_cents >= 0),
  updated_at    timestamptz not null default now(),
  primary key (profile_id, month)
);
create index on public.monthly_incomes (household_id, month);

-- A row = the month is closed, with the ratio snapshot used for its "shared" entries.
-- Reopening a month deletes its row.
create table public.periods (
  household_id    uuid not null references public.households (id) on delete cascade,
  month           date not null check (extract(day from month) = 1),
  ratio_mode      text not null check (ratio_mode in ('equal', 'income', 'fixed')),
  profile_a_id    uuid not null references public.profiles (id),
  profile_b_id    uuid not null references public.profiles (id),
  share_a         numeric(9, 8) not null check (share_a between 0 and 1),
  income_a_cents  bigint,
  income_b_cents  bigint,
  estimated       boolean not null default false,
  closed_at       timestamptz not null default now(),
  closed_by       uuid not null default auth.uid() references public.profiles (id),
  primary key (household_id, month),
  check (profile_a_id <> profile_b_id)
);
create index on public.periods (profile_a_id);
create index on public.periods (profile_b_id);
create index on public.periods (closed_by);

-- ─── Lock closed months ─────────────────────────────────────

create function private.assert_month_open(p_household uuid, p_date date) returns void
language plpgsql stable security definer set search_path = '' as $$
begin
  if exists (
    select 1 from public.periods
    where household_id = p_household and month = date_trunc('month', p_date)::date
  ) then
    raise exception 'The month % is closed. Reopen it to make changes.', to_char(p_date, 'YYYY-MM');
  end if;
end $$;

-- Entries that affect the balance cannot change inside a closed month.
-- Personal entries are not part of the balance, so they stay editable.
create function private.entries_lock() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if tg_op in ('UPDATE', 'DELETE') and old.split_type <> 'personal' then
    perform private.assert_month_open(old.household_id, old.date);
  end if;
  if tg_op in ('INSERT', 'UPDATE') then
    if new.split_type <> 'personal' then
      perform private.assert_month_open(new.household_id, new.date);
    end if;
    return new;
  end if;
  return old;
end $$;

create trigger entries_lock before insert or update or delete on public.entries
  for each row execute function private.entries_lock();

create function private.incomes_lock() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if tg_op in ('UPDATE', 'DELETE') then
    perform private.assert_month_open(old.household_id, old.month);
  end if;
  if tg_op in ('INSERT', 'UPDATE') then
    perform private.assert_month_open(new.household_id, new.month);
    new.updated_at = now();
    return new;
  end if;
  return old;
end $$;

create trigger monthly_incomes_lock before insert or update or delete on public.monthly_incomes
  for each row execute function private.incomes_lock();

revoke execute on function private.assert_month_open(uuid, date), private.entries_lock(), private.incomes_lock()
  from public, anon, authenticated;

-- ─── RLS ────────────────────────────────────────────────────

alter table public.monthly_incomes enable row level security;
alter table public.periods enable row level security;

create policy "household incomes" on public.monthly_incomes
  for all to authenticated
  using (household_id = (select private.my_household_id()))
  with check (household_id = (select private.my_household_id())
              and private.is_household_member(profile_id, household_id));

create policy "household periods" on public.periods
  for all to authenticated
  using (household_id = (select private.my_household_id()))
  with check (household_id = (select private.my_household_id())
              and private.is_household_member(profile_a_id, household_id)
              and private.is_household_member(profile_b_id, household_id));

-- households: fixed_ratio_profile_id must be a member
alter policy "members update household" on public.households
  with check (id = (select private.my_household_id())
              and (fixed_ratio_profile_id is null or private.is_household_member(fixed_ratio_profile_id, id)));

alter publication supabase_realtime add table public.monthly_incomes, public.periods, public.households, public.profiles;
