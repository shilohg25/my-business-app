"use client";

import { useEffect, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { StatCard } from "@/components/dashboard/stat-card";
import { getDashboardSummary, listShiftReports, type DashboardSummary, type ShiftReportRow } from "@/lib/data/client";
import { formatCurrency } from "@/lib/utils";

export function DashboardClient() {
  const [summary, setSummary] = useState<DashboardSummary>({ openShifts: 0, pendingReview: 0, discrepancyAlerts: 0, inventoryWarnings: 0 });
  const [reports, setReports] = useState<ShiftReportRow[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    Promise.all([getDashboardSummary(), listShiftReports(5)])
      .then(([nextSummary, nextReports]) => {
        setSummary(nextSummary);
        setReports(nextReports);
      })
      .catch((err: Error) => setError(err.message));
  }, []);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Dashboard</h1>
        <p className="text-sm text-slate-500">Current operational status across stations.</p>
      </div>

      {error ? <div className="rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">{error}</div> : null}

      <div className="grid gap-4 md:grid-cols-4">
        <StatCard label="Open shifts" value={String(summary.openShifts)} />
        <StatCard label="Pending review" value={String(summary.pendingReview)} />
        <StatCard label="Discrepancy alerts" value={String(summary.discrepancyAlerts)} />
        <StatCard label="Inventory warnings" value={String(summary.inventoryWarnings)} />
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Recent shift reports</CardTitle>
          <CardDescription>Live after Supabase schema and secrets are configured.</CardDescription>
        </CardHeader>
        <CardContent>
          {reports.length === 0 ? (
            <p className="text-sm text-slate-500">No reports loaded yet.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="text-left text-slate-500">
                  <tr><th className="py-2">Date</th><th>Station</th><th>Duty</th><th>Shift</th><th>Status</th><th className="text-right">Discrepancy</th></tr>
                </thead>
                <tbody>
                  {reports.map((report) => (
                    <tr key={report.id} className="border-t">
                      <td className="py-3">{report.report_date}</td>
                      <td>{report.fuel_stations?.name ?? "-"}</td>
                      <td>{report.duty_name}</td>
                      <td>{report.shift_time_label}</td>
                      <td><Badge>{report.status}</Badge></td>
                      <td className="text-right">{formatCurrency(Number(report.discrepancy_amount ?? 0))}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
