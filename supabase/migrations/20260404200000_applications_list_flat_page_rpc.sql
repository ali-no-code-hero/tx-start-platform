-- Paginated applications list when text search is active: avoids PostgREST wide `.or()` plans
-- that could hit statement_timeout under RLS. Uses UNION ALL branches + DISTINCT ids, then
-- applies the same list filters as the app (status, urgent, location, loan type).

create or replace function public.applications_list_flat_page(
  p_limit int,
  p_offset int,
  p_status text,
  p_urgent text,
  p_filter_by_location boolean,
  p_unassigned_only boolean,
  p_filter_location_ids uuid[],
  p_has_loan_filter boolean,
  p_loan_unknown boolean,
  p_loan_types text[],
  p_search_token text,
  p_search_customer_ids uuid[],
  p_search_location_ids uuid[],
  p_search_statuses public.application_status[]
)
returns table (
  id uuid,
  customer_id uuid,
  status public.application_status,
  created_at timestamptz,
  urgent_same_day boolean,
  loan_amount_requested numeric,
  loan_amount_approved numeric,
  type_of_loan text,
  location_id uuid,
  needs_location_review jsonb
)
language sql
stable
security invoker
set search_path = public
as $$
  with
  tok as (
    select trim(coalesce(p_search_token, '')) as t
  ),
  matching_ids as (
    select distinct q.id
    from (
      select app.id
      from public.applications app, tok
      where length(tok.t) >= 5
        and app.type_of_loan is not null
        and app.type_of_loan ilike '%' || tok.t || '%'
      union all
      select app.id
      from public.applications app
      where cardinality(p_search_customer_ids) > 0
        and app.customer_id = any (p_search_customer_ids)
      union all
      select app.id
      from public.applications app
      where cardinality(p_search_location_ids) > 0
        and app.location_id = any (p_search_location_ids)
      union all
      select app.id
      from public.applications app
      where cardinality(p_search_statuses) > 0
        and app.status = any (p_search_statuses)
    ) q
  ),
  lim as (
    select
      case
        when p_limit is null or p_limit < 1 then 50
        when p_limit > 101 then 101
        else p_limit
      end as n,
      greatest(coalesce(p_offset, 0), 0) as off
  )
  select
    app.id,
    app.customer_id,
    app.status,
    app.created_at,
    app.urgent_same_day,
    app.loan_amount_requested,
    app.loan_amount_approved,
    app.type_of_loan,
    app.location_id,
    app.submission_metadata->'needs_location_review' as needs_location_review
  from public.applications app
  inner join matching_ids m on m.id = app.id
  cross join lim
  where
    (p_status = 'all' or app.status = p_status::public.application_status)
    and (
      p_urgent = 'all'
      or (p_urgent = 'yes' and app.urgent_same_day = true)
      or (p_urgent = 'no' and app.urgent_same_day = false)
    )
    and (
      not p_filter_by_location
      or (
        p_unassigned_only
        and cardinality(p_filter_location_ids) = 0
        and app.location_id is null
      )
      or (
        not p_unassigned_only
        and cardinality(p_filter_location_ids) > 0
        and app.location_id = any (p_filter_location_ids)
      )
      or (
        p_unassigned_only
        and cardinality(p_filter_location_ids) > 0
        and (
          app.location_id is null
          or app.location_id = any (p_filter_location_ids)
        )
      )
    )
    and (
      not p_has_loan_filter
      or (
        p_loan_unknown
        and cardinality(p_loan_types) > 0
        and (
          app.type_of_loan is null
          or btrim(app.type_of_loan) = ''
          or app.type_of_loan = any (p_loan_types)
        )
      )
      or (
        p_loan_unknown
        and cardinality(p_loan_types) = 0
        and (
          app.type_of_loan is null
          or btrim(app.type_of_loan) = ''
        )
      )
      or (
        not p_loan_unknown
        and cardinality(p_loan_types) > 0
        and app.type_of_loan = any (p_loan_types)
      )
    )
  order by app.created_at desc
  limit (select lim.n from lim)
  offset (select lim.off from lim);
$$;

revoke all on function public.applications_list_flat_page(
  int,
  int,
  text,
  text,
  boolean,
  boolean,
  uuid[],
  boolean,
  boolean,
  text[],
  text,
  uuid[],
  uuid[],
  public.application_status[]
) from public;

grant execute on function public.applications_list_flat_page(
  int,
  int,
  text,
  text,
  boolean,
  boolean,
  uuid[],
  boolean,
  boolean,
  text[],
  text,
  uuid[],
  uuid[],
  public.application_status[]
) to authenticated;
