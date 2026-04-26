"use client";

import { useState } from "react";
import type { AllowedDeliveryStation, FuelDeliveryBatchPayload } from "@/lib/data/fuel-deliveries";
import { buildFuelDeliveryBatchPayload, recordFuelDeliveryBatch } from "@/lib/data/fuel-deliveries";

type ProductRow = {
  product_code: string;
  liters: string;
  unit_cost: string;
  tank_id: string;
  notes: string;
};

const emptyProductRow = (): ProductRow => ({ product_code: "DIESEL", liters: "", unit_cost: "", tank_id: "", notes: "" });

export function FuelDeliveryForm({
  mode = "field",
  allowedStations,
  onSuccess,
  defaultStationId
}: {
  mode?: "field" | "inventory";
  allowedStations: AllowedDeliveryStation[];
  onSuccess?: (id: string) => void;
  defaultStationId?: string;
}) {
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [stationId, setStationId] = useState(defaultStationId ?? allowedStations[0]?.station_id ?? "");
  const [deliveryDate, setDeliveryDate] = useState(new Date().toISOString().slice(0, 10));
  const [supplierName, setSupplierName] = useState("");
  const [invoiceNumber, setInvoiceNumber] = useState("");
  const [deliveryReference, setDeliveryReference] = useState("");
  const [notes, setNotes] = useState("");
  const [items, setItems] = useState<ProductRow[]>([emptyProductRow()]);

  const updateItem = (idx: number, key: keyof ProductRow, value: string) => {
    setItems((current) => current.map((item, index) => (index === idx ? { ...item, [key]: value } : item)));
  };

  const submit = async () => {
    setError(null);
    setMessage(null);

    try {
      const payload = buildFuelDeliveryBatchPayload({
        station_id: stationId,
        delivery_date: deliveryDate,
        supplier_name: supplierName || null,
        invoice_number: invoiceNumber || null,
        delivery_reference: deliveryReference || null,
        notes: notes || null,
        items: items.map((item) => ({
          product_code: item.product_code,
          liters: Number(item.liters),
          unit_cost: item.unit_cost ? Number(item.unit_cost) : null,
          tank_id: item.tank_id || null,
          notes: item.notes || null
        }))
      } satisfies FuelDeliveryBatchPayload);

      setSaving(true);
      const id = await recordFuelDeliveryBatch(payload);
      setMessage("Fuel delivery recorded.");
      setItems([emptyProductRow()]);
      setInvoiceNumber("");
      setDeliveryReference("");
      setNotes("");
      setSupplierName("");
      onSuccess?.(id);
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : "Unable to record delivery");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-3 rounded-2xl border bg-white p-4">
      <h3 className="font-semibold">Fuel Delivery Received</h3>
      {mode === "field" ? <p className="text-sm text-slate-600">This records delivery into station fuel inventory. It does not publish a shift report.</p> : null}
      {error ? <p className="text-sm text-red-700">{error}</p> : null}
      {message ? <p className="text-sm text-emerald-700">{message}</p> : null}

      <select className="min-h-11 w-full rounded-lg border px-3" value={stationId} onChange={(event) => setStationId(event.target.value)}>
        <option value="">Select station</option>
        {allowedStations.map((station) => (
          <option key={station.station_id} value={station.station_id}>{station.station_name}</option>
        ))}
      </select>
      <input className="min-h-11 w-full rounded-lg border px-3" type="date" value={deliveryDate} onChange={(event) => setDeliveryDate(event.target.value)} />
      <input className="min-h-11 w-full rounded-lg border px-3" placeholder="Supplier" value={supplierName} onChange={(event) => setSupplierName(event.target.value)} />
      <input className="min-h-11 w-full rounded-lg border px-3" placeholder="Invoice number" value={invoiceNumber} onChange={(event) => setInvoiceNumber(event.target.value)} />
      <input className="min-h-11 w-full rounded-lg border px-3" placeholder="Delivery reference" value={deliveryReference} onChange={(event) => setDeliveryReference(event.target.value)} />
      <textarea className="w-full rounded-lg border px-3 py-2" placeholder="Notes" value={notes} onChange={(event) => setNotes(event.target.value)} />

      {items.map((item, index) => (
        <div key={index} className="rounded border p-2 space-y-2">
          <select className="min-h-11 w-full rounded-lg border px-3" value={item.product_code} onChange={(event) => updateItem(index, "product_code", event.target.value)}>
            <option value="DIESEL">Diesel</option>
            <option value="SPECIAL">Special</option>
            <option value="UNLEADED">Unleaded</option>
          </select>
          <input className="min-h-11 w-full rounded-lg border px-3" type="number" step="0.001" min="0" placeholder="Liters received" value={item.liters} onChange={(event) => updateItem(index, "liters", event.target.value)} />
          <input className="min-h-11 w-full rounded-lg border px-3" type="number" step="0.0001" min="0" placeholder="Unit cost (optional)" value={item.unit_cost} onChange={(event) => updateItem(index, "unit_cost", event.target.value)} />
          <input className="min-h-11 w-full rounded-lg border px-3" placeholder="Tank ID (optional)" value={item.tank_id} onChange={(event) => updateItem(index, "tank_id", event.target.value)} />
          <input className="min-h-11 w-full rounded-lg border px-3" placeholder="Item notes (optional)" value={item.notes} onChange={(event) => updateItem(index, "notes", event.target.value)} />
          {items.length > 1 ? <button type="button" className="min-h-11 w-full rounded-xl border" onClick={() => setItems((current) => current.filter((_, rowIndex) => rowIndex !== index))}>Remove product</button> : null}
        </div>
      ))}
      <button type="button" className="min-h-11 w-full rounded-xl border" onClick={() => setItems((current) => [...current, emptyProductRow()])}>Add product</button>
      <button type="button" disabled={saving} className="min-h-11 w-full rounded-xl bg-slate-900 text-white" onClick={() => void submit()}>{saving ? "Recording..." : "Record delivery"}</button>
    </div>
  );
}
