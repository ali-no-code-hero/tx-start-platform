-- Speed up embedded customer loads for staff (e.g. applications list with customers(*)).
-- Correlated EXISTS re-scanned applications once per customer row and could hit statement_timeout.
-- Uncorrelated IN (subselect) materializes customer ids for the staff location once per query.

create index if not exists applications_location_customer_id_idx
  on public.applications (location_id, customer_id)
  where location_id is not null;

drop policy if exists customers_staff_select on public.customers;

create policy customers_staff_select
  on public.customers for select
  to authenticated
  using (
    id in (
      select a.customer_id
      from public.applications a
      where a.location_id is not null
        and a.location_id = public.current_staff_location_id()
    )
  );

drop policy if exists customers_staff_update on public.customers;

create policy customers_staff_update
  on public.customers for update
  to authenticated
  using (
    id in (
      select a.customer_id
      from public.applications a
      where a.location_id is not null
        and a.location_id = public.current_staff_location_id()
    )
  )
  with check (true);
