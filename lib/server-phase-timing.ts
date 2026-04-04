/**
 * JSON-line phase timings for Vercel/Node logs. Enable on prod with
 * `SERVER_TIMING_APPLICATIONS=1`. In development, logging is on by default.
 */
export function shouldLogApplicationsTiming(): boolean {
  if (process.env.SERVER_TIMING_APPLICATIONS === "0") return false;
  if (process.env.SERVER_TIMING_APPLICATIONS === "1") return true;
  return process.env.NODE_ENV === "development";
}

export type ServerPhaseTimer = {
  timeAsync: <T>(name: string, fn: () => Promise<T>) => Promise<T>;
  finish: (extra?: Record<string, unknown>) => void;
};

/** No-op timer when logging is disabled. */
export function createApplicationsPageTimer(): ServerPhaseTimer {
  if (!shouldLogApplicationsTiming()) {
    return {
      timeAsync: <T>(_name: string, fn: () => Promise<T>) => fn(),
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
    finish(extra?: Record<string, unknown>) {
      const totalMs = Math.round(performance.now() - t0);
      console.log(
        JSON.stringify({
          event: "server_phase_timing",
          scope: "applications_page",
          phases,
          totalMs,
          ...extra,
        }),
      );
    },
  };
}
