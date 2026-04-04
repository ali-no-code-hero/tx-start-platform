/**
 * Build a `Server-Timing` header value (RFC 6797 style) for logging or proxies.
 * @see https://developer.mozilla.org/en-US/docs/Web/HTTP/Headers/Server-Timing
 * @see https://web.dev/articles/custom-metrics#server-timing-api
 */
const METRIC_NAME_RE = /^[a-zA-Z0-9_:-]+$/;

function sanitizeMetricName(name: string): string {
  const s = name.replace(/[^a-zA-Z0-9_-]/g, "_").slice(0, 64);
  return s.length > 0 ? s : "metric";
}

function escapeDesc(s: string): string {
  return s.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
}

export function formatServerTimingHeader(
  phases: Record<string, number>,
  descriptions?: Record<string, string>,
): string {
  const parts: string[] = [];
  for (const [rawName, durRaw] of Object.entries(phases)) {
    if (typeof durRaw !== "number" || !Number.isFinite(durRaw)) continue;
    const name = METRIC_NAME_RE.test(rawName) ? rawName : sanitizeMetricName(rawName);
    const dur = Math.max(0, Math.round(durRaw));
    let chunk = `${name};dur=${dur}`;
    const desc = descriptions?.[rawName];
    if (desc) chunk += `;desc="${escapeDesc(desc)}"`;
    parts.push(chunk);
  }
  return parts.join(", ");
}
