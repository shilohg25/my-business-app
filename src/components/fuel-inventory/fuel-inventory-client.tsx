"use client";

import { type FormEvent, useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { ResetFiltersButton } from "@/components/ui/reset-filters-button";
import { SimpleModal } from "@/components/ui/simple-modal";
import { Textarea } from "@/components/ui/textarea";
import { canUseLiveData } from "@/lib/data/client";
import {
  createFuelOpeningBaseline,
  fetchFuelInventoryDashboard,
  finalizeFuelOpeningBaseline,
  recordFuelDelivery,
  voidFuelOpeningBaseline
} from "@/lib/data/fuel-inventory";
import { fetchCurrentProfile } from "@/lib/data/profile";
import { getSupabaseConfigurationState } from "@/lib/supabase/client";
import { areFiltersDefault, getCurrentMonthDateRange } from "@/lib/utils/filters";

function toNum(value: string) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function fuelVarianceLabel(value: number) {
  if (Math.abs(value) <= 0.001) return "Balanced";
  if (value > 0) return "Fuel over";
  return "Fuel shortage";
}

const fuelProductOrder = new Map([
  ["DIESEL", 0],
  ["SPECIAL", 1],
  ["UNLEADED", 2]
]);

export function FuelInventoryClient() {
  const liveData = canUseLiveData();
  const config = getSupabaseConfigurationState();

  const params = typeof window === "undefined" ? null : new URLSearchParams(window.location.search);
  const initialStation = params?.get("station_id") ?? "ALL";
  const monthDateRange = getCurrentMonthDateRange();
  const defaultFilters = {
    stationFilter: initialStation,
    productFilter: "ALL",
    datePreset: "THIS_MONTH",
    startDate: monthDateRange.startDate,
    endDate: monthDateRange.endDate
  };

  const [loading, setLoading] = useState(liveData);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [role, setRole] = useState<string | null>(null);
  const [roleChecking, setRoleChecking] = useState(liveData);

  const [stationFilter, setStationFilter] = useState(defaultFilters.stationFilter);
  const [productFilter, setProductFilter] = useState(defaultFilters.productFilter);
  const [datePreset, setDatePreset] = useState(defaultFilters.datePreset);
  const [startDate, setStartDate] = useState(defaultFilters.startDate);
  const [endDate, setEndDate] = useState(defaultFilters.endDate);

  const [result, setResult] = useState<Awaited<ReturnType<typeof fetchFuelInventoryDashboard>> | null>(null);

  const [baselineDateTime, setBaselineDateTime] = useState(`${new Date().toISOString().slice(0, 10)}T00:00`);
  const [baselineNotes, setBaselineNotes] = useState("");
  const [dieselOpening, setDieselOpening] = useState("0");
  const [specialOpening, setSpecialOpening] = useState("0");
  const [unleadedOpening, setUnleadedOpening] = useState("0");
  const [meterRows, setMeterRows] = useState([{ pump_label: "", product_code: "DIESEL", nozzle_label: "", opening_meter_reading: "0", notes: "" }]);

  const [deliveryModalOpen, setDeliveryModalOpen] = useState(false);
  const [deliverySaving, setDeliverySaving] = useState(false);
  const [deliveryError, setDeliveryError] = useState<string | null>(null);
  const [deliveryForm, setDeliveryForm] = useState({
    station_id: "",
    tank_id: "",
    product_code: "DIESEL",
    delivery_date: new Date().toISOString().slice(0, 10),
    supplier_name: "",
    invoice_number: "",
    delivery_reference: "",
    liters: "",
    unit_cost: "",
    notes: ""
  });

  useEffect(() => {
    if (datePreset === "TODAY") {
      const date = new Date().toISOString().slice(0, 10);
      setStartDate(date);
      setEndDate(date);
    } else if (datePreset === "THIS_MONTH") {
      const monthDefaults = getCurrentMonthDateRange();
      setStartDate(monthDefaults.startDate);
      setEndDate(monthDefaults.endDate);
    } else if (datePreset === "LAST_30") {
      const end = new Date();
      const start = new Date(end.getTime() - 29 * 86400000);
      setStartDate(start.toISOString().slice(0, 10));
      setEndDate(end.toISOString().slice(0, 10));
    }
  }, [datePreset]);

  const hasActiveFilters = !areFiltersDefault({ stationFilter, productFilter, datePreset, startDate, endDate }, defaultFilters);

  function resetFilters() {
    const nextDefaults = getCurrentMonthDateRange();
    setStationFilter(initialStation);
    setProductFilter("ALL");
    setDatePreset("THIS_MONTH");
    setStartDate(nextDefaults.startDate);
    setEndDate(nextDefaults.endDate);
  }

  const reload = async () => {
    if (!liveData) return;
    const data = await fetchFuelInventoryDashboard({ stationId: stationFilter === "ALL" ? undefined : stationFilter, product: productFilter, startDate, endDate });
    setResult(data);
    if (!deliveryForm.station_id && data.stations[0]) {
      setDeliveryForm((prev) => ({ ...prev, station_id: data.stations[0].id }));
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

  const groupedSummaryRows = useMemo(() => {
    const rows = [...(result?.summaryRows ?? [])].sort((a, b) => {
      const stationCompare = (a.station_name ?? "").localeCompare(b.station_name ?? "");
      if (stationCompare !== 0) return stationCompare;
      return (fuelProductOrder.get(a.product) ?? 99) - (fuelProductOrder.get(b.product) ?? 99);
    });

    const grouped = new Map<string, { stationId: string; stationName: string; rows: typeof rows }>();
    rows.forEach((row) => {
      const key = row.station_id;
      const existing = grouped.get(key);
      if (existing) {
        existing.rows.push(row);
        return;
      }

      grouped.set(key, {
        stationId: row.station_id,
        stationName: row.station_name ?? "Unknown station",
        rows: [row]
      });
    });

    return Array.from(grouped.values());
  }, [result?.summaryRows]);

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

  async function handleSubmitDelivery(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setDeliveryError(null);
    setMessage(null);
    setDeliverySaving(true);

    try {
      await recordFuelDelivery({
        station_id: deliveryForm.station_id,
        tank_id: deliveryForm.tank_id || null,
        product_code: deliveryForm.product_code,
        supplier_name: deliveryForm.supplier_name || null,
        delivery_date: deliveryForm.delivery_date,
        invoice_number: deliveryForm.invoice_number || null,
        delivery_reference: deliveryForm.delivery_reference || null,
        liters: toNum(deliveryForm.liters),
        unit_cost: deliveryForm.unit_cost ? toNum(deliveryForm.unit_cost) : null,
        notes: deliveryForm.notes || null
      });
      setMessage("Delivery recorded.");
      setDeliveryModalOpen(false);
      await reload();
    } catch (nextError) {
      setDeliveryError(nextError instanceof Error ? nextError.message : "Unable to record delivery");
    } finally {
      setDeliverySaving(false);
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-lg font-semibold text-slate-900">Fuel inventory operations</h2>
        <Button onClick={() => setDeliveryModalOpen(true)} type="button" variant="outline">
          Record Fuel Delivery
        </Button>
      </div>

      {!liveData ? <div className="rounded border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">{config.reason}</div> : null}
      {error ? <div className="rounded border border-red-200 bg-red-50 p-3 text-sm text-red-700">{error}</div> : null}
      {message ? <div className="rounded border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-700">{message}</div> : null}
      {roleChecking ? <div className="rounded border border-slate-200 bg-slate-50 p-3 text-sm text-slate-600">Checking role...</div> : null}
      {!roleChecking && !role ? <div className="rounded border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">No active profile found for this login.</div> : null}

      <Card>
        <CardHeader>
          <CardTitle>Filters</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-wrap items-end gap-3">
          <select className="rounded-md border px-3 py-2 text-sm" value={stationFilter} onChange={(e) => setStationFilter(e.target.value)}>
            <option value="ALL">All stations</option>
            {(result?.stations ?? []).map((station) => (
              <option key={station.id} value={station.id}>
                {station.name}
              </option>
            ))}
          </select>
          <select className="rounded-md border px-3 py-2 text-sm" value={productFilter} onChange={(e) => setProductFilter(e.target.value)}>
            <option value="ALL">All products</option>
            <option value="DIESEL">Diesel</option>
            <option value="SPECIAL">Special</option>
            <option value="UNLEADED">Unleaded</option>
          </select>
          <select className="rounded-md border px-3 py-2 text-sm" value={datePreset} onChange={(e) => setDatePreset(e.target.value)}>
            <option value="TODAY">Today</option>
            <option value="THIS_MONTH">This Month</option>
            <option value="LAST_30">Last 30 Days</option>
            <option value="CUSTOM">Custom</option>
          </select>
          <div className="grid grid-cols-2 gap-2">
            <Input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} />
            <Input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} />
          </div>
          <ResetFiltersButton className="ml-auto" onClick={resetFilters} visible={hasActiveFilters} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Baseline status panel</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="text-left text-slate-500">
                <tr>
                  <th className="py-2">Station</th>
                  <th>Status</th>
                  <th>Baseline at</th>
                  <th className="text-right">Diesel opening</th>
                  <th className="text-right">Special opening</th>
                  <th className="text-right">Unleaded opening</th>
                  <th>Action</th>
                </tr>
              </thead>
              <tbody>
                {baselinePanelRows.map((row) => (
                  <tr className="border-t" key={row.station.id}>
                    <td className="py-2">{row.station.name}</td>
                    <td>{row.status}</td>
                    <td>{row.baseline?.baseline_at ? new Date(row.baseline.baseline_at).toLocaleString() : "-"}</td>
                    <td className="text-right">{row.diesel.toFixed(3)}</td>
                    <td className="text-right">{row.special.toFixed(3)}</td>
                    <td className="text-right">{row.unleaded.toFixed(3)}</td>
                    <td>
                      {row.status === "missing" ? "Create baseline" : row.status === "draft" ? "Continue draft" : "View baseline"}
                      {row.baseline ? (
                        <Button className="ml-2" onClick={() => handleVoidBaseline(row.baseline!.id)} size="sm" variant="outline">
                          Void
                        </Button>
                      ) : null}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Opening Baseline Wizard</CardTitle>
          <CardDescription>Finalizing locks this station’s opening balance. Owner only.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="grid gap-2 md:grid-cols-3">
            <select className="rounded-md border px-3 py-2 text-sm" value={stationFilter} onChange={(e) => setStationFilter(e.target.value)}>
              <option value="ALL">Select station</option>
              {(result?.stations ?? []).map((station) => (
                <option key={station.id} value={station.id}>
                  {station.name}
                </option>
              ))}
            </select>
            <Input type="datetime-local" value={baselineDateTime} onChange={(e) => setBaselineDateTime(e.target.value)} />
            <Textarea placeholder="Notes" value={baselineNotes} onChange={(e) => setBaselineNotes(e.target.value)} />
          </div>
          <div className="grid gap-2 md:grid-cols-3">
            <Input type="number" step="0.001" placeholder="Diesel remaining liters" value={dieselOpening} onChange={(e) => setDieselOpening(e.target.value)} />
            <Input type="number" step="0.001" placeholder="Special remaining liters" value={specialOpening} onChange={(e) => setSpecialOpening(e.target.value)} />
            <Input type="number" step="0.001" placeholder="Unleaded remaining liters" value={unleadedOpening} onChange={(e) => setUnleadedOpening(e.target.value)} />
          </div>
          {meterRows.map((row, index) => (
            <div className="grid gap-2 md:grid-cols-5" key={`meter-${index}`}>
              <Input
                placeholder="Pump label"
                value={row.pump_label}
                onChange={(e) => setMeterRows((prev) => prev.map((x, i) => (i === index ? { ...x, pump_label: e.target.value } : x)))}
              />
              <select
                className="rounded-md border px-3 py-2 text-sm"
                value={row.product_code}
                onChange={(e) => setMeterRows((prev) => prev.map((x, i) => (i === index ? { ...x, product_code: e.target.value } : x)))}
              >
                <option>DIESEL</option>
                <option>SPECIAL</option>
                <option>UNLEADED</option>
              </select>
              <Input
                placeholder="Nozzle label"
                value={row.nozzle_label}
                onChange={(e) => setMeterRows((prev) => prev.map((x, i) => (i === index ? { ...x, nozzle_label: e.target.value } : x)))}
              />
              <Input
                type="number"
                step="0.001"
                placeholder="Current meter reading"
                value={row.opening_meter_reading}
                onChange={(e) => setMeterRows((prev) => prev.map((x, i) => (i === index ? { ...x, opening_meter_reading: e.target.value } : x)))}
              />
              <Input
                placeholder="Notes"
                value={row.notes}
                onChange={(e) => setMeterRows((prev) => prev.map((x, i) => (i === index ? { ...x, notes: e.target.value } : x)))}
              />
            </div>
          ))}
          <div className="flex gap-2">
            <Button onClick={() => setMeterRows((prev) => [...prev, { pump_label: "", product_code: "DIESEL", nozzle_label: "", opening_meter_reading: "0", notes: "" }])} variant="outline">
              Add meter row
            </Button>
            <Button onClick={() => handleSaveBaseline(false)}>Save draft baseline</Button>
            <Button disabled={role !== "Owner"} onClick={() => handleSaveBaseline(true)}>
              Finalize baseline
            </Button>
          </div>
          {role !== "Owner" ? <p className="text-sm text-amber-700">Only Owner profiles can finalize opening baselines.</p> : null}
        </CardContent>
      </Card>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
        <Card>
          <CardHeader>
            <CardDescription>Diesel variance</CardDescription>
            <CardTitle>{(result?.totals?.dieselVariance ?? 0).toFixed(3)}</CardTitle>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader>
            <CardDescription>Special variance</CardDescription>
            <CardTitle>{(result?.totals?.specialVariance ?? 0).toFixed(3)}</CardTitle>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader>
            <CardDescription>Unleaded variance</CardDescription>
            <CardTitle>{(result?.totals?.unleadedVariance ?? 0).toFixed(3)}</CardTitle>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader>
            <CardDescription>Total meter liters out</CardDescription>
            <CardTitle>{(result?.totals?.totalMeterLitersOut ?? 0).toFixed(3)}</CardTitle>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader>
            <CardDescription>Fuel shortage alerts</CardDescription>
            <CardTitle>{result?.totals?.shortageAlerts ?? 0}</CardTitle>
          </CardHeader>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Fuel inventory by station</CardTitle>
          <CardDescription>Grouped by station with product-level metrics.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {groupedSummaryRows.map((group) => (
            <section className="rounded-lg border" key={group.stationId}>
              <div className="border-b bg-slate-50 px-4 py-2 text-sm font-semibold text-slate-900">{group.stationName}</div>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="text-left text-slate-500">
                    <tr>
                      <th className="py-2 pl-4">Product</th>
                      <th className="text-right">Opening liters</th>
                      <th className="text-right">Delivered liters</th>
                      <th className="text-right">Meter liters out</th>
                      <th className="text-right">Expected ending</th>
                      <th className="text-right">Actual ending</th>
                      <th className="text-right">Variance</th>
                      <th className="pr-4">Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {group.rows.map((row) => (
                      <tr className="border-t" key={`${row.station_id}-${row.product}`}>
                        <td className="py-2 pl-4 font-medium">{row.product}</td>
                        <td className="text-right">{row.opening_liters.toFixed(3)}</td>
                        <td className="text-right">{row.delivered_liters.toFixed(3)}</td>
                        <td className="text-right">{row.meter_liters_out.toFixed(3)}</td>
                        <td className="text-right">{row.expected_ending_liters.toFixed(3)}</td>
                        <td className="text-right">{row.latest_actual_ending_liters.toFixed(3)}</td>
                        <td className="text-right">{row.variance_liters.toFixed(3)} ({fuelVarianceLabel(row.variance_liters)})</td>
                        <td className="pr-4">{row.baseline_status}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          ))}
          {!groupedSummaryRows.length ? <p className="text-sm text-slate-500">No fuel inventory rows for this filter range.</p> : null}
        </CardContent>
      </Card>

      <SimpleModal
        description="Record a supplier fuel drop for the selected station and product."
        onClose={() => {
          if (!deliverySaving) {
            setDeliveryModalOpen(false);
            setDeliveryError(null);
          }
        }}
        open={deliveryModalOpen}
        title="Record fuel delivery"
      >
        <form className="space-y-3" onSubmit={handleSubmitDelivery}>
          <select className="w-full rounded-md border px-3 py-2 text-sm" value={deliveryForm.station_id} onChange={(e) => setDeliveryForm((prev) => ({ ...prev, station_id: e.target.value }))}>
            <option value="">Select station</option>
            {(result?.stations ?? []).map((station) => (
              <option key={station.id} value={station.id}>
                {station.name}
              </option>
            ))}
          </select>
          <select className="w-full rounded-md border px-3 py-2 text-sm" value={deliveryForm.product_code} onChange={(e) => setDeliveryForm((prev) => ({ ...prev, product_code: e.target.value }))}>
            <option>DIESEL</option>
            <option>SPECIAL</option>
            <option>UNLEADED</option>
          </select>
          <Input placeholder="Tank id (optional)" value={deliveryForm.tank_id} onChange={(e) => setDeliveryForm((prev) => ({ ...prev, tank_id: e.target.value }))} />
          <Input type="date" value={deliveryForm.delivery_date} onChange={(e) => setDeliveryForm((prev) => ({ ...prev, delivery_date: e.target.value }))} />
          <Input placeholder="Supplier" value={deliveryForm.supplier_name} onChange={(e) => setDeliveryForm((prev) => ({ ...prev, supplier_name: e.target.value }))} />
          <Input placeholder="Invoice #" value={deliveryForm.invoice_number} onChange={(e) => setDeliveryForm((prev) => ({ ...prev, invoice_number: e.target.value }))} />
          <Input placeholder="Delivery reference" value={deliveryForm.delivery_reference} onChange={(e) => setDeliveryForm((prev) => ({ ...prev, delivery_reference: e.target.value }))} />
          <Input type="number" step="0.001" placeholder="Liters" value={deliveryForm.liters} onChange={(e) => setDeliveryForm((prev) => ({ ...prev, liters: e.target.value }))} />
          <Input type="number" step="0.01" placeholder="Unit cost" value={deliveryForm.unit_cost} onChange={(e) => setDeliveryForm((prev) => ({ ...prev, unit_cost: e.target.value }))} />
          <Textarea placeholder="Notes" value={deliveryForm.notes} onChange={(e) => setDeliveryForm((prev) => ({ ...prev, notes: e.target.value }))} />
          {deliveryError ? <p className="text-sm text-red-700">{deliveryError}</p> : null}
          <div className="flex justify-end gap-2">
            <Button
              disabled={deliverySaving}
              onClick={() => {
                setDeliveryModalOpen(false);
                setDeliveryError(null);
              }}
              type="button"
              variant="outline"
            >
              Cancel
            </Button>
            <Button disabled={deliverySaving} type="submit">
              {deliverySaving ? "Saving..." : "Record delivery"}
            </Button>
          </div>
        </form>
      </SimpleModal>

      {loading ? <p className="text-sm text-slate-500">Loading fuel inventory...</p> : null}
    </div>
  );
}
