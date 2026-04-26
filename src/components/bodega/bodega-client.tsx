"use client";

import { useEffect, useMemo, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { canUseLiveData } from "@/lib/data/client";
import { createBodega, fetchBodegaData } from "@/lib/data/bodega";
import { createSupabaseBrowserClient, getSupabaseConfigurationState } from "@/lib/supabase/client";
import { fetchCurrentProfile } from "@/lib/data/profile";

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
  const [result, setResult] = useState<Awaited<ReturnType<typeof fetchBodegaData>> | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [isOwner, setIsOwner] = useState(false);
  const [roleChecking, setRoleChecking] = useState(liveData);

  const [bodegaCode, setBodegaCode] = useState("");
  const [bodegaName, setBodegaName] = useState("");
  const [bodegaAddress, setBodegaAddress] = useState("");
  const [bodegaNotes, setBodegaNotes] = useState("");

  const [selectedBodegaId, setSelectedBodegaId] = useState("");
  const [supplierName, setSupplierName] = useState("");
  const [orderNumber, setOrderNumber] = useState("");
  const [receivedDate, setReceivedDate] = useState(todayIso());
  const [receiveNotes, setReceiveNotes] = useState("");
  const [receiveItems, setReceiveItems] = useState<ReceiveItem[]>([{ lubricant_product_id: "", product_name: "", sku: "", quantity: "", unit_cost: "" }]);

  const [toStationLocationId, setToStationLocationId] = useState("");
  const [transferReference, setTransferReference] = useState("");
  const [transferNotes, setTransferNotes] = useState("");
  const [transferItems, setTransferItems] = useState<TransferItem[]>([{ lubricant_product_id: "", quantity: "" }]);

  const reload = async () => {
    if (!liveData) return;
    const [data, profile] = await Promise.all([fetchBodegaData(), fetchCurrentProfile()]);
    setIsOwner(profile?.role === "Owner");
    setRoleChecking(false);
    setResult(data);
    if (!selectedBodegaId && data.locations[0]) setSelectedBodegaId(data.locations[0].id);
    if (!toStationLocationId && data.stations[0]) setToStationLocationId(data.stations[0].id);
  };

  useEffect(() => {
    reload().catch((err) => setError(err instanceof Error ? err.message : "Unable to load bodega data"));
  }, [liveData]);

  const filteredInventory = useMemo(
    () => (result?.inventory ?? []).filter((row) => !selectedBodegaId || row.location_id === selectedBodegaId),
    [result?.inventory, selectedBodegaId]
  );

  async function submitCreateBodega(e: React.FormEvent) {
    e.preventDefault();
    try {
      await createBodega({ code: bodegaCode, name: bodegaName, address: bodegaAddress, notes: bodegaNotes });
      setMessage("Bodega created");
      setBodegaCode(""); setBodegaName(""); setBodegaAddress(""); setBodegaNotes("");
      await reload();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to create bodega");
    }
  }

  async function submitReceiveOrder(event: React.FormEvent) {
    event.preventDefault();
    try {
      const supabase = createSupabaseBrowserClient();
      const { data, error: rpcError } = await supabase.rpc("fuel_receive_lubricant_purchase", {
        payload: {
          bodega_location_id: selectedBodegaId,
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
        }
      });
      if (rpcError) throw rpcError;
      setMessage(`Purchase received. Order id: ${data}`);
      await reload();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to receive order");
    }
  }

  async function submitTransfer(event: React.FormEvent) {
    event.preventDefault();
    try {
      const supabase = createSupabaseBrowserClient();
      const { data, error: rpcError } = await supabase.rpc("fuel_transfer_lubricants_between_locations", {
        payload: {
          from_location_id: selectedBodegaId,
          to_location_id: toStationLocationId,
          reference: transferReference || null,
          notes: transferNotes || null,
          items: transferItems.map((item) => ({ lubricant_product_id: item.lubricant_product_id, quantity: Number(item.quantity || 0) }))
        }
      });
      if (rpcError) throw rpcError;
      setMessage(`Transfer completed. Movements: ${Array.isArray(data?.movement_ids) ? data.movement_ids.length : 0}`);
      await reload();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to transfer");
    }
  }

  return <div className="space-y-4">
    {!liveData ? <div className="rounded border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">{config.reason}</div> : null}
    {error ? <div className="rounded border border-red-200 bg-red-50 p-3 text-sm text-red-700">{error}</div> : null}
    {message ? <div className="rounded border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-700">{message}</div> : null}

    <Card><CardHeader><CardTitle>Add bodega</CardTitle></CardHeader><CardContent>{roleChecking ? <p className="mb-2 text-sm text-slate-500">Checking role...</p> : null}{!isOwner && !roleChecking ? <p className="mb-2 text-sm text-amber-700">Only Owner profiles can create bodegas.</p> : null}
      <form className="space-y-2" onSubmit={submitCreateBodega}>
        <Input placeholder="Code" value={bodegaCode} onChange={(e) => setBodegaCode(e.target.value)} required />
        <Input placeholder="Name" value={bodegaName} onChange={(e) => setBodegaName(e.target.value)} required />
        <Input placeholder="Address" value={bodegaAddress} onChange={(e) => setBodegaAddress(e.target.value)} />
        <Textarea placeholder="Notes" value={bodegaNotes} onChange={(e) => setBodegaNotes(e.target.value)} />
        <Button type="submit" disabled={!isOwner}>{isOwner ? "Create bodega" : "Create bodega"}</Button>
      </form>
    </CardContent></Card>

    <Card><CardHeader><CardTitle>Bodega inventory</CardTitle></CardHeader><CardContent>
      <select className="mb-3 w-full rounded-md border px-3 py-2 text-sm" value={selectedBodegaId} onChange={(e) => setSelectedBodegaId(e.target.value)}>
        <option value="">All bodegas</option>
        {(result?.locations ?? []).map((b) => <option key={b.id} value={b.id}>{b.code} — {b.name}</option>)}
      </select>
      <div className="overflow-x-auto"><table className="w-full text-sm"><thead><tr><th>Bodega</th><th>SKU</th><th>Product</th><th className="text-right">Qty</th><th className="text-right">Reorder</th><th>Status</th></tr></thead><tbody>
        {filteredInventory.map((row) => <tr key={row.id} className="border-t"><td>{row.bodega_name ?? "-"}</td><td>{row.sku ?? "-"}</td><td>{row.product_name ?? "-"}</td><td className="text-right">{asNumber(row.quantity_on_hand).toFixed(2)}</td><td className="text-right">{asNumber(row.reorder_level).toFixed(2)}</td><td>{asNumber(row.quantity_on_hand) <= asNumber(row.reorder_level) ? "Low stock" : "OK"}</td></tr>)}
      </tbody></table></div>
    </CardContent></Card>

    <Card><CardHeader><CardTitle>Receive supplier order</CardTitle></CardHeader><CardContent>
      <form className="space-y-2" onSubmit={submitReceiveOrder}>
        <Input placeholder="Supplier" value={supplierName} onChange={(e) => setSupplierName(e.target.value)} />
        <Input placeholder="Order #" value={orderNumber} onChange={(e) => setOrderNumber(e.target.value)} />
        <Input type="date" value={receivedDate} onChange={(e) => setReceivedDate(e.target.value)} />
        <Textarea placeholder="Notes" value={receiveNotes} onChange={(e) => setReceiveNotes(e.target.value)} />
        {receiveItems.map((item, index) => <div className="grid grid-cols-4 gap-2" key={index}>
          <Input placeholder="Product" value={item.product_name} onChange={(e) => setReceiveItems((prev) => prev.map((x, i) => i===index ? { ...x, product_name: e.target.value } : x))} />
          <Input placeholder="SKU" value={item.sku} onChange={(e) => setReceiveItems((prev) => prev.map((x, i) => i===index ? { ...x, sku: e.target.value } : x))} />
          <Input placeholder="Qty" type="number" value={item.quantity} onChange={(e) => setReceiveItems((prev) => prev.map((x, i) => i===index ? { ...x, quantity: e.target.value } : x))} />
          <Input placeholder="Unit cost" type="number" value={item.unit_cost} onChange={(e) => setReceiveItems((prev) => prev.map((x, i) => i===index ? { ...x, unit_cost: e.target.value } : x))} />
        </div>)}
        <Button type="button" variant="outline" onClick={() => setReceiveItems((prev) => [...prev, { lubricant_product_id: "", product_name: "", sku: "", quantity: "", unit_cost: "" }])}>Add item</Button>
        <Button type="submit">Receive order</Button>
      </form>
    </CardContent></Card>

    <Card><CardHeader><CardTitle>Transfer to station</CardTitle></CardHeader><CardContent>
      <form className="space-y-2" onSubmit={submitTransfer}>
        <select className="w-full rounded-md border px-3 py-2 text-sm" value={toStationLocationId} onChange={(e) => setToStationLocationId(e.target.value)}>
          <option value="">To station</option>
          {(result?.stations ?? []).map((station) => <option key={station.id} value={station.id}>{station.code} — {station.name}</option>)}
        </select>
        <Input placeholder="Reference" value={transferReference} onChange={(e) => setTransferReference(e.target.value)} />
        <Textarea placeholder="Notes" value={transferNotes} onChange={(e) => setTransferNotes(e.target.value)} />
        {transferItems.map((item, index) => <div className="grid grid-cols-2 gap-2" key={index}>
          <select className="w-full rounded-md border px-3 py-2 text-sm" value={item.lubricant_product_id} onChange={(e) => setTransferItems((prev) => prev.map((x, i) => i===index ? { ...x, lubricant_product_id: e.target.value } : x))}>
            <option value="">Product</option>
            {(result?.products ?? []).map((p) => <option key={p.id} value={p.id}>{p.sku ? `${p.sku} — ${p.name}` : p.name}</option>)}
          </select>
          <Input placeholder="Qty" type="number" value={item.quantity} onChange={(e) => setTransferItems((prev) => prev.map((x, i) => i===index ? { ...x, quantity: e.target.value } : x))} />
        </div>)}
        <Button type="button" variant="outline" onClick={() => setTransferItems((prev) => [...prev, { lubricant_product_id: "", quantity: "" }])}>Add item</Button>
        <Button type="submit">Transfer</Button>
      </form>
    </CardContent></Card>
  </div>;
}
