-- Texas Star Loan CRM — initial schema, RLS, seeds

create extension if not exists "pgcrypto";

-- ---------------------------------------------------------------------------
-- Enums
-- ---------------------------------------------------------------------------
create type public.user_role as enum ('admin', 'staff', 'customer');
create type public.application_status as enum (
  'Pending',
  'Confirmed',
  'Rejected',
  'Declined',
  'Loaned'
);

-- ---------------------------------------------------------------------------
-- Tables
-- ---------------------------------------------------------------------------
create table public.locations (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  created_at timestamptz not null default now()
);

create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  email text not null,
  role public.user_role not null default 'staff',
  location_id uuid references public.locations (id),
  first_name text,
  last_name text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.customers (
  id uuid primary key default gen_random_uuid(),
  first_name text not null,
  last_name text not null,
  email text not null,
  phone text,
  wix_contact_id text unique,
  auth_user_id uuid references auth.users (id),
  created_at timestamptz not null default now()
);

create index customers_email_lower_idx on public.customers (lower(email));

create table public.applications (
  id uuid primary key default gen_random_uuid(),
  customer_id uuid not null references public.customers (id) on delete restrict,
  location_id uuid references public.locations (id),
  wix_submission_id text not null unique,
  type_of_loan text,
  loan_amount_requested numeric,
  loan_amount_approved numeric,
  urgent_same_day boolean not null default false,
  terms_agreed boolean not null default false,
  status public.application_status not null default 'Pending',
  submission_metadata jsonb not null default '{}'::jsonb,
  raw_payload jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index applications_location_id_idx on public.applications (location_id);
create index applications_customer_id_idx on public.applications (customer_id);
create index applications_status_idx on public.applications (status);
create index applications_created_at_idx on public.applications (created_at desc);

create table public.comments (
  id uuid primary key default gen_random_uuid(),
  application_id uuid not null references public.applications (id) on delete cascade,
  user_id uuid not null references public.profiles (id),
  content text not null,
  mentions jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now()
);

create index comments_application_id_idx on public.comments (application_id);

create table public.application_emails (
  id uuid primary key default gen_random_uuid(),
  application_id uuid not null references public.applications (id) on delete cascade,
  sent_by_user_id uuid not null references public.profiles (id),
  to_email text not null,
  subject text not null,
  body text not null,
  resend_id text,
  created_at timestamptz not null default now()
);

create index application_emails_application_id_idx on public.application_emails (application_id);

-- ---------------------------------------------------------------------------
-- updated_at
-- ---------------------------------------------------------------------------
create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger profiles_updated_at
  before update on public.profiles
  for each row execute function public.set_updated_at();

create trigger applications_updated_at
  before update on public.applications
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- Auth: profile on signup
-- ---------------------------------------------------------------------------
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  loc uuid;
begin
  begin
    loc := nullif(trim(new.raw_user_meta_data->>'location_id'), '')::uuid;
  exception
    when others then
      loc := null;
  end;

  insert into public.profiles (id, email, role, location_id, first_name, last_name)
  values (
    new.id,
    coalesce(new.email, ''),
    case lower(coalesce(new.raw_user_meta_data->>'role', 'staff'))
      when 'admin' then 'admin'::public.user_role
      when 'customer' then 'customer'::public.user_role
      else 'staff'::public.user_role
    end,
    loc,
    nullif(new.raw_user_meta_data->>'first_name', ''),
    nullif(new.raw_user_meta_data->>'last_name', '')
  );
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ---------------------------------------------------------------------------
-- Helpers for RLS (security definer — only exposes booleans / ids)
-- ---------------------------------------------------------------------------
create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.profiles p
    where p.id = auth.uid() and p.role = 'admin'::public.user_role
  );
$$;

create or replace function public.current_staff_location_id()
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select p.location_id from public.profiles p
  where p.id = auth.uid() and p.role = 'staff'::public.user_role;
$$;

-- ---------------------------------------------------------------------------
-- Seed locations
-- ---------------------------------------------------------------------------
insert into public.locations (name) values
  ('Gladewater'),
  ('Mineola'),
  ('Tyler'),
  ('Tyler 2'),
  ('Longview'),
  ('Longview 2')
on conflict (name) do nothing;

-- ---------------------------------------------------------------------------
-- Row Level Security
-- ---------------------------------------------------------------------------
alter table public.locations enable row level security;
alter table public.profiles enable row level security;
alter table public.customers enable row level security;
alter table public.applications enable row level security;
alter table public.comments enable row level security;
alter table public.application_emails enable row level security;

-- locations
create policy locations_select_authenticated
  on public.locations for select
  to authenticated
  using (true);

create policy locations_write_admin
  on public.locations for all
  to authenticated
  using (public.is_admin())
  with check (public.is_admin());

-- profiles
create policy profiles_select
  on public.profiles for select
  to authenticated
  using (
    id = auth.uid()
    or public.is_admin()
    or (
      exists (
        select 1 from public.profiles me
        where me.id = auth.uid() and me.role = 'staff'::public.user_role
      )
      and role in ('admin'::public.user_role, 'staff'::public.user_role)
    )
  );

create policy profiles_update_self
  on public.profiles for update
  to authenticated
  using (id = auth.uid())
  with check (id = auth.uid());

create policy profiles_admin_all
  on public.profiles for all
  to authenticated
  using (public.is_admin())
  with check (public.is_admin());

-- customers
create policy customers_admin_all
  on public.customers for all
  to authenticated
  using (public.is_admin())
  with check (public.is_admin());

create policy customers_staff_select
  on public.customers for select
  to authenticated
  using (
    exists (
      select 1 from public.applications a
      join public.profiles p on p.id = auth.uid()
      where a.customer_id = customers.id
        and p.role = 'staff'::public.user_role
        and a.location_id is not null
        and a.location_id = p.location_id
    )
  );

create policy customers_staff_update
  on public.customers for update
  to authenticated
  using (
    exists (
      select 1 from public.applications a
      join public.profiles p on p.id = auth.uid()
      where a.customer_id = customers.id
        and p.role = 'staff'::public.user_role
        and a.location_id is not null
        and a.location_id = p.location_id
    )
  )
  with check (true);

-- applications
create policy applications_admin_all
  on public.applications for all
  to authenticated
  using (public.is_admin())
  with check (public.is_admin());

create policy applications_staff_select
  on public.applications for select
  to authenticated
  using (
    exists (
      select 1 from public.profiles p
      where p.id = auth.uid()
        and p.role = 'staff'::public.user_role
        and applications.location_id is not null
        and applications.location_id = p.location_id
    )
  );

create policy applications_staff_update
  on public.applications for update
  to authenticated
  using (
    exists (
      select 1 from public.profiles p
      where p.id = auth.uid()
        and p.role = 'staff'::public.user_role
        and applications.location_id is not null
        and applications.location_id = p.location_id
    )
  )
  with check (
    exists (
      select 1 from public.profiles p
      where p.id = auth.uid()
        and p.role = 'staff'::public.user_role
        and applications.location_id is not null
        and applications.location_id = p.location_id
    )
  );

-- comments
create policy comments_admin_all
  on public.comments for all
  to authenticated
  using (public.is_admin())
  with check (public.is_admin());

create policy comments_staff_select
  on public.comments for select
  to authenticated
  using (
    exists (
      select 1 from public.applications a
      join public.profiles p on p.id = auth.uid()
      where a.id = comments.application_id
        and p.role = 'staff'::public.user_role
        and a.location_id is not null
        and a.location_id = p.location_id
    )
  );

create policy comments_staff_insert
  on public.comments for insert
  to authenticated
  with check (
    user_id = auth.uid()
    and exists (
      select 1 from public.applications a
      join public.profiles p on p.id = auth.uid()
      where a.id = comments.application_id
        and p.role = 'staff'::public.user_role
        and a.location_id is not null
        and a.location_id = p.location_id
    )
  );

create policy comments_update_own
  on public.comments for update
  to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

-- application_emails
create policy emails_admin_all
  on public.application_emails for all
  to authenticated
  using (public.is_admin())
  with check (public.is_admin());

create policy emails_staff_select
  on public.application_emails for select
  to authenticated
  using (
    exists (
      select 1 from public.applications a
      join public.profiles p on p.id = auth.uid()
      where a.id = application_emails.application_id
        and p.role = 'staff'::public.user_role
        and a.location_id is not null
        and a.location_id = p.location_id
    )
  );

create policy emails_staff_insert
  on public.application_emails for insert
  to authenticated
  with check (
    sent_by_user_id = auth.uid()
    and exists (
      select 1 from public.applications a
      join public.profiles p on p.id = auth.uid()
      where a.id = application_emails.application_id
        and p.role = 'staff'::public.user_role
        and a.location_id is not null
        and a.location_id = p.location_id
    )
  );

-- ---------------------------------------------------------------------------
-- Analytics RPC (admin only)
-- ---------------------------------------------------------------------------
create or replace function public.analytics_summary(
  range_start date,
  range_end date
)
returns json
language plpgsql
security definer
set search_path = public
as $$
declare
  result json;
begin
  if not public.is_admin() then
    raise exception 'not authorized';
  end if;

  select json_build_object(
    'monthly_volume', coalesce((
      select json_agg(row_to_json(t))
      from (
        select
          date_trunc('month', a.created_at)::date as month,
          count(*)::bigint as count
        from public.applications a
        where a.created_at::date >= range_start
          and a.created_at::date <= range_end
        group by 1
        order by 1
      ) t
    ), '[]'::json),
    'avg_loan_requested', (
      select round(avg(a.loan_amount_requested), 2)
      from public.applications a
      where a.created_at::date >= range_start
        and a.created_at::date <= range_end
        and a.loan_amount_requested is not null
    ),
    'avg_loan_approved', (
      select round(avg(a.loan_amount_approved), 2)
      from public.applications a
      where a.created_at::date >= range_start
        and a.created_at::date <= range_end
        and a.loan_amount_approved is not null
    ),
    'reapplication_rate', (
      with apps as (
        select customer_id, count(*)::bigint as n
        from public.applications
        where created_at::date >= range_start
          and created_at::date <= range_end
        group by customer_id
      )
      select case
        when count(*) = 0 then null::numeric
        else round(
          100.0 * count(*) filter (where n > 1)::numeric / count(*)::numeric,
          2
        )
      end
      from apps
    ),
    'total_applications_in_range', (
      select count(*)::bigint from public.applications a
      where a.created_at::date >= range_start and a.created_at::date <= range_end
    )
  ) into result;

  return result;
end;
$$;

grant execute on function public.analytics_summary(date, date) to authenticated;
