import { ManagementReportsClient } from "@/components/reports/management-reports-client";
import { Card, CardContent } from "@/components/ui/card";
import { appPath } from "@/lib/supabase/client";

export default function ReportsPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Management Reports</h1>
        <p className="text-sm text-slate-500">Business-facing summary of recent shift performance, discrepancies, and approval progress.</p>
      </div>

      <Card>
        <CardContent className="flex flex-wrap items-center justify-between gap-3">
          <p className="text-sm text-slate-600">Need to inspect individual entries? Open Daily Shift Reports for detail-level review and status updates.</p>
          <a
            href={appPath("/shift-reports/")}
            className="inline-flex items-center rounded-lg bg-slate-900 px-3 py-2 text-sm font-medium text-white hover:bg-slate-800"
          >
            Open Daily Shift Reports
          </a>
        </CardContent>
      </Card>

      <ManagementReportsClient />
    </div>
  );
}
