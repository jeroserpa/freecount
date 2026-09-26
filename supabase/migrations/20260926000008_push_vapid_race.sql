-- Two first-use requests may try to store the VAPID keys at the same time: the loser keeps the winner's keys.
create or replace function public.push_store_vapid(p_public text, p_private text) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if not exists (select 1 from vault.secrets where name = 'push_vapid_public') then
    perform vault.create_secret(p_public, 'push_vapid_public', 'Web Push VAPID public key');
    perform vault.create_secret(p_private, 'push_vapid_private', 'Web Push VAPID private key');
  end if;
exception when unique_violation then
  null;
end $$;

revoke execute on function public.push_store_vapid(text, text) from public, anon, authenticated;
grant execute on function public.push_store_vapid(text, text) to service_role;
