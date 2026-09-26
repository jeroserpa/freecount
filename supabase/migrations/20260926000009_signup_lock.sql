-- Private app for two people: once 2 accounts exist, the database refuses any new one
-- (independent of the "Allow new users to sign up" switch in the Supabase dashboard).
-- SQL tests can bypass it in their own transaction with: set local freecount.allow_extra_accounts = 'on'
-- (the auth service and the app cannot set this).

create function private.limit_accounts() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if coalesce(current_setting('freecount.allow_extra_accounts', true), '') <> 'on'
     and (select count(*) from auth.users) >= 2 then
    raise exception 'Sign-ups are closed: this Freecount already has its two accounts.'
      using errcode = 'P0001';
  end if;
  return new;
end $$;

revoke execute on function private.limit_accounts() from public, anon, authenticated;

create trigger limit_accounts before insert on auth.users
  for each row execute function private.limit_accounts();
