-- Move RLS helper functions out of the exposed `public` API schema.
-- (create_household / join_household stay public on purpose: they are the onboarding RPCs.)

create schema if not exists private;
grant usage on schema private to authenticated;

alter function public.my_household_id() set schema private;
alter function public.is_household_member(uuid, uuid) set schema private;

-- Policies reference the functions by OID, so they follow the move automatically.
