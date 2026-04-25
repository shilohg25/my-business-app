"use client";

import { useEffect, useMemo, useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { canUseLiveData } from "@/lib/data/client";
import { fetchExecutiveAnalytics } from "@/lib/data/executive";
import { getSupabaseConfigurationState } from "@/lib/supabase/client";
import { formatCurrency } from "@/lib/utils";

function todayIso() {
  return new Date().toISOString().slice(0, 10);
}

function startOfMonthIso() {
  const now = new Date();
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1)).toISOString().slice(0, 10);
}

function formatLiters(value: number) {
  return value.toLocaleString("en-US", { minimumFractionDigits: 3, maximumFractionDigits: 3, useGrouping: false });
}

function formatDay(value: string) {
  const parsed = new Date(`${value}T00:00:00Z`);
  if (Number.isNaN(parsed.getTime())) return value;
  return parsed.toLocaleDateString("en-US", { year: "numeric", month: "short", day: "numeric", timeZone: "UTC" });
}

export function ManagementReportsClient() {
  const liveData = canUseLiveData();
  const config = getSupabaseConfigurationState();

  const [startDate, setStartDate] = useState(startOfMonthIso());
  const [endDate, setEndDate] = useState(todayIso());
  const [loading, setLoading] = useState(liveData);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<Awaited<ReturnType<typeof fetchExecutiveAnalytics>> | null>(null);

  useEffect(() => {
    if (!liveData) {
      setLoading(false);
      setResult(null);
      return;
    }

    let active = true;
    setLoading(true);
    setError(null);

    fetchExecutiveAnalytics({ startDate, endDate })
      .then((data) => {
        if (!active) return;
        setResult(data);
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
  }, [endDate, liveData, startDate]);

  const productRows = useMemo(() => {
    const rows = Object.values(result?.analytics.productLiters ?? {});
    return rows.sort((a, b) => {
      const order = ["DIESEL", "SPECIAL", "UNLEADED", "OTHER"];
      return order.indexOf(a.product) - order.indexOf(b.product);
    });
  }, [result?.analytics.productLiters]);

  const totals = result?.analytics.totals;

  return (
    <div className="space-y-6">
      {!liveData ? (
        <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
          <strong>Management reports are in offline setup mode.</strong> {config.reason}
        </div>
      ) : null}

      {error ? <div className="rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">{error}</div> : null}

      <Card>
        <CardHeader>
          <CardTitle>Date range</CardTitle>
          <CardDescription>Default is this month using report date business periods.</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-3 sm:grid-cols-2">
          <label className="text-xs font-medium text-slate-600">Start date
            <input className="mt-1 w-full rounded-lg border px-3 py-2 text-sm" type="date" value={startDate} onChange={(event) => setStartDate(event.target.value)} />
          </label>
          <label className="text-xs font-medium text-slate-600">End date
            <input className="mt-1 w-full rounded-lg border px-3 py-2 text-sm" type="date" value={endDate} onChange={(event) => setEndDate(event.target.value)} />
          </label>
        </CardContent>
      </Card>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        <Card><CardHeader><CardDescription>Total fuel cash sales</CardDescription><CardTitle>{formatCurrency(totals?.totalFuelCashSales ?? 0)}</CardTitle></CardHeader></Card>
        <Card><CardHeader><CardDescription>Total lubricant sales</CardDescription><CardTitle>{formatCurrency(totals?.totalLubricantSales ?? 0)}</CardTitle></CardHeader></Card>
        <Card><CardHeader><CardDescription>Total expenses</CardDescription><CardTitle>{formatCurrency(totals?.totalExpenses ?? 0)}</CardTitle></CardHeader></Card>
        <Card><CardHeader><CardDescription>Total cash count</CardDescription><CardTitle>{formatCurrency(totals?.totalCashCount ?? 0)}</CardTitle></CardHeader></Card>
        <Card><CardHeader><CardDescription>Total net remittance</CardDescription><CardTitle>{formatCurrency(totals?.totalNetRemittance ?? 0)}</CardTitle></CardHeader></Card>
        <Card><CardHeader><CardDescription>Total discrepancy</CardDescription><CardTitle>{formatCurrency(totals?.totalDiscrepancy ?? 0)}</CardTitle></CardHeader></Card>
        <Card><CardHeader><CardDescription>Report count</CardDescription><CardTitle>{totals?.reportCount ?? 0}</CardTitle></CardHeader></Card>
        <Card><CardHeader><CardDescription>Approved reports</CardDescription><CardTitle>{totals?.approvedCount ?? 0}</CardTitle></CardHeader></Card>
        <Card><CardHeader><CardDescription>Reports needing review</CardDescription><CardTitle>{totals?.pendingReviewCount ?? 0}</CardTitle></CardHeader></Card>
      </div>

      <Card>
        <CardHeader><CardTitle>Product liters</CardTitle><CardDescription>Gross, credit, calibration, and net cash liters by product group.</CardDescription></CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="text-left text-slate-500"><tr><th className="py-2">Product</th><th className="text-right">Gross liters out</th><th className="text-right">Credit liters</th><th className="text-right">Calibration liters</th><th className="text-right">Net cash liters</th></tr></thead>
              <tbody>
                {productRows.map((row) => (
                  <tr className="border-t" key={row.product}><td className="py-2">{row.product}</td><td className="text-right">{formatLiters(row.grossLitersOut)}</td><td className="text-right">{formatLiters(row.creditLiters)}</td><td className="text-right">{formatLiters(row.calibrationLiters)}</td><td className="text-right">{formatLiters(row.netCashLiters)}</td></tr>
                ))}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      <div className="grid gap-4 xl:grid-cols-3">
        <Card>
          <CardHeader><CardTitle>Daily expense totals</CardTitle></CardHeader>
          <CardContent><div className="overflow-x-auto"><table className="w-full text-sm"><thead className="text-left text-slate-500"><tr><th className="py-2">Date</th><th className="text-right">Count</th><th className="text-right">Amount</th></tr></thead><tbody>{(result?.analytics.dailyExpenses ?? []).map((row) => (<tr className="border-t" key={row.date}><td className="py-2">{formatDay(row.date)}</td><td className="text-right">{row.count}</td><td className="text-right">{formatCurrency(row.amount)}</td></tr>))}</tbody></table></div></CardContent>
        </Card>
        <Card>
          <CardHeader><CardTitle>Monthly expense totals</CardTitle></CardHeader>
          <CardContent><div className="overflow-x-auto"><table className="w-full text-sm"><thead className="text-left text-slate-500"><tr><th className="py-2">Month</th><th className="text-right">Count</th><th className="text-right">Amount</th></tr></thead><tbody>{(result?.analytics.monthlyExpenses ?? []).map((row) => (<tr className="border-t" key={row.month}><td className="py-2">{row.month}</td><td className="text-right">{row.count}</td><td className="text-right">{formatCurrency(row.amount)}</td></tr>))}</tbody></table></div></CardContent>
        </Card>
        <Card>
          <CardHeader><CardTitle>Expenses by category</CardTitle></CardHeader>
          <CardContent><div className="overflow-x-auto"><table className="w-full text-sm"><thead className="text-left text-slate-500"><tr><th className="py-2">Category</th><th className="text-right">Count</th><th className="text-right">Amount</th></tr></thead><tbody>{(result?.analytics.expensesByCategory ?? []).map((row) => (<tr className="border-t" key={row.category}><td className="py-2">{row.category}</td><td className="text-right">{row.count}</td><td className="text-right">{formatCurrency(row.amount)}</td></tr>))}</tbody></table></div></CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader><CardTitle>Daily operating summary</CardTitle></CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="text-left text-slate-500"><tr><th className="py-2">Date</th><th className="text-right">Reports</th><th className="text-right">Fuel cash sales</th><th className="text-right">Expenses</th><th className="text-right">Cash count</th><th className="text-right">Net remittance</th><th className="text-right">Discrepancy</th><th className="text-right">Diesel liters</th><th className="text-right">Special liters</th><th className="text-right">Unleaded liters</th></tr></thead>
              <tbody>
                {(result?.analytics.dailySummary ?? []).map((row) => (
                  <tr className="border-t" key={row.date}>
                    <td className="py-2">{formatDay(row.date)}</td>
                    <td className="text-right">{row.reportCount}</td>
                    <td className="text-right">{formatCurrency(row.totalFuelCashSales)}</td>
                    <td className="text-right">{formatCurrency(row.totalExpenses)}</td>
                    <td className="text-right">{formatCurrency(row.totalCashCount)}</td>
                    <td className="text-right">{formatCurrency(row.totalNetRemittance)}</td>
                    <td className="text-right">{formatCurrency(row.totalDiscrepancy)}</td>
                    <td className="text-right">{formatLiters(row.dieselGrossLiters)}</td>
                    <td className="text-right">{formatLiters(row.specialGrossLiters)}</td>
                    <td className="text-right">{formatLiters(row.unleadedGrossLiters)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle>Cashier/Duty summary</CardTitle></CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="text-left text-slate-500"><tr><th className="py-2">Duty/Cashier</th><th className="text-right">Reports</th><th className="text-right">Expenses</th><th className="text-right">Net remittance</th><th className="text-right">Discrepancy</th></tr></thead>
              <tbody>
                {(result?.analytics.cashierSummary ?? []).map((row) => (
                  <tr key={row.dutyName} className="border-t"><td className="py-2">{row.dutyName}</td><td className="text-right">{row.reportCount}</td><td className="text-right">{formatCurrency(row.totalExpenses)}</td><td className="text-right">{formatCurrency(row.totalNetRemittance)}</td><td className="text-right">{formatCurrency(row.totalDiscrepancy)}</td></tr>
                ))}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      {loading ? <p className="text-sm text-slate-500">Loading executive analytics...</p> : null}
    </div>
  );
}
