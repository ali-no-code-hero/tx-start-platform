-- Analytics: index-friendly date filter on applications, compact loan-type options RPC.

create index if not exists applications_type_of_loan_btree_idx
  on public.applications (type_of_loan)
  where type_of_loan is not null and btrim(type_of_loan) <> '';

create or replace function public.analytics_distinct_loan_types()
returns text[]
language plpgsql
security definer
set search_path = public
stable
as $$
begin
  if not public.is_admin() then
    raise exception 'not authorized';
  end if;

  return coalesce(
    (
      select array_agg(sub.t order by sub.t)
      from (
        select distinct btrim(a.type_of_loan) as t
        from public.applications a
        where a.type_of_loan is not null
          and btrim(a.type_of_loan) <> ''
      ) sub
    ),
    array[]::text[]
  );
end;
$$;

grant execute on function public.analytics_distinct_loan_types() to authenticated;

-- Use timestamp bounds so applications_created_at_idx can be used (avoid created_at::date on column).
create or replace function public.analytics_summary(
  range_start date,
  range_end date,
  location_ids uuid[] default null,
  include_unassigned boolean default false,
  statuses public.application_status[] default null,
  loan_types text[] default null,
  urgent_filter boolean default null
)
returns json
language plpgsql
security definer
set search_path = public
as $$
declare
  result json;
  span_days int;
begin
  if not public.is_admin() then
    raise exception 'not authorized';
  end if;

  if range_end < range_start then
    raise exception 'range_end must be on or after range_start';
  end if;

  span_days := range_end - range_start;
  if span_days > 800 then
    raise exception 'date range too large (max 800 days)';
  end if;

  with filtered as (
    select a.*
    from public.applications a
    where a.created_at >= range_start::timestamp
      and a.created_at < (range_end + interval '1 day')::timestamp
      and (
        not (
          (location_ids is not null and cardinality(location_ids) > 0)
          or coalesce(include_unassigned, false)
        )
        or (
          (location_ids is not null and cardinality(location_ids) > 0 and a.location_id = any (location_ids))
          or (coalesce(include_unassigned, false) and a.location_id is null)
        )
      )
      and (
        not (statuses is not null and cardinality(statuses) > 0)
        or a.status = any (statuses)
      )
      and (
        not (loan_types is not null and cardinality(loan_types) > 0)
        or (
          (a.type_of_loan is not null and a.type_of_loan = any (loan_types))
          or ('Unknown' = any (loan_types) and a.type_of_loan is null)
        )
      )
      and (
        urgent_filter is null
        or (urgent_filter and a.urgent_same_day)
        or (not urgent_filter and not a.urgent_same_day)
      )
  )
  select json_build_object(
    'monthly_volume', coalesce((
      select json_agg(row_to_json(t) order by t.month)
      from (
        select
          date_trunc('month', f.created_at)::date as month,
          count(*)::bigint as count
        from filtered f
        group by 1
      ) t
    ), '[]'::json),
    'monthly_by_status', coalesce((
      select json_agg(row_to_json(t) order by t.month, t.status)
      from (
        select
          date_trunc('month', f.created_at)::date as month,
          f.status::text as status,
          count(*)::bigint as count
        from filtered f
        group by 1, 2
      ) t
    ), '[]'::json),
    'by_status', coalesce((
      select json_agg(row_to_json(t) order by t.count desc, t.status)
      from (
        select f.status::text as status, count(*)::bigint as count
        from filtered f
        group by 1
      ) t
    ), '[]'::json),
    'by_location', coalesce((
      select json_agg(row_to_json(t) order by t.count desc, t.location_name)
      from (
        select
          f.location_id,
          coalesce(l.name, 'Unassigned') as location_name,
          count(*)::bigint as count
        from filtered f
        left join public.locations l on l.id = f.location_id
        group by f.location_id, l.name
      ) t
    ), '[]'::json),
    'by_loan_type', coalesce((
      select json_agg(row_to_json(x) order by x.count desc, x.loan_type)
      from (
        select
          case when r.rn <= 15 then r.loan_type else 'Other' end as loan_type,
          sum(r.cnt)::bigint as count
        from (
          select
            t.loan_type,
            t.cnt,
            row_number() over (order by t.cnt desc, t.loan_type) as rn
          from (
            select
              coalesce(nullif(trim(f.type_of_loan), ''), 'Unknown') as loan_type,
              count(*)::bigint as cnt
            from filtered f
            group by coalesce(nullif(trim(f.type_of_loan), ''), 'Unknown')
          ) t(loan_type, cnt)
        ) r
        group by 1
      ) x
    ), '[]'::json),
    'by_prior_business', coalesce((
      select json_agg(row_to_json(t) order by t.bucket)
      from (
        select
          case
            when f.submission_metadata is null
              or not (f.submission_metadata ? 'legacy_business_before')
              or f.submission_metadata->>'legacy_business_before' is null
              or btrim(f.submission_metadata->>'legacy_business_before') = ''
            then 'unknown'
            when lower(btrim(f.submission_metadata->>'legacy_business_before')) in ('true', 't', '1', 'yes')
            then 'true'
            when lower(btrim(f.submission_metadata->>'legacy_business_before')) in ('false', 'f', '0', 'no')
            then 'false'
            else 'unknown'
          end as bucket,
          count(*)::bigint as count
        from filtered f
        group by 1
      ) t
    ), '[]'::json),
    'avg_loan_requested', (
      select round(avg(f.loan_amount_requested)::numeric, 2)
      from filtered f
      where f.loan_amount_requested is not null
    ),
    'median_loan_requested', (
      select round(
        (percentile_cont(0.5) within group (order by f.loan_amount_requested))::numeric,
        2
      )
      from filtered f
      where f.loan_amount_requested is not null
    ),
    'avg_loan_approved', (
      select round(avg(f.loan_amount_approved)::numeric, 2)
      from filtered f
      where f.loan_amount_approved is not null
    ),
    'median_loan_approved', (
      select round(
        (percentile_cont(0.5) within group (order by f.loan_amount_approved))::numeric,
        2
      )
      from filtered f
      where f.loan_amount_approved is not null
    ),
    'sum_loan_requested', (
      select coalesce(sum(f.loan_amount_requested), 0)::numeric
      from filtered f
      where f.loan_amount_requested is not null
    ),
    'sum_loan_approved_loaned', (
      select coalesce(sum(f.loan_amount_approved), 0)::numeric
      from filtered f
      where f.status = 'Loaned'::public.application_status
        and f.loan_amount_approved is not null
    ),
    'pct_urgent', (
      select case
        when count(*) = 0 then null::numeric
        else round(100.0 * count(*) filter (where f.urgent_same_day)::numeric / count(*)::numeric, 2)
      end
      from filtered f
    ),
    'median_hours_to_update', (
      select round(
        (
          percentile_cont(0.5) within group (
            order by extract(epoch from (f.updated_at - f.created_at)) / 3600.0
          )
        )::numeric,
        2
      )
      from filtered f
      where f.updated_at > f.created_at
    ),
    'reapplication_rate', (
      with apps as (
        select f.customer_id, count(*)::bigint as n
        from filtered f
        group by f.customer_id
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
      select count(*)::bigint from filtered f
    )
  ) into result;

  return result;
end;
$$;

grant execute on function public.analytics_summary(
  date,
  date,
  uuid[],
  boolean,
  public.application_status[],
  text[],
  boolean
) to authenticated;
