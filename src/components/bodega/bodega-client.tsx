"use client";

import { useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { ResetFiltersButton } from "@/components/ui/reset-filters-button";
import { SimpleModal } from "@/components/ui/simple-modal";
import { Textarea } from "@/components/ui/textarea";
import { createBodega, fetchBodegaData } from "@/lib/data/bodega";
import { canUseLiveData } from "@/lib/data/client";
import { fetchCurrentProfile } from "@/lib/data/profile";
import { createSupabaseBrowserClient, getSupabaseConfigurationState } from "@/lib/supabase/client";
import { areFiltersDefault } from "@/lib/utils/filters";
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

const EMPTY_RECEIVE_ITEM: ReceiveItem = { lubricant_product_id: "", product_name: "", sku: "", quantity: "", unit_cost: "" };
const EMPTY_TRANSFER_ITEM: TransferItem = { lubricant_product_id: "", quantity: "" };

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
  const [inventorySearch, setInventorySearch] = useState("");
  const [inventoryStatus, setInventoryStatus] = useState("all");

  const [receiveModalOpen, setReceiveModalOpen] = useState(false);
  const [receiveSaving, setReceiveSaving] = useState(false);
  const [receiveError, setReceiveError] = useState<string | null>(null);
  const [receiveBodegaId, setReceiveBodegaId] = useState("");
  const [supplierName, setSupplierName] = useState("");
  const [orderNumber, setOrderNumber] = useState("");
  const [receivedDate, setReceivedDate] = useState(todayIso());
  const [receiveNotes, setReceiveNotes] = useState("");
  const [receiveItems, setReceiveItems] = useState<ReceiveItem[]>([{ ...EMPTY_RECEIVE_ITEM }]);

  const [transferModalOpen, setTransferModalOpen] = useState(false);
  const [transferSaving, setTransferSaving] = useState(false);
  const [transferError, setTransferError] = useState<string | null>(null);
  const [transferFromBodegaId, setTransferFromBodegaId] = useState("");
  const [toStationLocationId, setToStationLocationId] = useState("");
  const [transferReference, setTransferReference] = useState("");
  const [transferNotes, setTransferNotes] = useState("");
  const [transferItems, setTransferItems] = useState<TransferItem[]>([{ ...EMPTY_TRANSFER_ITEM }]);

  const bodegas = result?.locations ?? [];
  const activeBodegas = useMemo(() => bodegas.filter((b) => b.is_active), [bodegas]);
  const stationLocations = result?.stationLocations ?? result?.stations ?? [];

  const reload = async () => {
    if (!liveData) return;
    const [data, profile] = await Promise.all([fetchBodegaData(), fetchCurrentProfile()]);
    setRole(profile?.role ?? null);
    setIsOwner(profile?.role === "Owner");
    setRoleChecking(false);
    setResult(data);
  };

  useEffect(() => {
    reload().catch((err) => setError(getErrorMessage(err)));
  }, [liveData]);

  const defaultFilters = { selectedBodegaId: "", inventorySearch: "", inventoryStatus: "all" };
  const filteredInventory = useMemo(() => {
    const normalizedSearch = inventorySearch.trim().toLowerCase();
    return (result?.inventory ?? []).filter((row) => {
      if (selectedBodegaId && row.location_id !== selectedBodegaId) return false;
      const isLowStock = asNumber(row.quantity_on_hand) <= asNumber(row.reorder_level);
      if (inventoryStatus === "low" && !isLowStock) return false;
      if (inventoryStatus === "ok" && isLowStock) return false;
      if (!normalizedSearch) return true;
      const haystack = `${row.product_name ?? ""} ${row.sku ?? ""}`.toLowerCase();
      return haystack.includes(normalizedSearch);
    });
  }, [inventorySearch, inventoryStatus, result?.inventory, selectedBodegaId]);
  const hasActiveFilters = !areFiltersDefault({ selectedBodegaId, inventorySearch, inventoryStatus }, defaultFilters);

  function resetFilters() {
    setSelectedBodegaId("");
    setInventorySearch("");
    setInventoryStatus("all");
  }

  const bodegaSummaries = useMemo(() => {
    const rows = result?.inventory ?? [];
    return bodegas.map((location) => {
      const locationRows = rows.filter((row) => row.location_id === location.id);
      const totalSkus = new Set(locationRows.map((row) => row.lubricant_product_id)).size;
      const totalUnits = locationRows.reduce((sum, row) => sum + asNumber(row.quantity_on_hand), 0);
      const lowStock = locationRows.filter((row) => asNumber(row.quantity_on_hand) <= asNumber(row.reorder_level)).length;
      return { location, totalSkus, totalUnits, lowStock };
    });
  }, [result?.inventory, bodegas]);

  const availableTransferProducts = useMemo(() => {
    const inventoryRows = (result?.inventory ?? []).filter((row) => row.location_id === transferFromBodegaId && asNumber(row.quantity_on_hand) > 0);
    return inventoryRows.map((row) => ({
      lubricant_product_id: row.lubricant_product_id,
      name: row.product_name ?? "Unnamed product",
      sku: row.sku,
      available: asNumber(row.quantity_on_hand)
    }));
  }, [result?.inventory, transferFromBodegaId]);

  const availableTransferByProductId = useMemo(
    () => new Map(availableTransferProducts.map((row) => [row.lubricant_product_id, row.available])),
    [availableTransferProducts]
  );

  function resetReceiveForm() {
    setSupplierName("");
    setOrderNumber("");
    setReceivedDate(todayIso());
    setReceiveNotes("");
    setReceiveItems([{ ...EMPTY_RECEIVE_ITEM }]);
    setReceiveError(null);
  }

  function resetTransferForm() {
    setToStationLocationId("");
    setTransferReference("");
    setTransferNotes("");
    setTransferItems([{ ...EMPTY_TRANSFER_ITEM }]);
    setTransferError(null);
  }

  function getDefaultBodegaId() {
    const validFromFilter = selectedBodegaId && bodegas.some((b) => b.id === selectedBodegaId);
    if (validFromFilter) return selectedBodegaId;
    return activeBodegas[0]?.id ?? bodegas[0]?.id ?? "";
  }

  function openReceiveModal() {
    setReceiveBodegaId(getDefaultBodegaId());
    setReceiveError(null);
    setReceiveModalOpen(true);
  }

  function openTransferModal() {
    setTransferFromBodegaId(getDefaultBodegaId());
    setTransferError(null);
    setTransferModalOpen(true);
  }

  function closeCreateModal() {
    if (createSaving) return;
    setCreateModalOpen(false);
  }

  function closeReceiveModal() {
    if (receiveSaving) return;
    setReceiveModalOpen(false);
  }

  function closeTransferModal() {
    if (transferSaving) return;
    setTransferModalOpen(false);
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
    setReceiveError(null);

    if (!receiveBodegaId) {
      setReceiveError("Select a bodega to receive stock into.");
      return;
    }

    if (!receiveItems.length) {
      setReceiveError("Add at least one item.");
      return;
    }

    for (const item of receiveItems) {
      if (!item.lubricant_product_id && isBlank(item.product_name)) {
        setReceiveError("Each item needs an existing product or product name.");
        return;
      }
      if (asNumber(item.quantity) <= 0) {
        setReceiveError("Each item quantity must be greater than zero.");
        return;
      }
    }

    setReceiveSaving(true);
    try {
      const supabase = createSupabaseBrowserClient();
      const { data, error: rpcError } = await supabase.rpc("fuel_receive_lubricant_purchase", {
        payload: {
          bodega_location_id: receiveBodegaId,
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
            unit_cost: item.unit_cost ? Number(item.unit_cost) : null
          }))
        }
      });
      if (rpcError) throw rpcError;

      setMessage(`Purchase received. Order id: ${data}`);
      setReceiveModalOpen(false);
      resetReceiveForm();
      await reload();
    } catch (err) {
      setReceiveError(`Unable to receive order: ${getErrorMessage(err)}`);
    } finally {
      setReceiveSaving(false);
    }
  }

  async function submitTransfer(event: React.FormEvent) {
    event.preventDefault();
    setTransferError(null);

    if (!transferFromBodegaId) {
      setTransferError("Select the bodega to transfer from.");
      return;
    }
    if (!toStationLocationId) {
      setTransferError("Select the station to transfer to.");
      return;
    }
    if (transferFromBodegaId === toStationLocationId) {
      setTransferError("From bodega and to station cannot be the same location.");
      return;
    }
    if (!transferItems.length) {
      setTransferError("Add at least one transfer item.");
      return;
    }

    for (const item of transferItems) {
      if (!item.lubricant_product_id) {
        setTransferError("Select a product for each transfer item.");
        return;
      }
      const availableQty = asNumber(availableTransferByProductId.get(item.lubricant_product_id));
      const requestedQty = asNumber(item.quantity);
      if (requestedQty <= 0) {
        setTransferError("Each transfer quantity must be greater than zero.");
        return;
      }
      if (requestedQty > availableQty) {
        setTransferError("Transfer quantity exceeds available bodega stock.");
        return;
      }
    }

    setTransferSaving(true);
    try {
      const supabase = createSupabaseBrowserClient();
      const { error: rpcError } = await supabase.rpc("fuel_transfer_lubricants_between_locations", {
        payload: {
          from_location_id: transferFromBodegaId,
          to_location_id: toStationLocationId,
          reference: transferReference || null,
          notes: transferNotes || null,
          items: transferItems.map((item) => ({
            lubricant_product_id: item.lubricant_product_id,
            quantity: Number(item.quantity || 0)
          }))
        }
      });
      if (rpcError) throw rpcError;

      setMessage("Transfer completed. Transferred stock appears under Station Lubricants.");
      setTransferModalOpen(false);
      resetTransferForm();
      await reload();
    } catch (err) {
      setTransferError(`Unable to transfer stock: ${getErrorMessage(err)}`);
    } finally {
      setTransferSaving(false);
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Bodega Inventory</h1>
          <p className="text-sm text-slate-500">Main lubricant warehouse for supplier orders and station refills.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          {isOwner ? (
            <Button onClick={() => setCreateModalOpen(true)} type="button">
              New Bodega
            </Button>
          ) : null}
          <Button onClick={openReceiveModal} type="button" variant="outline">
            Receive Supplier Order
          </Button>
          <Button onClick={openTransferModal} type="button" variant="outline">
            Transfer to Station
          </Button>
        </div>
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

      <SimpleModal open={receiveModalOpen} onClose={closeReceiveModal} title="Receive Supplier Order" description="Add lubricant stock into a selected bodega.">
        <form className="space-y-3" onSubmit={submitReceiveOrder}>
          <select className="w-full rounded-md border px-3 py-2 text-sm" value={receiveBodegaId} onChange={(event) => setReceiveBodegaId(event.target.value)}>
            <option value="">Select bodega</option>
            {bodegas.map((b) => (
              <option key={b.id} value={b.id}>
                {b.name}
              </option>
            ))}
          </select>
          <Input placeholder="Supplier" value={supplierName} onChange={(event) => setSupplierName(event.target.value)} />
          <Input placeholder="Order #" value={orderNumber} onChange={(event) => setOrderNumber(event.target.value)} />
          <Input type="date" value={receivedDate} onChange={(event) => setReceivedDate(event.target.value)} />
          <Textarea placeholder="Notes" value={receiveNotes} onChange={(event) => setReceiveNotes(event.target.value)} />

          {receiveItems.map((item, index) => (
            <div className="space-y-2 rounded-md border p-3" key={`receive-${index}`}>
              <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                <select
                  className="w-full rounded-md border px-3 py-2 text-sm"
                  value={item.lubricant_product_id}
                  onChange={(event) =>
                    setReceiveItems((prev) =>
                      prev.map((row, rowIndex) => (rowIndex === index ? { ...row, lubricant_product_id: event.target.value } : row))
                    )
                  }
                >
                  <option value="">Existing product (optional)</option>
                  {(result?.products ?? []).map((product) => (
                    <option key={product.id} value={product.id}>
                      {product.sku ? `${product.sku} — ${product.name}` : product.name}
                    </option>
                  ))}
                </select>
                <Input
                  placeholder="Product name"
                  value={item.product_name}
                  onChange={(event) =>
                    setReceiveItems((prev) =>
                      prev.map((row, rowIndex) => (rowIndex === index ? { ...row, product_name: event.target.value } : row))
                    )
                  }
                />
              </div>
              <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
                <Input
                  placeholder="SKU"
                  value={item.sku}
                  onChange={(event) =>
                    setReceiveItems((prev) => prev.map((row, rowIndex) => (rowIndex === index ? { ...row, sku: event.target.value } : row)))
                  }
                />
                <Input
                  placeholder="Qty"
                  type="number"
                  value={item.quantity}
                  onChange={(event) =>
                    setReceiveItems((prev) => prev.map((row, rowIndex) => (rowIndex === index ? { ...row, quantity: event.target.value } : row)))
                  }
                />
                <Input
                  placeholder="Unit cost"
                  type="number"
                  value={item.unit_cost}
                  onChange={(event) =>
                    setReceiveItems((prev) => prev.map((row, rowIndex) => (rowIndex === index ? { ...row, unit_cost: event.target.value } : row)))
                  }
                />
              </div>
            </div>
          ))}

          <div className="flex justify-between gap-2">
            <Button type="button" variant="outline" onClick={() => setReceiveItems((prev) => [...prev, { ...EMPTY_RECEIVE_ITEM }])}>
              Add item
            </Button>
            <Button disabled={receiveSaving} type="submit">
              {receiveSaving ? "Saving..." : "Receive order"}
            </Button>
          </div>
          {receiveError ? <p className="text-sm text-red-700">{receiveError}</p> : null}
        </form>
      </SimpleModal>

      <SimpleModal
        open={transferModalOpen}
        onClose={closeTransferModal}
        title="Transfer Lubricants to Station"
        description="Move stock from a selected bodega into a station lubricant inventory."
      >
        <form className="space-y-3" onSubmit={submitTransfer}>
          <select className="w-full rounded-md border px-3 py-2 text-sm" value={transferFromBodegaId} onChange={(event) => setTransferFromBodegaId(event.target.value)}>
            <option value="">From bodega</option>
            {bodegas.map((bodega) => (
              <option key={bodega.id} value={bodega.id}>
                {bodega.name}
              </option>
            ))}
          </select>
          <select className="w-full rounded-md border px-3 py-2 text-sm" value={toStationLocationId} onChange={(event) => setToStationLocationId(event.target.value)}>
            <option value="">To station</option>
            {stationLocations.map((station) => (
              <option key={station.id} value={station.id}>
                {station.name}
              </option>
            ))}
          </select>
          <Input placeholder="Reference" value={transferReference} onChange={(event) => setTransferReference(event.target.value)} />
          <Textarea placeholder="Notes" value={transferNotes} onChange={(event) => setTransferNotes(event.target.value)} />

          {availableTransferProducts.length === 0 ? <p className="text-sm text-slate-500">No available lubricant stock in this bodega.</p> : null}
          {transferItems.map((item, index) => (
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2" key={`transfer-${index}`}>
              <select
                className="w-full rounded-md border px-3 py-2 text-sm"
                value={item.lubricant_product_id}
                onChange={(event) =>
                  setTransferItems((prev) =>
                    prev.map((row, rowIndex) => (rowIndex === index ? { ...row, lubricant_product_id: event.target.value } : row))
                  )
                }
              >
                <option value="">Product</option>
                {availableTransferProducts.map((product) => (
                  <option key={product.lubricant_product_id} value={product.lubricant_product_id}>
                    {product.sku ? `${product.sku} — ` : ""}
                    {product.name} — available {product.available.toFixed(2)}
                  </option>
                ))}
              </select>
              <Input
                placeholder="Qty"
                type="number"
                value={item.quantity}
                onChange={(event) => setTransferItems((prev) => prev.map((row, rowIndex) => (rowIndex === index ? { ...row, quantity: event.target.value } : row)))}
              />
            </div>
          ))}

          <div className="flex justify-between gap-2">
            <Button type="button" variant="outline" onClick={() => setTransferItems((prev) => [...prev, { ...EMPTY_TRANSFER_ITEM }])}>
              Add item
            </Button>
            <Button disabled={transferSaving} type="submit">
              {transferSaving ? "Transferring..." : "Transfer"}
            </Button>
          </div>
          {transferError ? <p className="text-sm text-red-700">{transferError}</p> : null}
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
          <div className="mb-3 flex flex-wrap items-end gap-2">
            <select className="w-full rounded-md border px-3 py-2 text-sm sm:w-auto" value={selectedBodegaId} onChange={(event) => setSelectedBodegaId(event.target.value)}>
              <option value="">All bodegas</option>
              {bodegas.map((bodega) => (
                <option key={bodega.id} value={bodega.id}>
                  {bodega.name}
                </option>
              ))}
            </select>
            <Input className="w-full sm:w-52" placeholder="Search product or SKU" value={inventorySearch} onChange={(event) => setInventorySearch(event.target.value)} />
            <select className="w-full rounded-md border px-3 py-2 text-sm sm:w-auto" value={inventoryStatus} onChange={(event) => setInventoryStatus(event.target.value)}>
              <option value="all">All statuses</option>
              <option value="low">Low stock</option>
              <option value="ok">OK</option>
            </select>
            <ResetFiltersButton className="ml-auto" onClick={resetFilters} visible={hasActiveFilters} />
          </div>
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
                {filteredInventory.length ? (
                  filteredInventory.map((row) => (
                    <tr className="border-t" key={row.id}>
                      <td>{row.bodega_name ?? "-"}</td>
                      <td>{row.sku ?? "-"}</td>
                      <td>{row.product_name ?? "-"}</td>
                      <td className="text-right">{asNumber(row.quantity_on_hand).toFixed(2)}</td>
                      <td className="text-right">{asNumber(row.reorder_level).toFixed(2)}</td>
                      <td>{asNumber(row.quantity_on_hand) <= asNumber(row.reorder_level) ? "Low stock" : "OK"}</td>
                    </tr>
                  ))
                ) : (
                  <tr className="border-t">
                    <td className="py-3 text-center text-slate-500" colSpan={6}>
                      No lubricant stock found for this bodega.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
