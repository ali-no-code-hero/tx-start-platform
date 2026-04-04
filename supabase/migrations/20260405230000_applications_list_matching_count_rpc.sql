-- Exact row count for the applications list (same predicates as applications_list_flat_page,
-- without keyset cursors). RLS applies; used by the /applications header instead of PostgREST planned count.

create or replace function public.applications_list_matching_count(
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
returns bigint
language plpgsql
stable
security invoker
set search_path = public
as $$
declare
  tok_t text;
  search_active boolean;
  n bigint;
begin
  tok_t := trim(coalesce(p_search_token, ''));
  search_active :=
    length(tok_t) >= 5
    or coalesce(cardinality(p_search_customer_ids), 0) > 0
    or coalesce(cardinality(p_search_location_ids), 0) > 0;

  if not search_active then
    select count(*)::bigint
    into strict n
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
      );
    return n;
  end if;

  select count(*)::bigint
  into strict n
  from public.applications app
  where
    (
      (
        length(tok_t) >= 5
        and app.type_of_loan is not null
        and app.type_of_loan ilike '%' || tok_t || '%'
      )
      or (
        coalesce(cardinality(p_search_customer_ids), 0) > 0
        and app.customer_id = any (p_search_customer_ids)
      )
      or (
        coalesce(cardinality(p_search_location_ids), 0) > 0
        and app.location_id = any (p_search_location_ids)
      )
      or (
        length(tok_t) >= 5
        and coalesce(cardinality(p_search_statuses), 0) > 0
        and app.status = any (p_search_statuses)
      )
    )
    and (p_status = 'all' or app.status = p_status::public.application_status)
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
    );
  return n;
end;
$$;

revoke all on function public.applications_list_matching_count(
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

grant execute on function public.applications_list_matching_count(
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
