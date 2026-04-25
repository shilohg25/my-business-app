"use client";

import { useEffect, useMemo, useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { canUseLiveData } from "@/lib/data/client";
import { fetchExecutiveAnalytics } from "@/lib/data/executive";
import { appPath, getSupabaseConfigurationState } from "@/lib/supabase/client";
import { formatCurrency } from "@/lib/utils";

function todayIso() {
  return new Date().toISOString().slice(0, 10);
}

function startOfMonthIso() {
  const now = new Date();
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1)).toISOString().slice(0, 10);
}

function daysAgoIso(days: number) {
  const now = new Date();
  now.setUTCDate(now.getUTCDate() - days);
  return now.toISOString().slice(0, 10);
}

function formatDay(value: string) {
  const parsed = new Date(`${value}T00:00:00Z`);
  if (Number.isNaN(parsed.getTime())) return value;
  return parsed.toLocaleDateString("en-US", { year: "numeric", month: "short", day: "numeric", timeZone: "UTC" });
}

export function ExpensesClient() {
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

  const reportById = useMemo(() => new Map((result?.reports ?? []).map((report) => [report.id, report])), [result?.reports]);

  const expenseDetails = useMemo(() => {
    return (result?.expenses ?? [])
      .map((row) => {
        const report = reportById.get(row.shift_report_id);
        return {
          id: row.id,
          shift_report_id: row.shift_report_id,
          date: report?.report_date ?? "-",
          dutyName: report?.duty_name ?? "-",
          category: row.category ?? "Uncategorized",
          description: row.description ?? "-",
          receiptReference: row.receipt_reference ?? "-",
          amount: Number(row.amount ?? 0)
        };
      })
      .sort((a, b) => b.date.localeCompare(a.date));
  }, [reportById, result?.expenses]);

  const highestExpenseDay = useMemo(() => {
    const rows = result?.analytics.dailyExpenses ?? [];
    if (rows.length === 0) return null;
    return rows.reduce((highest, row) => (row.amount > highest.amount ? row : highest), rows[0]);
  }, [result?.analytics.dailyExpenses]);

  const topCategory = useMemo(() => {
    const rows = result?.analytics.expensesByCategory ?? [];
    return rows[0] ?? null;
  }, [result?.analytics.expensesByCategory]);

  const setPreset = (preset: "today" | "month" | "last30") => {
    if (preset === "today") {
      const date = todayIso();
      setStartDate(date);
      setEndDate(date);
      return;
    }

    if (preset === "month") {
      setStartDate(startOfMonthIso());
      setEndDate(todayIso());
      return;
    }

    setStartDate(daysAgoIso(29));
    setEndDate(todayIso());
  };

  const hasExpenses = (result?.expenses.length ?? 0) > 0;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Expenses</h1>
        <p className="text-sm text-slate-500">Daily and monthly operating expenses from committed shift reports.</p>
      </div>

      {!liveData ? (
        <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
          <strong>Expenses are in offline setup mode.</strong> {config.reason}
        </div>
      ) : null}

      {error ? <div className="rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">{error}</div> : null}

      <Card>
        <CardHeader>
          <CardTitle>Date range</CardTitle>
          <CardDescription>Choose an operating period for expense analysis.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex flex-wrap gap-2">
            <button className="rounded-lg border px-3 py-1.5 text-xs font-medium hover:bg-slate-50" onClick={() => setPreset("today")} type="button">Today</button>
            <button className="rounded-lg border px-3 py-1.5 text-xs font-medium hover:bg-slate-50" onClick={() => setPreset("month")} type="button">This Month</button>
            <button className="rounded-lg border px-3 py-1.5 text-xs font-medium hover:bg-slate-50" onClick={() => setPreset("last30")} type="button">Last 30 Days</button>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="text-xs font-medium text-slate-600">Start date
              <input className="mt-1 w-full rounded-lg border px-3 py-2 text-sm" type="date" value={startDate} onChange={(event) => setStartDate(event.target.value)} />
            </label>
            <label className="text-xs font-medium text-slate-600">End date
              <input className="mt-1 w-full rounded-lg border px-3 py-2 text-sm" type="date" value={endDate} onChange={(event) => setEndDate(event.target.value)} />
            </label>
          </div>
        </CardContent>
      </Card>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Card><CardHeader><CardDescription>Total expenses</CardDescription><CardTitle>{formatCurrency(result?.analytics.totals.totalExpenses ?? 0)}</CardTitle></CardHeader></Card>
        <Card><CardHeader><CardDescription>Expense entries</CardDescription><CardTitle>{result?.expenses.length ?? 0}</CardTitle></CardHeader></Card>
        <Card><CardHeader><CardDescription>Highest expense day</CardDescription><CardTitle>{highestExpenseDay ? formatCurrency(highestExpenseDay.amount) : "-"}</CardTitle></CardHeader><CardContent className="pt-0 text-xs text-slate-500">{highestExpenseDay ? formatDay(highestExpenseDay.date) : "No days"}</CardContent></Card>
        <Card><CardHeader><CardDescription>Top expense category</CardDescription><CardTitle>{topCategory?.category ?? "-"}</CardTitle></CardHeader><CardContent className="pt-0 text-xs text-slate-500">{topCategory ? formatCurrency(topCategory.amount) : "No category data"}</CardContent></Card>
      </div>

      {loading ? <p className="text-sm text-slate-500">Loading expenses...</p> : null}
      {!loading && !hasExpenses ? <p className="text-sm text-slate-500">No expenses found for this period.</p> : null}

      {!loading && hasExpenses ? (
        <>
          <Card>
            <CardHeader><CardTitle>Daily expenses</CardTitle></CardHeader>
            <CardContent>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="text-left text-slate-500"><tr><th className="py-2">Date</th><th className="text-right">Expense count</th><th className="text-right">Total amount</th></tr></thead>
                  <tbody>
                    {(result?.analytics.dailyExpenses ?? []).map((row) => (
                      <tr key={row.date} className="border-t"><td className="py-2">{formatDay(row.date)}</td><td className="text-right">{row.count}</td><td className="text-right">{formatCurrency(row.amount)}</td></tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader><CardTitle>Monthly expenses</CardTitle></CardHeader>
            <CardContent>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="text-left text-slate-500"><tr><th className="py-2">Month</th><th className="text-right">Expense count</th><th className="text-right">Total amount</th></tr></thead>
                  <tbody>
                    {(result?.analytics.monthlyExpenses ?? []).map((row) => (
                      <tr key={row.month} className="border-t"><td className="py-2">{row.month}</td><td className="text-right">{row.count}</td><td className="text-right">{formatCurrency(row.amount)}</td></tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader><CardTitle>Expenses by category</CardTitle></CardHeader>
            <CardContent>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="text-left text-slate-500"><tr><th className="py-2">Category</th><th className="text-right">Count</th><th className="text-right">Total amount</th></tr></thead>
                  <tbody>
                    {(result?.analytics.expensesByCategory ?? []).map((row) => (
                      <tr key={row.category} className="border-t"><td className="py-2">{row.category}</td><td className="text-right">{row.count}</td><td className="text-right">{formatCurrency(row.amount)}</td></tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader><CardTitle>Expense detail</CardTitle></CardHeader>
            <CardContent>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="text-left text-slate-500">
                    <tr>
                      <th className="py-2">Date</th><th>Duty/Cashier</th><th>Category</th><th>Description</th><th>Receipt reference</th><th className="text-right">Amount</th><th className="text-right">View report</th>
                    </tr>
                  </thead>
                  <tbody>
                    {expenseDetails.map((row) => (
                      <tr key={row.id} className="border-t">
                        <td className="py-2">{formatDay(row.date)}</td>
                        <td>{row.dutyName}</td>
                        <td>{row.category}</td>
                        <td>{row.description}</td>
                        <td>{row.receiptReference}</td>
                        <td className="text-right">{formatCurrency(row.amount)}</td>
                        <td className="text-right"><a className="inline-flex rounded-md border px-2 py-1 text-xs" href={appPath(`/shift-reports/view/?id=${row.shift_report_id}`)}>Open</a></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>
        </>
      ) : null}
    </div>
  );
}
