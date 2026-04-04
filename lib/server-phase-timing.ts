import { formatServerTimingHeader } from "@/lib/format-server-timing";

/**
 * Structured timing logs for /applications (Vercel Functions + optional local dev).
 *
 * Env:
 * - `APPLICATIONS_PERF_LOG=0` — disable all application perf logs (including on Vercel).
 * - `APPLICATIONS_PERF_LOG=1` — force enable (any environment).
 * - `SERVER_TIMING_APPLICATIONS=1` — same as APPLICATIONS_PERF_LOG=1 (legacy).
 * - Default: on in development; on on Vercel unless APPLICATIONS_PERF_LOG=0.
 *
 * Note: Next.js App Router does not expose a public API to set the HTTP `Server-Timing`
 * header from Server Components (responses are streamed before your code can append headers).
 * We emit the same metrics in structured logs as `server_timing_header` so you can correlate
 * with https://web.dev/articles/custom-metrics#server-timing-api and paste into proxies if needed.
 */
export function shouldEmitApplicationsPerformance(): boolean {
  if (process.env.APPLICATIONS_PERF_LOG === "0") return false;
  if (process.env.APPLICATIONS_PERF_LOG === "1") return true;
  if (process.env.SERVER_TIMING_APPLICATIONS === "1") return true;
  if (process.env.SERVER_TIMING_APPLICATIONS === "0") return false;
  if (process.env.NODE_ENV === "development") return true;
  if (process.env.VERCEL === "1") return true;
  return false;
}

/** @deprecated use shouldEmitApplicationsPerformance */
export function shouldLogApplicationsTiming(): boolean {
  return shouldEmitApplicationsPerformance();
}

export type ServerPhaseTimer = {
  timeAsync: <T>(name: string, fn: () => Promise<T>) => Promise<T>;
  /** Record a duration without wrapping (e.g. parallel Suspense sibling). */
  recordPhase: (name: string, durationMs: number) => void;
  /** Snapshot after all phases; includes values merged in `finish()`. */
  getPhaseSnapshot: () => Record<string, number>;
  finish: (extra?: Record<string, unknown>) => void;
};

type ListFetchTimingsLike = {
  applicationsSelectMs?: number;
  batchHydrateMs?: number;
};

function mergeListFetchTimingsIntoPhases(
  phases: Record<string, number>,
  listFetchTimings: ListFetchTimingsLike | undefined,
): void {
  if (!listFetchTimings) return;
  if (typeof listFetchTimings.applicationsSelectMs === "number") {
    phases.applications_select = listFetchTimings.applicationsSelectMs;
  }
  if (typeof listFetchTimings.batchHydrateMs === "number") {
    phases.batch_hydrate = listFetchTimings.batchHydrateMs;
  }
}

/** No-op timer when logging is disabled. */
export function createApplicationsPageTimer(): ServerPhaseTimer {
  if (!shouldEmitApplicationsPerformance()) {
    return {
      timeAsync: <T>(_name: string, fn: () => Promise<T>) => fn(),
      recordPhase: () => {},
      getPhaseSnapshot: () => ({}),
      finish: () => {},
    };
  }

  const t0 = performance.now();
  const phases: Record<string, number> = {};

  return {
    async timeAsync<T>(name: string, fn: () => Promise<T>): Promise<T> {
      const start = performance.now();
      try {
        return await fn();
      } finally {
        phases[name] = Math.round(performance.now() - start);
      }
    },
    recordPhase(name: string, durationMs: number) {
      phases[name] = Math.round(durationMs);
    },
    getPhaseSnapshot() {
      return { ...phases };
    },
    finish(extra?: Record<string, unknown>) {
      if (extra?.listFetchTimings && typeof extra.listFetchTimings === "object") {
        mergeListFetchTimingsIntoPhases(phases, extra.listFetchTimings as ListFetchTimingsLike);
      }

      const totalMs = Math.round(performance.now() - t0);
      phases.total_route = totalMs;

      const serverTimingHeader = formatServerTimingHeader(phases, {
        get_profile: "getProfile + Supabase auth",
        create_supabase_server_client: "createServerClient",
        wave1_locations_and_search_resolve: "locations list + search id resolution",
        matching_count_planned: "planned count HEAD (skipped when search active)",
        applications_list: "applications query + hydrate (inner)",
        loan_type_options_rpc: "applications_distinct_loan_type_options RPC",
        applications_select: "PostgREST select or RPC wall time",
        batch_hydrate: "batch customers + locations",
        total_route: "timer wall time until list section finish",
      });

      console.log(
        JSON.stringify({
          event: "server_phase_timing",
          scope: "applications_page",
          phases,
          totalMs,
          server_timing_header: serverTimingHeader,
          vercel: {
            id: process.env.VERCEL_ID ?? null,
            region: process.env.VERCEL_REGION ?? null,
            deploymentId: process.env.VERCEL_DEPLOYMENT_ID ?? null,
          },
          ...extra,
        }),
      );
    },
  };
}
