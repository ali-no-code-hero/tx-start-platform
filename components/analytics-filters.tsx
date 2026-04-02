"use client";

import type { AnalyticsUrlState } from "@/lib/analytics";
import { APPLICATION_STATUSES, type ApplicationStatus } from "@/lib/types";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";

type LocationOption = { id: string; name: string };

type Props = {
  locations: LocationOption[];
  loanTypeOptions: string[];
  initial: AnalyticsUrlState;
};

function toggleList<T>(list: T[], item: T, eq: (a: T, b: T) => boolean): T[] {
  const i = list.findIndex((x) => eq(x, item));
  if (i >= 0) return list.filter((_, j) => j !== i);
  return [...list, item];
}

export function AnalyticsFilters({ locations, loanTypeOptions, initial }: Props) {
  const router = useRouter();
  const [from, setFrom] = useState(initial.rangeStart);
  const [to, setTo] = useState(initial.rangeEnd);
  const [locIds, setLocIds] = useState<string[]>(initial.locationIds);
  const [unassigned, setUnassigned] = useState(initial.includeUnassigned);
  const [statuses, setStatuses] = useState<ApplicationStatus[]>(initial.statuses);
  const [loanTypes, setLoanTypes] = useState<string[]>(initial.loanTypes);
  const [urgent, setUrgent] = useState<"all" | "yes" | "no">(initial.urgent);

  const presets = useMemo(
    () =>
      [
        { label: "30d", days: 30 },
        { label: "90d", days: 90 },
        { label: "12 mo", months: 12 },
      ] as const,
    [],
  );

  function applyPreset(days?: number, months?: number) {
    const end = new Date();
    const start = new Date();
    if (days != null) start.setDate(start.getDate() - days);
    if (months != null) start.setMonth(start.getMonth() - months);
    setFrom(start.toISOString().slice(0, 10));
    setTo(end.toISOString().slice(0, 10));
  }

  function applyToUrl() {
    const q = new URLSearchParams();
    q.set("from", from);
    q.set("to", to);
    for (const id of locIds) q.append("location", id);
    if (unassigned) q.set("unassigned", "1");
    for (const s of statuses) q.append("status", s);
    for (const lt of loanTypes) q.append("loan_type", lt);
    if (urgent !== "all") q.set("urgent", urgent);
    router.push(`/admin/analytics?${q.toString()}`);
  }

  function clearFilters() {
    const defEnd = new Date();
    const defStart = new Date();
    defStart.setMonth(defStart.getMonth() - 12);
    setFrom(defStart.toISOString().slice(0, 10));
    setTo(defEnd.toISOString().slice(0, 10));
    setLocIds([]);
    setUnassigned(false);
    setStatuses([]);
    setLoanTypes([]);
    setUrgent("all");
    router.push("/admin/analytics");
  }

  return (
    <div className="space-y-4 rounded-lg border border-border bg-card p-4">
      <div className="flex flex-wrap items-end gap-3">
        <div className="grid gap-1.5">
          <Label htmlFor="analytics-from">From</Label>
          <input
            id="analytics-from"
            type="date"
            value={from}
            onChange={(e) => setFrom(e.target.value)}
            className="h-8 rounded-md border border-input bg-background px-2 text-sm"
          />
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor="analytics-to">To</Label>
          <input
            id="analytics-to"
            type="date"
            value={to}
            onChange={(e) => setTo(e.target.value)}
            className="h-8 rounded-md border border-input bg-background px-2 text-sm"
          />
        </div>
        <div className="flex flex-wrap gap-1">
          {presets.map((p) => (
            <Button
              key={p.label}
              type="button"
              variant="outline"
              size="sm"
              onClick={() =>
                "days" in p ? applyPreset(p.days) : applyPreset(undefined, p.months)
              }
            >
              {p.label}
            </Button>
          ))}
        </div>
      </div>

      <div className="grid gap-1.5">
        <Label>Urgent same-day</Label>
        <div className="flex flex-wrap gap-1">
          {(
            [
              ["all", "All"],
              ["yes", "Urgent only"],
              ["no", "Not urgent"],
            ] as const
          ).map(([v, label]) => (
            <Button
              key={v}
              type="button"
              size="sm"
              variant={urgent === v ? "default" : "outline"}
              onClick={() => setUrgent(v)}
            >
              {label}
            </Button>
          ))}
        </div>
      </div>

      <div className="grid gap-2">
        <Label>Location</Label>
        <div className="flex flex-wrap gap-1">
          <Button
            type="button"
            size="sm"
            variant={unassigned ? "default" : "outline"}
            onClick={() => setUnassigned((u) => !u)}
          >
            Unassigned
          </Button>
          {locations.map((loc) => {
            const on = locIds.includes(loc.id);
            return (
              <Button
                key={loc.id}
                type="button"
                size="sm"
                variant={on ? "default" : "outline"}
                onClick={() =>
                  setLocIds((prev) => toggleList(prev, loc.id, (a, b) => a === b))
                }
              >
                {loc.name}
              </Button>
            );
          })}
        </div>
      </div>

      <div className="grid gap-2">
        <Label>Status</Label>
        <div className="flex flex-wrap gap-1">
          {APPLICATION_STATUSES.map((s) => {
            const on = statuses.includes(s);
            return (
              <Button
                key={s}
                type="button"
                size="sm"
                variant={on ? "default" : "outline"}
                className={cn(on && "font-medium")}
                onClick={() =>
                  setStatuses((prev) => toggleList(prev, s, (a, b) => a === b))
                }
              >
                {s}
              </Button>
            );
          })}
        </div>
      </div>

      {loanTypeOptions.length > 0 ? (
        <div className="grid gap-2">
          <Label>Loan type</Label>
          <div className="flex flex-wrap gap-1">
            <Button
              type="button"
              size="sm"
              variant={loanTypes.includes("Unknown") ? "default" : "outline"}
              onClick={() =>
                setLoanTypes((prev) => toggleList(prev, "Unknown", (a, b) => a === b))
              }
            >
              Unknown
            </Button>
            {loanTypeOptions.map((lt) => {
              const on = loanTypes.includes(lt);
              return (
                <Button
                  key={lt}
                  type="button"
                  size="sm"
                  variant={on ? "default" : "outline"}
                  onClick={() =>
                    setLoanTypes((prev) => toggleList(prev, lt, (a, b) => a === b))
                  }
                >
                  {lt}
                </Button>
              );
            })}
          </div>
        </div>
      ) : null}

      <div className="flex flex-wrap gap-2 pt-1">
        <Button type="button" onClick={() => applyToUrl()}>
          Apply filters
        </Button>
        <Button type="button" variant="outline" onClick={() => clearFilters()}>
          Reset
        </Button>
      </div>
    </div>
  );
}
