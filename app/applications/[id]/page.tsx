import { ActivityTimeline } from "@/components/activity-timeline";
import { ApplicationEditForm } from "@/components/application-edit-form";
import { CommentComposer } from "@/components/comment-composer";
import { CustomerEditForm } from "@/components/customer-edit-form";
import { EmailComposer } from "@/components/email-composer";
import { InviteCustomerPortalCard } from "@/components/invite-customer-portal-card";
import { SmsComposer } from "@/components/sms-composer";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { getProfile } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { logSupabaseQueryErrorWithRequest } from "@/lib/server-trace";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";

export default async function ApplicationDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const profile = await getProfile();
  if (!profile) redirect("/account/unauthorized");

  const supabase = await createClient();

  const { data: app, error: appErr } = await supabase
    .from("applications")
    .select(
      `
      *,
      customers (*),
      locations ( id, name )
    `,
    )
    .eq("id", id)
    .maybeSingle();

  if (appErr) {
    await logSupabaseQueryErrorWithRequest("applications_detail_query_failed", appErr, {
      route: "/applications/[id]",
      applicationId: id,
      profileRole: profile.role,
      profileId: profile.id,
      query: "applications_by_id_embed_customers_locations",
    });
    notFound();
  }
  if (!app) notFound();

  const customer = app.customers as {
    id: string;
    first_name: string;
    last_name: string;
    email: string;
    phone: string | null;
    auth_user_id: string | null;
  } | null;

  const isCustomer = profile.role === "customer";
  const isStaffSide = profile.role === "staff" || profile.role === "admin";

  const location = app.locations as { id: string; name: string } | null;

  const { data: rawComments } = await supabase
    .from("comments")
    .select("id, content, mentions, created_at, user_id")
    .eq("application_id", id)
    .order("created_at", { ascending: true });

  const { data: rawEmails } = await supabase
    .from("application_emails")
    .select(
      "id, to_email, subject, body, created_at, sent_by_user_id, automation_rule_id",
    )
    .eq("application_id", id)
    .order("created_at", { ascending: true });

  const { data: rawSms } = await supabase
    .from("application_sms")
    .select("id, to_phone, body, created_at, sent_by_user_id, automation_rule_id")
    .eq("application_id", id)
    .order("created_at", { ascending: true });

  const authorIds = [
    ...new Set([
      ...(rawComments ?? []).map((c) => c.user_id),
      ...(rawEmails ?? []).map((e) => e.sent_by_user_id).filter(Boolean),
      ...(rawSms ?? []).map((s) => s.sent_by_user_id).filter(Boolean),
    ]),
  ] as string[];

  const { data: authors } =
    authorIds.length > 0
      ? await supabase
          .from("profiles")
          .select("id, first_name, last_name, email")
          .in("id", authorIds)
      : { data: [] as { id: string; first_name: string | null; last_name: string | null; email: string }[] };

  const authorMap = Object.fromEntries((authors ?? []).map((a) => [a.id, a]));

  const comments = (rawComments ?? []).map((c) => {
    let mentions: string[] = [];
    if (Array.isArray(c.mentions)) mentions = c.mentions as string[];
    else if (typeof c.mentions === "string") {
      try {
        const parsed = JSON.parse(c.mentions) as unknown;
        if (Array.isArray(parsed)) mentions = parsed as string[];
      } catch {
        mentions = [];
      }
    }
    return {
      id: c.id,
      content: c.content,
      mentions,
      created_at: c.created_at,
      author: authorMap[c.user_id] ?? null,
    };
  });

  const emails = (rawEmails ?? []).map((e) => ({
    id: e.id,
    to_email: e.to_email,
    subject: e.subject,
    body: e.body,
    created_at: e.created_at,
    isAutomated: e.sent_by_user_id == null && e.automation_rule_id != null,
    sender:
      e.sent_by_user_id && authorMap[e.sent_by_user_id]
        ? {
            first_name: authorMap[e.sent_by_user_id].first_name,
            last_name: authorMap[e.sent_by_user_id].last_name,
          }
        : null,
  }));

  const sms = (rawSms ?? []).map((s) => ({
    id: s.id,
    to_phone: s.to_phone,
    body: s.body,
    created_at: s.created_at,
    isAutomated: s.sent_by_user_id == null && s.automation_rule_id != null,
    sender:
      s.sent_by_user_id && authorMap[s.sent_by_user_id]
        ? {
            first_name: authorMap[s.sent_by_user_id].first_name,
            last_name: authorMap[s.sent_by_user_id].last_name,
          }
        : null,
  }));

  const { data: staffList } = isCustomer
    ? { data: [] as { id: string; first_name: string | null; last_name: string | null; email: string; role: string }[] }
    : await supabase
        .from("profiles")
        .select("id, first_name, last_name, email, role")
        .in("role", ["staff", "admin"])
        .order("first_name", { ascending: true });

  const { data: allLocations } =
    profile.role === "admin" && !isCustomer
      ? await supabase.from("locations").select("id, name").order("name")
      : { data: null };

  const meta = app.submission_metadata as Record<string, unknown> | null;
  const submissionsUrl =
    typeof meta?.submissions_url === "string" ? meta.submissions_url : null;

  const staffById = Object.fromEntries(
    (staffList ?? []).map((s) => [
      s.id,
      `${s.first_name ?? ""} ${s.last_name ?? ""}`.trim() || s.email,
    ]),
  );

  return (
    <div className="space-y-8">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <Link
            href="/applications"
            className="text-sm text-muted-foreground hover:text-foreground"
          >
            ← Applications
          </Link>
          <h1 className="mt-2 text-2xl font-semibold tracking-tight">
            {customer ? `${customer.first_name} ${customer.last_name}` : "Application"}
          </h1>
          <p className="text-sm text-muted-foreground">
            Submitted {new Date(app.created_at).toLocaleString()}
            {location ? ` · ${location.name}` : ""}
          </p>
        </div>
        <Badge variant="secondary" className="w-fit">
          {app.status}
        </Badge>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Application</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <dl className="grid grid-cols-2 gap-2 text-sm">
              <dt className="text-muted-foreground">Type</dt>
              <dd>{app.type_of_loan ?? "—"}</dd>
              <dt className="text-muted-foreground">Requested</dt>
              <dd>
                {app.loan_amount_requested != null
                  ? `$${Number(app.loan_amount_requested).toLocaleString()}`
                  : "—"}
              </dd>
              <dt className="text-muted-foreground">Urgent same-day</dt>
              <dd>{app.urgent_same_day ? "Yes" : "No"}</dd>
              <dt className="text-muted-foreground">Terms agreed</dt>
              <dd>{app.terms_agreed ? "Yes" : "No"}</dd>
              {isStaffSide && (
                <>
                  <dt className="text-muted-foreground">Wix submission</dt>
                  <dd className="break-all font-mono text-xs">{app.wix_submission_id}</dd>
                </>
              )}
            </dl>
            {isStaffSide && submissionsUrl && (
              <p className="text-sm">
                <a
                  href={submissionsUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-primary underline"
                >
                  Open in Wix
                </a>
              </p>
            )}
            {isCustomer && (
              <>
                <Separator />
                <dl className="grid grid-cols-2 gap-2 text-sm">
                  <dt className="text-muted-foreground">Approved amount</dt>
                  <dd>
                    {app.loan_amount_approved != null
                      ? `$${Number(app.loan_amount_approved).toLocaleString()}`
                      : "—"}
                  </dd>
                  <dt className="text-muted-foreground">Location</dt>
                  <dd>{location?.name ?? "—"}</dd>
                </dl>
              </>
            )}
            {isStaffSide && (
              <>
                <Separator />
                <ApplicationEditForm
                  applicationId={app.id}
                  status={app.status}
                  loan_amount_approved={app.loan_amount_approved}
                  locationId={app.location_id}
                  locations={allLocations ?? []}
                  isAdmin={profile.role === "admin"}
                />
              </>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Customer</CardTitle>
          </CardHeader>
          <CardContent>
            {customer ? (
              <CustomerEditForm customer={customer} />
            ) : (
              <p className="text-sm text-muted-foreground">No customer linked.</p>
            )}
          </CardContent>
        </Card>
      </div>

      {isStaffSide && (
        <div className="grid gap-6 lg:grid-cols-2">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Email customer</CardTitle>
            </CardHeader>
            <CardContent>
              {customer ? (
                <EmailComposer applicationId={app.id} defaultTo={customer.email} />
              ) : null}
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Text customer</CardTitle>
            </CardHeader>
            <CardContent>
              {customer ? (
                <SmsComposer applicationId={app.id} defaultTo={customer.phone ?? ""} />
              ) : null}
            </CardContent>
          </Card>
        </div>
      )}

      {profile.role === "admin" && isStaffSide && customer && (
        <InviteCustomerPortalCard
          applicationId={app.id}
          customerId={customer.id}
          defaultEmail={customer.email}
          defaultFirstName={customer.first_name}
          defaultLastName={customer.last_name}
          hasPortalAccount={Boolean(customer.auth_user_id)}
        />
      )}

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Activity</CardTitle>
        </CardHeader>
        <CardContent className="space-y-6">
          <ActivityTimeline
            comments={comments}
            emails={emails}
            sms={sms}
            staffById={staffById}
          />
          {isStaffSide && (
            <>
              <Separator />
              <CommentComposer
                applicationId={app.id}
                staffOptions={
                  staffList?.map((s) => ({
                    id: s.id,
                    label:
                      `${s.first_name ?? ""} ${s.last_name ?? ""}`.trim() || s.email,
                  })) ?? []
                }
              />
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
