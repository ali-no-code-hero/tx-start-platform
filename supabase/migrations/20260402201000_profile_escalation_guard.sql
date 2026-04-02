-- Prevent non-admins from escalating role/location/email on their own profile via RLS updates.
create or replace function public.prevent_profile_escalation()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is not null
     and auth.uid() = new.id
     and not public.is_admin() then
    if new.role is distinct from old.role
       or new.location_id is distinct from old.location_id
       or new.email is distinct from old.email
       or new.id is distinct from old.id then
      raise exception 'Cannot change protected profile fields';
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists profiles_escalation_guard on public.profiles;
create trigger profiles_escalation_guard
  before update on public.profiles
  for each row
  execute function public.prevent_profile_escalation();
