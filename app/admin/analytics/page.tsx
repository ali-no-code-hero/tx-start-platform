import { AnalyticsCharts } from "@/components/analytics-charts";
import { AnalyticsFilters } from "@/components/analytics-filters";
import { getProfile } from "@/lib/auth";
import type { AnalyticsPayload } from "@/lib/analytics";
import { parseAnalyticsSearchParams } from "@/lib/analytics";
import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";

export default async function AnalyticsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const profile = await getProfile();
  if (!profile || profile.role !== "admin") redirect("/applications");

  const sp = await searchParams;
  const urlState = parseAnalyticsSearchParams(sp);

  const supabase = await createClient();

  const [{ data: locRows }, { data: typeRows }, rpcResult] = await Promise.all([
    supabase.from("locations").select("id,name").order("name"),
    supabase.from("applications").select("type_of_loan").limit(8000),
    supabase.rpc("analytics_summary", {
      range_start: urlState.rangeStart,
      range_end: urlState.rangeEnd,
      location_ids: urlState.locationIds.length > 0 ? urlState.locationIds : null,
      include_unassigned: urlState.includeUnassigned,
      statuses: urlState.statuses.length > 0 ? urlState.statuses : null,
      loan_types: urlState.loanTypes.length > 0 ? urlState.loanTypes : null,
      urgent_filter:
        urlState.urgent === "yes" ? true : urlState.urgent === "no" ? false : null,
    }),
  ]);

  const { data, error } = rpcResult;

  const locations = (locRows ?? []).map((r) => ({
    id: r.id as string,
    name: r.name as string,
  }));

  const loanTypeOptions = [
    ...new Set(
      (typeRows ?? [])
        .map((r) => r.type_of_loan)
        .filter((t): t is string => typeof t === "string" && t.trim().length > 0),
    ),
  ].sort((a, b) => a.localeCompare(b));

  if (error) {
    return (
      <div className="space-y-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Analytics</h1>
          <p className="text-sm text-muted-foreground">
            {urlState.rangeStart} — {urlState.rangeEnd}
          </p>
        </div>
        <AnalyticsFilters
          locations={locations}
          loanTypeOptions={loanTypeOptions}
          initial={urlState}
        />
        <div className="rounded-lg border border-destructive/50 bg-destructive/10 p-4 text-sm">
          Analytics unavailable: {error.message}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Analytics</h1>
        <p className="text-sm text-muted-foreground">
          {urlState.rangeStart} — {urlState.rangeEnd}
          {urlState.locationIds.length > 0 || urlState.includeUnassigned
            ? " · filtered by location"
            : ""}
          {urlState.statuses.length > 0 ? " · filtered by status" : ""}
          {urlState.loanTypes.length > 0 ? " · filtered by loan type" : ""}
          {urlState.urgent !== "all" ? " · filtered by urgency" : ""}
        </p>
      </div>

      <AnalyticsFilters
        locations={locations}
        loanTypeOptions={loanTypeOptions}
        initial={urlState}
      />

      <AnalyticsCharts payload={data as AnalyticsPayload} />
    </div>
  );
}
