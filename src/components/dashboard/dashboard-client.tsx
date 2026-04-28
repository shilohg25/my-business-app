"use client";

import { useEffect, useMemo, useState } from "react";
import { canUseLiveData } from "@/lib/data/client";
import { fetchExecutiveAnalytics } from "@/lib/data/executive";
import { appPath, getSupabaseConfigurationState } from "@/lib/supabase/client";
import { formatCurrency } from "@/lib/utils";
import { formatSignedCurrency } from "@/lib/analytics/discrepancy";
import { fetchLubricantControlData } from "@/lib/data/lubricants";
import { fetchFuelInventoryDashboard } from "@/lib/data/fuel-inventory";
import { fetchStationExpenses } from "@/lib/data/expenses";
import { buildExpenseAnalytics } from "@/lib/analytics/expenses";
import { MetricGrid, type DashboardMetric } from "@/components/dashboard/sections/metric-grid";
import { startOfMonthIso, todayIso } from "@/lib/config/dashboard";

function formatLiters(value: number) {
  return value.toLocaleString("en-US", { minimumFractionDigits: 3, maximumFractionDigits: 3, useGrouping: false });
}

export function DashboardClient() {
  const liveData = canUseLiveData();
  const config = getSupabaseConfigurationState();
  const [loading, setLoading] = useState(liveData);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<Awaited<ReturnType<typeof fetchExecutiveAnalytics>> | null>(null);
  const [lubricants, setLubricants] = useState<Awaited<ReturnType<typeof fetchLubricantControlData>> | null>(null);
  const [fuelInventory, setFuelInventory] = useState<Awaited<ReturnType<typeof fetchFuelInventoryDashboard>> | null>(null);
  const [expenseRows, setExpenseRows] = useState<Awaited<ReturnType<typeof fetchStationExpenses>>["rows"]>([]);

  useEffect(() => {
    if (!liveData) return setLoading(false);
    let active = true;
    setLoading(true);
    setError(null);
    Promise.all([
      fetchExecutiveAnalytics({ startDate: startOfMonthIso(), endDate: todayIso() }),
      fetchLubricantControlData({ startDate: startOfMonthIso(), endDate: todayIso() }),
      fetchFuelInventoryDashboard(),
      fetchStationExpenses({ startDate: startOfMonthIso(), endDate: todayIso() })
    ])
      .then(([analyticsData, lubricantData, fuelData, expenseData]) => {
        if (!active) return;
        setResult(analyticsData);
        setLubricants(lubricantData);
        setFuelInventory(fuelData);
        setExpenseRows(expenseData.rows);
      })
      .catch((nextError: Error) => active && setError(nextError.message))
      .finally(() => active && setLoading(false));
    return () => {
      active = false;
    };
  }, [liveData]);

  const liters = useMemo(() => result?.analytics.productLiters ?? {}, [result?.analytics.productLiters]);
  const totals = result?.analytics.totals;
  const topExpenseStation = useMemo(() => buildExpenseAnalytics(expenseRows).byStation[0] ?? null, [expenseRows]);

  const executiveMetrics: DashboardMetric[] = [
    { label: "Month-to-date fuel cash sales", value: formatCurrency(totals?.totalFuelCashSales ?? 0) },
    { label: "Month-to-date expenses", value: formatCurrency(totals?.totalExpenses ?? 0) },
    { label: "Month-to-date net remittance", value: formatCurrency(totals?.totalNetRemittance ?? 0) },
    { label: "Month-to-date net cash over/short", value: formatSignedCurrency(totals?.netDiscrepancy ?? 0) }
  ];
  const operationsMetrics: DashboardMetric[] = [
    { label: "Lubricant sales this month", value: formatCurrency(lubricants?.analytics.totalSalesAmount ?? 0) },
    { label: "Low-stock lubricant warnings", value: String((lubricants?.analytics.warehouseLowStockCount ?? 0) + (lubricants?.analytics.stationLowStockCount ?? 0)) },
    { label: "Reports needing review", value: String(totals?.pendingReviewCount ?? 0) },
    { label: "Top station by expenses", value: topExpenseStation?.station_name ?? "-", hint: topExpenseStation ? formatCurrency(topExpenseStation.amount) : "No expense data" }
  ];
  const inventoryMetrics: DashboardMetric[] = [
    { label: "Fuel deliveries this month", value: String(fuelInventory?.deliveries.length ?? 0) },
    { label: "Diesel variance liters", value: formatLiters(fuelInventory?.totals?.dieselVariance ?? 0) },
    { label: "Special variance liters", value: formatLiters(fuelInventory?.totals?.specialVariance ?? 0) },
    { label: "Unleaded variance liters", value: formatLiters(fuelInventory?.totals?.unleadedVariance ?? 0) },
    { label: "Stations missing fuel baseline", value: String(fuelInventory?.totals?.missingBaselineStations ?? 0) },
    { label: "Fuel shortage alerts", value: String(fuelInventory?.totals?.shortageAlerts ?? 0) },
    { label: "Diesel gross liters out", value: formatLiters(liters.DIESEL?.grossLitersOut ?? 0) },
    { label: "Unleaded gross liters out", value: formatLiters(liters.UNLEADED?.grossLitersOut ?? 0) }
  ];

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Dashboard</h1>
          <p className="text-sm text-slate-500">Owner overview for current month operations and executive metrics.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <a className="inline-flex h-10 items-center rounded-xl border px-4 text-sm font-medium hover:bg-slate-50" href={appPath("/shift-reports/")}>Daily Shift Reports</a>
          <a className="inline-flex h-10 items-center rounded-xl border px-4 text-sm font-medium hover:bg-slate-50" href={appPath("/expenses/")}>Expenses</a>
          <a className="inline-flex h-10 items-center rounded-xl bg-slate-900 px-4 text-sm font-medium text-white hover:bg-slate-800" href={appPath("/reports/")}>Management Reports</a>
        </div>
      </div>

      {!liveData ? <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900"><strong>Dashboard is in offline setup mode.</strong> {config.reason}</div> : null}
      {error ? <div className="rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">{error}</div> : null}

      <MetricGrid title="Executive summary" metrics={executiveMetrics} />
      <MetricGrid title="Current month operations" metrics={operationsMetrics} />
      <MetricGrid title="Inventory and exception alerts" metrics={inventoryMetrics} />

      {loading ? <p className="text-sm text-slate-500">Loading executive snapshot...</p> : null}
    </div>
  );
}
