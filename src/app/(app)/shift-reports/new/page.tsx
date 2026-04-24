import { ShiftReportForm } from "@/components/shift-reports/shift-report-form";

export default function NewShiftReportPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">New Shift Report</h1>
        <p className="text-sm text-slate-500">Enter meter readings, credits, expenses, lubricant sales, and cash count.</p>
      </div>
      <ShiftReportForm />
    </div>
  );
}
