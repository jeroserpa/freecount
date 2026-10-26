-- Recurring expenses: "add automatically" and "notify" become independent.
-- - recurring_templates.notify: send a push when an occurrence is added (auto) or due (reminder).
-- - Entries created by the generator are flagged with a transaction-local setting so the push trigger
--   treats them as "added automatically" (both people notified) even when the generator runs inside a
--   user's request (process_recurring RPC), where auth.uid() is that user.

alter table public.recurring_templates add column notify boolean not null default true;

create or replace function private.process_household_recurring(p_household uuid, p_today date) returns int
language plpgsql security definer set search_path = '' as $$
declare
  t public.recurring_templates;
  v_count int := 0;
  v_guard int;
  v_closed boolean;
begin
  perform set_config('freecount.generating', 'on', true);
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
  perform set_config('freecount.generating', 'off', true);
  return v_count;
end $$;

create or replace function private.push_on_entry() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  v_cat record;
  v_what text;
  v_actor uuid := auth.uid();
  t public.recurring_templates;
begin
  if new.split_type = 'personal' then return null; end if;
  select name, emoji into v_cat from public.categories where id = new.category_id;
  v_what := coalesce(nullif(new.note, ''), v_cat.name, 'Expense');

  if coalesce(current_setting('freecount.generating', true), '') = 'on' or v_actor is null then
    -- Added automatically by a recurring template → both people, unless the template is silenced.
    select * into t from public.recurring_templates where id = new.recurring_template_id;
    if t.id is not null and not t.notify then return null; end if;
    perform private.push_notify(new.household_id, null, null,
      '🔁 ' || v_what || ' · ' || private.euros(new.amount_cents),
      'Recurring ' || case when new.kind = 'refund' then 'refund' else 'expense' end || ' added automatically',
      '/entry/' || new.id);
  else
    perform private.push_notify(new.household_id, v_actor, null,
      coalesce(v_cat.emoji || ' ', '') || private.display_name(v_actor)
        || case when new.kind = 'refund' then ' received ' else ' added ' end || private.euros(new.amount_cents),
      v_what,
      '/entry/' || new.id);
  end if;
  return null;
end $$;

create or replace function private.push_on_pending() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  t public.recurring_templates;
begin
  select * into t from public.recurring_templates where id = new.template_id;
  if not t.notify then return null; end if;
  perform private.push_notify(new.household_id, null,
    case when t.split_type = 'personal' then array[t.payer_id] else null end,
    '🔔 ' || coalesce(nullif(t.note, ''), 'Recurring expense') || ' is due',
    'Confirm the amount (last ' || private.euros(new.suggested_amount_cents) || ')',
    '/add?pending=' || new.id);
  return null;
end $$;

revoke execute on function private.process_household_recurring(uuid, date), private.push_on_entry(),
  private.push_on_pending() from public, anon, authenticated;
