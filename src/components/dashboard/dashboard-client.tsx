"use client";

import { useEffect, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { StatCard } from "@/components/dashboard/stat-card";
import {
  canUseLiveData,
  getDashboardSummary,
  listShiftReports,
  type DashboardSummary,
  type ShiftReportRow
} from "@/lib/data/client";
import { getSupabaseConfigurationState } from "@/lib/supabase/client";
import { formatCurrency } from "@/lib/utils";

const emptySummary: DashboardSummary = {
  openShifts: 0,
  pendingReview: 0,
  discrepancyAlerts: 0,
  inventoryWarnings: 0
};

export function DashboardClient() {
  const liveData = canUseLiveData();
  const config = getSupabaseConfigurationState();

  const [summary, setSummary] = useState<DashboardSummary>(emptySummary);
  const [reports, setReports] = useState<ShiftReportRow[]>([]);
  const [loading, setLoading] = useState(liveData);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!liveData) {
      setLoading(false);
      return;
    }

    let active = true;
    setLoading(true);
    setError(null);

    Promise.all([getDashboardSummary(), listShiftReports(5)])
      .then(([nextSummary, nextReports]) => {
        if (!active) return;
        setSummary(nextSummary);
        setReports(nextReports);
      })
      .catch((err: Error) => {
        if (!active) return;
        setError(err.message);
      })
      .finally(() => {
        if (active) setLoading(false);
      });

    return () => {
      active = false;
    };
  }, [liveData]);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Dashboard</h1>
        <p className="text-sm text-slate-500">Current operational status across stations.</p>
      </div>

      {!liveData ? (
        <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
          <strong>Dashboard is in offline setup mode.</strong> {config.reason}
        </div>
      ) : null}

      {error ? <div className="rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">{error}</div> : null}

      <div className="grid gap-4 md:grid-cols-4">
        <StatCard label="Open shifts" value={loading ? "..." : String(summary.openShifts)} />
        <StatCard label="Pending review" value={loading ? "..." : String(summary.pendingReview)} />
        <StatCard label="Discrepancy alerts" value={loading ? "..." : String(summary.discrepancyAlerts)} />
        <StatCard label="Inventory warnings" value={loading ? "..." : String(summary.inventoryWarnings)} />
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Recent shift reports</CardTitle>
          <CardDescription>
            {liveData ? "Latest committed reports from Supabase." : "Connect Supabase to load live reports."}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {loading ? <p className="text-sm text-slate-500">Loading reports...</p> : null}

          {!loading && reports.length === 0 ? (
            <p className="text-sm text-slate-500">
              {liveData ? "No reports found yet. Create one manually or import an OSR workbook." : "No live data is available until Supabase is configured."}
            </p>
          ) : null}

          {!loading && reports.length > 0 ? (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="text-left text-slate-500">
                  <tr>
                    <th className="py-2">Date</th>
                    <th>Station</th>
                    <th>Duty</th>
                    <th>Shift</th>
                    <th>Status</th>
                    <th className="text-right">Discrepancy</th>
                  </tr>
                </thead>
                <tbody>
                  {reports.map((report) => (
                    <tr key={report.id} className="border-t">
                      <td className="py-3">{report.report_date}</td>
                      <td>{report.fuel_stations?.name ?? "-"}</td>
                      <td>{report.duty_name}</td>
                      <td>{report.shift_time_label}</td>
                      <td>
                        <Badge>{report.status}</Badge>
                      </td>
                      <td className="text-right">{formatCurrency(Number(report.discrepancy_amount ?? 0))}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : null}
        </CardContent>
      </Card>
    </div>
  );
}
