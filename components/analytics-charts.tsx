"use client";

import type { AnalyticsPayload } from "@/lib/analytics";
import { APPLICATION_STATUSES } from "@/lib/types";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

const STATUS_COLORS: Record<string, string> = {
  Pending: "oklch(0.65 0.15 85)",
  Confirmed: "oklch(0.55 0.12 250)",
  Rejected: "oklch(0.55 0.2 25)",
  Declined: "oklch(0.5 0.18 35)",
  Loaned: "oklch(0.5 0.14 145)",
};

function formatMoney(n: number | null | undefined): string {
  if (n == null || Number.isNaN(Number(n))) return "—";
  return `$${Number(n).toLocaleString(undefined, { maximumFractionDigits: 0 })}`;
}

function buildStackedMonthly(payload: AnalyticsPayload) {
  const rows = Array.isArray(payload.monthly_by_status) ? payload.monthly_by_status : [];
  const monthSet = new Set<string>();
  for (const r of rows) {
    if (r.month) monthSet.add(String(r.month).slice(0, 10));
  }
  const months = [...monthSet].sort();
  const data = months.map((m) => {
    const label = m.slice(0, 7);
    const row: Record<string, string | number> = { label };
    for (const s of APPLICATION_STATUSES) row[s] = 0;
    for (const r of rows) {
      const rm = r.month ? String(r.month).slice(0, 10) : "";
      if (rm !== m) continue;
      const st = r.status;
      if (st in row) row[st] = Number(r.count) || 0;
    }
    return row;
  });
  return data;
}

export function AnalyticsCharts({ payload }: { payload: AnalyticsPayload | null }) {
  if (!payload) {
    return <p className="text-sm text-muted-foreground">No analytics data.</p>;
  }

  const monthly = Array.isArray(payload.monthly_volume) ? payload.monthly_volume : [];
  const chartData = monthly.map((m) => ({
    label: m.month ? String(m.month).slice(0, 7) : "",
    count: Number(m.count) || 0,
  }));

  const stackedData = buildStackedMonthly(payload);
  const byStatus = Array.isArray(payload.by_status) ? payload.by_status : [];
  const byLocation = Array.isArray(payload.by_location) ? payload.by_location : [];
  const byLoanType = Array.isArray(payload.by_loan_type) ? payload.by_loan_type : [];
  const byPrior = Array.isArray(payload.by_prior_business) ? payload.by_prior_business : [];

  return (
    <div className="grid gap-6 lg:grid-cols-2">
      <Card className="lg:col-span-2">
        <CardHeader>
          <CardTitle className="text-base">Applications per month (by status)</CardTitle>
        </CardHeader>
        <CardContent className="h-[360px]">
          {stackedData.length === 0 ? (
            <p className="text-sm text-muted-foreground">No applications in this range.</p>
          ) : (
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={stackedData} margin={{ left: 8, right: 8, top: 8, bottom: 8 }}>
                <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                <XAxis dataKey="label" tick={{ fontSize: 11 }} />
                <YAxis allowDecimals={false} tick={{ fontSize: 11 }} />
                <Tooltip />
                <Legend wrapperStyle={{ fontSize: 11 }} />
                {APPLICATION_STATUSES.map((s) => (
                  <Bar
                    key={s}
                    dataKey={s}
                    stackId="stack"
                    fill={STATUS_COLORS[s] ?? "oklch(0.5 0.1 250)"}
                    radius={[0, 0, 0, 0]}
                  />
                ))}
              </BarChart>
            </ResponsiveContainer>
          )}
        </CardContent>
      </Card>

      <Card className="lg:col-span-2">
        <CardHeader>
          <CardTitle className="text-base">Applications per month (total)</CardTitle>
        </CardHeader>
        <CardContent className="h-[280px]">
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
          <CardTitle className="text-base">By status</CardTitle>
        </CardHeader>
        <CardContent className="h-[260px]">
          {byStatus.length === 0 ? (
            <p className="text-sm text-muted-foreground">No data.</p>
          ) : (
            <ResponsiveContainer width="100%" height="100%">
              <BarChart
                layout="vertical"
                data={byStatus.map((r) => ({
                  name: r.status,
                  count: Number(r.count) || 0,
                }))}
                margin={{ left: 8, right: 16, top: 8, bottom: 8 }}
              >
                <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                <XAxis type="number" allowDecimals={false} tick={{ fontSize: 11 }} />
                <YAxis
                  type="category"
                  dataKey="name"
                  width={72}
                  tick={{ fontSize: 11 }}
                />
                <Tooltip />
                <Bar dataKey="count" fill="oklch(0.48 0.14 260)" radius={[0, 4, 4, 0]} />
              </BarChart>
            </ResponsiveContainer>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">By location</CardTitle>
        </CardHeader>
        <CardContent className="h-[260px]">
          {byLocation.length === 0 ? (
            <p className="text-sm text-muted-foreground">No data.</p>
          ) : (
            <ResponsiveContainer width="100%" height="100%">
              <BarChart
                layout="vertical"
                data={byLocation.map((r) => ({
                  name: r.location_name,
                  count: Number(r.count) || 0,
                }))}
                margin={{ left: 8, right: 16, top: 8, bottom: 8 }}
              >
                <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                <XAxis type="number" allowDecimals={false} tick={{ fontSize: 11 }} />
                <YAxis type="category" dataKey="name" width={88} tick={{ fontSize: 11 }} />
                <Tooltip />
                <Bar dataKey="count" fill="oklch(0.5 0.12 200)" radius={[0, 4, 4, 0]} />
              </BarChart>
            </ResponsiveContainer>
          )}
        </CardContent>
      </Card>

      <Card className="lg:col-span-2">
        <CardHeader>
          <CardTitle className="text-base">By loan type</CardTitle>
        </CardHeader>
        <CardContent className="h-[min(360px,50vh)]">
          {byLoanType.length === 0 ? (
            <p className="text-sm text-muted-foreground">No data.</p>
          ) : (
            <ResponsiveContainer width="100%" height="100%">
              <BarChart
                layout="vertical"
                data={byLoanType.map((r) => ({
                  name: r.loan_type,
                  count: Number(r.count) || 0,
                }))}
                margin={{ left: 8, right: 16, top: 8, bottom: 8 }}
              >
                <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                <XAxis type="number" allowDecimals={false} tick={{ fontSize: 11 }} />
                <YAxis type="category" dataKey="name" width={120} tick={{ fontSize: 11 }} />
                <Tooltip />
                <Bar dataKey="count" fill="oklch(0.46 0.16 300)" radius={[0, 4, 4, 0]} />
              </BarChart>
            </ResponsiveContainer>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Prior business (legacy import)</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2 text-sm">
          {byPrior.length === 0 ? (
            <p className="text-sm text-muted-foreground">No data.</p>
          ) : (
            byPrior.map((r) => (
              <div key={r.bucket} className="flex justify-between gap-2">
                <span className="text-muted-foreground capitalize">{r.bucket}</span>
                <span className="font-medium tabular-nums">{Number(r.count) || 0}</span>
              </div>
            ))
          )}
          <p className="text-xs text-muted-foreground pt-1">
            Based on <code className="text-[0.7rem]">legacy_business_before</code> in submission
            metadata when present.
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Amounts and volume</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2 text-sm">
          <div className="flex justify-between gap-2">
            <span className="text-muted-foreground">Sum requested</span>
            <span className="font-medium tabular-nums">
              {formatMoney(payload.sum_loan_requested != null ? Number(payload.sum_loan_requested) : null)}
            </span>
          </div>
          <div className="flex justify-between gap-2">
            <span className="text-muted-foreground">Sum approved (Loaned)</span>
            <span className="font-medium tabular-nums">
              {formatMoney(
                payload.sum_loan_approved_loaned != null
                  ? Number(payload.sum_loan_approved_loaned)
                  : null,
              )}
            </span>
          </div>
          <div className="flex justify-between gap-2 border-t border-border pt-2">
            <span className="text-muted-foreground">Avg. requested</span>
            <span className="font-medium">{formatMoney(payload.avg_loan_requested)}</span>
          </div>
          <div className="flex justify-between gap-2">
            <span className="text-muted-foreground">Median requested</span>
            <span className="font-medium">{formatMoney(payload.median_loan_requested)}</span>
          </div>
          <div className="flex justify-between gap-2">
            <span className="text-muted-foreground">Avg. approved (any)</span>
            <span className="font-medium">{formatMoney(payload.avg_loan_approved)}</span>
          </div>
          <div className="flex justify-between gap-2">
            <span className="text-muted-foreground">Median approved (any)</span>
            <span className="font-medium">{formatMoney(payload.median_loan_approved)}</span>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Operations</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2 text-sm">
          <div className="flex justify-between gap-2">
            <span className="text-muted-foreground">% urgent (same-day)</span>
            <span className="font-medium">
              {payload.pct_urgent != null ? `${payload.pct_urgent}%` : "—"}
            </span>
          </div>
          <div className="flex justify-between gap-2">
            <span className="text-muted-foreground">Median hours to update</span>
            <span className="font-medium tabular-nums">
              {payload.median_hours_to_update != null
                ? `${payload.median_hours_to_update}h`
                : "—"}
            </span>
          </div>
          <p className="text-xs text-muted-foreground">
            Hours from created to updated when updated is later than created (rough backlog /
            processing signal).
          </p>
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
              {payload.reapplication_rate != null ? `${payload.reapplication_rate}%` : "—"}
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
