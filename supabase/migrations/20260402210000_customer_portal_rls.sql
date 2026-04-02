-- Customer portal: RLS for linked auth users + signup link from invite metadata

-- ---------------------------------------------------------------------------
-- Resolve CRM customer row for the signed-in portal user
-- ---------------------------------------------------------------------------
create or replace function public.my_customer_id()
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select c.id
  from public.customers c
  where c.auth_user_id = auth.uid()
  limit 1;
$$;

revoke all on function public.my_customer_id() from public;
grant execute on function public.my_customer_id() to authenticated;

-- ---------------------------------------------------------------------------
-- Link invited customer to auth user (metadata.customer_id on invite)
-- ---------------------------------------------------------------------------
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  loc uuid;
  role_text text;
  cust_id uuid;
begin
  begin
    loc := nullif(trim(new.raw_user_meta_data->>'location_id'), '')::uuid;
  exception
    when others then
      loc := null;
  end;

  role_text := lower(coalesce(new.raw_user_meta_data->>'role', 'staff'));

  insert into public.profiles (id, email, role, location_id, first_name, last_name)
  values (
    new.id,
    coalesce(new.email, ''),
    case role_text
      when 'admin' then 'admin'::public.user_role
      when 'customer' then 'customer'::public.user_role
      else 'staff'::public.user_role
    end,
    case when role_text = 'customer' then null else loc end,
    nullif(new.raw_user_meta_data->>'first_name', ''),
    nullif(new.raw_user_meta_data->>'last_name', '')
  );

  if role_text = 'customer' then
    begin
      cust_id := nullif(trim(new.raw_user_meta_data->>'customer_id'), '')::uuid;
      if cust_id is not null then
        update public.customers
        set auth_user_id = new.id
        where id = cust_id
          and auth_user_id is null;
      end if;
    exception
      when others then
        null;
    end;
  end if;

  return new;
end;
$$;

-- ---------------------------------------------------------------------------
-- applications: customers see only their own
-- ---------------------------------------------------------------------------
create policy applications_customer_select
  on public.applications for select
  to authenticated
  using (
    customer_id is not null
    and customer_id = public.my_customer_id()
  );

-- ---------------------------------------------------------------------------
-- customers: portal user reads/updates own row
-- ---------------------------------------------------------------------------
create policy customers_customer_select_self
  on public.customers for select
  to authenticated
  using (auth_user_id = auth.uid());

create policy customers_customer_update_self
  on public.customers for update
  to authenticated
  using (auth_user_id = auth.uid())
  with check (auth_user_id = auth.uid());

-- ---------------------------------------------------------------------------
-- comments / comms log: read-only for portal customers
-- ---------------------------------------------------------------------------
create policy comments_customer_select
  on public.comments for select
  to authenticated
  using (
    exists (
      select 1 from public.applications a
      join public.customers cu on cu.id = a.customer_id
      where a.id = comments.application_id
        and cu.auth_user_id = auth.uid()
    )
  );

create policy emails_customer_select
  on public.application_emails for select
  to authenticated
  using (
    exists (
      select 1 from public.applications a
      join public.customers cu on cu.id = a.customer_id
      where a.id = application_emails.application_id
        and cu.auth_user_id = auth.uid()
    )
  );

create policy sms_customer_select
  on public.application_sms for select
  to authenticated
  using (
    exists (
      select 1 from public.applications a
      join public.customers cu on cu.id = a.customer_id
      where a.id = application_sms.application_id
        and cu.auth_user_id = auth.uid()
    )
  );

-- ---------------------------------------------------------------------------
-- profiles: customers may load staff names shown on their activity timeline
-- ---------------------------------------------------------------------------
create policy profiles_customer_select_activity_authors
  on public.profiles for select
  to authenticated
  using (
    exists (
      select 1 from public.profiles me
      where me.id = auth.uid() and me.role = 'customer'::public.user_role
    )
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
