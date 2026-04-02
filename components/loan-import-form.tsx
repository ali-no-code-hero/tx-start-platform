"use client";

import { importLegacyLoanCsv, type LegacyImportResult } from "@/app/actions/legacy-import";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";

export function LoanImportForm() {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [lastResult, setLastResult] = useState<LegacyImportResult | null>(null);

  async function onFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    if (!file.name.toLowerCase().endsWith(".csv")) {
      toast.error("Choose a .csv file exported from the legacy system.");
      return;
    }

    setBusy(true);
    setLastResult(null);
    try {
      const text = await file.text();
      const result = await importLegacyLoanCsv(text);
      setLastResult(result);
      if (result.imported > 0) {
        toast.success(`Imported ${result.imported} application(s).`);
        router.refresh();
      } else if (result.skippedDuplicate > 0 && result.failedImports === 0 && result.parseErrors.length === 0) {
        toast.message("No new rows — legacy IDs already exist.");
      }
      if (result.importErrors.length > 0 || result.parseErrors.length > 0) {
        toast.error("Some rows were skipped — see details below.");
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Import failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Upload CSV</CardTitle>
        <CardDescription>
          Use the legacy export format (columns: id, uuid, createdAt, status, names, location, email,
          phone, loan fields, etc.). Each row becomes a customer (matched by email) and an
          application. The export <code className="text-xs">uuid</code> is stored as the submission
          ID so re-uploading the same file skips duplicates.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="space-y-2">
          <Label htmlFor="loan-csv">CSV file</Label>
          <Input
            id="loan-csv"
            type="file"
            accept=".csv,text/csv"
            disabled={busy}
            onChange={(ev) => void onFileChange(ev)}
          />
        </div>
        {lastResult && <ImportResultDetails result={lastResult} />}
      </CardContent>
      <CardFooter className="text-xs text-muted-foreground">
        Requires <code className="rounded bg-muted px-1">SUPABASE_SERVICE_ROLE_KEY</code> on the
        server (same as user management and webhooks).
      </CardFooter>
    </Card>
  );
}

function ImportResultDetails({ result }: { result: LegacyImportResult }) {
  return (
    <div className="rounded-lg border bg-muted/40 p-4 text-sm space-y-3">
      <div className="flex flex-wrap gap-x-6 gap-y-1">
        <span>
          <strong className="font-medium text-foreground">Imported:</strong> {result.imported}
        </span>
        <span>
          <strong className="font-medium text-foreground">Skipped (duplicate ID):</strong>{" "}
          {result.skippedDuplicate}
        </span>
        <span>
          <strong className="font-medium text-foreground">Failed:</strong> {result.failedImports}
        </span>
        <span>
          <strong className="font-medium text-foreground">Parse issues:</strong>{" "}
          {result.parseErrors.length}
        </span>
      </div>
      {result.unknownLocations.length > 0 && (
        <div>
          <p className="font-medium text-foreground mb-1">Unknown locations (imported without location)</p>
          <p className="text-muted-foreground">{result.unknownLocations.join(", ")}</p>
          <p className="text-xs text-muted-foreground mt-1">
            Add them under Locations or assign from each application. Rows are flagged with{" "}
            <code className="rounded bg-background px-1">needs_location_review</code> in metadata.
          </p>
        </div>
      )}
      {result.parseErrors.length > 0 && (
        <ErrorList title="CSV row issues" items={result.parseErrors} />
      )}
      {result.importErrors.length > 0 && (
        <ErrorList title="Database import errors" items={result.importErrors} />
      )}
    </div>
  );
}

function ErrorList({
  title,
  items,
}: {
  title: string;
  items: { rowIndex: number; message: string }[];
}) {
  return (
    <div>
      <p className="font-medium text-foreground mb-1">{title}</p>
      <ul className="max-h-40 overflow-y-auto space-y-1 text-xs font-mono text-muted-foreground">
        {items.map((e, i) => (
          <li key={i}>
            Row {e.rowIndex}: {e.message}
          </li>
        ))}
      </ul>
    </div>
  );
}
