-- `search_active` must not use `cardinality(p_search_statuses) > 0` alone: the app briefly
-- sent every status when the token was "" (`includes("")` is true for all strings in JS),
-- which kept `search_active` true and forced a full-table scan via the status UNION branch.

create or replace function public.applications_list_flat_page(
  p_limit int,
  p_after_created_at timestamptz,
  p_after_id uuid,
  p_before_created_at timestamptz,
  p_before_id uuid,
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
language plpgsql
stable
security invoker
set search_path = public
as $$
declare
  lim_n int;
  tok_t text;
  search_active boolean;
begin
  lim_n :=
    case
      when p_limit is null or p_limit < 1 then 50
      when p_limit > 101 then 101
      else p_limit
    end;

  tok_t := trim(coalesce(p_search_token, ''));
  search_active :=
    length(tok_t) >= 5
    or coalesce(cardinality(p_search_customer_ids), 0) > 0
    or coalesce(cardinality(p_search_location_ids), 0) > 0;

  if not search_active then
    return query
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
          and coalesce(cardinality(p_filter_location_ids), 0) = 0
          and app.location_id is null
        )
        or (
          not p_unassigned_only
          and coalesce(cardinality(p_filter_location_ids), 0) > 0
          and app.location_id = any (p_filter_location_ids)
        )
        or (
          p_unassigned_only
          and coalesce(cardinality(p_filter_location_ids), 0) > 0
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
          and coalesce(cardinality(p_loan_types), 0) > 0
          and (
            app.type_of_loan is null
            or btrim(app.type_of_loan) = ''
            or app.type_of_loan = any (p_loan_types)
          )
        )
        or (
          p_loan_unknown
          and coalesce(cardinality(p_loan_types), 0) = 0
          and (
            app.type_of_loan is null
            or btrim(app.type_of_loan) = ''
          )
        )
        or (
          not p_loan_unknown
          and coalesce(cardinality(p_loan_types), 0) > 0
          and app.type_of_loan = any (p_loan_types)
        )
      )
      and case
        when p_before_created_at is not null and p_before_id is not null then
          (app.created_at, app.id) > (p_before_created_at, p_before_id)
        when p_after_created_at is not null and p_after_id is not null then
          (app.created_at, app.id) < (p_after_created_at, p_after_id)
        else true
      end
    order by app.created_at desc, app.id desc
    limit lim_n;
    return;
  end if;

  return query
  with
  matching_ids as (
    select distinct q.id
    from (
      select app2.id
      from public.applications app2
      where length(tok_t) >= 5
        and app2.type_of_loan is not null
        and app2.type_of_loan ilike '%' || tok_t || '%'
      union all
      select app2.id
      from public.applications app2
      where coalesce(cardinality(p_search_customer_ids), 0) > 0
        and app2.customer_id = any (p_search_customer_ids)
      union all
      select app2.id
      from public.applications app2
      where coalesce(cardinality(p_search_location_ids), 0) > 0
        and app2.location_id = any (p_search_location_ids)
      union all
      select app2.id
      from public.applications app2
      where length(tok_t) >= 5
        and coalesce(cardinality(p_search_statuses), 0) > 0
        and app2.status = any (p_search_statuses)
    ) q
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
        and coalesce(cardinality(p_filter_location_ids), 0) = 0
        and app.location_id is null
      )
      or (
        not p_unassigned_only
        and coalesce(cardinality(p_filter_location_ids), 0) > 0
        and app.location_id = any (p_filter_location_ids)
      )
      or (
        p_unassigned_only
        and coalesce(cardinality(p_filter_location_ids), 0) > 0
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
        and coalesce(cardinality(p_loan_types), 0) > 0
        and (
          app.type_of_loan is null
          or btrim(app.type_of_loan) = ''
          or app.type_of_loan = any (p_loan_types)
        )
      )
      or (
        p_loan_unknown
        and coalesce(cardinality(p_loan_types), 0) = 0
        and (
          app.type_of_loan is null
          or btrim(app.type_of_loan) = ''
        )
      )
      or (
        not p_loan_unknown
        and coalesce(cardinality(p_loan_types), 0) > 0
        and app.type_of_loan = any (p_loan_types)
      )
    )
    and case
      when p_before_created_at is not null and p_before_id is not null then
        (app.created_at, app.id) > (p_before_created_at, p_before_id)
      when p_after_created_at is not null and p_after_id is not null then
        (app.created_at, app.id) < (p_after_created_at, p_after_id)
      else true
    end
  order by app.created_at desc, app.id desc
  limit lim_n;
end;
$$;
