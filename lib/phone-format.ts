/** Digits for US national number (10 digits), or null. */
function usNationalDigits(raw: string): string | null {
  const d = raw.replace(/\D/g, "");
  if (d.length === 10) return d;
  if (d.length === 11 && d.startsWith("1")) return d.slice(1);
  return null;
}

/** US-focused E.164 for SMS/auth; no Twilio dependency (safe for client bundles). */
export function toE164Us(raw: string | null | undefined): string | null {
  const d = (raw ?? "").replace(/\D/g, "");
  if (d.length === 10) return `+1${d}`;
  if (d.length === 11 && d.startsWith("1")) return `+${d}`;
  const t = (raw ?? "").trim();
  if (t.startsWith("+") && d.length >= 10) return `+${d}`;
  return null;
}

/** Pretty-print US national format, e.g. (512) 767-3628. Null if not a US 10-digit number. */
export function formatPhoneUs(raw: string | null | undefined): string | null {
  const ten = usNationalDigits((raw ?? "").trim());
  if (!ten) return null;
  return `(${ten.slice(0, 3)}) ${ten.slice(3, 6)}-${ten.slice(6)}`;
}

/**
 * Canonical `customers.phone`: formatted when parseable as US 10-digit; empty → null;
 * otherwise trimmed original (partial or non-US input preserved).
 */
export function toStoredUsPhone(raw: string | null | undefined): string | null {
  const t = (raw ?? "").trim();
  if (!t) return null;
  return formatPhoneUs(t) ?? t;
}

/** Friendly value for `application_sms.to_phone` audit rows (US numbers only in this product). */
export function toStoredSmsToPhone(e164: string): string {
  return formatPhoneUs(e164) ?? e164;
}
