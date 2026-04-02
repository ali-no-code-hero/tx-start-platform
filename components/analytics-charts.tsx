"use client";

import type { AnalyticsPayload } from "@/lib/analytics";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

export function AnalyticsCharts({ payload }: { payload: AnalyticsPayload | null }) {
  if (!payload) {
    return <p className="text-sm text-muted-foreground">No analytics data.</p>;
  }

  const monthly = Array.isArray(payload.monthly_volume) ? payload.monthly_volume : [];

  const chartData = monthly.map((m) => ({
    label: m.month ? String(m.month).slice(0, 7) : "",
    count: Number(m.count) || 0,
  }));

  return (
    <div className="grid gap-6 lg:grid-cols-2">
      <Card className="lg:col-span-2">
        <CardHeader>
          <CardTitle className="text-base">Applications per month</CardTitle>
        </CardHeader>
        <CardContent className="h-[320px]">
          {chartData.length === 0 ? (
            <p className="text-sm text-muted-foreground">No applications in this range.</p>
          ) : (
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={chartData} margin={{ left: 8, right: 8, top: 8, bottom: 8 }}>
                <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                <XAxis dataKey="label" tick={{ fontSize: 11 }} />
                <YAxis allowDecimals={false} tick={{ fontSize: 11 }} />
                <Tooltip />
                <Bar dataKey="count" fill="oklch(0.45 0.15 250)" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Averages</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2 text-sm">
          <div className="flex justify-between">
            <span className="text-muted-foreground">Avg. amount requested</span>
            <span className="font-medium">
              {payload.avg_loan_requested != null
                ? `$${Number(payload.avg_loan_requested).toLocaleString()}`
                : "—"}
            </span>
          </div>
          <div className="flex justify-between">
            <span className="text-muted-foreground">Avg. amount approved</span>
            <span className="font-medium">
              {payload.avg_loan_approved != null
                ? `$${Number(payload.avg_loan_approved).toLocaleString()}`
                : "—"}
            </span>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Retention / reapplication</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2 text-sm">
          <div className="flex justify-between">
            <span className="text-muted-foreground">Reapplication rate (period)</span>
            <span className="font-medium">
              {payload.reapplication_rate != null
                ? `${payload.reapplication_rate}%`
                : "—"}
            </span>
          </div>
          <p className="text-xs text-muted-foreground">
            Share of customers (with ≥1 application in range) who submitted more than once in the
            same range.
          </p>
          <div className="flex justify-between pt-2 border-t border-border">
            <span className="text-muted-foreground">Total applications</span>
            <span className="font-medium">{payload.total_applications_in_range ?? 0}</span>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
