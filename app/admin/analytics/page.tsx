import { AnalyticsCharts } from "@/components/analytics-charts";
import { getProfile } from "@/lib/auth";
import type { AnalyticsPayload } from "@/lib/analytics";
import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";

export default async function AnalyticsPage() {
  const profile = await getProfile();
  if (!profile || profile.role !== "admin") redirect("/applications");

  const end = new Date();
  const start = new Date();
  start.setMonth(start.getMonth() - 12);

  const rangeStart = start.toISOString().slice(0, 10);
  const rangeEnd = end.toISOString().slice(0, 10);

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("analytics_summary", {
    range_start: rangeStart,
    range_end: rangeEnd,
  });

  if (error) {
    return (
      <div className="rounded-lg border border-destructive/50 bg-destructive/10 p-4 text-sm">
        Analytics unavailable: {error.message}
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Analytics</h1>
        <p className="text-sm text-muted-foreground">
          Last 12 months ({rangeStart} — {rangeEnd})
        </p>
      </div>
      <AnalyticsCharts payload={data as AnalyticsPayload} />
    </div>
  );
}
