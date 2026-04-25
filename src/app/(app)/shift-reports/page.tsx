import { ReportList } from "@/components/shift-reports/report-list";

export default function ShiftReportsPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Daily Shift Reports</h1>
        <p className="text-sm text-slate-500">Review imported and manually entered shift reports.</p>
        <p className="mt-2 text-sm text-slate-600">
          Use this page to review the actual shift paperwork: meter readings, credit receipts, cash count,
          expenses, lubricant sales, discrepancies, and approval status.
        </p>
      </div>
      <ReportList />
    </div>
  );
}
