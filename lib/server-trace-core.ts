/** PostgREST / Supabase client error shape (subset we log). */
export type PostgrestLikeError = {
  message: string;
  code?: string | null;
  details?: string | null;
  hint?: string | null;
};

/** Safe JSON snapshot for Vercel logs when PostgREST returns `{}` or non-standard bodies. */
export function snapshotUnknownError(raw: unknown, maxLen = 4000): string {
  try {
    if (raw != null && typeof raw === "object") {
      const o = raw as Record<string, unknown>;
      const payload = {
        message: o.message,
        code: o.code,
        details: o.details,
        hint: o.hint,
        error: o.error,
        name: raw instanceof Error ? raw.name : undefined,
      };
      return JSON.stringify(payload).slice(0, maxLen);
    }
    return String(raw).slice(0, maxLen);
  } catch {
    return "[unserializable error]";
  }
}

/**
 * Build a user-visible + loggable error when the client returns odd shapes
 * (e.g. JSON `{}`, `{ error: "..." }` without `message`, or network failures with status only).
 */
export function coercePostgrestLikeError(
  raw: unknown,
  http: { status: number; statusText: string },
): PostgrestLikeError {
  const httpLine = [http.status > 0 ? String(http.status) : "", http.statusText?.trim() ?? ""]
    .filter(Boolean)
    .join(" ");

  if (raw instanceof Error) {
    const e = raw as Error & { code?: string; details?: string; hint?: string };
    const msg = (e.message ?? "").trim();
    return {
      message: msg || httpLine || "Request failed.",
      code: e.code ?? null,
      details: e.details ?? null,
      hint: e.hint ?? null,
    };
  }

  if (raw != null && typeof raw === "object") {
    const o = raw as Record<string, unknown>;
    const fromErrorKey = typeof o.error === "string" ? o.error.trim() : "";
    const m =
      [o.message, fromErrorKey || null, o.msg, o.detail]
        .map((x) => (typeof x === "string" ? x.trim() : ""))
        .find(Boolean) ?? "";
    if (m) {
      return {
        message: m,
        code: typeof o.code === "string" ? o.code : null,
        details:
          typeof o.details === "string"
            ? o.details
            : typeof o.detail === "string"
              ? o.detail
              : null,
        hint: typeof o.hint === "string" ? o.hint : null,
      };
    }
    const keys = Object.keys(o);
    if (keys.length > 0) {
      return {
        message:
          httpLine ||
          `Unrecognized error body (keys: ${keys.join(",")}): ${JSON.stringify(o).slice(0, 400)}`,
        code: typeof o.code === "string" ? o.code : null,
        details: typeof o.details === "string" ? o.details : null,
        hint: typeof o.hint === "string" ? o.hint : null,
      };
    }
  }

  return {
    message:
      httpLine ||
      "Request failed with an empty or unrecognized error body (check diag.httpStatus in Vercel logs).",
    code: null,
    details: null,
    hint: null,
  };
}

function normalizePostgrestLogFields(err: PostgrestLikeError): PostgrestLikeError {
  const msg = (err.message ?? "").trim();
  if (msg) return { ...err, message: msg };
  const fallback = [err.code, err.details, err.hint]
    .map((s) => (typeof s === "string" ? s.trim() : ""))
    .filter(Boolean)
    .join(" — ");
  return {
    ...err,
    message: fallback || "(empty error message; likely non-JSON or empty upstream body)",
  };
}

export type VercelRequestTrace = {
  vercelId?: string;
  deploymentId?: string;
  /** Edge / routing region when present */
  region?: string;
};

function getVercelDeployMeta(): Record<string, string | undefined> {
  return {
    vercelEnv: process.env.VERCEL_ENV,
    vercelDeploymentId: process.env.VERCEL_DEPLOYMENT_ID,
    vercelCommit: process.env.VERCEL_GIT_COMMIT_SHA?.slice(0, 12),
  };
}

/**
 * One JSON line per call — filter in Vercel → Logs with e.g. `applications_list_query_failed`
 * or `source:tx-star-crm`. Use `diag` for HTTP status, failing step, URL length, error snapshots.
 */
export function logSupabaseQueryError(
  event: string,
  err: PostgrestLikeError,
  ctx: Record<string, unknown> = {},
  diag?: Record<string, unknown> | null,
): void {
  const n = normalizePostgrestLogFields(err);
  const payload: Record<string, unknown> = {
    source: "tx-star-crm",
    event,
    severity: "error",
    supabase: {
      message: n.message,
      code: n.code ?? null,
      details: n.details ?? null,
      hint: n.hint ?? null,
    },
    ctx,
    deploy: getVercelDeployMeta(),
    ts: new Date().toISOString(),
  };
  if (diag != null && Object.keys(diag).length > 0) {
    payload.diag = diag;
  }
  console.error(JSON.stringify(payload));
}
