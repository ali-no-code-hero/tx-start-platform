-- Load the current user's profile row without going through profiles RLS.
-- Avoids edge cases where PostgREST returns 0 rows even though a row exists (e.g. policy
-- interaction) and matches auth.uid() strictly inside a definer context.

create or replace function public.get_my_profile()
returns table (
  id uuid,
  email text,
  role public.user_role,
  location_id uuid,
  first_name text,
  last_name text
)
language sql
stable
security definer
set search_path = public
as $$
  select
    p.id,
    p.email,
    p.role,
    p.location_id,
    p.first_name,
    p.last_name
  from public.profiles p
  where p.id = auth.uid();
$$;

revoke all on function public.get_my_profile() from public;
grant execute on function public.get_my_profile() to authenticated;
