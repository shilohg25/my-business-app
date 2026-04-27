import { appPath } from "@/lib/supabase/client";

export default function ImportsPage() {
  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-semibold tracking-tight">Excel Import Retired</h1>
      <p className="text-sm text-slate-600">
        Excel import has been retired. Use <a className="underline" href={appPath("/shift-reports/")}>Daily Shift Reports</a> for web report workflows. Cashier field data entry now happens in the separate mobile app.
      </p>
      <p className="text-xs text-slate-500">
        Historical import records remain available for audit traceability. Existing rows in <code>fuel_import_batches</code> and reports with source <code>excel_import</code> are preserved.
      </p>
    </div>
  );
}
