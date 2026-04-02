import { AnalyticsCharts } from "@/components/analytics-charts";
import type { AnalyticsPayload, AnalyticsUrlState } from "@/lib/analytics";
import { createClient } from "@/lib/supabase/server";

export function AnalyticsChartsSkeleton() {
  return (
    <div className="space-y-4" aria-busy="true" aria-label="Loading analytics">
      <div className="grid gap-4 md:grid-cols-2">
        {[0, 1, 2, 3].map((i) => (
          <div
            key={i}
            className="h-[280px] animate-pulse rounded-lg border bg-muted/40"
          />
        ))}
      </div>
      <div className="h-[320px] animate-pulse rounded-lg border bg-muted/40" />
    </div>
  );
}

export async function AnalyticsChartsSection({ urlState }: { urlState: AnalyticsUrlState }) {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("analytics_summary", {
    range_start: urlState.rangeStart,
    range_end: urlState.rangeEnd,
    location_ids: urlState.locationIds.length > 0 ? urlState.locationIds : null,
    include_unassigned: urlState.includeUnassigned,
    statuses: urlState.statuses.length > 0 ? urlState.statuses : null,
    loan_types: urlState.loanTypes.length > 0 ? urlState.loanTypes : null,
    urgent_filter:
      urlState.urgent === "yes" ? true : urlState.urgent === "no" ? false : null,
  });

  if (error) {
    return (
      <div className="rounded-lg border border-destructive/50 bg-destructive/10 p-4 text-sm">
        Analytics unavailable: {error.message}
      </div>
    );
  }

  return <AnalyticsCharts payload={data as AnalyticsPayload} />;
}
