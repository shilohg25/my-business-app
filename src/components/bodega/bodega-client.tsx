"use client";

import { useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { SimpleModal } from "@/components/ui/simple-modal";
import { Textarea } from "@/components/ui/textarea";
import { createBodega, fetchBodegaData } from "@/lib/data/bodega";
import { canUseLiveData } from "@/lib/data/client";
import { fetchCurrentProfile } from "@/lib/data/profile";
import { createSupabaseBrowserClient, getSupabaseConfigurationState } from "@/lib/supabase/client";
import { getErrorMessage, isBlank } from "@/lib/utils/forms";

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
  const [role, setRole] = useState<string | null>(null);
  const [isOwner, setIsOwner] = useState(false);
  const [roleChecking, setRoleChecking] = useState(liveData);

  const [bodegaName, setBodegaName] = useState("");
  const [bodegaAddress, setBodegaAddress] = useState("");
  const [bodegaNotes, setBodegaNotes] = useState("");
  const [createModalOpen, setCreateModalOpen] = useState(false);
  const [createSaving, setCreateSaving] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);

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
    setRole(profile?.role ?? null);
    setIsOwner(profile?.role === "Owner");
    setRoleChecking(false);
    setResult(data);
    if (!selectedBodegaId && data.locations[0]) setSelectedBodegaId(data.locations[0].id);
    if (!toStationLocationId && data.stations[0]) setToStationLocationId(data.stations[0].id);
  };

  useEffect(() => {
    reload().catch((err) => setError(getErrorMessage(err)));
  }, [liveData]);

  const filteredInventory = useMemo(
    () => (result?.inventory ?? []).filter((row) => !selectedBodegaId || row.location_id === selectedBodegaId),
    [result?.inventory, selectedBodegaId]
  );

  const bodegaSummaries = useMemo(() => {
    const rows = result?.inventory ?? [];
    return (result?.locations ?? []).map((location) => {
      const locationRows = rows.filter((row) => row.location_id === location.id);
      const totalSkus = new Set(locationRows.map((row) => row.lubricant_product_id)).size;
      const totalUnits = locationRows.reduce((sum, row) => sum + asNumber(row.quantity_on_hand), 0);
      const lowStock = locationRows.filter((row) => asNumber(row.quantity_on_hand) <= asNumber(row.reorder_level)).length;
      return { location, totalSkus, totalUnits, lowStock };
    });
  }, [result?.inventory, result?.locations]);

  function closeCreateModal() {
    if (createSaving) return;
    setCreateModalOpen(false);
  }

  async function submitCreateBodega(event: React.FormEvent) {
    event.preventDefault();

    if (!isOwner) return;
    if (isBlank(bodegaName)) {
      setCreateError("Bodega name is required.");
      return;
    }

    setCreateSaving(true);
    setCreateError(null);
    setMessage(null);
    setError(null);

    try {
      await createBodega({ name: bodegaName.trim(), address: bodegaAddress, notes: bodegaNotes });
      setMessage("Bodega created");
      setBodegaName("");
      setBodegaAddress("");
      setBodegaNotes("");
      setCreateModalOpen(false);
      await reload();
    } catch (err) {
      setCreateError(getErrorMessage(err));
    } finally {
      setCreateSaving(false);
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
      setError(getErrorMessage(err));
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
      setError(getErrorMessage(err));
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Bodega Inventory</h1>
          <p className="text-sm text-slate-500">Main lubricant warehouse for supplier orders and station refills.</p>
        </div>
        {isOwner ? (
          <Button onClick={() => setCreateModalOpen(true)} type="button">
            New Bodega
          </Button>
        ) : null}
      </div>

      {!liveData ? <div className="rounded border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">{config.reason}</div> : null}
      {error ? <div className="rounded border border-red-200 bg-red-50 p-3 text-sm text-red-700">{error}</div> : null}
      {message ? <div className="rounded border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-700">{message}</div> : null}
      {roleChecking ? <p className="text-sm text-slate-500">Checking role...</p> : null}
      {!isOwner && !roleChecking && role ? <p className="text-sm text-amber-700">Only Owner profiles can create bodegas.</p> : null}

      <SimpleModal
        description="Bodega code is generated automatically from the bodega name."
        onClose={closeCreateModal}
        open={createModalOpen}
        title="New Bodega"
      >
        <form className="space-y-3" onSubmit={submitCreateBodega}>
          <Input aria-label="Bodega name" placeholder="Bodega name" value={bodegaName} onChange={(event) => setBodegaName(event.target.value)} />
          <Input aria-label="Address" placeholder="Address" value={bodegaAddress} onChange={(event) => setBodegaAddress(event.target.value)} />
          <Textarea aria-label="Notes" placeholder="Notes" value={bodegaNotes} onChange={(event) => setBodegaNotes(event.target.value)} />
          {createError ? <p className="text-sm text-red-700">{createError}</p> : null}
          <div className="flex justify-end gap-2">
            <Button disabled={createSaving} onClick={closeCreateModal} type="button" variant="outline">
              Cancel
            </Button>
            <Button disabled={createSaving} type="submit">
              {createSaving ? "Creating..." : "Create bodega"}
            </Button>
          </div>
        </form>
      </SimpleModal>

      <Card>
        <CardHeader>
          <CardTitle>Bodega list</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr>
                  <th className="py-2">Bodega</th>
                  <th>Address</th>
                  <th>Active</th>
                  <th className="text-right">Total SKUs</th>
                  <th className="text-right">Total units</th>
                  <th className="text-right">Low stock count</th>
                </tr>
              </thead>
              <tbody>
                {bodegaSummaries.map((row) => (
                  <tr className="border-t" key={row.location.id}>
                    <td className="py-2">
                      <div className="font-medium">{row.location.name}</div>
                      <div className="text-xs text-slate-500">Code: {row.location.code}</div>
                    </td>
                    <td>{row.location.address ?? "-"}</td>
                    <td>{row.location.is_active ? "Active" : "Inactive"}</td>
                    <td className="text-right">{row.totalSkus}</td>
                    <td className="text-right">{row.totalUnits.toFixed(2)}</td>
                    <td className="text-right">{row.lowStock}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Bodega inventory</CardTitle>
        </CardHeader>
        <CardContent>
          <select className="mb-3 w-full rounded-md border px-3 py-2 text-sm" value={selectedBodegaId} onChange={(e) => setSelectedBodegaId(e.target.value)}>
            <option value="">All bodegas</option>
            {(result?.locations ?? []).map((b) => (
              <option key={b.id} value={b.id}>
                {b.name}
              </option>
            ))}
          </select>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr>
                  <th>Bodega</th>
                  <th>SKU</th>
                  <th>Product</th>
                  <th className="text-right">Qty</th>
                  <th className="text-right">Reorder</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {filteredInventory.map((row) => (
                  <tr className="border-t" key={row.id}>
                    <td>{row.bodega_name ?? "-"}</td>
                    <td>{row.sku ?? "-"}</td>
                    <td>{row.product_name ?? "-"}</td>
                    <td className="text-right">{asNumber(row.quantity_on_hand).toFixed(2)}</td>
                    <td className="text-right">{asNumber(row.reorder_level).toFixed(2)}</td>
                    <td>{asNumber(row.quantity_on_hand) <= asNumber(row.reorder_level) ? "Low stock" : "OK"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Receive supplier order</CardTitle>
        </CardHeader>
        <CardContent>
          <form className="space-y-2" onSubmit={submitReceiveOrder}>
            <Input placeholder="Supplier" value={supplierName} onChange={(e) => setSupplierName(e.target.value)} />
            <Input placeholder="Order #" value={orderNumber} onChange={(e) => setOrderNumber(e.target.value)} />
            <Input type="date" value={receivedDate} onChange={(e) => setReceivedDate(e.target.value)} />
            <Textarea placeholder="Notes" value={receiveNotes} onChange={(e) => setReceiveNotes(e.target.value)} />
            {receiveItems.map((item, index) => (
              <div className="grid grid-cols-4 gap-2" key={index}>
                <Input
                  placeholder="Product"
                  value={item.product_name}
                  onChange={(e) => setReceiveItems((prev) => prev.map((x, i) => (i === index ? { ...x, product_name: e.target.value } : x)))}
                />
                <Input placeholder="SKU" value={item.sku} onChange={(e) => setReceiveItems((prev) => prev.map((x, i) => (i === index ? { ...x, sku: e.target.value } : x)))} />
                <Input
                  placeholder="Qty"
                  type="number"
                  value={item.quantity}
                  onChange={(e) => setReceiveItems((prev) => prev.map((x, i) => (i === index ? { ...x, quantity: e.target.value } : x)))}
                />
                <Input
                  placeholder="Unit cost"
                  type="number"
                  value={item.unit_cost}
                  onChange={(e) => setReceiveItems((prev) => prev.map((x, i) => (i === index ? { ...x, unit_cost: e.target.value } : x)))}
                />
              </div>
            ))}
            <Button type="button" variant="outline" onClick={() => setReceiveItems((prev) => [...prev, { lubricant_product_id: "", product_name: "", sku: "", quantity: "", unit_cost: "" }])}>
              Add item
            </Button>
            <Button type="submit">Receive order</Button>
          </form>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Transfer to station</CardTitle>
        </CardHeader>
        <CardContent>
          <form className="space-y-2" onSubmit={submitTransfer}>
            <select className="w-full rounded-md border px-3 py-2 text-sm" value={toStationLocationId} onChange={(e) => setToStationLocationId(e.target.value)}>
              <option value="">To station</option>
              {(result?.stations ?? []).map((station) => (
                <option key={station.id} value={station.id}>
                  {station.name}
                </option>
              ))}
            </select>
            <Input placeholder="Reference" value={transferReference} onChange={(e) => setTransferReference(e.target.value)} />
            <Textarea placeholder="Notes" value={transferNotes} onChange={(e) => setTransferNotes(e.target.value)} />
            {transferItems.map((item, index) => (
              <div className="grid grid-cols-2 gap-2" key={index}>
                <select
                  className="w-full rounded-md border px-3 py-2 text-sm"
                  value={item.lubricant_product_id}
                  onChange={(e) => setTransferItems((prev) => prev.map((x, i) => (i === index ? { ...x, lubricant_product_id: e.target.value } : x)))}
                >
                  <option value="">Product</option>
                  {(result?.products ?? []).map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.sku ? `${p.sku} — ${p.name}` : p.name}
                    </option>
                  ))}
                </select>
                <Input
                  placeholder="Qty"
                  type="number"
                  value={item.quantity}
                  onChange={(e) => setTransferItems((prev) => prev.map((x, i) => (i === index ? { ...x, quantity: e.target.value } : x)))}
                />
              </div>
            ))}
            <Button type="button" variant="outline" onClick={() => setTransferItems((prev) => [...prev, { lubricant_product_id: "", quantity: "" }])}>
              Add item
            </Button>
            <Button type="submit">Transfer</Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
