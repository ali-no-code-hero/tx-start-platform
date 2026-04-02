import type { ApplicationStatus } from "@/lib/types";

/** Minimal RFC 4180-style parser (quoted fields, commas inside quotes). */
export function parseCsvRows(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let inQuotes = false;
  const len = text.length;

  const pushField = () => {
    row.push(field);
    field = "";
  };

  const pushRow = () => {
    if (row.length > 1 || (row.length === 1 && row[0] !== "")) {
      rows.push(row);
    }
    row = [];
  };

  for (let i = 0; i < len; i++) {
    const c = text[i]!;
    if (inQuotes) {
      if (c === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        field += c;
      }
    } else if (c === '"') {
      inQuotes = true;
    } else if (c === ",") {
      pushField();
    } else if (c === "\n") {
      pushField();
      pushRow();
    } else if (c === "\r") {
      if (text[i + 1] === "\n") i++;
      pushField();
      pushRow();
    } else {
      field += c;
    }
  }
  pushField();
  if (row.length > 0 && !(row.length === 1 && row[0] === "")) {
    rows.push(row);
  }
  return rows;
}

function trimCell(s: string): string {
  return s.trim();
}

function parseBoolLoose(v: string): boolean {
  return v.trim().toUpperCase() === "TRUE";
}

function parseOptionalBool(v: string): boolean | null {
  const t = v.trim();
  if (t === "") return null;
  if (t.toUpperCase() === "TRUE") return true;
  if (t.toUpperCase() === "FALSE") return false;
  return null;
}

function parseNumberLoose(v: string): number | null {
  const t = v.trim();
  if (t === "") return null;
  const n = Number(t.replace(/,/g, ""));
  return Number.isFinite(n) ? n : null;
}

function parseUsDateTime(v: string): Date | null {
  const t = v.trim();
  if (!t) return null;
  const d = new Date(t);
  return Number.isNaN(d.getTime()) ? null : d;
}

const STATUS_MAP: Record<string, ApplicationStatus> = {
  PENDING: "Pending",
  CONFIRMED: "Confirmed",
  REJECTED: "Rejected",
  DECLINED: "Declined",
  LOANED: "Loaned",
};

function mapStatus(raw: string): ApplicationStatus | null {
  const key = raw.trim().toUpperCase();
  return STATUS_MAP[key] ?? null;
}

export type ParsedLegacyLoanRow = {
  legacyNumericId: string;
  legacyUuid: string;
  createdAt: Date | null;
  updatedAt: Date | null;
  status: ApplicationStatus;
  firstName: string;
  lastName: string;
  locationName: string;
  email: string;
  phone: string | null;
  typeOfLoan: string | null;
  loanAmountRequested: number | null;
  urgentSameDay: boolean;
  businessBefore: boolean | null;
  termsAgreed: boolean;
  loanAmountApproved: number | null;
  raw: Record<string, string>;
};

export type LegacyCsvParseResult =
  | { ok: true; rows: ParsedLegacyLoanRow[]; errors: { rowIndex: number; message: string }[] }
  | { ok: false; error: string };

const EXPECTED_HEADERS = new Set([
  "id",
  "uuid",
  "createdat",
  "updatedat",
  "status",
  "firstname",
  "lastname",
  "location",
  "email",
  "phonenumber",
  "typeofloan",
  "loanamount",
  "urgent",
  "businessbefore",
  "agreementtermsconditions",
  "loanamountapproved",
  "finalapprovedloan",
]);

export function parseLegacyLoanExportCsv(csvText: string): LegacyCsvParseResult {
  const grid = parseCsvRows(csvText.replace(/^\uFEFF/, ""));
  if (grid.length < 2) {
    return { ok: false, error: "CSV must include a header row and at least one data row." };
  }

  const headerRaw = grid[0]!.map(trimCell);
  const headerKeys = headerRaw.map((h) => h.toLowerCase().replace(/\s/g, ""));
  const missing = [...EXPECTED_HEADERS].filter((h) => !headerKeys.includes(h));
  if (missing.length > 0) {
    return {
      ok: false,
      error: `Missing expected column(s): ${missing.join(", ")}. Export must match the legacy loan export format.`,
    };
  }

  const col = (name: string) => {
    const idx = headerKeys.indexOf(name.toLowerCase().replace(/\s/g, ""));
    return idx >= 0 ? idx : -1;
  };

  const iUuid = col("uuid");
  const iEmail = col("email");
  const iFirst = col("firstname");
  const iLast = col("lastname");
  const iStatus = col("status");
  const iCreated = col("createdat");
  const iUpdated = col("updatedat");
  const iLoc = col("location");
  const iPhone = col("phonenumber");
  const iType = col("typeofloan");
  const iReq = col("loanamount");
  const iUrgent = col("urgent");
  const iBiz = col("businessbefore");
  const iTerms = col("agreementtermsconditions");
  const iAppr = col("loanamountapproved");
  const iFinal = col("finalapprovedloan");
  const iNumId = col("id");

  const rows: ParsedLegacyLoanRow[] = [];
  const errors: { rowIndex: number; message: string }[] = [];

  for (let r = 1; r < grid.length; r++) {
    const cells = grid[r]!;
    const get = (idx: number) => trimCell(cells[idx] ?? "");
    const raw: Record<string, string> = {};
    headerRaw.forEach((h, j) => {
      raw[h] = trimCell(cells[j] ?? "");
    });

    const legacyUuid = get(iUuid);
    const email = get(iEmail).trim().toLowerCase();
    const firstName = get(iFirst).trim();
    const lastName = get(iLast).trim();
    const statusRaw = get(iStatus);
    const status = mapStatus(statusRaw);

    if (!legacyUuid) {
      errors.push({ rowIndex: r + 1, message: "Missing uuid" });
      continue;
    }
    if (!email || !email.includes("@")) {
      errors.push({ rowIndex: r + 1, message: "Missing or invalid email" });
      continue;
    }
    if (!firstName || !lastName) {
      errors.push({ rowIndex: r + 1, message: "Missing first or last name" });
      continue;
    }
    if (!status) {
      errors.push({ rowIndex: r + 1, message: `Unknown status: ${statusRaw}` });
      continue;
    }

    const loanAppr = parseNumberLoose(get(iAppr));
    const loanFinal = parseNumberLoose(get(iFinal));
    const loanAmountApproved =
      loanAppr != null ? loanAppr : loanFinal != null ? loanFinal : null;

    rows.push({
      legacyNumericId: get(iNumId),
      legacyUuid,
      createdAt: parseUsDateTime(get(iCreated)),
      updatedAt: parseUsDateTime(get(iUpdated)),
      status,
      firstName,
      lastName,
      locationName: get(iLoc).trim(),
      email,
      phone: (() => {
        const p = get(iPhone).trim();
        return p === "" ? null : p;
      })(),
      typeOfLoan: (() => {
        const t = get(iType).trim();
        return t === "" ? null : t;
      })(),
      loanAmountRequested: parseNumberLoose(get(iReq)),
      urgentSameDay: parseBoolLoose(get(iUrgent)),
      businessBefore: parseOptionalBool(get(iBiz)),
      termsAgreed: parseBoolLoose(get(iTerms)),
      loanAmountApproved,
      raw,
    });
  }

  return { ok: true, rows, errors };
}
