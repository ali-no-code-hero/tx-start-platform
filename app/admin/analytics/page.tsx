import {
  AnalyticsChartsSection,
  AnalyticsChartsSkeleton,
} from "@/components/analytics-charts-section";
import { AnalyticsPageContent } from "@/components/analytics-page-content";
import { getProfile } from "@/lib/auth";
import { parseAnalyticsSearchParams } from "@/lib/analytics";
import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import { Suspense } from "react";

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

  const [{ data: locRows }, loanTypesResult] = await Promise.all([
    supabase.from("locations").select("id,name").order("name"),
    supabase.rpc("analytics_distinct_loan_types"),
  ]);

  const locations = (locRows ?? []).map((r) => ({
    id: r.id as string,
    name: r.name as string,
  }));

  const loanTypeOptions = Array.isArray(loanTypesResult.data)
    ? (loanTypesResult.data as string[]).filter(
        (t): t is string => typeof t === "string" && t.trim().length > 0,
      )
    : [];

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

      <AnalyticsPageContent
        locations={locations}
        loanTypeOptions={loanTypeOptions}
        initial={urlState}
      >
        <Suspense fallback={<AnalyticsChartsSkeleton />}>
          <AnalyticsChartsSection urlState={urlState} />
        </Suspense>
      </AnalyticsPageContent>
    </div>
  );
}
