import { LocationsManager } from "@/components/locations-manager";
import { createAdminClient } from "@/lib/supabase/admin";

export default async function AdminLocationsPage() {
  const admin = createAdminClient();
  const { data: locations, error } = await admin
    .from("locations")
    .select("id, name, created_at")
    .order("name");

  if (error) {
    return (
      <div className="rounded-lg border border-destructive/50 bg-destructive/10 p-4 text-sm">
        Failed to load locations: {error.message}
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="border-l-[3px] border-primary pl-4">
        <h1 className="text-2xl font-semibold tracking-tight text-foreground">Locations</h1>
        <p className="text-sm text-muted-foreground">
          Store names must match Wix form values (e.g. Longview 2).
        </p>
      </div>
      <LocationsManager initial={locations ?? []} />
    </div>
  );
}
