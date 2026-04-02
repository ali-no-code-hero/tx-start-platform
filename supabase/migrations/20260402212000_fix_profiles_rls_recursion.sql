-- Fix "infinite recursion detected in policy for relation profiles".
-- Any RLS expression that scans public.profiles as the session user re-enters profiles
-- policies. Use SECURITY DEFINER helpers (same pattern as is_admin / current_staff_location_id)
-- or compare location to current_staff_location_id() instead of joining profiles.

-- ---------------------------------------------------------------------------
-- Helpers (bypass RLS when reading profiles for auth checks)
-- ---------------------------------------------------------------------------
create or replace function public.auth_is_staff()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.profiles p
    where p.id = auth.uid() and p.role = 'staff'::public.user_role
  );
$$;

revoke all on function public.auth_is_staff() from public;
grant execute on function public.auth_is_staff() to authenticated;

create or replace function public.auth_is_customer()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.profiles p
    where p.id = auth.uid() and p.role = 'customer'::public.user_role
  );
$$;

revoke all on function public.auth_is_customer() from public;
grant execute on function public.auth_is_customer() to authenticated;

-- ---------------------------------------------------------------------------
-- profiles: remove self-referential EXISTS subqueries
-- ---------------------------------------------------------------------------
drop policy if exists profiles_select on public.profiles;

create policy profiles_select
  on public.profiles for select
  to authenticated
  using (
    id = auth.uid()
    or public.is_admin()
    or (
      public.auth_is_staff()
      and role in ('admin'::public.user_role, 'staff'::public.user_role)
    )
  );

drop policy if exists profiles_customer_select_activity_authors on public.profiles;

create policy profiles_customer_select_activity_authors
  on public.profiles for select
  to authenticated
  using (
    public.auth_is_customer()
    and (
      id in (
        select c.user_id from public.comments c
        inner join public.applications a on a.id = c.application_id
        inner join public.customers cu on cu.id = a.customer_id
        where cu.auth_user_id = auth.uid()
      )
      or id in (
        select e.sent_by_user_id from public.application_emails e
        inner join public.applications a on a.id = e.application_id
        inner join public.customers cu on cu.id = a.customer_id
        where cu.auth_user_id = auth.uid()
          and e.sent_by_user_id is not null
      )
      or id in (
        select s.sent_by_user_id from public.application_sms s
        inner join public.applications a on a.id = s.application_id
        inner join public.customers cu on cu.id = a.customer_id
        where cu.auth_user_id = auth.uid()
          and s.sent_by_user_id is not null
      )
    )
  );

-- ---------------------------------------------------------------------------
-- Staff scoping: use current_staff_location_id() instead of joining profiles
-- ---------------------------------------------------------------------------
drop policy if exists customers_staff_select on public.customers;
create policy customers_staff_select
  on public.customers for select
  to authenticated
  using (
    exists (
      select 1 from public.applications a
      where a.customer_id = customers.id
        and a.location_id is not null
        and a.location_id = public.current_staff_location_id()
    )
  );

drop policy if exists customers_staff_update on public.customers;
create policy customers_staff_update
  on public.customers for update
  to authenticated
  using (
    exists (
      select 1 from public.applications a
      where a.customer_id = customers.id
        and a.location_id is not null
        and a.location_id = public.current_staff_location_id()
    )
  )
  with check (true);

drop policy if exists applications_staff_select on public.applications;
create policy applications_staff_select
  on public.applications for select
  to authenticated
  using (
    public.current_staff_location_id() is not null
    and applications.location_id is not null
    and applications.location_id = public.current_staff_location_id()
  );

drop policy if exists applications_staff_update on public.applications;
create policy applications_staff_update
  on public.applications for update
  to authenticated
  using (
    public.current_staff_location_id() is not null
    and applications.location_id is not null
    and applications.location_id = public.current_staff_location_id()
  )
  with check (
    public.current_staff_location_id() is not null
    and applications.location_id is not null
    and applications.location_id = public.current_staff_location_id()
  );

drop policy if exists comments_staff_select on public.comments;
create policy comments_staff_select
  on public.comments for select
  to authenticated
  using (
    exists (
      select 1 from public.applications a
      where a.id = comments.application_id
        and a.location_id is not null
        and a.location_id = public.current_staff_location_id()
    )
  );

drop policy if exists comments_staff_insert on public.comments;
create policy comments_staff_insert
  on public.comments for insert
  to authenticated
  with check (
    user_id = auth.uid()
    and exists (
      select 1 from public.applications a
      where a.id = comments.application_id
        and a.location_id is not null
        and a.location_id = public.current_staff_location_id()
    )
  );

drop policy if exists emails_staff_select on public.application_emails;
create policy emails_staff_select
  on public.application_emails for select
  to authenticated
  using (
    exists (
      select 1 from public.applications a
      where a.id = application_emails.application_id
        and a.location_id is not null
        and a.location_id = public.current_staff_location_id()
    )
  );

drop policy if exists emails_staff_insert on public.application_emails;
create policy emails_staff_insert
  on public.application_emails for insert
  to authenticated
  with check (
    sent_by_user_id = auth.uid()
    and sent_by_user_id is not null
    and exists (
      select 1 from public.applications a
      where a.id = application_emails.application_id
        and a.location_id is not null
        and a.location_id = public.current_staff_location_id()
    )
  );

drop policy if exists sms_staff_select on public.application_sms;
create policy sms_staff_select
  on public.application_sms for select
  to authenticated
  using (
    exists (
      select 1 from public.applications a
      where a.id = application_sms.application_id
        and a.location_id is not null
        and a.location_id = public.current_staff_location_id()
    )
  );

drop policy if exists sms_staff_insert on public.application_sms;
create policy sms_staff_insert
  on public.application_sms for insert
  to authenticated
  with check (
    sent_by_user_id = auth.uid()
    and sent_by_user_id is not null
    and exists (
      select 1 from public.applications a
      where a.id = application_sms.application_id
        and a.location_id is not null
        and a.location_id = public.current_staff_location_id()
    )
  );
