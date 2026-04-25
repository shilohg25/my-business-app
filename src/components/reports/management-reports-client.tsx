"use client";

import { useEffect, useMemo, useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { canUseLiveData, listShiftReports, type ShiftReportRow } from "@/lib/data/client";
import { appPath, getSupabaseConfigurationState } from "@/lib/supabase/client";
import { formatCurrency } from "@/lib/utils";

type TotalsKey =
  | "totalFuelCashSales"
  | "totalLubricantSales"
  | "totalCashCount"
  | "operationalNetRemittance"
  | "workbookStyleDiscrepancy";

function getTotalAsNumber(totals: Record<string, unknown>, key: TotalsKey) {
  const value = totals[key];
  const numeric = Number(value ?? Number.NaN);
  return Number.isFinite(numeric) ? numeric : null;
}

function sumTotal(reports: ShiftReportRow[], key: TotalsKey) {
  return reports.reduce((sum, report) => sum + (getTotalAsNumber(report.calculated_totals ?? {}, key) ?? 0), 0);
}

export function ManagementReportsClient() {
  const liveData = canUseLiveData();
  const config = getSupabaseConfigurationState();

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

    listShiftReports(100)
      .then((rows) => {
        if (!active) return;
        setReports(rows);
      })
      .catch((nextError: Error) => {
        if (!active) return;
        setError(nextError.message);
      })
      .finally(() => {
        if (active) setLoading(false);
      });

    return () => {
      active = false;
    };
  }, [liveData]);

  const summary = useMemo(() => {
    const totalFuelCashSales = sumTotal(reports, "totalFuelCashSales");
    const totalLubricantSales = sumTotal(reports, "totalLubricantSales");
    const totalCashCount = sumTotal(reports, "totalCashCount");
    const totalNetRemittance = sumTotal(reports, "operationalNetRemittance");
    const totalDiscrepancy = reports.reduce((sum, report) => sum + Number(report.discrepancy_amount ?? 0), 0);
    const approved = reports.filter((report) => report.status === "approved").length;
    const needingReview = reports.filter((report) => report.status !== "approved").length;

    return {
      totalFuelCashSales,
      totalLubricantSales,
      totalCashCount,
      totalNetRemittance,
      totalDiscrepancy,
      reportCount: reports.length,
      approved,
      needingReview
    };
  }, [reports]);

  const dailyTotals = useMemo(() => {
    const grouped = new Map<string, { count: number; fuelCashSales: number; cashCount: number; netRemittance: number; discrepancy: number }>();

    reports.forEach((report) => {
      const key = report.report_date || "-";
      const entry = grouped.get(key) ?? { count: 0, fuelCashSales: 0, cashCount: 0, netRemittance: 0, discrepancy: 0 };

      entry.count += 1;
      entry.fuelCashSales += getTotalAsNumber(report.calculated_totals ?? {}, "totalFuelCashSales") ?? 0;
      entry.cashCount += getTotalAsNumber(report.calculated_totals ?? {}, "totalCashCount") ?? 0;
      entry.netRemittance += getTotalAsNumber(report.calculated_totals ?? {}, "operationalNetRemittance") ?? 0;
      entry.discrepancy += Number(report.discrepancy_amount ?? 0);

      grouped.set(key, entry);
    });

    return Array.from(grouped.entries())
      .map(([date, totals]) => ({ date, ...totals }))
      .sort((a, b) => (a.date < b.date ? 1 : -1));
  }, [reports]);

  const dutySummary = useMemo(() => {
    const grouped = new Map<string, { count: number; netRemittance: number; discrepancy: number }>();

    reports.forEach((report) => {
      const key = report.duty_name || "-";
      const entry = grouped.get(key) ?? { count: 0, netRemittance: 0, discrepancy: 0 };

      entry.count += 1;
      entry.netRemittance += getTotalAsNumber(report.calculated_totals ?? {}, "operationalNetRemittance") ?? 0;
      entry.discrepancy += Number(report.discrepancy_amount ?? 0);

      grouped.set(key, entry);
    });

    return Array.from(grouped.entries())
      .map(([dutyName, totals]) => ({ dutyName, ...totals }))
      .sort((a, b) => b.netRemittance - a.netRemittance);
  }, [reports]);

  const statusBreakdown = useMemo(() => {
    const counts = {
      draft: 0,
      submitted: 0,
      reviewed: 0,
      approved: 0
    };

    reports.forEach((report) => {
      if (report.status === "draft" || report.status === "submitted" || report.status === "reviewed" || report.status === "approved") {
        counts[report.status] += 1;
      }
    });

    return counts;
  }, [reports]);

  return (
    <div className="space-y-6">
      {!liveData ? (
        <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
          <strong>Management reports are in offline setup mode.</strong> {config.reason}
        </div>
      ) : null}

      {error ? <div className="rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">{error}</div> : null}

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Card><CardHeader><CardDescription>Total fuel cash sales</CardDescription><CardTitle>{formatCurrency(summary.totalFuelCashSales)}</CardTitle></CardHeader></Card>
        <Card><CardHeader><CardDescription>Total lubricant sales</CardDescription><CardTitle>{formatCurrency(summary.totalLubricantSales)}</CardTitle></CardHeader></Card>
        <Card><CardHeader><CardDescription>Total cash count</CardDescription><CardTitle>{formatCurrency(summary.totalCashCount)}</CardTitle></CardHeader></Card>
        <Card><CardHeader><CardDescription>Total net remittance</CardDescription><CardTitle>{formatCurrency(summary.totalNetRemittance)}</CardTitle></CardHeader></Card>
        <Card><CardHeader><CardDescription>Total discrepancy</CardDescription><CardTitle>{formatCurrency(summary.totalDiscrepancy)}</CardTitle></CardHeader></Card>
        <Card><CardHeader><CardDescription>Number of reports</CardDescription><CardTitle>{summary.reportCount}</CardTitle></CardHeader></Card>
        <Card><CardHeader><CardDescription>Number approved</CardDescription><CardTitle>{summary.approved}</CardTitle></CardHeader></Card>
        <Card><CardHeader><CardDescription>Number needing review</CardDescription><CardTitle>{summary.needingReview}</CardTitle></CardHeader></Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Daily totals</CardTitle>
          <CardDescription>Grouped by report date from recent shift reports (up to 100 rows).</CardDescription>
        </CardHeader>
        <CardContent>
          {loading ? <p className="text-sm text-slate-500">Loading daily totals...</p> : null}
          {!loading && dailyTotals.length === 0 ? <p className="text-sm text-slate-500">No reports available for aggregation.</p> : null}
          {!loading && dailyTotals.length > 0 ? (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="text-left text-slate-500">
                  <tr>
                    <th className="py-2">Date</th><th className="text-right">Reports</th><th className="text-right">Fuel cash sales</th><th className="text-right">Cash count</th><th className="text-right">Net remittance</th><th className="text-right">Discrepancy</th>
                  </tr>
                </thead>
                <tbody>
                  {dailyTotals.map((row) => (
                    <tr className="border-t" key={row.date}>
                      <td className="py-2">{row.date}</td><td className="text-right">{row.count}</td><td className="text-right">{formatCurrency(row.fuelCashSales)}</td><td className="text-right">{formatCurrency(row.cashCount)}</td><td className="text-right">{formatCurrency(row.netRemittance)}</td><td className="text-right">{formatCurrency(row.discrepancy)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : null}
        </CardContent>
      </Card>

      <div className="grid gap-4 xl:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Cashier/Duty summary</CardTitle>
            <CardDescription>Net remittance and discrepancy grouped by duty/cashier.</CardDescription>
          </CardHeader>
          <CardContent>
            {!loading && dutySummary.length === 0 ? <p className="text-sm text-slate-500">No duty records available.</p> : null}
            {dutySummary.length > 0 ? (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="text-left text-slate-500">
                    <tr><th className="py-2">Duty/Cashier</th><th className="text-right">Reports</th><th className="text-right">Net remittance</th><th className="text-right">Discrepancy</th></tr>
                  </thead>
                  <tbody>
                    {dutySummary.map((row) => (
                      <tr className="border-t" key={row.dutyName}>
                        <td className="py-2">{row.dutyName}</td><td className="text-right">{row.count}</td><td className="text-right">{formatCurrency(row.netRemittance)}</td><td className="text-right">{formatCurrency(row.discrepancy)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : null}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Status breakdown</CardTitle>
            <CardDescription>Current report workflow distribution.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-2 text-sm">
            <div className="flex items-center justify-between rounded-lg border p-2"><span>Draft</span><strong>{statusBreakdown.draft}</strong></div>
            <div className="flex items-center justify-between rounded-lg border p-2"><span>Submitted</span><strong>{statusBreakdown.submitted}</strong></div>
            <div className="flex items-center justify-between rounded-lg border p-2"><span>Reviewed</span><strong>{statusBreakdown.reviewed}</strong></div>
            <div className="flex items-center justify-between rounded-lg border p-2"><span>Approved</span><strong>{statusBreakdown.approved}</strong></div>
            <a className="mt-2 inline-flex text-xs font-medium text-slate-700 underline" href={appPath("/shift-reports/")}>Open Daily Shift Reports for action</a>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
