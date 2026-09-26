-- M6: yearly income adjustment.
-- Recomputes a year's "shared" entries with the ratio of the yearly incomes, compared with the monthly ratios
-- that were used; the difference is added to the balance.

create table public.yearly_adjustments (
  household_id      uuid not null references public.households (id) on delete cascade,
  year              int  not null check (year between 2000 and 2100),
  profile_a_id      uuid not null references public.profiles (id),
  profile_b_id      uuid not null references public.profiles (id),
  income_a_cents    bigint not null check (income_a_cents >= 0),
  income_b_cents    bigint not null check (income_b_cents >= 0),
  share_a           numeric(9, 8) not null check (share_a between 0 and 1),
  adjustment_cents  bigint not null,  -- signed: > 0 means B owes A
  created_by        uuid not null default auth.uid() references public.profiles (id),
  created_at        timestamptz not null default now(),
  primary key (household_id, year),
  check (profile_a_id <> profile_b_id)
);
create index on public.yearly_adjustments (profile_a_id);
create index on public.yearly_adjustments (profile_b_id);
create index on public.yearly_adjustments (created_by);

alter table public.yearly_adjustments enable row level security;

create policy "household yearly adjustments" on public.yearly_adjustments
  for all to authenticated
  using (household_id = (select private.my_household_id()))
  with check (household_id = (select private.my_household_id())
              and private.is_household_member(profile_a_id, household_id)
              and private.is_household_member(profile_b_id, household_id));

alter publication supabase_realtime add table public.yearly_adjustments;
