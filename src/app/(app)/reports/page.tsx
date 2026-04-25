import { ManagementReportsClient } from "@/components/reports/management-reports-client";

export default function ReportsPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Management Reports</h1>
        <p className="text-sm text-slate-500">Executive summaries for sales, expenses, liters, remittance, cash over/short, and lubricant control warnings.</p>
      </div>

      <ManagementReportsClient />
    </div>
  );
}
