import { getProfile } from "@/lib/auth";
import {
  parseApplicationsListQuery,
  resolveApplicationsListSearch,
} from "@/lib/applications-list";
import { createApplicationsPageTimer } from "@/lib/server-phase-timing";
import { createClient } from "@/lib/supabase/server";
import { logSupabaseQueryErrorWithRequest } from "@/lib/server-trace";
import { redirect } from "next/navigation";
import { Suspense } from "react";

import {
  ApplicationsListSection,
  ApplicationsListSectionFallback,
} from "./applications-list-section";
import { ApplicationsMatchingCount } from "./applications-matching-count";

export default async function ApplicationsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const timer = createApplicationsPageTimer();

  const profile = await timer.timeAsync("get_profile", () => getProfile());
  if (!profile) redirect("/account/unauthorized");

  const raw = await searchParams;
  const listQuery = parseApplicationsListQuery(raw);

  const supabase = await timer.timeAsync("create_supabase_server_client", () => createClient());

  const [locsResult, searchPrep] = await timer.timeAsync(
    "wave1_locations_and_search_resolve",
    async () =>
      Promise.all([
        profile.role === "customer"
          ? Promise.resolve({
              data: [] as { id: string; name: string }[],
              error: null,
            })
          : supabase.from("locations").select("id, name").order("name"),
        resolveApplicationsListSearch(supabase, listQuery),
      ]),
  );

  const locationsForFilters =
    profile.role === "customer" ? [] : (locsResult.data ?? []);
  if (!searchPrep.ok) {
    const { error, logContext } = searchPrep.failure;
    timer.finish({
      profileRole: profile.role,
      abortedAfter: "wave1_search_resolve_failed",
      page: listQuery.page,
      pageSize: listQuery.pageSize,
      hasSearch: listQuery.q.trim().length > 0,
    });
    await logSupabaseQueryErrorWithRequest(
      "applications_list_query_failed",
      error,
      {
        route: "/applications",
        profileRole: profile.role,
        profileId: profile.id,
        locationId: profile.location_id,
        query: "applications_search_resolve",
        listQuery: {
          page: listQuery.page,
          pageSize: listQuery.pageSize,
          qLen: listQuery.q.length,
          status: listQuery.status,
          urgent: listQuery.urgent,
          locationFilterCount: listQuery.locationIds.length,
          loanTypeFilterCount: listQuery.loanTypes.length,
          unassignedOnly: listQuery.unassignedOnly,
        },
      },
      logContext
        ? { ...logContext, listFetchMode: "search_resolve" }
        : null,
    );
    return (
      <div className="rounded-lg border border-destructive/50 bg-destructive/10 p-4 text-sm">
        Failed to load applications:{" "}
        {[error.message, error.details, error.code].filter(Boolean).join(" — ") ||
          "Something went wrong loading this list."}
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Applications</h1>
        <p className="text-sm text-muted-foreground">
          {profile.role === "customer"
            ? "Your loan applications and status updates."
            : profile.role === "staff"
              ? `Applications for your assigned location (${listQuery.pageSize} per page; filters and search apply across all you can access).`
              : `All locations (${listQuery.pageSize} per page; filters and search apply across the full dataset).`}
        </p>
        <Suspense
          fallback={
            <p className="mt-2 text-sm tabular-nums text-muted-foreground">
              <span className="text-muted-foreground/80">Loading total…</span>
            </p>
          }
        >
          <ApplicationsMatchingCount
            timer={timer}
            profileRole={profile.role}
            listQuery={listQuery}
            resolved={searchPrep.resolved}
          />
        </Suspense>
      </div>
      <Suspense fallback={<ApplicationsListSectionFallback />}>
        <ApplicationsListSection
          timer={timer}
          profile={profile}
          listQuery={listQuery}
          resolved={searchPrep.resolved}
          locationsForFilters={locationsForFilters}
        />
      </Suspense>
    </div>
  );
}
