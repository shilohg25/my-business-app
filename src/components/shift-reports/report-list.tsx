"use client";

import { useEffect, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { listShiftReports, markReportStatus, type ShiftReportRow } from "@/lib/data/client";
import { formatCurrency } from "@/lib/utils";

export function ReportList() {
  const [reports, setReports] = useState<ShiftReportRow[]>([]);
  const [error, setError] = useState<string | null>(null);

  async function refresh() {
    try {
      setReports(await listShiftReports(50));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to load reports.");
    }
  }

  useEffect(() => { void refresh(); }, []);

  async function approve(id: string) {
    try {
      await markReportStatus(id, "approved", "Approved from shift report list");
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Approval failed.");
    }
  }

  return (
    <div className="rounded-2xl border bg-white p-5">
      {error ? <p className="mb-4 text-sm text-red-700">{error}</p> : null}
      {reports.length === 0 ? <p className="text-sm text-slate-500">No reports found. Create one manually or import an Excel workbook.</p> : null}
      {reports.length > 0 ? (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="text-left text-slate-500"><tr><th className="py-2">Date</th><th>Station</th><th>Duty</th><th>Shift</th><th>Source</th><th>Status</th><th className="text-right">Discrepancy</th><th></th></tr></thead>
            <tbody>
              {reports.map((report) => (
                <tr className="border-t" key={report.id}>
                  <td className="py-3">{report.report_date}</td>
                  <td>{report.fuel_stations?.name ?? "-"}</td>
                  <td>{report.duty_name}</td>
                  <td>{report.shift_time_label}</td>
                  <td>{report.source}</td>
                  <td><Badge>{report.status}</Badge></td>
                  <td className="text-right">{formatCurrency(Number(report.discrepancy_amount ?? 0))}</td>
                  <td className="text-right"><Button variant="outline" onClick={() => approve(report.id)}>Approve</Button></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}
    </div>
  );
}
