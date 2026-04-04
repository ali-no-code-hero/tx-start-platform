-- applications_distinct_loan_type_options ran two full passes over public.applications
-- (DISTINCT loan strings + EXISTS for unknown), doubling RLS work and hitting statement_timeout.
-- One materialized CTE scans the table once; DISTINCT and EXISTS run on that snapshot only.

create or replace function public.applications_distinct_loan_type_options()
returns jsonb
language sql
stable
security invoker
set search_path = public
as $$
  with apps as materialized (
    select a.type_of_loan
    from public.applications a
  )
  select jsonb_build_object(
    'types',
    coalesce(
      (
        select jsonb_agg(sub.t order by sub.t)
        from (
          select distinct btrim(apps.type_of_loan) as t
          from apps
          where apps.type_of_loan is not null
            and btrim(apps.type_of_loan) <> ''
        ) sub
      ),
      '[]'::jsonb
    ),
    'has_unknown',
    exists (
      select 1
      from apps
      where apps.type_of_loan is null
         or btrim(apps.type_of_loan) = ''
    )
  );
$$;
