import { ReportList } from "@/components/shift-reports/report-list";

export default function ShiftReportsPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Shift Reports</h1>
        <p className="text-sm text-slate-500">
          Review submitted reports, discrepancies, and approval status.
        </p>
      </div>
      <ReportList />
    </div>
  );
}
