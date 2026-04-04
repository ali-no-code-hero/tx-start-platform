import {
  applicationsListHasActiveFilters,
  fetchApplicationsMatchingCount,
  type ApplicationsListQueryState,
  type ApplicationsListSearchResolved,
} from "@/lib/applications-list";
import type { ServerPhaseTimer } from "@/lib/server-phase-timing";
import { createClient } from "@/lib/supabase/server";
import type { UserRole } from "@/lib/types";

export async function ApplicationsMatchingCount({
  timer,
  profileRole,
  listQuery,
  resolved,
}: {
  timer: ServerPhaseTimer;
  profileRole: UserRole;
  listQuery: ApplicationsListQueryState;
  resolved: ApplicationsListSearchResolved;
}) {
  const supabase = await createClient();
  const matchingTotalCount = await timer.timeAsync("matching_count_planned", () =>
    fetchApplicationsMatchingCount(supabase, listQuery, resolved),
  );

  return (
    <p className="mt-2 text-sm tabular-nums text-muted-foreground">
      {matchingTotalCount != null ? (
        <>
          <span className="font-semibold text-foreground">
            {matchingTotalCount.toLocaleString()}
          </span>{" "}
          application{matchingTotalCount !== 1 ? "s" : ""}
          {applicationsListHasActiveFilters(listQuery)
            ? " match these filters"
            : profileRole === "admin"
              ? " in the system"
              : profileRole === "staff"
                ? " you can access"
                : ""}
          <span className="font-normal"> (planner estimate)</span>.
        </>
      ) : (
        <>
          Total count is unavailable right now
          {profileRole === "admin" && !applicationsListHasActiveFilters(listQuery)
            ? " — all applications still load below"
            : ""}
          .
        </>
      )}
    </p>
  );
}
