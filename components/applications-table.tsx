"use client";

import { Badge } from "@/components/ui/badge";
import { Button, buttonVariants } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  APPLICATION_LIST_MIN_SEARCH_CHARS,
  applicationsListSearchParams,
  type ApplicationsListQueryState,
} from "@/lib/applications-list";
import { cn } from "@/lib/utils";
import type { ApplicationRow } from "@/lib/types";
import { APPLICATION_STATUSES, type ApplicationStatus } from "@/lib/types";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";

function toggleList<T>(list: T[], item: T, eq: (a: T, b: T) => boolean): T[] {
  const i = list.findIndex((x) => eq(x, item));
  if (i >= 0) return list.filter((_, j) => j !== i);
  return [...list, item];
}

function patchListQuery(
  base: ApplicationsListQueryState,
  patch: Partial<ApplicationsListQueryState>,
): ApplicationsListQueryState {
  const next: ApplicationsListQueryState = { ...base, ...patch };
  if (patch.after !== undefined && patch.after != null) next.before = null;
  if (patch.before !== undefined && patch.before != null) next.after = null;
  if (
    patch.q !== undefined ||
    patch.status !== undefined ||
    patch.urgent !== undefined ||
    patch.locationIds !== undefined ||
    patch.unassignedOnly !== undefined ||
    patch.loanTypes !== undefined ||
    patch.pageSize !== undefined
  ) {
    next.after = null;
    next.before = null;
  }
  return next;
}

function listHref(pathname: string, state: ApplicationsListQueryState): string {
  const qs = applicationsListSearchParams(state).toString();
  return qs ? `${pathname}?${qs}` : pathname;
}

function statusVariant(s: ApplicationStatus) {
  switch (s) {
    case "Pending":
      return "secondary" as const;
    case "Confirmed":
      return "default" as const;
    case "Loaned":
      return "default" as const;
    case "Rejected":
    case "Declined":
      return "destructive" as const;
    default:
      return "outline" as const;
  }
}

export function ApplicationsTable({
  rows,
  totalCount,
  hasNextPage,
  hasPreviousPage,
  pageSize,
  queryState,
  isAdmin,
  isCustomer = false,
  locations = [],
  loanTypeOptions = [],
  hasUnknownLoanType = false,
  deferLoanTypeOptions = false,
}: {
  rows: ApplicationRow[];
  /** Exact total when known (last page or full count); `null` when more rows may exist after this page. */
  totalCount: number | null;
  hasNextPage: boolean;
  /** True when URL has a keyset cursor (`after` or `before`). */
  hasPreviousPage: boolean;
  pageSize: number;
  queryState: ApplicationsListQueryState;
  isAdmin: boolean;
  isCustomer?: boolean;
  locations?: { id: string; name: string }[];
  loanTypeOptions?: string[];
  hasUnknownLoanType?: boolean;
  /**
   * When true, loan-type chips load via `/api/applications/loan-type-options` after mount
   * so the main list RSC does not block on the distinct RPC.
   */
  deferLoanTypeOptions?: boolean;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const queryRef = useRef(queryState);

  const [deferredLoanLoad, setDeferredLoanLoad] = useState<"loading" | "done" | "error">(
    () => (deferLoanTypeOptions ? "loading" : "done"),
  );
  const [deferredLoanOptions, setDeferredLoanOptions] = useState<string[]>([]);
  const [deferredLoanUnknown, setDeferredLoanUnknown] = useState(false);

  useEffect(() => {
    if (!deferLoanTypeOptions) return;
    let cancelled = false;
    fetch("/api/applications/loan-type-options")
      .then((r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return r.json() as Promise<{ options?: unknown; has_unknown?: unknown }>;
      })
      .then((data) => {
        if (cancelled) return;
        const raw = data.options;
        const options = Array.isArray(raw)
          ? raw.filter((t): t is string => typeof t === "string" && t.trim() !== "")
          : [];
        setDeferredLoanOptions(
          [...new Set(options.map((t) => t.trim()))].sort((a, b) => a.localeCompare(b)),
        );
        setDeferredLoanUnknown(Boolean(data.has_unknown));
        setDeferredLoanLoad("done");
      })
      .catch(() => {
        if (cancelled) return;
        setDeferredLoanOptions([]);
        setDeferredLoanUnknown(false);
        setDeferredLoanLoad("error");
      });
    return () => {
      cancelled = true;
    };
  }, [deferLoanTypeOptions]);

  const effectiveLoanOptions = deferLoanTypeOptions ? deferredLoanOptions : loanTypeOptions;
  const effectiveLoanUnknown = deferLoanTypeOptions ? deferredLoanUnknown : hasUnknownLoanType;
  useEffect(() => {
    queryRef.current = queryState;
  }, [queryState]);

  const [qInput, setQInput] = useState(queryState.q);
  useEffect(() => {
    // Debounced field must match URL after navigation (back/forward, filters, pagination).
    // eslint-disable-next-line react-hooks/set-state-in-effect -- intentional URL → input sync
    setQInput(queryState.q);
  }, [queryState.q]);

  useEffect(() => {
    const id = setTimeout(() => {
      const qs = queryRef.current;
      const trimmed = qInput.trim();
      if (trimmed === qs.q.trim()) return;
      router.replace(listHref(pathname, patchListQuery(qs, { q: trimmed })));
    }, 400);
    return () => clearTimeout(id);
  }, [qInput, pathname, router]);

  const pushList = (next: ApplicationsListQueryState) => {
    router.push(listHref(pathname, next));
  };

  const showLoanTypeFilters =
    (deferLoanTypeOptions &&
      (deferredLoanLoad === "loading" || deferredLoanLoad === "error")) ||
    effectiveLoanOptions.length > 0 ||
    effectiveLoanUnknown;
  const totalPages =
    totalCount != null ? Math.max(1, Math.ceil(totalCount / pageSize)) : null;
  const isAnchorPage = queryState.after == null && queryState.before == null;
  const from =
    rows.length === 0 ? 0 : isAnchorPage ? 1 : null;
  const to = rows.length === 0 ? 0 : rows.length;
  const firstRow = rows[0];
  const lastRow = rows.length > 0 ? rows[rows.length - 1] : null;
  const prevHref =
    hasPreviousPage && firstRow
      ? listHref(
          pathname,
          patchListQuery(queryState, {
            before: { created_at: firstRow.created_at, id: firstRow.id },
            after: null,
          }),
        )
      : null;
  const nextHref =
    hasNextPage && lastRow
      ? listHref(
          pathname,
          patchListQuery(queryState, {
            after: { created_at: lastRow.created_at, id: lastRow.id },
            before: null,
          }),
        )
      : null;

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex max-w-md flex-1 flex-col gap-1">
          <Input
            placeholder={
              isCustomer
                ? `Search loan type, location, status… (${APPLICATION_LIST_MIN_SEARCH_CHARS}+ characters)`
                : `Search name, email, phone, loan type… (${APPLICATION_LIST_MIN_SEARCH_CHARS}+ characters)`
            }
            value={qInput}
            onChange={(e) => setQInput(e.target.value)}
            className="bg-background"
          />
          {qInput.trim().length > 0 &&
          qInput.trim().length < APPLICATION_LIST_MIN_SEARCH_CHARS ? (
            <p className="text-xs text-muted-foreground">
              Type at least {APPLICATION_LIST_MIN_SEARCH_CHARS} characters to run search (shorter
              text is ignored for loading the list).
            </p>
          ) : null}
        </div>
        <div className="flex flex-wrap gap-2">
          {(["all", ...APPLICATION_STATUSES] as const).map((s) => (
            <button
              key={s}
              type="button"
              onClick={() =>
                pushList(
                  patchListQuery(queryState, {
                    status: s === "all" ? "all" : s,
                  }),
                )
              }
              className={`rounded-full border px-3 py-1 text-xs font-medium transition-colors ${
                queryState.status === s
                  ? "border-primary bg-primary text-primary-foreground"
                  : "border-border bg-background text-muted-foreground hover:bg-muted"
              }`}
            >
              {s === "all" ? "All" : s}
            </button>
          ))}
        </div>
      </div>

      <div className="space-y-3 rounded-lg border border-border bg-card p-4">
        <div className="grid gap-2">
          <Label className="text-muted-foreground">Urgent same-day</Label>
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
                variant={queryState.urgent === v ? "default" : "outline"}
                onClick={() =>
                  pushList(
                    patchListQuery(queryState, {
                      urgent: v,
                    }),
                  )
                }
              >
                {label}
              </Button>
            ))}
          </div>
        </div>

        {locations.length > 0 ? (
          <div className="grid gap-2">
            <Label className="text-muted-foreground">Location</Label>
            <div className="flex flex-wrap gap-1">
              <Button
                type="button"
                size="sm"
                variant={queryState.unassignedOnly ? "default" : "outline"}
                onClick={() =>
                  pushList(
                    patchListQuery(queryState, {
                      unassignedOnly: !queryState.unassignedOnly,
                    }),
                  )
                }
              >
                Unassigned
              </Button>
              {locations.map((loc) => {
                const on = queryState.locationIds.includes(loc.id);
                return (
                  <Button
                    key={loc.id}
                    type="button"
                    size="sm"
                    variant={on ? "default" : "outline"}
                    className={cn(on && "font-medium")}
                    onClick={() =>
                      pushList(
                        patchListQuery(queryState, {
                          locationIds: toggleList(
                            queryState.locationIds,
                            loc.id,
                            (a, b) => a === b,
                          ),
                        }),
                      )
                    }
                  >
                    {loc.name}
                  </Button>
                );
              })}
            </div>
          </div>
        ) : null}

        {showLoanTypeFilters ? (
          <div className="grid gap-2">
            <Label className="text-muted-foreground">Loan type</Label>
            {deferLoanTypeOptions && deferredLoanLoad === "loading" ? (
              <p className="text-xs text-muted-foreground">Loading loan type filters…</p>
            ) : deferLoanTypeOptions && deferredLoanLoad === "error" ? (
              <p className="text-xs text-destructive">
                Loan type filters could not be loaded. Refresh the page or try again later.
              </p>
            ) : (
              <div className="flex flex-wrap gap-1">
                {effectiveLoanUnknown ? (
                  <Button
                    type="button"
                    size="sm"
                    variant={
                      queryState.loanTypes.includes("Unknown") ? "default" : "outline"
                    }
                    onClick={() =>
                      pushList(
                        patchListQuery(queryState, {
                          loanTypes: toggleList(
                            queryState.loanTypes,
                            "Unknown",
                            (a, b) => a === b,
                          ),
                        }),
                      )
                    }
                  >
                    Unknown
                  </Button>
                ) : null}
                {effectiveLoanOptions.map((lt) => {
                  const on = queryState.loanTypes.includes(lt);
                  return (
                    <Button
                      key={lt}
                      type="button"
                      size="sm"
                      variant={on ? "default" : "outline"}
                      className={cn(on && "font-medium")}
                      onClick={() =>
                        pushList(
                          patchListQuery(queryState, {
                            loanTypes: toggleList(queryState.loanTypes, lt, (a, b) => a === b),
                          }),
                        )
                      }
                    >
                      {lt}
                    </Button>
                  );
                })}
              </div>
            )}
          </div>
        ) : null}
      </div>

      <div className="rounded-lg border border-border bg-card overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Applicant</TableHead>
              <TableHead>Location</TableHead>
              <TableHead>Loan</TableHead>
              <TableHead>Amount</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Urgent</TableHead>
              <TableHead>Submitted</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.length === 0 ? (
              <TableRow>
                <TableCell colSpan={7} className="text-center text-muted-foreground">
                  No applications match.
                </TableCell>
              </TableRow>
            ) : (
              rows.map((r) => {
                const c = r.customers;
                const meta = r.submission_metadata as { needs_location_review?: boolean } | null;
                return (
                  <TableRow key={r.id}>
                    <TableCell>
                      <Link
                        href={`/applications/${r.id}`}
                        prefetch={false}
                        className="font-medium text-primary hover:underline"
                      >
                        {c ? `${c.first_name} ${c.last_name}` : "—"}
                      </Link>
                      <div className="text-xs text-muted-foreground">{c?.email}</div>
                    </TableCell>
                    <TableCell>
                      <span>{r.locations?.name ?? "—"}</span>
                      {isAdmin && meta?.needs_location_review && !r.location_id && (
                        <Badge variant="outline" className="ml-2 text-amber-600">
                          Needs location
                        </Badge>
                      )}
                    </TableCell>
                    <TableCell className="max-w-[140px] truncate text-sm">
                      {r.type_of_loan ?? "—"}
                    </TableCell>
                    <TableCell>
                      {r.loan_amount_requested != null
                        ? `$${Number(r.loan_amount_requested).toLocaleString()}`
                        : "—"}
                    </TableCell>
                    <TableCell>
                      <Badge variant={statusVariant(r.status)}>{r.status}</Badge>
                    </TableCell>
                    <TableCell>{r.urgent_same_day ? "Yes" : "—"}</TableCell>
                    <TableCell className="whitespace-nowrap text-sm text-muted-foreground">
                      {new Date(r.created_at).toLocaleString()}
                    </TableCell>
                  </TableRow>
                );
              })
            )}
          </TableBody>
        </Table>
      </div>

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-sm text-muted-foreground">
          {rows.length === 0
            ? "No results"
            : from != null
              ? totalCount != null
                ? `Showing ${from}–${to} of ${totalCount}`
                : hasNextPage
                  ? `Showing ${from}–${to}+`
                  : `Showing ${from}–${to}`
              : totalCount != null
                ? `Showing ${rows.length} of ${totalCount}`
                : hasNextPage
                  ? `Showing ${rows.length} (more below)`
                  : `Showing ${rows.length}`}
        </p>
        <div className="flex items-center gap-2">
          {prevHref ? (
            <Link
              href={prevHref}
              className={cn(buttonVariants({ variant: "outline", size: "sm" }))}
            >
              Previous
            </Link>
          ) : (
            <Button type="button" variant="outline" size="sm" disabled>
              Previous
            </Button>
          )}
          <span className="min-w-[5rem] text-center text-sm text-muted-foreground tabular-nums">
            {isAnchorPage && totalPages != null ? `~${totalPages} pages` : !isAnchorPage ? "···" : ""}
          </span>
          {nextHref ? (
            <Link
              href={nextHref}
              className={cn(buttonVariants({ variant: "outline", size: "sm" }))}
            >
              Next
            </Link>
          ) : (
            <Button type="button" variant="outline" size="sm" disabled>
              Next
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}
