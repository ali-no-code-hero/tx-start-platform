import { formatPhoneUs } from "@/lib/phone-format";
import { z } from "zod";

/** Accepts unknown webhook body; extracts fields via common paths + label map. */
const looseRecord = z.record(z.string(), z.unknown());

function asRecord(v: unknown): Record<string, unknown> | null {
  if (v && typeof v === "object" && !Array.isArray(v)) {
    return v as Record<string, unknown>;
  }
  return null;
}

function pickStr(obj: unknown, keys: string[]): string | undefined {
  const r = asRecord(obj);
  if (!r) return undefined;
  for (const k of keys) {
    const v = r[k];
    if (typeof v === "string" && v.trim()) return v.trim();
  }
  return undefined;
}

function pickBool(obj: unknown, keys: string[]): boolean | undefined {
  const r = asRecord(obj);
  if (!r) return undefined;
  for (const k of keys) {
    const v = r[k];
    if (typeof v === "boolean") return v;
    if (v === "Checked" || v === "true") return true;
    if (v === "false") return false;
  }
  return undefined;
}

function pickNum(obj: unknown, keys: string[]): number | undefined {
  const r = asRecord(obj);
  if (!r) return undefined;
  for (const k of keys) {
    const v = r[k];
    if (typeof v === "number" && !Number.isNaN(v)) return v;
    if (typeof v === "string") {
      const n = Number(String(v).replace(/[^0-9.]/g, ""));
      if (!Number.isNaN(n)) return n;
    }
  }
  return undefined;
}

type LabelEntry = { label?: string; value?: unknown };

function submissionsFromBody(body: Record<string, unknown>): LabelEntry[] {
  const raw = body.submissions ?? body.Submissions;
  if (!Array.isArray(raw)) return [];
  return raw.map((item) => {
    const o = asRecord(item);
    return {
      label:
        typeof o?.label === "string"
          ? o.label
          : typeof o?.["Submissions Label"] === "string"
            ? (o["Submissions Label"] as string)
            : undefined,
      value:
        o?.value ?? o?.["Submissions Value"] ?? o?.["Submissions value"],
    };
  });
}

function valueByLabel(entries: LabelEntry[], want: string): string | undefined {
  const w = want.toLowerCase();
  for (const e of entries) {
    if (e.label && e.label.toLowerCase() === w) {
      if (typeof e.value === "string") return e.value.trim();
      if (typeof e.value === "number") return String(e.value);
      if (e.value === true) return "true";
    }
  }
  return undefined;
}

function normalizePhone(input: string | undefined): string {
  if (!input) return "";
  return input.replace(/\D/g, "");
}

export type NormalizedWixSubmission = {
  wixSubmissionId: string;
  wixFormId?: string;
  wixContactId?: string;
  submissionsUrl?: string;
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  phoneDigits: string;
  loanAmountRequested?: number;
  typeOfLoan?: string;
  locationName?: string;
  urgentSameDay: boolean;
  termsAgreed: boolean;
  submittedAt?: string;
};

export function normalizeWixPayload(raw: unknown): NormalizedWixSubmission | null {
  const parsed = looseRecord.safeParse(raw);
  if (!parsed.success) return null;
  const body = parsed.data;

  const subs = submissionsFromBody(body);

  const contact = asRecord(body.contact ?? body.Contact);
  const contactName = asRecord(contact?.name ?? contact?.Name);

  const firstName =
    pickStr(body, ["Field First Name", "fieldFirstName", "firstName"]) ??
    valueByLabel(subs, "First name") ??
    pickStr(contactName, ["first", "First"]) ??
    "";

  const lastName =
    pickStr(body, ["Field Last Name", "fieldLastName", "lastName"]) ??
    valueByLabel(subs, "Last name") ??
    pickStr(contactName, ["last", "Last"]) ??
    "";

  const email =
    pickStr(body, ["Field Email", "fieldEmail", "email"]) ??
    valueByLabel(subs, "Email") ??
    pickStr(contact, ["email", "Email"]) ??
    "";

  const phoneRaw =
    pickStr(body, ["Field Phone 6 C 34", "Contact Phone", "phone"]) ??
    valueByLabel(subs, "Phone") ??
    "";

  const wixSubmissionId =
    pickStr(body, ["Submission Id", "submissionId", "id"]) ?? "";

  if (!wixSubmissionId || !email) {
    return null;
  }

  const safeFirst = firstName || "Unknown";
  const safeLast = lastName || "Unknown";

  const loanAmount =
    pickNum(body, ["Field Loan Amount", "loan_amount", "loanAmount"]) ??
    (() => {
      const s = valueByLabel(subs, "Loan Amount");
      return s ? Number(s.replace(/[^0-9.]/g, "")) : undefined;
    })();

  const typeOfLoan =
    pickStr(body, ["Field Type Of Loan", "type_of_loan", "typeOfLoan"]) ??
    valueByLabel(subs, "Type of Loan");

  const locationName =
    pickStr(body, ["Field Location", "location"]) ??
    valueByLabel(subs, "Location");

  const urgentFromLabel =
    valueByLabel(subs, "Do you need an urgent same-day loan?") === "Checked";
  const termsFromLabel =
    valueByLabel(
      subs,
      "I agree to the Terms & Conditions and Privacy Policy and consent to be contacted regarding the loan and for marketing purposes by providing my information.",
    ) === "Checked";

  const urgentSameDay =
    pickBool(body, ["form_field_3e5c", "Field Form Field 3 E 5 C 1"]) ??
    urgentFromLabel;

  const termsAgreed =
    pickBool(body, ["form_field_d82e", "Field Form Field D 82 E"]) ??
    termsFromLabel;

  const wixContactId =
    pickStr(body, ["Contact Id", "contactId", "contact_id"]) ??
    pickStr(contact, ["id", "contactId"]);

  const submissionsUrl = pickStr(body, ["Submissions Link", "submissionsLink"]);

  const wixFormId = pickStr(body, ["Form Id", "formId"]);

  const submittedAt = pickStr(body, ["Submission Time", "submissionTime", "createdAt"]);

  const phoneDigits = normalizePhone(phoneRaw);
  const phone =
    phoneDigits.length >= 10
      ? (formatPhoneUs(phoneDigits) ?? (phoneRaw || phoneDigits))
      : phoneRaw || phoneDigits;

  return {
    wixSubmissionId,
    wixFormId,
    wixContactId,
    submissionsUrl,
    firstName: safeFirst,
    lastName: safeLast,
    email: email.toLowerCase(),
    phone,
    phoneDigits,
    loanAmountRequested: loanAmount,
    typeOfLoan,
    locationName,
    urgentSameDay: Boolean(urgentSameDay),
    termsAgreed: Boolean(termsAgreed),
    submittedAt,
  };
}
