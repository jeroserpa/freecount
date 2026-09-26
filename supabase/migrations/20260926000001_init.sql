-- Freecount — initial schema (M1)
-- Money is always stored as integer cents (bigint).

-- ─────────────────────────────────────────────────────────────
-- Tables
-- ─────────────────────────────────────────────────────────────

create table public.households (
  id           uuid primary key default gen_random_uuid(),
  name         text not null default 'Home',
  invite_code  text not null unique default upper(substr(md5(gen_random_uuid()::text), 1, 6)),
  ratio_mode   text not null default 'equal' check (ratio_mode in ('equal', 'income', 'fixed')),
  fixed_ratio  numeric(5,4) check (fixed_ratio between 0 and 1),
  created_at   timestamptz not null default now()
);

create table public.profiles (
  id                             uuid primary key references auth.users (id) on delete cascade,
  household_id                   uuid references public.households (id) on delete set null,
  display_name                   text not null default '',
  emoji                          text not null default '🙂',
  reference_monthly_income_cents bigint not null default 0 check (reference_monthly_income_cents >= 0),
  created_at                     timestamptz not null default now()
);
create index on public.profiles (household_id);

create table public.categories (
  id                   uuid primary key default gen_random_uuid(),
  household_id         uuid not null references public.households (id) on delete cascade,
  name                 text not null check (length(name) between 1 and 40),
  emoji                text not null default '📦',
  color                text not null default '#64748b',
  sort_order           int  not null default 0,
  monthly_budget_cents bigint check (monthly_budget_cents >= 0),
  archived             boolean not null default false,
  created_at           timestamptz not null default now()
);
create index on public.categories (household_id);

create table public.entries (
  id                 uuid primary key default gen_random_uuid(),  -- client may supply (offline, idempotent)
  household_id       uuid not null references public.households (id) on delete cascade,
  kind               text not null default 'expense' check (kind in ('expense', 'refund')),
  amount_cents       bigint not null check (amount_cents > 0),
  date               date not null default current_date,
  payer_id           uuid not null references public.profiles (id),  -- for a refund: who received the money
  category_id        uuid references public.categories (id) on delete set null,
  note               text not null default '',
  split_type         text not null default 'shared'
                       check (split_type in ('personal', 'shared', 'custom', 'for_other')),
  payer_share_cents  bigint,  -- custom only: part of the amount borne by the payer
  created_by         uuid not null default auth.uid() references public.profiles (id),
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now(),
  constraint custom_share_valid check (
    (split_type = 'custom' and payer_share_cents between 0 and amount_cents)
    or (split_type <> 'custom' and payer_share_cents is null)
  )
);
create index on public.entries (household_id, date desc);
create index on public.entries (category_id);
create index on public.entries (payer_id);

create table public.settlements (
  id            uuid primary key default gen_random_uuid(),
  household_id  uuid not null references public.households (id) on delete cascade,
  from_id       uuid not null references public.profiles (id),
  to_id         uuid not null references public.profiles (id),
  amount_cents  bigint not null check (amount_cents > 0),
  date          date not null default current_date,
  note          text not null default '',
  created_by    uuid not null default auth.uid() references public.profiles (id),
  created_at    timestamptz not null default now(),
  check (from_id <> to_id)
);
create index on public.settlements (household_id, date desc);

-- ─────────────────────────────────────────────────────────────
-- Helpers
-- ─────────────────────────────────────────────────────────────

-- Household of the calling user (security definer to avoid RLS recursion on profiles).
create function public.my_household_id() returns uuid
language sql stable security definer set search_path = '' as $$
  select household_id from public.profiles where id = auth.uid()
$$;

create function public.is_household_member(p_profile uuid, p_household uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.profiles where id = p_profile and household_id = p_household)
$$;

-- Create a profile row for every new auth user.
create function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  insert into public.profiles (id, display_name)
  values (new.id, coalesce(new.raw_user_meta_data ->> 'display_name', split_part(new.email, '@', 1)));
  return new;
end $$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

create function public.touch_updated_at() returns trigger
language plpgsql set search_path = '' as $$
begin
  new.updated_at = now();
  return new;
end $$;

create trigger entries_touch before update on public.entries
  for each row execute function public.touch_updated_at();

-- ─────────────────────────────────────────────────────────────
-- Household onboarding (RPC)
-- ─────────────────────────────────────────────────────────────

create function public.create_household(p_name text default 'Home') returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  v_household uuid;
begin
  if auth.uid() is null then raise exception 'not authenticated'; end if;
  if (select household_id from public.profiles where id = auth.uid()) is not null then
    raise exception 'already in a household';
  end if;

  insert into public.households (name) values (coalesce(nullif(trim(p_name), ''), 'Home'))
  returning id into v_household;

  update public.profiles set household_id = v_household where id = auth.uid();

  insert into public.categories (household_id, name, emoji, color, sort_order) values
    (v_household, 'Groceries',   '🛒', '#16a34a', 1),
    (v_household, 'Rent',        '🏠', '#2563eb', 2),
    (v_household, 'Utilities',   '💡', '#eab308', 3),
    (v_household, 'Restaurants', '🍽️', '#ea580c', 4),
    (v_household, 'Transport',   '🚆', '#0891b2', 5),
    (v_household, 'Leisure',     '🎉', '#db2777', 6),
    (v_household, 'Health',      '🏥', '#dc2626', 7),
    (v_household, 'Household',   '🧴', '#7c3aed', 8),
    (v_household, 'Gifts',       '🎁', '#c026d3', 9),
    (v_household, 'Travel',      '✈️', '#0d9488', 10),
    (v_household, 'Refunds',     '↩️', '#65a30d', 11),
    (v_household, 'Other',       '📦', '#64748b', 12);

  return v_household;
end $$;

create function public.join_household(p_code text) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  v_household uuid;
begin
  if auth.uid() is null then raise exception 'not authenticated'; end if;
  if (select household_id from public.profiles where id = auth.uid()) is not null then
    raise exception 'already in a household';
  end if;

  select id into v_household from public.households where invite_code = upper(trim(p_code));
  if v_household is null then raise exception 'invalid invite code'; end if;

  if (select count(*) from public.profiles where household_id = v_household) >= 2 then
    raise exception 'household is full';
  end if;

  update public.profiles set household_id = v_household where id = auth.uid();
  return v_household;
end $$;

revoke execute on function public.create_household(text), public.join_household(text) from public, anon;
grant  execute on function public.create_household(text), public.join_household(text) to authenticated;
revoke execute on function public.handle_new_user(), public.touch_updated_at() from public, anon, authenticated;
revoke execute on function public.my_household_id(), public.is_household_member(uuid, uuid) from public, anon;
grant  execute on function public.my_household_id(), public.is_household_member(uuid, uuid) to authenticated;

-- ─────────────────────────────────────────────────────────────
-- Row Level Security
-- ─────────────────────────────────────────────────────────────

alter table public.households  enable row level security;
alter table public.profiles    enable row level security;
alter table public.categories  enable row level security;
alter table public.entries     enable row level security;
alter table public.settlements enable row level security;

-- households: members can read & update their own household
create policy "members read household" on public.households
  for select to authenticated using (id = (select public.my_household_id()));
create policy "members update household" on public.households
  for update to authenticated using (id = (select public.my_household_id()))
  with check (id = (select public.my_household_id()));

-- profiles: see yourself and your household members; edit only yourself (household changes go through RPCs)
create policy "read own and household profiles" on public.profiles
  for select to authenticated
  using (id = (select auth.uid()) or household_id = (select public.my_household_id()));
create policy "update own profile" on public.profiles
  for update to authenticated using (id = (select auth.uid()))
  with check (id = (select auth.uid()) and household_id is not distinct from (select public.my_household_id()));

-- categories: full access within household
create policy "household categories" on public.categories
  for all to authenticated
  using (household_id = (select public.my_household_id()))
  with check (household_id = (select public.my_household_id()));

-- entries: household-scoped; personal entries are private to their payer
create policy "read entries" on public.entries
  for select to authenticated
  using (household_id = (select public.my_household_id())
         and (split_type <> 'personal' or payer_id = (select auth.uid())));
create policy "insert entries" on public.entries
  for insert to authenticated
  with check (household_id = (select public.my_household_id())
              and public.is_household_member(payer_id, household_id)
              and (split_type <> 'personal' or payer_id = (select auth.uid())));
create policy "update entries" on public.entries
  for update to authenticated
  using (household_id = (select public.my_household_id())
         and (split_type <> 'personal' or payer_id = (select auth.uid())))
  with check (household_id = (select public.my_household_id())
              and public.is_household_member(payer_id, household_id)
              and (split_type <> 'personal' or payer_id = (select auth.uid())));
create policy "delete entries" on public.entries
  for delete to authenticated
  using (household_id = (select public.my_household_id())
         and (split_type <> 'personal' or payer_id = (select auth.uid())));

-- settlements: full access within household, both parties must be members
create policy "household settlements" on public.settlements
  for all to authenticated
  using (household_id = (select public.my_household_id()))
  with check (household_id = (select public.my_household_id())
              and public.is_household_member(from_id, household_id)
              and public.is_household_member(to_id, household_id));

-- ─────────────────────────────────────────────────────────────
-- Realtime
-- ─────────────────────────────────────────────────────────────
alter publication supabase_realtime add table public.entries, public.settlements, public.categories;
