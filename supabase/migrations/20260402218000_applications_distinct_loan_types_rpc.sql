-- Distinct loan-type values for filter chips: one indexed-friendly query under caller RLS (no row limit).

create or replace function public.applications_distinct_loan_type_options()
returns jsonb
language sql
stable
security invoker
set search_path = public
as $$
  select jsonb_build_object(
    'types',
    coalesce(
      (
        select jsonb_agg(sub.t order by sub.t)
        from (
          select distinct btrim(a.type_of_loan) as t
          from public.applications a
          where a.type_of_loan is not null
            and btrim(a.type_of_loan) <> ''
        ) sub
      ),
      '[]'::jsonb
    ),
    'has_unknown',
    exists (
      select 1
      from public.applications a
      where a.type_of_loan is null
         or btrim(a.type_of_loan) = ''
    )
  );
$$;

revoke all on function public.applications_distinct_loan_type_options() from public;
grant execute on function public.applications_distinct_loan_type_options() to authenticated;
