"use client";

import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { APPLICATION_STATUSES, type ApplicationStatus } from "@/lib/types";
import Link from "next/link";
import { useMemo, useState } from "react";

export type ApplicationRow = {
  id: string;
  status: ApplicationStatus;
  created_at: string;
  urgent_same_day: boolean;
  loan_amount_requested: number | null;
  loan_amount_approved: number | null;
  type_of_loan: string | null;
  location_id: string | null;
  submission_metadata: Record<string, unknown> | null;
  customers: {
    id: string;
    first_name: string;
    last_name: string;
    email: string;
    phone: string | null;
  } | null;
  locations: { name: string } | null;
};

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
  isAdmin,
  isCustomer = false,
}: {
  rows: ApplicationRow[];
  isAdmin: boolean;
  isCustomer?: boolean;
}) {
  const [q, setQ] = useState("");
  const [status, setStatus] = useState<ApplicationStatus | "all">("all");

  const filtered = useMemo(() => {
    return rows.filter((r) => {
      if (status !== "all" && r.status !== status) return false;
      if (!q.trim()) return true;
      const n = q.toLowerCase();
      const c = r.customers;
      const hay = [
        c?.first_name,
        c?.last_name,
        c?.email,
        c?.phone,
        r.type_of_loan,
        r.locations?.name,
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();
      return hay.includes(n);
    });
  }, [rows, q, status]);

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <Input
          placeholder={
            isCustomer
              ? "Search loan type, location, status…"
              : "Search name, email, phone, loan type…"
          }
          value={q}
          onChange={(e) => setQ(e.target.value)}
          className="max-w-md bg-background"
        />
        <div className="flex flex-wrap gap-2">
          {(["all", ...APPLICATION_STATUSES] as const).map((s) => (
            <button
              key={s}
              type="button"
              onClick={() => setStatus(s)}
              className={`rounded-full border px-3 py-1 text-xs font-medium transition-colors ${
                status === s
                  ? "border-primary bg-primary text-primary-foreground"
                  : "border-border bg-background text-muted-foreground hover:bg-muted"
              }`}
            >
              {s === "all" ? "All" : s}
            </button>
          ))}
        </div>
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
            {filtered.length === 0 ? (
              <TableRow>
                <TableCell colSpan={7} className="text-center text-muted-foreground">
                  No applications match.
                </TableCell>
              </TableRow>
            ) : (
              filtered.map((r) => {
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
    </div>
  );
}
