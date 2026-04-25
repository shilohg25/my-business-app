import { ReportDetail } from "@/components/shift-reports/report-detail";

export default function ShiftReportDetailPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Shift Report Detail</h1>
        <p className="text-sm text-slate-500">View full report entries, totals, and audit history.</p>
      </div>
      <ReportDetail />
    </div>
  );
}
