import type { ApplicationStatus } from "@/lib/types";

export type AnalyticsMonthlyRow = { month: string; count: number };
export type AnalyticsMonthlyStatusRow = { month: string; status: string; count: number };
export type AnalyticsBreakdownRow = { status: string; count: number };
export type AnalyticsLocationRow = {
  location_id: string | null;
  location_name: string;
  count: number;
};
export type AnalyticsLoanTypeRow = { loan_type: string; count: number };
export type AnalyticsPriorBusinessRow = { bucket: string; count: number };

export type AnalyticsPayload = {
  monthly_volume: AnalyticsMonthlyRow[];
  monthly_by_status: AnalyticsMonthlyStatusRow[];
  by_status: AnalyticsBreakdownRow[];
  by_location: AnalyticsLocationRow[];
  by_loan_type: AnalyticsLoanTypeRow[];
  by_prior_business: AnalyticsPriorBusinessRow[];
  avg_loan_requested: number | null;
  median_loan_requested: number | null;
  avg_loan_approved: number | null;
  median_loan_approved: number | null;
  sum_loan_requested: number | null;
  sum_loan_approved_loaned: number | null;
  pct_urgent: number | null;
  median_hours_to_update: number | null;
  reapplication_rate: number | null;
  total_applications_in_range: number;
};

export type AnalyticsUrlState = {
  rangeStart: string;
  rangeEnd: string;
  locationIds: string[];
  includeUnassigned: boolean;
  statuses: ApplicationStatus[];
  loanTypes: string[];
  urgent: "all" | "yes" | "no";
};

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const STATUSES: ReadonlySet<string> = new Set([
  "Pending",
  "Confirmed",
  "Rejected",
  "Declined",
  "Loaned",
]);

function multiParam(
  sp: Record<string, string | string[] | undefined>,
  key: string,
): string[] {
  const v = sp[key];
  if (v === undefined) return [];
  return Array.isArray(v) ? v : [v];
}

function defaultRange(): { start: string; end: string } {
  const end = new Date();
  const start = new Date();
  start.setMonth(start.getMonth() - 12);
  return {
    start: start.toISOString().slice(0, 10),
    end: end.toISOString().slice(0, 10),
  };
}

function isIsoDate(s: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
  const t = Date.parse(`${s}T12:00:00Z`);
  return !Number.isNaN(t);
}

/** Parse admin analytics URL search params into validated state + RPC args. */
export function parseAnalyticsSearchParams(
  sp: Record<string, string | string[] | undefined>,
): AnalyticsUrlState {
  const def = defaultRange();
  const fromRaw = multiParam(sp, "from")[0];
  const toRaw = multiParam(sp, "to")[0];
  let rangeStart = fromRaw && isIsoDate(fromRaw) ? fromRaw : def.start;
  let rangeEnd = toRaw && isIsoDate(toRaw) ? toRaw : def.end;
  if (rangeEnd < rangeStart) {
    [rangeStart, rangeEnd] = [rangeEnd, rangeStart];
  }

  const locationIds = multiParam(sp, "location")
    .map((s) => s.trim())
    .filter((s) => UUID_RE.test(s));

  const includeUnassigned = multiParam(sp, "unassigned").some((v) => v === "1" || v === "true");

  const statuses = multiParam(sp, "status").filter((s): s is ApplicationStatus =>
    STATUSES.has(s),
  );

  const loanTypes = multiParam(sp, "loan_type").map((s) => s.trim()).filter(Boolean);

  const urgentRaw = multiParam(sp, "urgent")[0]?.toLowerCase();
  const urgent =
    urgentRaw === "yes" || urgentRaw === "no"
      ? urgentRaw
      : ("all" as const);

  return {
    rangeStart,
    rangeEnd,
    locationIds,
    includeUnassigned,
    statuses,
    loanTypes,
    urgent,
  };
}
