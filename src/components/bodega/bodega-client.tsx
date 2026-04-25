"use client";

import { useEffect, useMemo, useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { canUseLiveData } from "@/lib/data/client";
import { fetchBodegaData } from "@/lib/data/bodega";
import { createSupabaseBrowserClient, getSupabaseConfigurationState } from "@/lib/supabase/client";
import { formatCurrency } from "@/lib/utils";

function asNumber(value: unknown) {
  const parsed = Number(value ?? Number.NaN);
  return Number.isFinite(parsed) ? parsed : 0;
}

function todayIso() {
  return new Date().toISOString().slice(0, 10);
}

type ReceiveItem = { lubricant_product_id: string; product_name: string; sku: string; quantity: string; unit_cost: string };
type TransferItem = { lubricant_product_id: string; quantity: string };

export function BodegaClient() {
  const liveData = canUseLiveData();
  const config = getSupabaseConfigurationState();
  const [loading, setLoading] = useState(liveData);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [result, setResult] = useState<Awaited<ReturnType<typeof fetchBodegaData>> | null>(null);

  const [supplierName, setSupplierName] = useState("");
  const [orderNumber, setOrderNumber] = useState("");
  const [receivedDate, setReceivedDate] = useState(todayIso());
  const [receiveNotes, setReceiveNotes] = useState("");
  const [receiveItems, setReceiveItems] = useState<ReceiveItem[]>([{ lubricant_product_id: "", product_name: "", sku: "", quantity: "", unit_cost: "" }]);

  const [stationId, setStationId] = useState("");
  const [transferReference, setTransferReference] = useState("");
  const [transferNotes, setTransferNotes] = useState("");
  const [transferItems, setTransferItems] = useState<TransferItem[]>([{ lubricant_product_id: "", quantity: "" }]);
  const [isSubmittingReceive, setIsSubmittingReceive] = useState(false);
  const [isSubmittingTransfer, setIsSubmittingTransfer] = useState(false);

  const reload = async () => {
    if (!liveData) return;
    const data = await fetchBodegaData();
    setResult(data);
    if (!stationId && data.stations[0]) setStationId(data.stations[0].id);
  };

  useEffect(() => {
    if (!liveData) {
      setLoading(false);
      return;
    }

    setLoading(true);
    setError(null);

    reload()
      .catch((err: Error) => setError(err.message))
      .finally(() => setLoading(false));
  }, [liveData]);

  const lowStockSet = useMemo(() => {
    const rows = result?.inventory ?? [];
    return new Set(rows.filter((row) => asNumber(row.quantity_on_hand) <= asNumber(row.reorder_level)).map((row) => row.id));
  }, [result?.inventory]);

  async function submitReceiveOrder(event: React.FormEvent) {
    event.preventDefault();
    if (!liveData) return;

    setIsSubmittingReceive(true);
    setError(null);
    setMessage(null);
    try {
      const supabase = createSupabaseBrowserClient();
      const payload = {
        supplier_name: supplierName || null,
        order_number: orderNumber || null,
        order_date: receivedDate,
        received_date: receivedDate,
        notes: receiveNotes || null,
        items: receiveItems.map((item) => ({
          lubricant_product_id: item.lubricant_product_id || null,
          product_name: item.product_name || null,
          sku: item.sku || null,
          quantity: Number(item.quantity || 0),
          unit_cost: Number(item.unit_cost || 0)
        }))
      };

      const { data, error: rpcError } = await supabase.rpc("fuel_receive_lubricant_purchase", { payload });
      if (rpcError) throw rpcError;
      setMessage(`Purchase received. Order id: ${data}`);
      setReceiveItems([{ lubricant_product_id: "", product_name: "", sku: "", quantity: "", unit_cost: "" }]);
      await reload();
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : "Unable to receive purchase order");
    } finally {
      setIsSubmittingReceive(false);
    }
  }

  async function submitTransfer(event: React.FormEvent) {
    event.preventDefault();
    if (!liveData) return;

    setIsSubmittingTransfer(true);
    setError(null);
    setMessage(null);

    try {
      const supabase = createSupabaseBrowserClient();
      const payload = {
        station_id: stationId,
        reference: transferReference || null,
        notes: transferNotes || null,
        items: transferItems.map((item) => ({
          lubricant_product_id: item.lubricant_product_id,
          quantity: Number(item.quantity || 0)
        }))
      };

      const { data, error: rpcError } = await supabase.rpc("fuel_transfer_lubricants_to_station", { payload });
      if (rpcError) throw rpcError;
      setMessage(`Transfer completed. Movement count: ${Array.isArray(data?.movement_ids) ? data.movement_ids.length : 0}`);
      setTransferItems([{ lubricant_product_id: "", quantity: "" }]);
      await reload();
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : "Unable to transfer lubricants");
    } finally {
      setIsSubmittingTransfer(false);
    }
  }

  return (
    <div className="space-y-6">
      {!liveData ? <div className="rounded border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">{config.reason}</div> : null}
      {error ? <div className="rounded border border-red-200 bg-red-50 p-3 text-sm text-red-700">{error}</div> : null}
      {message ? <div className="rounded border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-700">{message}</div> : null}

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
        <Card><CardHeader><CardDescription>Total SKUs</CardDescription><CardTitle>{result?.summary.totalSkus ?? 0}</CardTitle></CardHeader></Card>
        <Card><CardHeader><CardDescription>Total units on hand</CardDescription><CardTitle>{asNumber(result?.summary.totalUnitsOnHand).toFixed(2)}</CardTitle></CardHeader></Card>
        <Card><CardHeader><CardDescription>Low-stock SKUs</CardDescription><CardTitle>{result?.summary.lowStockSkus ?? 0}</CardTitle></CardHeader></Card>
        <Card><CardHeader><CardDescription>Purchases this month</CardDescription><CardTitle>{result?.summary.purchasesThisMonth ?? 0}</CardTitle></CardHeader></Card>
        <Card><CardHeader><CardDescription>Transfers this month</CardDescription><CardTitle>{result?.summary.transfersThisMonth ?? 0}</CardTitle></CardHeader></Card>
      </div>

      <Card>
        <CardHeader><CardTitle>Bodega inventory</CardTitle></CardHeader>
        <CardContent>
          {(result?.inventory.length ?? 0) === 0 ? <p className="text-sm text-slate-500">No inventory rows found.</p> : null}
          {(result?.inventory.length ?? 0) > 0 ? (
            <div className="overflow-x-auto"><table className="w-full text-sm"><thead className="text-left text-slate-500"><tr><th className="py-2">SKU</th><th>Product</th><th>Unit</th><th className="text-right">Qty on hand</th><th className="text-right">Reorder level</th><th className="text-right">Default unit price</th><th>Status</th></tr></thead><tbody>{result?.inventory.map((row) => <tr className="border-t" key={row.id}><td className="py-2">{row.sku ?? "-"}</td><td>{row.product_name ?? "-"}</td><td>{row.unit ?? "-"}</td><td className="text-right">{asNumber(row.quantity_on_hand).toFixed(2)}</td><td className="text-right">{asNumber(row.reorder_level).toFixed(2)}</td><td className="text-right">{formatCurrency(asNumber(row.default_unit_price))}</td><td>{lowStockSet.has(row.id) ? "Low stock" : "OK"}</td></tr>)}</tbody></table></div>
          ) : null}
        </CardContent>
      </Card>

      <div className="grid gap-4 xl:grid-cols-2">
        <Card>
          <CardHeader><CardTitle>Receive supplier order</CardTitle></CardHeader>
          <CardContent>
            <form className="space-y-3" onSubmit={submitReceiveOrder}>
              <Input placeholder="Supplier name" value={supplierName} onChange={(e) => setSupplierName(e.target.value)} />
              <Input placeholder="Order number" value={orderNumber} onChange={(e) => setOrderNumber(e.target.value)} />
              <Input type="date" value={receivedDate} onChange={(e) => setReceivedDate(e.target.value)} />
              <Textarea placeholder="Notes" value={receiveNotes} onChange={(e) => setReceiveNotes(e.target.value)} />
              {receiveItems.map((row, index) => (
                <div className="grid gap-2 sm:grid-cols-4" key={`receive-${index}`}>
                  <Input placeholder="Product name" value={row.product_name} onChange={(e) => setReceiveItems((prev) => prev.map((item, i) => i === index ? { ...item, product_name: e.target.value } : item))} />
                  <Input placeholder="SKU" value={row.sku} onChange={(e) => setReceiveItems((prev) => prev.map((item, i) => i === index ? { ...item, sku: e.target.value } : item))} />
                  <Input type="number" min="0" step="0.01" placeholder="Quantity" value={row.quantity} onChange={(e) => setReceiveItems((prev) => prev.map((item, i) => i === index ? { ...item, quantity: e.target.value } : item))} />
                  <Input type="number" min="0" step="0.01" placeholder="Unit cost" value={row.unit_cost} onChange={(e) => setReceiveItems((prev) => prev.map((item, i) => i === index ? { ...item, unit_cost: e.target.value } : item))} />
                </div>
              ))}
              <div className="flex gap-2">
                <Button type="button" variant="outline" onClick={() => setReceiveItems((prev) => [...prev, { lubricant_product_id: "", product_name: "", sku: "", quantity: "", unit_cost: "" }])}>Add item row</Button>
                <Button type="submit" disabled={isSubmittingReceive}>{isSubmittingReceive ? "Receiving..." : "Receive order"}</Button>
              </div>
            </form>
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle>Transfer to station</CardTitle></CardHeader>
          <CardContent>
            <form className="space-y-3" onSubmit={submitTransfer}>
              <select className="w-full rounded-md border px-3 py-2 text-sm" value={stationId} onChange={(e) => setStationId(e.target.value)}>
                <option value="">Select station</option>
                {(result?.stations ?? []).map((station) => <option key={station.id} value={station.id}>{station.name}</option>)}
              </select>
              <Input placeholder="Reference" value={transferReference} onChange={(e) => setTransferReference(e.target.value)} />
              <Textarea placeholder="Notes" value={transferNotes} onChange={(e) => setTransferNotes(e.target.value)} />
              {transferItems.map((row, index) => (
                <div className="grid gap-2 sm:grid-cols-2" key={`transfer-${index}`}>
                  <select className="w-full rounded-md border px-3 py-2 text-sm" value={row.lubricant_product_id} onChange={(e) => setTransferItems((prev) => prev.map((item, i) => i === index ? { ...item, lubricant_product_id: e.target.value } : item))}>
                    <option value="">Select product</option>
                    {(result?.products ?? []).map((product) => <option key={product.id} value={product.id}>{product.sku ? `${product.sku} — ${product.name}` : product.name}</option>)}
                  </select>
                  <Input type="number" min="0" step="0.01" placeholder="Quantity" value={row.quantity} onChange={(e) => setTransferItems((prev) => prev.map((item, i) => i === index ? { ...item, quantity: e.target.value } : item))} />
                </div>
              ))}
              <div className="flex gap-2">
                <Button type="button" variant="outline" onClick={() => setTransferItems((prev) => [...prev, { lubricant_product_id: "", quantity: "" }])}>Add item row</Button>
                <Button type="submit" disabled={isSubmittingTransfer}>{isSubmittingTransfer ? "Transferring..." : "Transfer"}</Button>
              </div>
            </form>
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-4 xl:grid-cols-2">
        <Card>
          <CardHeader><CardTitle>Purchase history</CardTitle></CardHeader>
          <CardContent>
            {(result?.purchaseHistory.length ?? 0) === 0 ? <p className="text-sm text-slate-500">No purchases found.</p> : null}
            {(result?.purchaseHistory.length ?? 0) > 0 ? (
              <div className="overflow-x-auto"><table className="w-full text-sm"><thead className="text-left text-slate-500"><tr><th className="py-2">Date</th><th>Supplier</th><th>Order number</th><th>Status</th><th className="text-right">Total amount</th></tr></thead><tbody>{result?.purchaseHistory.map((row) => <tr className="border-t" key={row.id}><td className="py-2">{row.received_date ?? row.order_date}</td><td>{row.supplier_name ?? "-"}</td><td>{row.order_number ?? "-"}</td><td>{row.status}</td><td className="text-right">{formatCurrency(asNumber(row.total_amount))}</td></tr>)}</tbody></table></div>
            ) : null}
          </CardContent>
        </Card>
        <Card>
          <CardHeader><CardTitle>Recent transfers</CardTitle></CardHeader>
          <CardContent>
            {(result?.recentTransfers.length ?? 0) === 0 ? <p className="text-sm text-slate-500">No transfer movements found.</p> : null}
            {(result?.recentTransfers.length ?? 0) > 0 ? (
              <div className="overflow-x-auto"><table className="w-full text-sm"><thead className="text-left text-slate-500"><tr><th className="py-2">Date</th><th>Product</th><th className="text-right">Quantity</th><th>To station</th><th>Reference</th><th>Notes</th></tr></thead><tbody>{result?.recentTransfers.map((row) => <tr className="border-t" key={row.id}><td className="py-2">{row.created_at?.slice(0, 10) ?? "-"}</td><td>{row.product_name ?? "-"}</td><td className="text-right">{asNumber(row.quantity).toFixed(2)}</td><td>{row.station_name ?? "-"}</td><td>{row.reference ?? "-"}</td><td>{row.notes ?? "-"}</td></tr>)}</tbody></table></div>
            ) : null}
          </CardContent>
        </Card>
      </div>

      {loading ? <p className="text-sm text-slate-500">Loading bodega inventory...</p> : null}
    </div>
  );
}
