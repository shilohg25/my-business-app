"use client";

import { useEffect, useMemo, useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { canUseLiveData } from "@/lib/data/client";
import { fetchExecutiveAnalytics } from "@/lib/data/executive";
import { appPath, getSupabaseConfigurationState } from "@/lib/supabase/client";
import { formatCurrency } from "@/lib/utils";
import { formatSignedCurrency } from "@/lib/analytics/discrepancy";
import { fetchLubricantControlData } from "@/lib/data/lubricants";

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

export function DashboardClient() {
  const liveData = canUseLiveData();
  const config = getSupabaseConfigurationState();

  const [loading, setLoading] = useState(liveData);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<Awaited<ReturnType<typeof fetchExecutiveAnalytics>> | null>(null);
  const [lubricants, setLubricants] = useState<Awaited<ReturnType<typeof fetchLubricantControlData>> | null>(null);

  useEffect(() => {
    if (!liveData) {
      setLoading(false);
      setResult(null);
      return;
    }

    let active = true;
    setLoading(true);
    setError(null);

    Promise.all([
      fetchExecutiveAnalytics({ startDate: startOfMonthIso(), endDate: todayIso() }),
      fetchLubricantControlData({ startDate: startOfMonthIso(), endDate: todayIso() })
    ])
      .then(([analyticsData, lubricantData]) => {
        if (!active) return;
        setResult(analyticsData);
        setLubricants(lubricantData);
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

  const liters = useMemo(() => result?.analytics.productLiters ?? {}, [result?.analytics.productLiters]);
  const totals = result?.analytics.totals;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Dashboard</h1>
          <p className="text-sm text-slate-500">Owner overview for current month operations and executive metrics.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <a className="inline-flex h-10 items-center rounded-xl border px-4 text-sm font-medium hover:bg-slate-50" href={appPath("/imports/")}>Excel Import</a>
          <a className="inline-flex h-10 items-center rounded-xl border px-4 text-sm font-medium hover:bg-slate-50" href={appPath("/shift-reports/")}>Daily Shift Reports</a>
          <a className="inline-flex h-10 items-center rounded-xl border px-4 text-sm font-medium hover:bg-slate-50" href={appPath("/expenses/")}>Expenses</a>
          <a className="inline-flex h-10 items-center rounded-xl bg-slate-900 px-4 text-sm font-medium text-white hover:bg-slate-800" href={appPath("/reports/")}>Management Reports</a>
        </div>
      </div>

      {!liveData ? (
        <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
          <strong>Dashboard is in offline setup mode.</strong> {config.reason}
        </div>
      ) : null}

      {error ? <div className="rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">{error}</div> : null}

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Card><CardHeader><CardDescription>Month-to-date fuel cash sales</CardDescription><CardTitle>{formatCurrency(totals?.totalFuelCashSales ?? 0)}</CardTitle></CardHeader></Card>
        <Card><CardHeader><CardDescription>Month-to-date expenses</CardDescription><CardTitle>{formatCurrency(totals?.totalExpenses ?? 0)}</CardTitle></CardHeader></Card>
        <Card><CardHeader><CardDescription>Month-to-date net remittance</CardDescription><CardTitle>{formatCurrency(totals?.totalNetRemittance ?? 0)}</CardTitle></CardHeader></Card>
        <Card><CardHeader><CardDescription>Month-to-date net cash over/short</CardDescription><CardTitle>{formatSignedCurrency(totals?.netDiscrepancy ?? 0)}</CardTitle></CardHeader></Card>
        <Card><CardHeader><CardDescription>Lubricant sales this month</CardDescription><CardTitle>{formatCurrency(lubricants?.analytics.totalSalesAmount ?? 0)}</CardTitle></CardHeader></Card>
        <Card><CardHeader><CardDescription>Low-stock lubricant warnings</CardDescription><CardTitle>{(lubricants?.analytics.warehouseLowStockCount ?? 0) + (lubricants?.analytics.stationLowStockCount ?? 0)}</CardTitle></CardHeader></Card>
        <Card><CardHeader><CardDescription>Cash shortage reports</CardDescription><CardTitle>{totals?.cashShortageReportCount ?? 0}</CardTitle></CardHeader></Card>
        <Card><CardHeader><CardDescription>Cash overage reports</CardDescription><CardTitle>{totals?.cashOverageReportCount ?? 0}</CardTitle></CardHeader></Card>
        <Card><CardHeader><CardDescription>Diesel gross liters out</CardDescription><CardTitle>{formatLiters(liters.DIESEL?.grossLitersOut ?? 0)}</CardTitle></CardHeader></Card>
        <Card><CardHeader><CardDescription>Special gross liters out</CardDescription><CardTitle>{formatLiters(liters.SPECIAL?.grossLitersOut ?? 0)}</CardTitle></CardHeader></Card>
        <Card><CardHeader><CardDescription>Unleaded gross liters out</CardDescription><CardTitle>{formatLiters(liters.UNLEADED?.grossLitersOut ?? 0)}</CardTitle></CardHeader></Card>
        <Card><CardHeader><CardDescription>Reports needing review</CardDescription><CardTitle>{totals?.pendingReviewCount ?? 0}</CardTitle></CardHeader></Card>
      </div>

      {loading ? <p className="text-sm text-slate-500">Loading executive snapshot...</p> : null}
    </div>
  );
}
