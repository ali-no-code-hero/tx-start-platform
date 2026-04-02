import { ApplicationsTable } from "@/components/applications-table";
import { getProfile } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";

export default async function ApplicationsPage() {
  const profile = await getProfile();
  if (!profile) redirect("/login");

  const supabase = await createClient();
  const { data: applications, error } = await supabase
    .from("applications")
    .select(
      `
      id,
      status,
      created_at,
      urgent_same_day,
      loan_amount_requested,
      loan_amount_approved,
      type_of_loan,
      location_id,
      submission_metadata,
      customers ( id, first_name, last_name, email, phone ),
      locations ( name )
    `,
    )
    .order("created_at", { ascending: false });

  if (error) {
    return (
      <div className="rounded-lg border border-destructive/50 bg-destructive/10 p-4 text-sm">
        Failed to load applications: {error.message}
      </div>
    );
  }

  const rows = (applications ?? []).map((a) => {
    const cust = a.customers as
      | { id: string; first_name: string; last_name: string; email: string; phone: string | null }
      | { id: string; first_name: string; last_name: string; email: string; phone: string | null }[]
      | null;
    const loc = a.locations as { name: string } | { name: string }[] | null;
    return {
      id: a.id,
      status: a.status,
      created_at: a.created_at,
      urgent_same_day: a.urgent_same_day,
      loan_amount_requested: a.loan_amount_requested,
      loan_amount_approved: a.loan_amount_approved,
      type_of_loan: a.type_of_loan,
      location_id: a.location_id,
      submission_metadata: a.submission_metadata as Record<string, unknown> | null,
      customers: Array.isArray(cust) ? cust[0] ?? null : cust,
      locations: Array.isArray(loc) ? loc[0] ?? null : loc,
    };
  });

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Applications</h1>
        <p className="text-sm text-muted-foreground">
          {profile.role === "customer"
            ? "Your loan applications and status updates."
            : profile.role === "staff"
              ? "Showing applications for your assigned location."
              : "All locations."}
        </p>
      </div>
      <ApplicationsTable
        rows={rows}
        isAdmin={profile.role === "admin"}
        isCustomer={profile.role === "customer"}
      />
    </div>
  );
}
