"use client";

import { useEffect, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { canUseLiveData, listShiftReports, markReportStatus, type ShiftReportRow } from "@/lib/data/client";
import { getSupabaseConfigurationState } from "@/lib/supabase/client";
import { formatCurrency } from "@/lib/utils";

export function ReportList() {
  const liveData = canUseLiveData();
  const config = getSupabaseConfigurationState();

  const [reports, setReports] = useState<ShiftReportRow[]>([]);
  const [loading, setLoading] = useState(liveData);
  const [busyReportId, setBusyReportId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function refresh() {
    if (!liveData) {
      setLoading(false);
      return;
    }

    setLoading(true);
    setError(null);

    try {
      setReports(await listShiftReports(50));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to load reports.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void refresh();
  }, [liveData]);

  async function approve(id: string) {
    if (!liveData) {
      setError(config.reason);
      return;
    }

    setBusyReportId(id);
    setError(null);

    try {
      await markReportStatus(id, "approved", "Approved from shift report list");
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Approval failed.");
    } finally {
      setBusyReportId(null);
    }
  }

  return (
    <div className="rounded-2xl border bg-white p-5">
      {!liveData ? (
        <p className="mb-4 rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
          Shift reports cannot load until Supabase is configured. {config.reason}
        </p>
      ) : null}

      {error ? <p className="mb-4 text-sm text-red-700">{error}</p> : null}
      {loading ? <p className="text-sm text-slate-500">Loading reports...</p> : null}

      {!loading && reports.length === 0 ? (
        <p className="text-sm text-slate-500">
          {liveData ? "No reports found. Create one manually or import an Excel workbook." : "No live report data is available in setup mode."}
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
                <th>Source</th>
                <th>Status</th>
                <th className="text-right">Discrepancy</th>
                <th className="text-right">Action</th>
              </tr>
            </thead>
            <tbody>
              {reports.map((report) => {
                const isApproved = report.status === "approved";
                const isBusy = busyReportId === report.id;

                return (
                  <tr className="border-t" key={report.id}>
                    <td className="py-3">{report.report_date}</td>
                    <td>{report.fuel_stations?.name ?? "-"}</td>
                    <td>{report.duty_name}</td>
                    <td>{report.shift_time_label}</td>
                    <td>{report.source}</td>
                    <td>
                      <Badge>{report.status}</Badge>
                    </td>
                    <td className="text-right">{formatCurrency(Number(report.discrepancy_amount ?? 0))}</td>
                    <td className="text-right">
                      <Button variant="outline" onClick={() => approve(report.id)} disabled={isApproved || isBusy}>
                        {isBusy ? "Approving..." : isApproved ? "Approved" : "Approve"}
                      </Button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      ) : null}
    </div>
  );
}
