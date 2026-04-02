-- Fix failed index from 20260402215000: (status::text) is not valid in index expressions.
-- Safe to run on databases that already applied other trgm indexes.

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

-- IF NOT EXISTS: no-op when 20260402215000 already created this index (same definition).
create index if not exists applications_status_text_trgm_idx
  on public.applications using gin (public.application_status_to_text(status) gin_trgm_ops);
