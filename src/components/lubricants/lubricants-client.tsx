"use client";

import { useEffect, useMemo, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { appPath, getSupabaseConfigurationState } from "@/lib/supabase/client";
import { canUseLiveData } from "@/lib/data/client";
import { fetchLubricantControlData } from "@/lib/data/lubricants";

function todayIso() { return new Date().toISOString().slice(0, 10); }
function startOfMonthIso() { const now = new Date(); return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1)).toISOString().slice(0, 10); }
function formatNumber(value: number | string | null | undefined, digits = 2) { const n = Number(value ?? Number.NaN); return Number.isFinite(n) ? n.toLocaleString("en-US", { minimumFractionDigits: digits, maximumFractionDigits: digits }) : "-"; }

export function LubricantsClient() {
  const liveData = canUseLiveData();
  const config = getSupabaseConfigurationState();
  const [result, setResult] = useState<Awaited<ReturnType<typeof fetchLubricantControlData>> | null>(null);
  const [stationFilter, setStationFilter] = useState("all");

  useEffect(() => {
    fetchLubricantControlData({ startDate: startOfMonthIso(), endDate: todayIso() }).then(setResult).catch(() => setResult(null));
  }, [liveData]);

  const filteredStationInventory = useMemo(() => (result?.stationInventory ?? []).filter((row) => stationFilter === "all" || row.station_id === stationFilter), [result, stationFilter]);
  const filteredSales = useMemo(() => (result?.sales ?? []).filter((row) => stationFilter === "all" || row.station_id === stationFilter), [result, stationFilter]);
  const filteredMovements = useMemo(() => (result?.movements ?? []).filter((row) => stationFilter === "all" || row.from_location_id === stationFilter || row.to_location_id === stationFilter), [result, stationFilter]);

  return <div className="space-y-6">
    {!liveData ? <div className="rounded border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">{config.reason}</div> : null}

    <Card><CardHeader><CardTitle>Station filter</CardTitle></CardHeader><CardContent>
      <select className="w-full rounded-md border px-3 py-2 text-sm" value={stationFilter} onChange={(e) => setStationFilter(e.target.value)}>
        <option value="all">All stations</option>
        {(result?.stations ?? []).map((station) => <option key={station.id} value={station.id}>{station.name}</option>)}
      </select>
    </CardContent></Card>

    <Card><CardHeader><CardTitle>Station lubricant inventory</CardTitle></CardHeader><CardContent>
      <div className="overflow-x-auto"><table className="w-full text-sm"><thead><tr><th>Station</th><th>SKU</th><th>Product</th><th className="text-right">Quantity on hand</th><th className="text-right">Reorder level</th><th>Status</th></tr></thead><tbody>
        {filteredStationInventory.map((row) => <tr key={row.id} className="border-t"><td>{row.station_name ?? "-"}</td><td>{row.sku ?? "-"}</td><td>{row.product_name ?? "-"}</td><td className="text-right">{formatNumber(row.quantity_on_hand)}</td><td className="text-right">{formatNumber(row.reorder_level)}</td><td>{Number(row.quantity_on_hand ?? 0) <= Number(row.reorder_level ?? 0) ? "Low stock" : "OK"}</td></tr>)}
      </tbody></table></div>
    </CardContent></Card>

    <Card><CardHeader><CardTitle>Lubricant sales</CardTitle></CardHeader><CardContent>
      <div className="overflow-x-auto"><table className="w-full text-sm"><thead><tr><th>Report date</th><th>Station</th><th>Duty/Cashier</th><th>Product</th><th className="text-right">Quantity</th><th className="text-right">Unit price</th><th className="text-right">Amount</th><th>View report</th></tr></thead><tbody>
        {filteredSales.map((row) => <tr key={row.id} className="border-t"><td>{row.report_date ?? "-"}</td><td>{row.station_name ?? "-"}</td><td>{row.duty_name ?? "-"}</td><td>{row.product_name_snapshot}</td><td className="text-right">{formatNumber(row.quantity)}</td><td className="text-right">{formatNumber(row.unit_price)}</td><td className="text-right">{formatNumber(row.amount)}</td><td><a className="underline" href={appPath(`/shift-reports/view/?id=${row.shift_report_id}`)}>View report</a></td></tr>)}
      </tbody></table></div>
    </CardContent></Card>

    <Card><CardHeader><CardTitle>Movement history</CardTitle></CardHeader><CardContent>
      <div className="overflow-x-auto"><table className="w-full text-sm"><thead><tr><th>Date</th><th>Product</th><th>Type</th><th className="text-right">Qty</th><th>From location</th><th>To location</th><th>Reference</th><th>Notes</th></tr></thead><tbody>
        {filteredMovements.map((row) => <tr key={row.id} className="border-t"><td>{row.created_at?.slice(0,10) ?? "-"}</td><td>{row.product_name ?? "-"}</td><td>{row.movement_type}</td><td className="text-right">{formatNumber(row.quantity)}</td><td>{row.from_location_name ?? "-"}</td><td>{row.to_location_name ?? "-"}</td><td>{row.reference ?? "-"}</td><td>{row.notes ?? "-"}</td></tr>)}
      </tbody></table></div>
    </CardContent></Card>

    <Card><CardHeader><CardTitle>Reconciliation warnings</CardTitle></CardHeader><CardContent>
      <ul className="list-disc pl-5 text-sm text-amber-800">{(result?.warnings ?? []).map((warning) => <li key={warning}>{warning}</li>)}</ul>
    </CardContent></Card>
  </div>;
}
