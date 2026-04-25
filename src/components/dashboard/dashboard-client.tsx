"use client";

import { useEffect, useMemo, useState } from "react";
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
import { appPath, getSupabaseConfigurationState } from "@/lib/supabase/client";
import { formatCurrency } from "@/lib/utils";

const emptySummary: DashboardSummary = {
  openShifts: 0,
  pendingReview: 0,
  discrepancyAlerts: 0,
  inventoryWarnings: 0
};

function StatusBadge({ status }: { status: string }) {
  const toneByStatus: Record<string, string> = {
    draft: "border-slate-300 bg-slate-100 text-slate-700",
    submitted: "border-blue-200 bg-blue-50 text-blue-700",
    reviewed: "border-amber-200 bg-amber-50 text-amber-700",
    approved: "border-emerald-200 bg-emerald-50 text-emerald-700"
  };

  return <Badge className={toneByStatus[status] ?? ""}>{status || "-"}</Badge>;
}

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

    Promise.all([getDashboardSummary(), listShiftReports(12)])
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

  const pendingReviewReports = useMemo(
    () => reports.filter((report) => report.status === "submitted" || report.status === "reviewed" || report.status === "draft"),
    [reports]
  );
  const discrepancyReports = useMemo(() => reports.filter((report) => Number(report.discrepancy_amount ?? 0) !== 0), [reports]);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Dashboard</h1>
          <p className="text-sm text-slate-500">Daily owner operations snapshot for imports, reviews, approvals, and discrepancies.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <a className="inline-flex h-10 items-center rounded-xl border px-4 text-sm font-medium hover:bg-slate-50" href={appPath("/imports/")}>Import Excel Workbook</a>
          <a className="inline-flex h-10 items-center rounded-xl border px-4 text-sm font-medium hover:bg-slate-50" href={appPath("/shift-reports/")}>Open Daily Shift Reports</a>
          <a className="inline-flex h-10 items-center rounded-xl bg-slate-900 px-4 text-sm font-medium text-white hover:bg-slate-800" href={appPath("/reports/")}>Open Management Reports</a>
        </div>
      </div>

      {!liveData ? (
        <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
          <strong>Dashboard is in offline setup mode.</strong> {config.reason}
        </div>
      ) : null}

      {error ? <div className="rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">{error}</div> : null}

      <div className="grid gap-4 md:grid-cols-4">
        <StatCard label="Open shifts" value={loading ? "..." : String(summary.openShifts)} />
        <StatCard label="Reports needing review" value={loading ? "..." : String(summary.pendingReview)} />
        <StatCard label="Reports with discrepancy" value={loading ? "..." : String(summary.discrepancyAlerts)} />
        <StatCard label="Inventory warnings" value={loading ? "..." : String(summary.inventoryWarnings)} />
      </div>

      <div className="grid gap-4 xl:grid-cols-3">
        <Card className="xl:col-span-2">
          <CardHeader>
            <CardTitle>Recent committed reports</CardTitle>
            <CardDescription>
              {liveData ? "Most recent shift reports with direct review links." : "Connect Supabase to load live reports."}
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
                      <th>Duty/Cashier</th>
                      <th>Shift</th>
                      <th>Status</th>
                      <th className="text-right">Discrepancy</th>
                      <th className="text-right">Action</th>
                    </tr>
                  </thead>
                  <tbody>
                    {reports.map((report) => (
                      <tr key={report.id} className="border-t">
                        <td className="py-3">{report.report_date || "-"}</td>
                        <td>{report.duty_name || "-"}</td>
                        <td>{report.shift_time_label || "-"}</td>
                        <td><StatusBadge status={report.status} /></td>
                        <td className="text-right">{formatCurrency(Number(report.discrepancy_amount ?? 0))}</td>
                        <td className="text-right">
                          <a className="inline-flex rounded-lg border px-3 py-1.5 text-xs font-medium hover:bg-slate-50" href={appPath(`/shift-reports/view/?id=${report.id}`)}>View</a>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : null}
          </CardContent>
        </Card>

        <div className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Reports needing review</CardTitle>
              <CardDescription>Draft, submitted, or reviewed reports that still need manager action.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-2 text-sm">
              {pendingReviewReports.length === 0 ? <p className="text-slate-500">No pending review reports in recent data.</p> : null}
              {pendingReviewReports.slice(0, 5).map((report) => (
                <div key={report.id} className="flex items-center justify-between gap-2 rounded-lg border p-2">
                  <div>
                    <p className="font-medium">{report.report_date || "-"}</p>
                    <p className="text-xs text-slate-500">{report.duty_name || "-"}</p>
                  </div>
                  <a className="text-xs font-medium text-slate-700 underline" href={appPath(`/shift-reports/view/?id=${report.id}`)}>Open</a>
                </div>
              ))}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Reports with discrepancy</CardTitle>
              <CardDescription>Recent reports where discrepancy amount is not zero.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-2 text-sm">
              {discrepancyReports.length === 0 ? <p className="text-slate-500">No discrepancy alerts in recent data.</p> : null}
              {discrepancyReports.slice(0, 5).map((report) => (
                <div key={report.id} className="flex items-center justify-between gap-2 rounded-lg border p-2">
                  <div>
                    <p className="font-medium">{report.report_date || "-"}</p>
                    <p className="text-xs text-slate-500">{report.duty_name || "-"}</p>
                  </div>
                  <span className="text-xs font-semibold text-amber-700">{formatCurrency(Number(report.discrepancy_amount ?? 0))}</span>
                </div>
              ))}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
