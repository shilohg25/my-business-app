"use client";

import { useEffect, useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { createSupabaseBrowserClient, getSupabaseConfigurationState } from "@/lib/supabase/client";
import { canUseLiveData } from "@/lib/data/client";
import { fetchFuelInventoryData } from "@/lib/data/fuel-inventory";
import { formatCurrency } from "@/lib/utils";

function asNumber(value: unknown) {
  const parsed = Number(value ?? Number.NaN);
  return Number.isFinite(parsed) ? parsed : 0;
}

function todayIso() {
  return new Date().toISOString().slice(0, 10);
}

export function FuelInventoryClient() {
  const liveData = canUseLiveData();
  const config = getSupabaseConfigurationState();
  const [loading, setLoading] = useState(liveData);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [result, setResult] = useState<Awaited<ReturnType<typeof fetchFuelInventoryData>> | null>(null);

  const [stationId, setStationId] = useState("");
  const [tankId, setTankId] = useState("");
  const [productCode, setProductCode] = useState("DIESEL");
  const [deliveryDate, setDeliveryDate] = useState(todayIso());
  const [supplierName, setSupplierName] = useState("");
  const [invoiceNumber, setInvoiceNumber] = useState("");
  const [deliveryReference, setDeliveryReference] = useState("");
  const [liters, setLiters] = useState("");
  const [unitCost, setUnitCost] = useState("");
  const [deliveryNotes, setDeliveryNotes] = useState("");

  const [readingDate, setReadingDate] = useState(todayIso());
  const [openingLiters, setOpeningLiters] = useState("");
  const [actualEndingLiters, setActualEndingLiters] = useState("");
  const [readingNotes, setReadingNotes] = useState("");

  const reload = async () => {
    if (!liveData) return;
    const data = await fetchFuelInventoryData();
    setResult(data);
    if (!stationId && data.stations[0]) setStationId(data.stations[0].id);
  };

  useEffect(() => {
    if (!liveData) {
      setLoading(false);
      return;
    }
    setLoading(true);
    reload().catch((err: Error) => setError(err.message)).finally(() => setLoading(false));
  }, [liveData]);

  async function submitDelivery(event: React.FormEvent) {
    event.preventDefault();
    if (!liveData) return;

    setError(null);
    setMessage(null);
    try {
      const supabase = createSupabaseBrowserClient();
      const payload = {
        station_id: stationId,
        tank_id: tankId || null,
        product_code: productCode,
        supplier_name: supplierName || null,
        delivery_date: deliveryDate,
        invoice_number: invoiceNumber || null,
        delivery_reference: deliveryReference || null,
        liters: Number(liters || 0),
        unit_cost: unitCost ? Number(unitCost) : null,
        notes: deliveryNotes || null
      };
      const { data, error: rpcError } = await supabase.rpc("fuel_record_fuel_delivery", { payload });
      if (rpcError) throw rpcError;
      setMessage(`Delivery recorded. Delivery id: ${data}`);
      await reload();
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : "Unable to record delivery");
    }
  }

  async function submitReading(event: React.FormEvent) {
    event.preventDefault();
    if (!liveData) return;

    setError(null);
    setMessage(null);
    try {
      const supabase = createSupabaseBrowserClient();
      const payload = {
        station_id: stationId,
        tank_id: tankId || null,
        product_code: productCode,
        reading_date: readingDate,
        opening_liters: Number(openingLiters || 0),
        actual_ending_liters: Number(actualEndingLiters || 0),
        notes: readingNotes || null
      };
      const { data, error: rpcError } = await supabase.rpc("fuel_record_tank_reading", { payload });
      if (rpcError) throw rpcError;
      setMessage(`Tank reading recorded. Reading id: ${data}`);
      await reload();
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : "Unable to record reading");
    }
  }

  return (
    <div className="space-y-6">
      {!liveData ? <div className="rounded border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">{config.reason}</div> : null}
      {error ? <div className="rounded border border-red-200 bg-red-50 p-3 text-sm text-red-700">{error}</div> : null}
      {message ? <div className="rounded border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-700">{message}</div> : null}

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
        <Card><CardHeader><CardDescription>Diesel stock variance</CardDescription><CardTitle>{asNumber(result?.summary.dieselVariance).toFixed(2)}</CardTitle></CardHeader></Card>
        <Card><CardHeader><CardDescription>Special stock variance</CardDescription><CardTitle>{asNumber(result?.summary.specialVariance).toFixed(2)}</CardTitle></CardHeader></Card>
        <Card><CardHeader><CardDescription>Unleaded stock variance</CardDescription><CardTitle>{asNumber(result?.summary.unleadedVariance).toFixed(2)}</CardTitle></CardHeader></Card>
        <Card><CardHeader><CardDescription>Fuel deliveries this month</CardDescription><CardTitle>{result?.summary.deliveriesThisMonth ?? 0}</CardTitle></CardHeader></Card>
        <Card><CardHeader><CardDescription>Gross liters out this month</CardDescription><CardTitle>{asNumber(result?.summary.grossLitersOutThisMonth).toFixed(3)}</CardTitle></CardHeader></Card>
      </div>

      <Card><CardHeader><CardTitle>Product inventory</CardTitle></CardHeader><CardContent>{(result?.productInventory.length ?? 0) === 0 ? <p className="text-sm text-slate-500">No fuel inventory rows found.</p> : <div className="overflow-x-auto"><table className="w-full text-sm"><thead className="text-left text-slate-500"><tr><th className="py-2">Station</th><th>Product</th><th className="text-right">Delivered liters</th><th className="text-right">Gross liters out</th><th className="text-right">Latest actual ending</th><th className="text-right">Latest expected ending</th><th className="text-right">Variance liters</th><th>Status</th></tr></thead><tbody>{result?.productInventory.map((row) => <tr className="border-t" key={`${row.station_id}-${row.product}`}><td className="py-2">{row.station_name ?? "-"}</td><td>{row.product}</td><td className="text-right">{row.delivered_liters.toFixed(3)}</td><td className="text-right">{row.gross_liters_out.toFixed(3)}</td><td className="text-right">{row.latest_actual_ending.toFixed(3)}</td><td className="text-right">{row.latest_expected_ending.toFixed(3)}</td><td className="text-right">{row.variance_liters.toFixed(3)}</td><td>{Math.abs(row.variance_liters) <= 0.001 ? "Balanced" : row.variance_liters > 0 ? "Over" : "Short"}</td></tr>)}</tbody></table></div>}</CardContent></Card>

      <Card><CardHeader><CardTitle>Deliveries</CardTitle></CardHeader><CardContent>{(result?.deliveries.length ?? 0) === 0 ? <p className="text-sm text-slate-500">No deliveries found.</p> : <div className="overflow-x-auto"><table className="w-full text-sm"><thead className="text-left text-slate-500"><tr><th className="py-2">Date</th><th>Station</th><th>Product</th><th>Supplier</th><th>Invoice/reference</th><th className="text-right">Liters</th><th className="text-right">Unit cost</th><th className="text-right">Total cost</th></tr></thead><tbody>{result?.deliveries.map((row) => <tr className="border-t" key={row.id}><td className="py-2">{row.delivery_date}</td><td>{row.station_name ?? "-"}</td><td>{row.product_code_snapshot}</td><td>{row.supplier_name ?? "-"}</td><td>{row.invoice_number ?? row.delivery_reference ?? "-"}</td><td className="text-right">{asNumber(row.liters).toFixed(3)}</td><td className="text-right">{formatCurrency(asNumber(row.unit_cost))}</td><td className="text-right">{formatCurrency(asNumber(row.total_cost))}</td></tr>)}</tbody></table></div>}</CardContent></Card>

      <Card><CardHeader><CardTitle>Tank readings</CardTitle></CardHeader><CardContent>{(result?.readings.length ?? 0) === 0 ? <p className="text-sm text-slate-500">No tank readings found.</p> : <div className="overflow-x-auto"><table className="w-full text-sm"><thead className="text-left text-slate-500"><tr><th className="py-2">Date</th><th>Station</th><th>Product</th><th className="text-right">Opening</th><th className="text-right">Received</th><th className="text-right">Meter liters out</th><th className="text-right">Expected ending</th><th className="text-right">Actual ending</th><th className="text-right">Variance</th><th>Notes</th></tr></thead><tbody>{result?.readings.map((row) => <tr className="border-t" key={row.id}><td className="py-2">{row.reading_date}</td><td>{row.station_name ?? "-"}</td><td>{row.product_code_snapshot}</td><td className="text-right">{asNumber(row.opening_liters).toFixed(3)}</td><td className="text-right">{asNumber(row.received_liters).toFixed(3)}</td><td className="text-right">{asNumber(row.meter_liters_out).toFixed(3)}</td><td className="text-right">{asNumber(row.expected_ending_liters).toFixed(3)}</td><td className="text-right">{asNumber(row.actual_ending_liters).toFixed(3)}</td><td className="text-right">{asNumber(row.variance_liters).toFixed(3)}</td><td>{row.notes ?? "-"}</td></tr>)}</tbody></table></div>}</CardContent></Card>

      <div className="grid gap-4 xl:grid-cols-2">
        <Card><CardHeader><CardTitle>Record delivery</CardTitle></CardHeader><CardContent><form className="space-y-2" onSubmit={submitDelivery}><select className="w-full rounded-md border px-3 py-2 text-sm" value={stationId} onChange={(e) => setStationId(e.target.value)}><option value="">Select station</option>{(result?.stations ?? []).map((station) => <option key={station.id} value={station.id}>{station.name}</option>)}</select><select className="w-full rounded-md border px-3 py-2 text-sm" value={productCode} onChange={(e) => setProductCode(e.target.value)}><option>DIESEL</option><option>SPECIAL</option><option>UNLEADED</option></select><Input placeholder="Optional tank id" value={tankId} onChange={(e) => setTankId(e.target.value)} /><Input type="date" value={deliveryDate} onChange={(e) => setDeliveryDate(e.target.value)} /><Input placeholder="Supplier name" value={supplierName} onChange={(e) => setSupplierName(e.target.value)} /><Input placeholder="Invoice number" value={invoiceNumber} onChange={(e) => setInvoiceNumber(e.target.value)} /><Input placeholder="Delivery reference" value={deliveryReference} onChange={(e) => setDeliveryReference(e.target.value)} /><Input type="number" step="0.001" min="0" placeholder="Liters" value={liters} onChange={(e) => setLiters(e.target.value)} /><Input type="number" step="0.0001" min="0" placeholder="Unit cost" value={unitCost} onChange={(e) => setUnitCost(e.target.value)} /><Textarea placeholder="Notes" value={deliveryNotes} onChange={(e) => setDeliveryNotes(e.target.value)} /><Button type="submit">Record delivery</Button></form></CardContent></Card>
        <Card><CardHeader><CardTitle>Record tank reading</CardTitle></CardHeader><CardContent><form className="space-y-2" onSubmit={submitReading}><select className="w-full rounded-md border px-3 py-2 text-sm" value={stationId} onChange={(e) => setStationId(e.target.value)}><option value="">Select station</option>{(result?.stations ?? []).map((station) => <option key={station.id} value={station.id}>{station.name}</option>)}</select><select className="w-full rounded-md border px-3 py-2 text-sm" value={productCode} onChange={(e) => setProductCode(e.target.value)}><option>DIESEL</option><option>SPECIAL</option><option>UNLEADED</option></select><Input placeholder="Optional tank id" value={tankId} onChange={(e) => setTankId(e.target.value)} /><Input type="date" value={readingDate} onChange={(e) => setReadingDate(e.target.value)} /><Input type="number" step="0.001" placeholder="Opening liters" value={openingLiters} onChange={(e) => setOpeningLiters(e.target.value)} /><Input type="number" step="0.001" placeholder="Actual ending liters" value={actualEndingLiters} onChange={(e) => setActualEndingLiters(e.target.value)} /><Textarea placeholder="Notes" value={readingNotes} onChange={(e) => setReadingNotes(e.target.value)} /><Button type="submit">Record reading</Button></form></CardContent></Card>
      </div>

      {loading ? <p className="text-sm text-slate-500">Loading fuel inventory...</p> : null}
    </div>
  );
}
