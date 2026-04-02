-- Speed up applications list search (ilike %term%) and reduce statement_timeout risk.
-- Requires pg_trgm (available on Supabase).

create extension if not exists pg_trgm;

create index if not exists customers_first_name_trgm_idx
  on public.customers using gin (first_name gin_trgm_ops);

create index if not exists customers_last_name_trgm_idx
  on public.customers using gin (last_name gin_trgm_ops);

create index if not exists customers_email_trgm_idx
  on public.customers using gin (email gin_trgm_ops);

create index if not exists customers_phone_trgm_idx
  on public.customers using gin (phone gin_trgm_ops)
  where phone is not null;

create index if not exists applications_type_of_loan_trgm_idx
  on public.applications using gin (type_of_loan gin_trgm_ops)
  where type_of_loan is not null;

-- Enum::text is not immutable in PG index expressions; use a wrapper for GIN(trgm).
create or replace function public.application_status_to_text(s public.application_status)
returns text
language sql
immutable
parallel safe
strict
set search_path = public
as $$
  select s::text;
$$;

revoke all on function public.application_status_to_text(public.application_status) from public;
grant execute on function public.application_status_to_text(public.application_status) to authenticated;

create index if not exists applications_status_text_trgm_idx
  on public.applications using gin (public.application_status_to_text(status) gin_trgm_ops);

create index if not exists locations_name_trgm_idx
  on public.locations using gin (name gin_trgm_ops);
