-- Status entered tracking + SMS/email automation rules, dedupe fires, SMS log

-- ---------------------------------------------------------------------------
-- applications.status_entered_at
-- ---------------------------------------------------------------------------
alter table public.applications
  add column if not exists status_entered_at timestamptz not null default now();

update public.applications
set status_entered_at = created_at
where status_entered_at is null;

create or replace function public.application_touch_status_entered_at()
returns trigger
language plpgsql
as $$
begin
  if tg_op = 'INSERT' then
    new.status_entered_at := coalesce(new.created_at, now());
  elsif new.status is distinct from old.status then
    new.status_entered_at := now();
  end if;
  return new;
end;
$$;

drop trigger if exists applications_status_entered_at on public.applications;
create trigger applications_status_entered_at
  before insert or update on public.applications
  for each row execute function public.application_touch_status_entered_at();

-- ---------------------------------------------------------------------------
-- Enums + automation_rules
-- ---------------------------------------------------------------------------
create type public.automation_channel as enum ('sms', 'email');

create table public.automation_rules (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  channel public.automation_channel not null,
  application_status public.application_status not null,
  delay_minutes integer not null,
  body_template text not null,
  subject_template text,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint automation_rules_delay_non_negative check (delay_minutes >= 0),
  constraint automation_rules_email_subject check (
    (channel = 'email'::public.automation_channel and subject_template is not null and length(trim(subject_template)) > 0)
    or (channel = 'sms'::public.automation_channel and subject_template is null)
  )
);

create index automation_rules_active_channel_idx
  on public.automation_rules (is_active, channel)
  where is_active = true;

create trigger automation_rules_updated_at
  before update on public.automation_rules
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- Dedupe: one fire per rule per application per status episode
-- ---------------------------------------------------------------------------
create table public.automation_rule_fires (
  id uuid primary key default gen_random_uuid(),
  application_id uuid not null references public.applications (id) on delete cascade,
  rule_id uuid not null references public.automation_rules (id) on delete cascade,
  status_entered_at_snapshot timestamptz not null,
  fired_at timestamptz not null default now(),
  constraint automation_rule_fires_unique_episode unique (application_id, rule_id, status_entered_at_snapshot)
);

create index automation_rule_fires_application_id_idx on public.automation_rule_fires (application_id);

-- ---------------------------------------------------------------------------
-- application_sms
-- ---------------------------------------------------------------------------
create table public.application_sms (
  id uuid primary key default gen_random_uuid(),
  application_id uuid not null references public.applications (id) on delete cascade,
  sent_by_user_id uuid references public.profiles (id),
  automation_rule_id uuid references public.automation_rules (id) on delete set null,
  status_entered_at_snapshot timestamptz,
  to_phone text not null,
  body text not null,
  twilio_sid text,
  created_at timestamptz not null default now()
);

create index application_sms_application_id_idx on public.application_sms (application_id);

-- ---------------------------------------------------------------------------
-- application_emails: automation columns + nullable sender
-- ---------------------------------------------------------------------------
alter table public.application_emails
  alter column sent_by_user_id drop not null;

alter table public.application_emails
  add column if not exists automation_rule_id uuid references public.automation_rules (id) on delete set null;

alter table public.application_emails
  add column if not exists status_entered_at_snapshot timestamptz;

create index application_emails_automation_rule_id_idx on public.application_emails (automation_rule_id);

-- ---------------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------------
alter table public.automation_rules enable row level security;
alter table public.automation_rule_fires enable row level security;
alter table public.application_sms enable row level security;

-- automation_rules: admin only
create policy automation_rules_admin_all
  on public.automation_rules for all
  to authenticated
  using (public.is_admin())
  with check (public.is_admin());

-- automation_rule_fires: admin read-only (cron uses service role)
create policy automation_rule_fires_admin_select
  on public.automation_rule_fires for select
  to authenticated
  using (public.is_admin());

-- application_sms
create policy sms_admin_all
  on public.application_sms for all
  to authenticated
  using (public.is_admin())
  with check (public.is_admin());

create policy sms_staff_select
  on public.application_sms for select
  to authenticated
  using (
    exists (
      select 1 from public.applications a
      join public.profiles p on p.id = auth.uid()
      where a.id = application_sms.application_id
        and p.role = 'staff'::public.user_role
        and a.location_id is not null
        and a.location_id = p.location_id
    )
  );

create policy sms_staff_insert
  on public.application_sms for insert
  to authenticated
  with check (
    sent_by_user_id = auth.uid()
    and sent_by_user_id is not null
    and exists (
      select 1 from public.applications a
      join public.profiles p on p.id = auth.uid()
      where a.id = application_sms.application_id
        and p.role = 'staff'::public.user_role
        and a.location_id is not null
        and a.location_id = p.location_id
    )
  );

-- Tighten application_emails staff insert: manual sends only
drop policy if exists emails_staff_insert on public.application_emails;

create policy emails_staff_insert
  on public.application_emails for insert
  to authenticated
  with check (
    sent_by_user_id = auth.uid()
    and sent_by_user_id is not null
    and exists (
      select 1 from public.applications a
      join public.profiles p on p.id = auth.uid()
      where a.id = application_emails.application_id
        and p.role = 'staff'::public.user_role
        and a.location_id is not null
        and a.location_id = p.location_id
    )
  );
