"use client";

import { useEffect, useMemo, useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { appPath, getSupabaseConfigurationState } from "@/lib/supabase/client";
import { formatCurrency } from "@/lib/utils";
import { canUseLiveData } from "@/lib/data/client";
import { fetchLubricantControlData } from "@/lib/data/lubricants";
import { isLowStock } from "@/lib/analytics/lubricants";

function todayIso() {
  return new Date().toISOString().slice(0, 10);
}

function startOfMonthIso() {
  const now = new Date();
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1)).toISOString().slice(0, 10);
}

function formatNumber(value: number | string | null | undefined, digits = 2) {
  const numeric = Number(value ?? Number.NaN);
  if (!Number.isFinite(numeric)) return "-";
  return numeric.toLocaleString("en-US", { minimumFractionDigits: digits, maximumFractionDigits: digits });
}

export function LubricantsClient() {
  const liveData = canUseLiveData();
  const config = getSupabaseConfigurationState();
  const [loading, setLoading] = useState(liveData);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<Awaited<ReturnType<typeof fetchLubricantControlData>> | null>(null);
  const [stationFilter, setStationFilter] = useState<string>("all");

  useEffect(() => {
    if (!liveData) {
      setLoading(false);
      setResult(null);
      return;
    }

    let active = true;
    setLoading(true);
    setError(null);

    fetchLubricantControlData({ startDate: startOfMonthIso(), endDate: todayIso() })
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
  }, [liveData]);

  const filteredStationInventory = useMemo(
    () =>
      (result?.stationInventory ?? []).filter((row) => stationFilter === "all" || row.station_id === stationFilter),
    [result?.stationInventory, stationFilter]
  );

  const filteredSales = useMemo(
    () =>
      (result?.sales ?? []).filter((row) => stationFilter === "all" || row.station_id === stationFilter),
    [result?.sales, stationFilter]
  );

  const filteredMovements = useMemo(
    () =>
      (result?.movements ?? []).filter((row) =>
        stationFilter === "all" || row.from_station_id === stationFilter || row.to_station_id === stationFilter
      ),
    [result?.movements, stationFilter]
  );

  const reconciliationWarnings = useMemo(() => {
    const warnings = [...(result?.analytics.warnings ?? [])];
    if ((result?.stationInventory ?? []).some(isLowStock)) warnings.push("Station inventory is below reorder level");
    if ((result?.warehouseInventory ?? []).some(isLowStock)) warnings.push("Warehouse inventory is below reorder level");
    return Array.from(new Set(warnings));
  }, [result]);

  return (
    <div className="space-y-6">
      {!liveData ? <div className="rounded border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">{config.reason}</div> : null}
      {error ? <div className="rounded border border-red-200 bg-red-50 p-3 text-sm text-red-700">{error}</div> : null}

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
        <Card><CardHeader><CardDescription>Lubricant sales this month</CardDescription><CardTitle>{formatCurrency(result?.analytics.totalSalesAmount ?? 0)}</CardTitle></CardHeader></Card>
        <Card><CardHeader><CardDescription>Units sold this month</CardDescription><CardTitle>{formatNumber(result?.analytics.totalUnitsSold ?? 0, 2)}</CardTitle></CardHeader></Card>
        <Card><CardHeader><CardDescription>Station low-stock warnings</CardDescription><CardTitle>{result?.analytics.stationLowStockCount ?? 0}</CardTitle></CardHeader></Card>
        <Card><CardHeader><CardDescription>Recent refills</CardDescription><CardTitle>{(result?.movements ?? []).filter((x) => x.movement_type === "transfer_out").length}</CardTitle></CardHeader></Card>
        <Card><CardHeader><CardDescription>Products active</CardDescription><CardTitle>{(result?.products ?? []).filter((x) => x.is_active !== false).length}</CardTitle></CardHeader></Card>
      </div>

      <Card>
        <CardHeader><CardTitle>Station filter</CardTitle></CardHeader>
        <CardContent>
          <select className="w-full rounded-md border px-3 py-2 text-sm" value={stationFilter} onChange={(e) => setStationFilter(e.target.value)}>
            <option value="all">All stations</option>
            {(result?.stations ?? []).map((station) => <option key={station.id} value={station.id}>{station.name}</option>)}
          </select>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle>Station inventory</CardTitle></CardHeader>
        <CardContent>
          {filteredStationInventory.length === 0 ? <p className="text-sm text-slate-500">No station lubricant inventory found.</p> : null}
          {filteredStationInventory.length > 0 ? <div className="overflow-x-auto"><table className="w-full text-sm"><thead className="text-left text-slate-500"><tr><th className="py-2">Station</th><th>SKU</th><th>Product</th><th className="text-right">Quantity on hand</th><th className="text-right">Reorder level</th><th>Status</th></tr></thead><tbody>{filteredStationInventory.map((row) => <tr className="border-t" key={row.id}><td className="py-2">{row.station_name ?? "-"}</td><td>{row.sku ?? "-"}</td><td>{row.product_name ?? "-"}</td><td className="text-right">{formatNumber(row.quantity_on_hand)}</td><td className="text-right">{formatNumber(row.reorder_level)}</td><td>{isLowStock(row) ? "Low stock" : "OK"}</td></tr>)}</tbody></table></div> : null}
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle>Lubricant sales</CardTitle></CardHeader>
        <CardContent>
          {filteredSales.length === 0 ? <p className="text-sm text-slate-500">No lubricant sales found for this filter.</p> : null}
          {filteredSales.length > 0 ? <div className="overflow-x-auto"><table className="w-full text-sm"><thead className="text-left text-slate-500"><tr><th className="py-2">Report date</th><th>Station</th><th>Duty/Cashier</th><th>Product</th><th className="text-right">Quantity</th><th className="text-right">Unit price</th><th className="text-right">Amount</th><th>View report</th></tr></thead><tbody>{filteredSales.map((row) => <tr className="border-t" key={row.id}><td className="py-2">{row.report_date ?? row.created_at?.slice(0, 10) ?? "-"}</td><td>{row.station_name ?? "-"}</td><td>{row.duty_name ?? "-"}</td><td>{row.product_name_snapshot ?? "-"}</td><td className="text-right">{formatNumber(row.quantity)}</td><td className="text-right">{formatCurrency(Number(row.unit_price ?? 0))}</td><td className="text-right">{formatCurrency(Number(row.amount ?? 0))}</td><td>{row.shift_report_id ? <a className="underline" href={appPath(`/shift-reports/view/?id=${row.shift_report_id}`)}>View report</a> : "-"}</td></tr>)}</tbody></table></div> : null}
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle>Movement history</CardTitle></CardHeader>
        <CardContent>
          {filteredMovements.length === 0 ? <p className="text-sm text-slate-500">No movement history found.</p> : null}
          {filteredMovements.length > 0 ? <div className="overflow-x-auto"><table className="w-full text-sm"><thead className="text-left text-slate-500"><tr><th className="py-2">Date</th><th>Product</th><th>Movement type</th><th className="text-right">Quantity</th><th>From</th><th>To</th><th>Reference</th><th>Notes</th><th>Linked report</th></tr></thead><tbody>{filteredMovements.map((row) => <tr className="border-t" key={row.id}><td className="py-2">{row.created_at?.slice(0, 10) ?? "-"}</td><td>{row.product_name ?? "-"}</td><td>{row.movement_type}</td><td className="text-right">{formatNumber(row.quantity)}</td><td>{row.from_station_name ?? "-"}</td><td>{row.to_station_name ?? "-"}</td><td>{row.reference ?? "-"}</td><td>{row.notes ?? "-"}</td><td>{row.shift_report_id ? <a className="underline" href={appPath(`/shift-reports/view/?id=${row.shift_report_id}`)}>View report</a> : "-"}</td></tr>)}</tbody></table></div> : null}
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle>Reconciliation warnings</CardTitle></CardHeader>
        <CardContent>
          {reconciliationWarnings.length === 0 ? <p className="text-sm text-slate-500">No warnings detected.</p> : <ul className="list-disc space-y-1 pl-5 text-sm text-amber-800">{reconciliationWarnings.map((warning) => <li key={warning}>{warning}</li>)}</ul>}
        </CardContent>
      </Card>

      {loading ? <p className="text-sm text-slate-500">Loading station lubricants...</p> : null}
    </div>
  );
}
