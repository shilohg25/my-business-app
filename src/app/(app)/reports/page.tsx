import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { appPath } from "@/lib/supabase/client";

const managementReports = [
  {
    title: "Daily sales summary",
    description: "Consolidated daily totals across fuel, lubricant, and convenience sales."
  },
  {
    title: "Cash remittance summary",
    description: "Compare cashier cash turnover, expected remittance, and submitted cash counts."
  },
  {
    title: "Product liters summary",
    description: "Track liters sold by product and station with trend-ready totals."
  },
  {
    title: "Credit sales summary",
    description: "Review card and credit-account sales by station and reporting period."
  },
  {
    title: "Expense summary",
    description: "Aggregate station operating expenses captured in shift workflows."
  },
  {
    title: "Discrepancy report",
    description: "Highlight variances between expected and actual shift-level outcomes."
  },
  {
    title: "Export history",
    description: "Track generated management exports and download history for audits."
  }
];

export default function ReportsPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Management Reports</h1>
        <p className="text-sm text-slate-500">
          Owner and manager summaries for sales, remittance, credits, expenses, and discrepancies.
        </p>
      </div>

      <Card>
        <CardContent className="flex flex-wrap items-center justify-between gap-3">
          <p className="text-sm text-slate-600">
            Detailed shift paperwork lives under Daily Shift Reports. This page will be for summarized business
            reporting and exports.
          </p>
          <a
            href={appPath("/shift-reports/")}
            className="inline-flex items-center rounded-lg bg-slate-900 px-3 py-2 text-sm font-medium text-white hover:bg-slate-800"
          >
            Open Daily Shift Reports
          </a>
        </CardContent>
      </Card>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {managementReports.map((report) => (
          <Card key={report.title}>
            <CardHeader>
              <div className="flex items-center justify-between gap-2">
                <CardTitle>{report.title}</CardTitle>
                <Badge>Coming soon</Badge>
              </div>
              <CardDescription>{report.description}</CardDescription>
            </CardHeader>
            <CardContent className="pt-0 text-xs text-slate-500">Management summary module in progress.</CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
