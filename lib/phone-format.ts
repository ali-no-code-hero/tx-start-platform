/** US-focused E.164 for SMS/auth; no Twilio dependency (safe for client bundles). */
export function toE164Us(raw: string | null | undefined): string | null {
  const d = (raw ?? "").replace(/\D/g, "");
  if (d.length === 10) return `+1${d}`;
  if (d.length === 11 && d.startsWith("1")) return `+${d}`;
  const t = (raw ?? "").trim();
  if (t.startsWith("+") && d.length >= 10) return `+${d}`;
  return null;
}
