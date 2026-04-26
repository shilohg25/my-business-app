"use client";

import { useEffect, useMemo, useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { canUseLiveData } from "@/lib/data/client";
import { getSupabaseConfigurationState } from "@/lib/supabase/client";
import {
  createFuelOpeningBaseline,
  fetchFuelInventoryDashboard,
  finalizeFuelOpeningBaseline,
  recordFuelDelivery,
  recordTankReading,
  voidFuelOpeningBaseline
} from "@/lib/data/fuel-inventory";
import { fetchCurrentProfile } from "@/lib/data/profile";

function todayIso() {
  return new Date().toISOString().slice(0, 10);
}

function monthStartIso() {
  const now = new Date();
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1)).toISOString().slice(0, 10);
}

function toNum(value: string) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function fuelVarianceLabel(value: number) {
  if (Math.abs(value) <= 0.001) return "Balanced";
  if (value > 0) return "Fuel over";
  return "Fuel shortage";
}

export function FuelInventoryClient() {
  const liveData = canUseLiveData();
  const config = getSupabaseConfigurationState();

  const params = typeof window === "undefined" ? null : new URLSearchParams(window.location.search);
  const initialStation = params?.get("station_id") ?? "ALL";

  const [loading, setLoading] = useState(liveData);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [role, setRole] = useState<string | null>(null);
  const [roleChecking, setRoleChecking] = useState(liveData);

  const [stationFilter, setStationFilter] = useState(initialStation);
  const [productFilter, setProductFilter] = useState("ALL");
  const [datePreset, setDatePreset] = useState("THIS_MONTH");
  const [startDate, setStartDate] = useState(monthStartIso());
  const [endDate, setEndDate] = useState(todayIso());

  const [result, setResult] = useState<Awaited<ReturnType<typeof fetchFuelInventoryDashboard>> | null>(null);

  const [baselineDateTime, setBaselineDateTime] = useState(`${todayIso()}T00:00`);
  const [baselineNotes, setBaselineNotes] = useState("");
  const [dieselOpening, setDieselOpening] = useState("0");
  const [specialOpening, setSpecialOpening] = useState("0");
  const [unleadedOpening, setUnleadedOpening] = useState("0");
  const [meterRows, setMeterRows] = useState([{ pump_label: "", product_code: "DIESEL", nozzle_label: "", opening_meter_reading: "0", notes: "" }]);

  const [deliveryForm, setDeliveryForm] = useState({ station_id: "", tank_id: "", product_code: "DIESEL", delivery_date: todayIso(), supplier_name: "", invoice_number: "", delivery_reference: "", liters: "", unit_cost: "", notes: "" });
  const [readingForm, setReadingForm] = useState({ station_id: "", tank_id: "", product_code: "DIESEL", reading_date: todayIso(), opening_liters: "", actual_ending_liters: "", notes: "" });

  useEffect(() => {
    if (datePreset === "TODAY") {
      setStartDate(todayIso());
      setEndDate(todayIso());
    } else if (datePreset === "THIS_MONTH") {
      setStartDate(monthStartIso());
      setEndDate(todayIso());
    } else if (datePreset === "LAST_30") {
      const end = new Date();
      const start = new Date(end.getTime() - 29 * 86400000);
      setStartDate(start.toISOString().slice(0, 10));
      setEndDate(end.toISOString().slice(0, 10));
    }
  }, [datePreset]);

  const reload = async () => {
    if (!liveData) return;
    const data = await fetchFuelInventoryDashboard({ stationId: stationFilter === "ALL" ? undefined : stationFilter, product: productFilter, startDate, endDate });
    setResult(data);
    if (!deliveryForm.station_id && data.stations[0]) {
      setDeliveryForm((prev) => ({ ...prev, station_id: data.stations[0].id }));
      setReadingForm((prev) => ({ ...prev, station_id: data.stations[0].id }));
    }
  };

  useEffect(() => {
    if (!liveData) {
      setLoading(false);
      return;
    }

    setLoading(true);
    setRoleChecking(true);
    setError(null);

    const loadRole = async () => {
      const profile = await fetchCurrentProfile();
      return profile?.role ?? null;
    };

    Promise.all([reload(), loadRole()])
      .then(([, nextRole]) => setRole(nextRole))
      .catch((nextError: Error) => setError(nextError.message))
      .finally(() => {
        setLoading(false);
        setRoleChecking(false);
      });
  }, [liveData, stationFilter, productFilter, startDate, endDate]);

  const baselinePanelRows = useMemo(() => {
    const baselines = result?.baselines ?? [];
    const baselineProducts = result?.baselineProducts ?? [];
    return (result?.stations ?? []).map((station) => {
      const stationBaselines = baselines.filter((b) => b.station_id === station.id).sort((a, b) => (b.baseline_at ?? "").localeCompare(a.baseline_at ?? ""));
      const latest = stationBaselines[0] ?? null;
      const openingByProduct = new Map<string, number>();
      if (latest) {
        baselineProducts.filter((p) => p.baseline_id === latest.id).forEach((row) => openingByProduct.set(row.product_code_snapshot, Number(row.opening_liters ?? 0)));
      }
      return {
        station,
        status: latest?.status ?? "missing",
        baseline: latest,
        diesel: openingByProduct.get("DIESEL") ?? 0,
        special: openingByProduct.get("SPECIAL") ?? 0,
        unleaded: openingByProduct.get("UNLEADED") ?? 0
      };
    });
  }, [result]);

  async function handleSaveBaseline(finalize = false) {
    setError(null);
    setMessage(null);
    try {
      const stationId = stationFilter === "ALL" ? (result?.stations[0]?.id ?? "") : stationFilter;
      if (!stationId) throw new Error("Select a station before creating baseline");
      const baselineId = await createFuelOpeningBaseline({
        station_id: stationId,
        baseline_at: new Date(baselineDateTime).toISOString(),
        notes: baselineNotes || null,
        products: [
          { product_code: "DIESEL", opening_liters: toNum(dieselOpening) },
          { product_code: "SPECIAL", opening_liters: toNum(specialOpening) },
          { product_code: "UNLEADED", opening_liters: toNum(unleadedOpening) }
        ],
        meters: meterRows.map((row) => ({
          pump_label: row.pump_label,
          product_code: row.product_code,
          nozzle_label: row.nozzle_label || null,
          opening_meter_reading: toNum(row.opening_meter_reading),
          notes: row.notes || null
        }))
      });
      if (finalize) await finalizeFuelOpeningBaseline(baselineId);
      setMessage(finalize ? "Baseline created and finalized." : "Baseline draft saved.");
      await reload();
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : "Unable to save baseline");
    }
  }

  async function handleVoidBaseline(baselineId: string) {
    const reason = window.prompt("Void reason");
    if (!reason) return;
    try {
      await voidFuelOpeningBaseline(baselineId, reason);
      setMessage("Baseline voided.");
      await reload();
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : "Unable to void baseline");
    }
  }

  return (
    <div className="space-y-6">
      {!liveData ? <div className="rounded border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">{config.reason}</div> : null}
      {error ? <div className="rounded border border-red-200 bg-red-50 p-3 text-sm text-red-700">{error}</div> : null}
      {message ? <div className="rounded border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-700">{message}</div> : null}
      {roleChecking ? <div className="rounded border border-slate-200 bg-slate-50 p-3 text-sm text-slate-600">Checking role...</div> : null}
      {!roleChecking && !role ? <div className="rounded border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">No active profile found for this login.</div> : null}

      <Card>
        <CardHeader><CardTitle>Filters</CardTitle></CardHeader>
        <CardContent className="grid gap-3 md:grid-cols-4">
          <select className="rounded-md border px-3 py-2 text-sm" value={stationFilter} onChange={(e) => setStationFilter(e.target.value)}><option value="ALL">All stations</option>{(result?.stations ?? []).map((station) => <option key={station.id} value={station.id}>{station.name}</option>)}</select>
          <select className="rounded-md border px-3 py-2 text-sm" value={productFilter} onChange={(e) => setProductFilter(e.target.value)}><option value="ALL">All products</option><option value="DIESEL">Diesel</option><option value="SPECIAL">Special</option><option value="UNLEADED">Unleaded</option></select>
          <select className="rounded-md border px-3 py-2 text-sm" value={datePreset} onChange={(e) => setDatePreset(e.target.value)}><option value="TODAY">Today</option><option value="THIS_MONTH">This Month</option><option value="LAST_30">Last 30 Days</option><option value="CUSTOM">Custom</option></select>
          <div className="grid grid-cols-2 gap-2"><Input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} /><Input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} /></div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle>Baseline status panel</CardTitle></CardHeader>
        <CardContent><div className="overflow-x-auto"><table className="w-full text-sm"><thead className="text-left text-slate-500"><tr><th className="py-2">Station</th><th>Status</th><th>Baseline at</th><th className="text-right">Diesel opening</th><th className="text-right">Special opening</th><th className="text-right">Unleaded opening</th><th>Action</th></tr></thead><tbody>{baselinePanelRows.map((row) => <tr className="border-t" key={row.station.id}><td className="py-2">{row.station.name}</td><td>{row.status}</td><td>{row.baseline?.baseline_at ? new Date(row.baseline.baseline_at).toLocaleString() : "-"}</td><td className="text-right">{row.diesel.toFixed(3)}</td><td className="text-right">{row.special.toFixed(3)}</td><td className="text-right">{row.unleaded.toFixed(3)}</td><td>{row.status === "missing" ? "Create baseline" : row.status === "draft" ? "Continue draft" : "View baseline"}{row.baseline ? <Button className="ml-2" size="sm" variant="outline" onClick={() => handleVoidBaseline(row.baseline!.id)}>Void</Button> : null}</td></tr>)}</tbody></table></div></CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle>Opening Baseline Wizard</CardTitle><CardDescription>Finalizing locks this station’s opening balance. Owner only.</CardDescription></CardHeader>
        <CardContent className="space-y-3">
          <div className="grid gap-2 md:grid-cols-3">
            <select className="rounded-md border px-3 py-2 text-sm" value={stationFilter} onChange={(e) => setStationFilter(e.target.value)}><option value="ALL">Select station</option>{(result?.stations ?? []).map((station) => <option key={station.id} value={station.id}>{station.name}</option>)}</select>
            <Input type="datetime-local" value={baselineDateTime} onChange={(e) => setBaselineDateTime(e.target.value)} />
            <Textarea placeholder="Notes" value={baselineNotes} onChange={(e) => setBaselineNotes(e.target.value)} />
          </div>
          <div className="grid gap-2 md:grid-cols-3"><Input type="number" step="0.001" placeholder="Diesel remaining liters" value={dieselOpening} onChange={(e) => setDieselOpening(e.target.value)} /><Input type="number" step="0.001" placeholder="Special remaining liters" value={specialOpening} onChange={(e) => setSpecialOpening(e.target.value)} /><Input type="number" step="0.001" placeholder="Unleaded remaining liters" value={unleadedOpening} onChange={(e) => setUnleadedOpening(e.target.value)} /></div>
          {meterRows.map((row, index) => <div className="grid gap-2 md:grid-cols-5" key={`meter-${index}`}><Input placeholder="Pump label" value={row.pump_label} onChange={(e) => setMeterRows((prev) => prev.map((x, i) => i === index ? { ...x, pump_label: e.target.value } : x))} /><select className="rounded-md border px-3 py-2 text-sm" value={row.product_code} onChange={(e) => setMeterRows((prev) => prev.map((x, i) => i === index ? { ...x, product_code: e.target.value } : x))}><option>DIESEL</option><option>SPECIAL</option><option>UNLEADED</option></select><Input placeholder="Nozzle label" value={row.nozzle_label} onChange={(e) => setMeterRows((prev) => prev.map((x, i) => i === index ? { ...x, nozzle_label: e.target.value } : x))} /><Input type="number" step="0.001" placeholder="Current meter reading" value={row.opening_meter_reading} onChange={(e) => setMeterRows((prev) => prev.map((x, i) => i === index ? { ...x, opening_meter_reading: e.target.value } : x))} /><Input placeholder="Notes" value={row.notes} onChange={(e) => setMeterRows((prev) => prev.map((x, i) => i === index ? { ...x, notes: e.target.value } : x))} /></div>)}
          <div className="flex gap-2"><Button variant="outline" onClick={() => setMeterRows((prev) => [...prev, { pump_label: "", product_code: "DIESEL", nozzle_label: "", opening_meter_reading: "0", notes: "" }])}>Add meter row</Button><Button onClick={() => handleSaveBaseline(false)}>Save draft baseline</Button><Button disabled={role !== "Owner"} onClick={() => handleSaveBaseline(true)}>Finalize baseline</Button></div>{role !== "Owner" ? <p className="text-sm text-amber-700">Only Owner profiles can finalize opening baselines.</p> : null}
        </CardContent>
      </Card>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
        <Card><CardHeader><CardDescription>Diesel variance</CardDescription><CardTitle>{(result?.totals?.dieselVariance ?? 0).toFixed(3)}</CardTitle></CardHeader></Card>
        <Card><CardHeader><CardDescription>Special variance</CardDescription><CardTitle>{(result?.totals?.specialVariance ?? 0).toFixed(3)}</CardTitle></CardHeader></Card>
        <Card><CardHeader><CardDescription>Unleaded variance</CardDescription><CardTitle>{(result?.totals?.unleadedVariance ?? 0).toFixed(3)}</CardTitle></CardHeader></Card>
        <Card><CardHeader><CardDescription>Total meter liters out</CardDescription><CardTitle>{(result?.totals?.totalMeterLitersOut ?? 0).toFixed(3)}</CardTitle></CardHeader></Card>
        <Card><CardHeader><CardDescription>Fuel shortage alerts</CardDescription><CardTitle>{result?.totals?.shortageAlerts ?? 0}</CardTitle></CardHeader></Card>
      </div>

      <Card>
        <CardHeader><CardTitle>Fuel inventory table</CardTitle></CardHeader>
        <CardContent><div className="overflow-x-auto"><table className="w-full text-sm"><thead className="text-left text-slate-500"><tr><th className="py-2">Station</th><th>Product</th><th className="text-right">Opening liters</th><th className="text-right">Delivered liters</th><th className="text-right">Meter liters out</th><th className="text-right">Expected ending</th><th className="text-right">Latest actual ending</th><th className="text-right">Variance</th><th>Baseline status</th></tr></thead><tbody>{(result?.summaryRows ?? []).map((row) => <tr className="border-t" key={`${row.station_id}-${row.product}`}><td className="py-2">{row.station_name ?? "-"}</td><td>{row.product}</td><td className="text-right">{row.opening_liters.toFixed(3)}</td><td className="text-right">{row.delivered_liters.toFixed(3)}</td><td className="text-right">{row.meter_liters_out.toFixed(3)}</td><td className="text-right">{row.expected_ending_liters.toFixed(3)}</td><td className="text-right">{row.latest_actual_ending_liters.toFixed(3)}</td><td className="text-right">{row.variance_liters.toFixed(3)} ({fuelVarianceLabel(row.variance_liters)})</td><td>{row.baseline_status}</td></tr>)}</tbody></table></div></CardContent>
      </Card>

      <div className="grid gap-4 xl:grid-cols-2">
        <Card><CardHeader><CardTitle>Record fuel delivery</CardTitle></CardHeader><CardContent><form className="space-y-2" onSubmit={async (event) => { event.preventDefault(); setError(null); try { await recordFuelDelivery({ station_id: deliveryForm.station_id, tank_id: deliveryForm.tank_id || null, product_code: deliveryForm.product_code, supplier_name: deliveryForm.supplier_name || null, delivery_date: deliveryForm.delivery_date, invoice_number: deliveryForm.invoice_number || null, delivery_reference: deliveryForm.delivery_reference || null, liters: toNum(deliveryForm.liters), unit_cost: deliveryForm.unit_cost ? toNum(deliveryForm.unit_cost) : null, notes: deliveryForm.notes || null }); setMessage("Delivery recorded."); await reload(); } catch (nextError) { setError(nextError instanceof Error ? nextError.message : "Unable to record delivery"); } }}><select className="w-full rounded-md border px-3 py-2 text-sm" value={deliveryForm.station_id} onChange={(e) => setDeliveryForm((prev) => ({ ...prev, station_id: e.target.value }))}><option value="">Select station</option>{(result?.stations ?? []).map((station) => <option key={station.id} value={station.id}>{station.name}</option>)}</select><select className="w-full rounded-md border px-3 py-2 text-sm" value={deliveryForm.product_code} onChange={(e) => setDeliveryForm((prev) => ({ ...prev, product_code: e.target.value }))}><option>DIESEL</option><option>SPECIAL</option><option>UNLEADED</option></select><Input placeholder="Tank id (optional)" value={deliveryForm.tank_id} onChange={(e) => setDeliveryForm((prev) => ({ ...prev, tank_id: e.target.value }))} /><Input type="date" value={deliveryForm.delivery_date} onChange={(e) => setDeliveryForm((prev) => ({ ...prev, delivery_date: e.target.value }))} /><Input placeholder="Supplier" value={deliveryForm.supplier_name} onChange={(e) => setDeliveryForm((prev) => ({ ...prev, supplier_name: e.target.value }))} /><Input type="number" step="0.001" placeholder="Liters" value={deliveryForm.liters} onChange={(e) => setDeliveryForm((prev) => ({ ...prev, liters: e.target.value }))} /><Button type="submit">Record delivery</Button></form></CardContent></Card>
        <Card><CardHeader><CardTitle>Record tank reading</CardTitle></CardHeader><CardContent><form className="space-y-2" onSubmit={async (event) => { event.preventDefault(); setError(null); try { await recordTankReading({ station_id: readingForm.station_id, tank_id: readingForm.tank_id || null, product_code: readingForm.product_code, reading_date: readingForm.reading_date, opening_liters: toNum(readingForm.opening_liters), actual_ending_liters: toNum(readingForm.actual_ending_liters), notes: readingForm.notes || null }); setMessage("Tank reading recorded."); await reload(); } catch (nextError) { setError(nextError instanceof Error ? nextError.message : "Unable to record reading"); } }}><select className="w-full rounded-md border px-3 py-2 text-sm" value={readingForm.station_id} onChange={(e) => setReadingForm((prev) => ({ ...prev, station_id: e.target.value }))}><option value="">Select station</option>{(result?.stations ?? []).map((station) => <option key={station.id} value={station.id}>{station.name}</option>)}</select><select className="w-full rounded-md border px-3 py-2 text-sm" value={readingForm.product_code} onChange={(e) => setReadingForm((prev) => ({ ...prev, product_code: e.target.value }))}><option>DIESEL</option><option>SPECIAL</option><option>UNLEADED</option></select><Input type="date" value={readingForm.reading_date} onChange={(e) => setReadingForm((prev) => ({ ...prev, reading_date: e.target.value }))} /><Input type="number" step="0.001" placeholder="Opening liters" value={readingForm.opening_liters} onChange={(e) => setReadingForm((prev) => ({ ...prev, opening_liters: e.target.value }))} /><Input type="number" step="0.001" placeholder="Actual ending liters" value={readingForm.actual_ending_liters} onChange={(e) => setReadingForm((prev) => ({ ...prev, actual_ending_liters: e.target.value }))} /><Button type="submit">Record reading</Button></form></CardContent></Card>
      </div>

      {loading ? <p className="text-sm text-slate-500">Loading fuel inventory...</p> : null}
    </div>
  );
}
