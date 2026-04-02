import { LoanImportForm } from "@/components/loan-import-form";

export default function AdminImportPage() {
  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Import legacy loans</h1>
        <p className="text-sm text-muted-foreground mt-1 max-w-2xl">
          Upload a CSV export from your previous system. Applications appear on the main Applications
          list with the same status, amounts, and contact details. Re-importing the same file is
          safe: rows are deduplicated by the legacy <code className="text-xs">uuid</code> column.
        </p>
      </div>
      <LoanImportForm />
    </div>
  );
}
