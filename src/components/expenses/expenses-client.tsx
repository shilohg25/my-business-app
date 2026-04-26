"use client";

import { useEffect, useMemo, useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { ResetFiltersButton } from "@/components/ui/reset-filters-button";
import { buildExpenseAnalytics } from "@/lib/analytics/expenses";
import { canUseLiveData } from "@/lib/data/client";
import { fetchStationExpenses, type ExpenseStationOption } from "@/lib/data/expenses";
import { appPath, getSupabaseConfigurationState } from "@/lib/supabase/client";
import { areFiltersDefault, getCurrentMonthDateRange } from "@/lib/utils/filters";
import { formatCurrency } from "@/lib/utils";

function daysAgoIso(days: number) {
  const now = new Date();
  now.setUTCDate(now.getUTCDate() - days);
  return now.toISOString().slice(0, 10);
}

function formatDay(value: string | null | undefined) {
  if (!value) return "-";
  const parsed = new Date(`${value}T00:00:00Z`);
  if (Number.isNaN(parsed.getTime())) return value;
  return parsed.toLocaleDateString("en-US", { year: "numeric", month: "short", day: "numeric", timeZone: "UTC" });
}

function formatMonth(value: string | undefined) {
  if (!value) return "-";
  const parsed = new Date(`${value}-01T00:00:00Z`);
  if (Number.isNaN(parsed.getTime())) return value;
  return parsed.toLocaleDateString("en-US", { year: "numeric", month: "long", timeZone: "UTC" });
}

export function ExpensesClient() {
  const liveData = canUseLiveData();
  const config = getSupabaseConfigurationState();

  const monthDateRange = getCurrentMonthDateRange();
  const defaultFilters = { stationId: "all", startDate: monthDateRange.startDate, endDate: monthDateRange.endDate };
  const [stationId, setStationId] = useState("all");
  const [startDate, setStartDate] = useState(defaultFilters.startDate);
  const [endDate, setEndDate] = useState(defaultFilters.endDate);
  const [loading, setLoading] = useState(liveData);
  const [error, setError] = useState<string | null>(null);
  const [rows, setRows] = useState<Awaited<ReturnType<typeof fetchStationExpenses>>["rows"]>([]);
  const [stations, setStations] = useState<ExpenseStationOption[]>([]);

  useEffect(() => {
    if (!liveData) {
      setLoading(false);
      setRows([]);
      setStations([]);
      return;
    }

    let active = true;
    setLoading(true);
    setError(null);

    fetchStationExpenses({
      stationId: stationId === "all" ? undefined : stationId,
      startDate,
      endDate
    })
      .then((data) => {
        if (!active) return;
        setRows(data.rows);
        setStations(data.stations);
      })
      .catch(() => {
        if (!active) return;
        setError("We couldn't load expenses right now. Please try again in a moment.");
      })
      .finally(() => {
        if (active) setLoading(false);
      });

    return () => {
      active = false;
    };
  }, [endDate, liveData, startDate, stationId]);

  const analytics = useMemo(() => buildExpenseAnalytics(rows), [rows]);
  const activeStations = useMemo(() => stations.filter((station) => station.is_active), [stations]);
  const isAllStations = stationId === "all";
  const selectedStation = stations.find((station) => station.id === stationId) ?? null;

  function resetFilters() {
    const nextDefaults = getCurrentMonthDateRange();
    setStationId("all");
    setStartDate(nextDefaults.startDate);
    setEndDate(nextDefaults.endDate);
  }

  const hasActiveFilters = !areFiltersDefault({ stationId, startDate, endDate }, defaultFilters);

  const setPreset = (preset: "today" | "month" | "last30") => {
    if (preset === "today") {
      const date = new Date().toISOString().slice(0, 10);
      setStartDate(date);
      setEndDate(date);
      return;
    }
    if (preset === "month") {
      const monthDefaults = getCurrentMonthDateRange();
      setStartDate(monthDefaults.startDate);
      setEndDate(monthDefaults.endDate);
      return;
    }

    setStartDate(daysAgoIso(29));
    setEndDate(new Date().toISOString().slice(0, 10));
  };

  const hasRows = analytics.expenseCount > 0;

  return (
    <div className="space-y-6">
      {!liveData ? (
        <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
          <strong>Expenses are in offline setup mode.</strong> {config.reason}
        </div>
      ) : null}

      {error ? <div className="rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">{error}</div> : null}

      <Card>
        <CardHeader>
          <CardTitle>Filters</CardTitle>
          <CardDescription>Track station expenses by shift report business date.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="text-xs font-medium text-slate-600">Station
              <select className="mt-1 h-11 w-full rounded-lg border px-3 py-2 text-sm" value={stationId} onChange={(event) => setStationId(event.target.value)}>
                <option value="all">All stations</option>
                {activeStations.map((station) => (
                  <option key={station.id} value={station.id}>{station.name}</option>
                ))}
              </select>
            </label>
            <div className="flex flex-wrap items-end gap-2">
              <button className="min-h-10 rounded-lg border px-3 py-1.5 text-xs font-medium hover:bg-slate-50" onClick={() => setPreset("today")} type="button">Today</button>
              <button className="min-h-10 rounded-lg border px-3 py-1.5 text-xs font-medium hover:bg-slate-50" onClick={() => setPreset("month")} type="button">This Month</button>
              <button className="min-h-10 rounded-lg border px-3 py-1.5 text-xs font-medium hover:bg-slate-50" onClick={() => setPreset("last30")} type="button">Last 30 Days</button>
            </div>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="text-xs font-medium text-slate-600">Custom start date
              <input className="mt-1 h-11 w-full rounded-lg border px-3 py-2 text-sm" type="date" value={startDate} onChange={(event) => setStartDate(event.target.value)} />
            </label>
            <label className="text-xs font-medium text-slate-600">Custom end date
              <input className="mt-1 h-11 w-full rounded-lg border px-3 py-2 text-sm" type="date" value={endDate} onChange={(event) => setEndDate(event.target.value)} />
            </label>
          </div>
          <div className="flex flex-wrap justify-end gap-2">
            <ResetFiltersButton onClick={resetFilters} visible={hasActiveFilters} />
          </div>
        </CardContent>
      </Card>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Card><CardHeader><CardDescription>Total expenses</CardDescription><CardTitle>{formatCurrency(analytics.totalExpenses)}</CardTitle></CardHeader></Card>
        <Card><CardHeader><CardDescription>Expense entries</CardDescription><CardTitle>{analytics.expenseCount}</CardTitle></CardHeader></Card>
        <Card><CardHeader><CardDescription>Highest expense day</CardDescription><CardTitle>{analytics.highestExpenseDay ? formatCurrency(analytics.highestExpenseDay.amount) : "-"}</CardTitle></CardHeader><CardContent className="pt-0 text-xs text-slate-500">{analytics.highestExpenseDay ? formatDay(analytics.highestExpenseDay.report_date) : "No days"}</CardContent></Card>
        <Card><CardHeader><CardDescription>Top expense category</CardDescription><CardTitle>{analytics.topExpenseCategory?.category ?? "-"}</CardTitle></CardHeader><CardContent className="pt-0 text-xs text-slate-500">{analytics.topExpenseCategory ? formatCurrency(analytics.topExpenseCategory.amount) : "No category data"}</CardContent></Card>
        {!isAllStations ? <Card><CardHeader><CardDescription>Selected station</CardDescription><CardTitle>{selectedStation?.name ?? "Unknown station"}</CardTitle></CardHeader><CardContent className="pt-0 text-xs text-slate-500">Station total expenses: {formatCurrency(analytics.totalExpenses)}</CardContent></Card> : null}
      </div>

      {loading ? <p className="text-sm text-slate-500">Loading expenses...</p> : null}
      {!loading && !hasRows ? <p className="text-sm text-slate-500">No expenses found for this station and date range.</p> : null}

      {!loading && hasRows ? (
        <>
          {isAllStations ? (
            <Card>
              <CardHeader><CardTitle>Expenses by station</CardTitle></CardHeader>
              <CardContent>
                <div className="overflow-x-auto"><table className="w-full min-w-[640px] text-sm"><thead className="text-left text-slate-500"><tr><th className="py-2">Station</th><th className="text-right">Expense count</th><th className="text-right">Total expenses</th></tr></thead><tbody>{analytics.byStation.map((row) => (<tr key={row.key} className="border-t"><td className="py-2">{row.station_name}</td><td className="text-right">{row.count}</td><td className="text-right">{formatCurrency(row.amount)}</td></tr>))}</tbody></table></div>
              </CardContent>
            </Card>
          ) : null}

          <Card>
            <CardHeader><CardTitle>Daily expenses</CardTitle></CardHeader>
            <CardContent>
              <div className="overflow-x-auto"><table className="w-full min-w-[640px] text-sm"><thead className="text-left text-slate-500"><tr><th className="py-2">Date</th>{isAllStations ? <th>Station</th> : null}<th className="text-right">Expense count</th><th className="text-right">Total amount</th></tr></thead><tbody>{analytics.byDay.map((row) => (<tr key={row.key} className="border-t"><td className="py-2">{formatDay(row.report_date)}</td>{isAllStations ? <td>{row.station_name}</td> : null}<td className="text-right">{row.count}</td><td className="text-right">{formatCurrency(row.amount)}</td></tr>))}</tbody></table></div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader><CardTitle>Monthly expenses</CardTitle></CardHeader>
            <CardContent>
              <div className="overflow-x-auto"><table className="w-full min-w-[640px] text-sm"><thead className="text-left text-slate-500"><tr><th className="py-2">Month</th>{isAllStations ? <th>Station</th> : null}<th className="text-right">Expense count</th><th className="text-right">Total amount</th></tr></thead><tbody>{analytics.byMonth.map((row) => (<tr key={row.key} className="border-t"><td className="py-2">{formatMonth(row.month)}</td>{isAllStations ? <td>{row.station_name}</td> : null}<td className="text-right">{row.count}</td><td className="text-right">{formatCurrency(row.amount)}</td></tr>))}</tbody></table></div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader><CardTitle>Expenses by category</CardTitle></CardHeader>
            <CardContent>
              <div className="overflow-x-auto"><table className="w-full min-w-[640px] text-sm"><thead className="text-left text-slate-500"><tr><th className="py-2">Category</th><th className="text-right">Expense count</th><th className="text-right">Total amount</th></tr></thead><tbody>{analytics.byCategory.map((row) => (<tr key={row.key} className="border-t"><td className="py-2">{row.category}</td><td className="text-right">{row.count}</td><td className="text-right">{formatCurrency(row.amount)}</td></tr>))}</tbody></table></div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader><CardTitle>Expense detail</CardTitle></CardHeader>
            <CardContent>
              <div className="overflow-x-auto"><table className="w-full min-w-[640px] text-sm"><thead className="text-left text-slate-500"><tr><th className="py-2">Report date</th><th>Station</th><th>Duty/Cashier</th><th>Shift</th><th>Category</th><th>Description</th><th>Receipt reference</th><th className="text-right">Amount</th><th className="text-right">View report</th></tr></thead><tbody>{analytics.detailRows.map((row) => (<tr key={row.id} className="border-t"><td className="py-2">{formatDay(row.report_date)}</td><td>{row.station_name || "Unknown station"}</td><td>{row.duty_name || "-"}</td><td>{row.shift_time_label || "-"}</td><td>{row.category?.trim() || "Uncategorized"}</td><td>{row.description || "-"}</td><td>{row.receipt_reference || "-"}</td><td className="text-right">{formatCurrency(Number(row.amount ?? 0))}</td><td className="text-right"><a className="inline-flex rounded-md border px-2 py-1 text-xs" href={appPath(`/shift-reports/view/?id=${row.shift_report_id}`)}>Open</a></td></tr>))}</tbody></table></div>
            </CardContent>
          </Card>
        </>
      ) : null}
    </div>
  );
}
