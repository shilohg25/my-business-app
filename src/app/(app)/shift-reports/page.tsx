import Link from "next/link";
import { ReportList } from "@/components/shift-reports/report-list";

export default function ShiftReportsPage() {
  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Shift Reports</h1>
          <p className="text-sm text-slate-500">Review, balance, print, and export reports.</p>
        </div>
        <Link href="/shift-reports/new" className="inline-flex h-10 items-center justify-center rounded-xl bg-slate-900 px-4 text-sm font-medium text-white hover:bg-slate-800">New report</Link>
      </div>
      <ReportList />
    </div>
  );
}
