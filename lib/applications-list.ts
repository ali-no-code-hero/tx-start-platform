import type { SupabaseClient } from "@supabase/supabase-js";

import type { ApplicationRow, ApplicationStatus } from "@/lib/types";
import { APPLICATION_STATUSES } from "@/lib/types";

export const APPLICATION_LIST_PAGE_SIZE_DEFAULT = 25;
export const APPLICATION_LIST_PAGE_SIZE_MAX = 100;
const SEARCH_IDS_CAP = 200;
const LOAN_TYPE_SCAN_LIMIT = 5000;
const MAX_LOAN_FILTERS = 48;
const MAX_LOC_FILTERS = 64;

const APPLICATION_SELECT = `
  id,
  status,
  created_at,
  urgent_same_day,
  loan_amount_requested,
  loan_amount_approved,
  type_of_loan,
  location_id,
  submission_metadata,
  customers ( id, first_name, last_name, email, phone ),
  locations ( name )
`;

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function isUuid(s: string): boolean {
  return UUID_RE.test(s);
}

function firstParam(v: string | string[] | undefined): string | undefined {
  if (v === undefined) return undefined;
  return Array.isArray(v) ? v[0] : v;
}

function allTokens(v: string | string[] | undefined, max: number): string[] {
  if (v === undefined) return [];
  const parts = Array.isArray(v) ? v : [v];
  return parts
    .flatMap((p) => p.split(","))
    .map((s) => s.trim())
    .filter(Boolean)
    .slice(0, max);
}

export type ApplicationsListQueryState = {
  page: number;
  pageSize: number;
  q: string;
  status: ApplicationStatus | "all";
  urgent: "all" | "yes" | "no";
  locationIds: string[];
  unassignedOnly: boolean;
  loanTypes: string[];
};

export function parseApplicationsListQuery(
  raw: Record<string, string | string[] | undefined>,
): ApplicationsListQueryState {
  const page = Math.max(1, Number.parseInt(firstParam(raw.page) ?? "1", 10) || 1);
  const rawSize = Number.parseInt(firstParam(raw.pageSize) ?? "", 10);
  const pageSize = Number.isFinite(rawSize)
    ? Math.min(APPLICATION_LIST_PAGE_SIZE_MAX, Math.max(10, rawSize))
    : APPLICATION_LIST_PAGE_SIZE_DEFAULT;
  const q = (firstParam(raw.q) ?? "").trim();
  const st = firstParam(raw.status) ?? "all";
  const status =
    st === "all"
      ? "all"
      : (APPLICATION_STATUSES as readonly string[]).includes(st)
        ? (st as ApplicationStatus)
        : "all";

  const u = firstParam(raw.urgent);
  const urgent = u === "yes" || u === "no" ? u : "all";

  const unassignedRaw = firstParam(raw.unassigned);
  const unassignedOnly = unassignedRaw === "1" || unassignedRaw === "true";

  const locTokens = allTokens(raw.loc, MAX_LOC_FILTERS);
  const locationIds = locTokens.filter(isUuid);

  const loanTypes = allTokens(raw.loan, MAX_LOAN_FILTERS);

  return {
    page,
    pageSize,
    q,
    status,
    urgent,
    locationIds,
    unassignedOnly,
    loanTypes,
  };
}

/** Strip LIKE wildcards and delimiter chars so .or() filter strings stay safe. */
function sanitizeSearchToken(raw: string): string {
  return raw
    .trim()
    .slice(0, 120)
    .replace(/%/g, "")
    .replace(/_/g, "")
    .replace(/[,()]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function escapePostgrestInToken(s: string): string {
  if (/^[a-zA-Z0-9 _./+\-]+$/.test(s)) return s;
  return `"${s.replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`;
}

function mapApplicationRows(
  applications: Record<string, unknown>[],
): ApplicationRow[] {
  return applications.map((a) => {
    const cust = a.customers as
      | { id: string; first_name: string; last_name: string; email: string; phone: string | null }
      | { id: string; first_name: string; last_name: string; email: string; phone: string | null }[]
      | null;
    const loc = a.locations as { name: string } | { name: string }[] | null;
    return {
      id: a.id as string,
      status: a.status as ApplicationStatus,
      created_at: a.created_at as string,
      urgent_same_day: a.urgent_same_day as boolean,
      loan_amount_requested: a.loan_amount_requested as number | null,
      loan_amount_approved: a.loan_amount_approved as number | null,
      type_of_loan: a.type_of_loan as string | null,
      location_id: a.location_id as string | null,
      submission_metadata: a.submission_metadata as Record<string, unknown> | null,
      customers: Array.isArray(cust) ? cust[0] ?? null : cust,
      locations: Array.isArray(loc) ? loc[0] ?? null : loc,
    };
  });
}

export async function fetchLoanTypeFilterOptions(
  supabase: SupabaseClient,
): Promise<{ options: string[]; hasUnknown: boolean }> {
  const { data, error } = await supabase
    .from("applications")
    .select("type_of_loan")
    .limit(LOAN_TYPE_SCAN_LIMIT);

  if (error || !data) {
    return { options: [], hasUnknown: false };
  }

  const set = new Set<string>();
  let hasUnknown = false;
  for (const row of data) {
    const t = (row as { type_of_loan: string | null }).type_of_loan?.trim() ?? "";
    if (t) set.add(t);
    else hasUnknown = true;
  }
  return {
    options: [...set].sort((a, b) => a.localeCompare(b)),
    hasUnknown,
  };
}

export async function fetchApplicationsPage(
  supabase: SupabaseClient,
  params: ApplicationsListQueryState,
): Promise<{ rows: ApplicationRow[]; total: number; error: Error | null }> {
  const { page, pageSize, q, status, urgent, locationIds, unassignedOnly, loanTypes } =
    params;
  const from = (page - 1) * pageSize;
  const to = from + pageSize - 1;

  let query = supabase
    .from("applications")
    .select(APPLICATION_SELECT, { count: "exact" })
    .order("created_at", { ascending: false });

  if (status !== "all") {
    query = query.eq("status", status);
  }

  if (urgent === "yes") {
    query = query.eq("urgent_same_day", true);
  } else if (urgent === "no") {
    query = query.eq("urgent_same_day", false);
  }

  const hasLoc = locationIds.length > 0 || unassignedOnly;
  if (hasLoc) {
    if (unassignedOnly && locationIds.length === 0) {
      query = query.is("location_id", null);
    } else if (!unassignedOnly && locationIds.length > 0) {
      query = query.in("location_id", locationIds);
    } else {
      query = query.or(
        `location_id.is.null,location_id.in.(${locationIds.join(",")})`,
      );
    }
  }

  if (loanTypes.length > 0) {
    const wantUnknown = loanTypes.includes("Unknown");
    const known = loanTypes.filter((l) => l !== "Unknown");
    if (wantUnknown && known.length > 0) {
      const inList = known.map(escapePostgrestInToken).join(",");
      query = query.or(`type_of_loan.is.null,type_of_loan.eq.,type_of_loan.in.(${inList})`);
    } else if (wantUnknown) {
      query = query.or("type_of_loan.is.null,type_of_loan.eq.");
    } else {
      query = query.in("type_of_loan", known);
    }
  }

  const token = sanitizeSearchToken(q);
  if (token.length > 0) {
    const ilike = `%${token}%`;

    const [custRes, locRes] = await Promise.all([
      Promise.all([
        supabase.from("customers").select("id").ilike("first_name", ilike).limit(SEARCH_IDS_CAP),
        supabase.from("customers").select("id").ilike("last_name", ilike).limit(SEARCH_IDS_CAP),
        supabase.from("customers").select("id").ilike("email", ilike).limit(SEARCH_IDS_CAP),
        supabase.from("customers").select("id").ilike("phone", ilike).limit(SEARCH_IDS_CAP),
      ]),
      supabase.from("locations").select("id").ilike("name", ilike).limit(SEARCH_IDS_CAP),
    ]);

    const customerIdSet = new Set<string>();
    for (const r of custRes) {
      if (r.error) {
        return { rows: [], total: 0, error: new Error(r.error.message) };
      }
      for (const row of r.data ?? []) {
        customerIdSet.add((row as { id: string }).id);
      }
    }
    if (locRes.error) {
      return { rows: [], total: 0, error: new Error(locRes.error.message) };
    }
    const searchLocationIds = (locRes.data ?? []).map((row) => (row as { id: string }).id);

    const customerIds = [...customerIdSet];
    const orParts: string[] = [];
    if (customerIds.length > 0) {
      orParts.push(`customer_id.in.(${customerIds.join(",")})`);
    }
    orParts.push(`type_of_loan.ilike.${ilike}`);
    orParts.push(`status.ilike.${ilike}`);
    if (searchLocationIds.length > 0) {
      orParts.push(`location_id.in.(${searchLocationIds.join(",")})`);
    }
    query = query.or(orParts.join(","));
  }

  const { data: applications, error, count } = await query.range(from, to);

  if (error) {
    return { rows: [], total: 0, error: new Error(error.message) };
  }

  return {
    rows: mapApplicationRows((applications ?? []) as Record<string, unknown>[]),
    total: count ?? 0,
    error: null,
  };
}

export function applicationsListSearchParams(state: ApplicationsListQueryState): URLSearchParams {
  const p = new URLSearchParams();
  if (state.page > 1) p.set("page", String(state.page));
  if (state.pageSize !== APPLICATION_LIST_PAGE_SIZE_DEFAULT) {
    p.set("pageSize", String(state.pageSize));
  }
  if (state.q) p.set("q", state.q);
  if (state.status !== "all") p.set("status", state.status);
  if (state.urgent !== "all") p.set("urgent", state.urgent);
  if (state.unassignedOnly) p.set("unassigned", "1");
  for (const id of state.locationIds) {
    p.append("loc", id);
  }
  for (const lt of state.loanTypes) {
    p.append("loan", lt);
  }
  return p;
}
