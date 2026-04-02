-- Composite indexes for applications list: filter columns + sort key (created_at desc).
-- Helps Postgres satisfy WHERE … ORDER BY created_at DESC LIMIT without wide scans.

create index if not exists applications_status_created_at_desc_idx
  on public.applications (status, created_at desc);

create index if not exists applications_location_created_at_desc_idx
  on public.applications (location_id, created_at desc)
  where location_id is not null;

create index if not exists applications_urgent_created_at_desc_idx
  on public.applications (urgent_same_day, created_at desc);

create index if not exists applications_type_of_loan_created_at_desc_idx
  on public.applications (type_of_loan, created_at desc)
  where type_of_loan is not null;
