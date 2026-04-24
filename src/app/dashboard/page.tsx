import { StatCard } from "@/components/layout/stat-card";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Sidebar } from "@/components/layout/sidebar";
import { Topbar } from "@/components/layout/topbar";

export default function DashboardPage() {
  return (
    <div className="flex min-h-screen bg-slate-50">
      <Sidebar />
      <div className="flex-1">
        <Topbar />
        <main className="p-6">
          <div className="space-y-6">
            <div>
              <h1 className="text-2xl font-semibold tracking-tight">Dashboard</h1>
              <p className="text-sm text-slate-500">Current operational status across stations.</p>
            </div>

            <div className="grid gap-4 md:grid-cols-4">
              <StatCard label="Open shifts" value="0" hint="Awaiting live Supabase data" />
              <StatCard label="Pending review" value="0" />
              <StatCard label="Discrepancy alerts" value="0" />
              <StatCard label="Inventory warnings" value="0" />
            </div>

            <Card>
              <CardHeader>
                <CardTitle>Implementation status</CardTitle>
                <CardDescription>
                  Starter app shell is wired for the required operational modules.
                </CardDescription>
              </CardHeader>
              <CardContent className="flex flex-wrap gap-2">
                {[
                  "Shift reports",
                  "Excel import",
                  "Cash count",
                  "Credit receipts",
                  "Expenses",
                  "Lubricants",
                  "Bodega inventory",
                  "Audit logs",
                  "Exports"
                ].map((item) => (
                  <Badge key={item}>{item}</Badge>
                ))}
              </CardContent>
            </Card>
          </div>
        </main>
      </div>
    </div>
  );
}
