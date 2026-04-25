"use client";

import { useEffect, useMemo, useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { appPath, getSupabaseConfigurationState } from "@/lib/supabase/client";
import { formatCurrency } from "@/lib/utils";
import { canUseLiveData } from "@/lib/data/client";
import { fetchLubricantControlData } from "@/lib/data/lubricants";
import { isLowStock } from "@/lib/analytics/lubricants";

type TabKey = "sales" | "inventory" | "movements" | "products";

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

function formatDate(value: string | null | undefined) {
  if (!value) return "-";
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return value;
  return parsed.toLocaleDateString("en-US", { year: "numeric", month: "short", day: "numeric" });
}

export function LubricantsClient() {
  const liveData = canUseLiveData();
  const config = getSupabaseConfigurationState();
  const [loading, setLoading] = useState(liveData);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<TabKey>("sales");
  const [result, setResult] = useState<Awaited<ReturnType<typeof fetchLubricantControlData>> | null>(null);

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

  const warningRows = useMemo(() => result?.analytics.warnings ?? [], [result?.analytics.warnings]);

  return (
    <div className="space-y-6">
      {!liveData ? (
        <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
          <strong>Lubricant control is in offline setup mode.</strong> {config.reason}
        </div>
      ) : null}

      {error ? <div className="rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">{error}</div> : null}

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
        <Card><CardHeader><CardDescription>Total lubricant sales this month</CardDescription><CardTitle>{formatCurrency(result?.analytics.totalSalesAmount ?? 0)}</CardTitle></CardHeader></Card>
        <Card><CardHeader><CardDescription>Units sold this month</CardDescription><CardTitle>{formatNumber(result?.analytics.totalUnitsSold ?? 0, 2)}</CardTitle></CardHeader></Card>
        <Card><CardHeader><CardDescription>Warehouse SKUs below reorder level</CardDescription><CardTitle>{result?.analytics.warehouseLowStockCount ?? 0}</CardTitle></CardHeader></Card>
        <Card><CardHeader><CardDescription>Station SKUs below reorder level</CardDescription><CardTitle>{result?.analytics.stationLowStockCount ?? 0}</CardTitle></CardHeader></Card>
        <Card><CardHeader><CardDescription>Recent movements count</CardDescription><CardTitle>{result?.analytics.recentMovementCount ?? 0}</CardTitle></CardHeader></Card>
      </div>

      {warningRows.length > 0 ? (
        <Card>
          <CardHeader><CardTitle>Review warnings</CardTitle></CardHeader>
          <CardContent>
            <ul className="list-disc space-y-1 pl-4 text-sm text-amber-800">
              {warningRows.map((warning) => <li key={warning}>{warning}</li>)}
            </ul>
          </CardContent>
        </Card>
      ) : null}

      <div className="flex flex-wrap gap-2">
        {(["sales", "inventory", "movements", "products"] as TabKey[]).map((tab) => (
          <button
            key={tab}
            type="button"
            onClick={() => setActiveTab(tab)}
            className={`rounded-xl border px-3 py-1.5 text-sm capitalize ${activeTab === tab ? "bg-slate-900 text-white" : "bg-white hover:bg-slate-50"}`}
          >
            {tab}
          </button>
        ))}
      </div>

      {activeTab === "sales" ? (
        <Card>
          <CardHeader><CardTitle>Sales</CardTitle></CardHeader>
          <CardContent>
            {result && result.sales.length === 0 ? <p className="text-sm text-slate-500">No lubricant sales found for this period.</p> : null}
            {result && result.sales.length > 0 ? (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="text-left text-slate-500"><tr><th className="py-2">Report date</th><th>Duty/Cashier</th><th>Product</th><th className="text-right">Quantity</th><th className="text-right">Unit price</th><th className="text-right">Amount</th><th className="text-right">View report</th></tr></thead>
                  <tbody>
                    {result.sales.map((row) => (
                      <tr className="border-t" key={row.id}>
                        <td className="py-2">{formatDate(row.report_date ?? row.created_at)}</td>
                        <td>{row.duty_name ?? "-"}</td>
                        <td>{row.product_name_snapshot ?? "-"}</td>
                        <td className="text-right">{formatNumber(row.quantity, 2)}</td>
                        <td className="text-right">{formatCurrency(Number(row.unit_price ?? 0))}</td>
                        <td className="text-right">{formatCurrency(Number(row.amount ?? 0))}</td>
                        <td className="text-right"><a className="underline" href={appPath(`/shift-reports/view/?id=${row.shift_report_id}`)}>View report</a></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : null}
          </CardContent>
        </Card>
      ) : null}

      {activeTab === "inventory" && result ? (
        <div className="space-y-4">
          <Card>
            <CardHeader><CardTitle>Warehouse inventory</CardTitle></CardHeader>
            <CardContent>
              <div className="overflow-x-auto"><table className="w-full text-sm"><thead className="text-left text-slate-500"><tr><th className="py-2">Product</th><th>SKU</th><th className="text-right">Quantity on hand</th><th className="text-right">Reorder level</th><th>Status</th></tr></thead><tbody>{result.warehouseInventory.map((row) => { const low = isLowStock(row); return <tr className="border-t" key={row.id}><td className="py-2">{row.product_name ?? "-"}</td><td>{row.sku ?? "-"}</td><td className="text-right">{formatNumber(row.quantity_on_hand, 2)}</td><td className="text-right">{formatNumber(row.reorder_level, 2)}</td><td>{low ? "Low stock" : "OK"}</td></tr>; })}</tbody></table></div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader><CardTitle>Station inventory</CardTitle></CardHeader>
            <CardContent>
              <div className="overflow-x-auto"><table className="w-full text-sm"><thead className="text-left text-slate-500"><tr><th className="py-2">Station</th><th>Product</th><th>SKU</th><th className="text-right">Quantity on hand</th><th className="text-right">Reorder level</th><th>Status</th></tr></thead><tbody>{result.stationInventory.map((row) => { const low = isLowStock(row); return <tr className="border-t" key={row.id}><td className="py-2">{row.station_name ?? "-"}</td><td>{row.product_name ?? "-"}</td><td>{row.sku ?? "-"}</td><td className="text-right">{formatNumber(row.quantity_on_hand, 2)}</td><td className="text-right">{formatNumber(row.reorder_level, 2)}</td><td>{low ? "Low stock" : "OK"}</td></tr>; })}</tbody></table></div>
            </CardContent>
          </Card>
        </div>
      ) : null}

      {activeTab === "movements" && result ? (
        <Card>
          <CardHeader><CardTitle>Movements</CardTitle><CardDescription>Read-only movement history for now to avoid non-transactional inventory mutation.</CardDescription></CardHeader>
          <CardContent>
            <div className="overflow-x-auto"><table className="w-full text-sm"><thead className="text-left text-slate-500"><tr><th className="py-2">Date</th><th>Product</th><th>Movement type</th><th className="text-right">Quantity</th><th>From station</th><th>To station</th><th>Reference</th><th>Notes</th><th>Linked report</th></tr></thead><tbody>{result.movements.map((row) => <tr className="border-t" key={row.id}><td className="py-2">{formatDate(row.created_at)}</td><td>{row.product_name ?? "-"}</td><td>{row.movement_type}</td><td className="text-right">{formatNumber(row.quantity, 2)}</td><td>{row.from_station_name ?? "-"}</td><td>{row.to_station_name ?? "-"}</td><td>{row.reference ?? "-"}</td><td>{row.notes ?? "-"}</td><td>{row.shift_report_id ? <a href={appPath(`/shift-reports/view/?id=${row.shift_report_id}`)} className="underline">View report</a> : "-"}</td></tr>)}</tbody></table></div>
          </CardContent>
        </Card>
      ) : null}

      {activeTab === "products" && result ? (
        <Card>
          <CardHeader><CardTitle>Products</CardTitle></CardHeader>
          <CardContent>
            <div className="overflow-x-auto"><table className="w-full text-sm"><thead className="text-left text-slate-500"><tr><th className="py-2">SKU</th><th>Product name</th><th>Unit</th><th className="text-right">Default unit price</th><th>Active</th></tr></thead><tbody>{result.products.map((row) => <tr className="border-t" key={row.id}><td className="py-2">{row.sku ?? "-"}</td><td>{row.name ?? "-"}</td><td>{row.unit ?? "-"}</td><td className="text-right">{formatCurrency(Number(row.default_unit_price ?? 0))}</td><td>{row.is_active ? "Yes" : "No"}</td></tr>)}</tbody></table></div>
          </CardContent>
        </Card>
      ) : null}

      {loading ? <p className="text-sm text-slate-500">Loading lubricant control...</p> : null}
    </div>
  );
}
