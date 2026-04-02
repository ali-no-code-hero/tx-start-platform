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
  if (patch.page !== undefined) return next;
  if (
    patch.q !== undefined ||
    patch.status !== undefined ||
    patch.urgent !== undefined ||
    patch.locationIds !== undefined ||
    patch.unassignedOnly !== undefined ||
    patch.loanTypes !== undefined ||
    patch.pageSize !== undefined
  ) {
    next.page = 1;
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
  page,
  pageSize,
  queryState,
  isAdmin,
  isCustomer = false,
  locations = [],
  loanTypeOptions = [],
  hasUnknownLoanType = false,
}: {
  rows: ApplicationRow[];
  /** Exact total when known (last page or full count); `null` when more rows may exist after this page. */
  totalCount: number | null;
  hasNextPage: boolean;
  page: number;
  pageSize: number;
  queryState: ApplicationsListQueryState;
  isAdmin: boolean;
  isCustomer?: boolean;
  locations?: { id: string; name: string }[];
  loanTypeOptions?: string[];
  hasUnknownLoanType?: boolean;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const queryRef = useRef(queryState);
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

  const showLoanTypeFilters = loanTypeOptions.length > 0 || hasUnknownLoanType;
  const totalPages =
    totalCount != null ? Math.max(1, Math.ceil(totalCount / pageSize)) : null;
  const from =
    rows.length === 0 ? 0 : (page - 1) * pageSize + 1;
  const to = from + rows.length - 1;

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <Input
          placeholder={
            isCustomer
              ? "Search loan type, location, status…"
              : "Search name, email, phone, loan type…"
          }
          value={qInput}
          onChange={(e) => setQInput(e.target.value)}
          className="max-w-md bg-background"
        />
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
            <div className="flex flex-wrap gap-1">
              {hasUnknownLoanType ? (
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
              {loanTypeOptions.map((lt) => {
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
            : totalCount != null
              ? `Showing ${from}–${to} of ${totalCount}`
              : hasNextPage
                ? `Showing ${from}–${to}+`
                : `Showing ${from}–${to}`}
        </p>
        <div className="flex items-center gap-2">
          {page > 1 ? (
            <Link
              href={listHref(pathname, patchListQuery(queryState, { page: page - 1 }))}
              className={cn(buttonVariants({ variant: "outline", size: "sm" }))}
            >
              Previous
            </Link>
          ) : (
            <Button type="button" variant="outline" size="sm" disabled>
              Previous
            </Button>
          )}
          <span className="text-sm text-muted-foreground tabular-nums">
            {totalPages != null ? `Page ${page} of ${totalPages}` : `Page ${page}`}
          </span>
          {(totalPages != null ? page < totalPages : hasNextPage) ? (
            <Link
              href={listHref(pathname, patchListQuery(queryState, { page: page + 1 }))}
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
