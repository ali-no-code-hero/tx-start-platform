import { InviteStaffForm } from "@/components/admin-invite-form";
import { UsersTable } from "@/components/users-table";
import { createAdminClient } from "@/lib/supabase/admin";

export default async function AdminUsersPage() {
  const admin = createAdminClient();
  const { data: rawProfiles, error } = await admin
    .from("profiles")
    .select("id, email, role, location_id, first_name, last_name, locations ( name )")
    .order("created_at", { ascending: false });

  if (error) {
    return (
      <div className="rounded-lg border border-destructive/50 bg-destructive/10 p-4 text-sm">
        Failed to load users: {error.message}
      </div>
    );
  }

  const { data: locations } = await admin.from("locations").select("id, name").order("name");

  const profiles = (rawProfiles ?? []).map((p) => {
    const loc = p.locations as { name: string } | { name: string }[] | null;
    const locationName = Array.isArray(loc) ? loc[0]?.name : loc?.name;
    return {
      id: p.id as string,
      email: p.email as string,
      role: p.role as "admin" | "staff" | "customer",
      location_id: p.location_id as string | null,
      first_name: p.first_name as string | null,
      last_name: p.last_name as string | null,
      locations: locationName ? { name: locationName } : null,
    };
  });

  return (
    <div className="space-y-8">
      <div className="border-l-[3px] border-primary pl-4">
        <h1 className="text-2xl font-semibold tracking-tight text-foreground">Users</h1>
        <p className="text-sm text-muted-foreground">
          Invite staff and admins here. For borrower portal access, open an application and use{" "}
          <strong>Invite to customer portal</strong> (links the Supabase user to the CRM customer
          on first signup).
        </p>
      </div>
      <InviteStaffForm locations={locations ?? []} />
      <UsersTable rows={profiles} locations={locations ?? []} />
    </div>
  );
}
