import { ReportList } from "@/components/shift-reports/report-list";

export default function ReportsPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Reports</h1>
        <p className="text-sm text-slate-500">
          View committed shift reports. Summary exports will be added after report details are stabilized.
        </p>
      </div>
      <ReportList />
    </div>
  );
}
