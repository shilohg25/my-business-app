"use client";

import { type FormEvent, useEffect, useMemo, useState } from "react";
import { Badge } from "@/components/ui/badge";
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
import { formatLiters, formatVariance } from "@/lib/utils/format";
import { areFiltersDefault, getCurrentMonthDateRange } from "@/lib/utils/filters";

const fuelProducts = ["DIESEL", "SPECIAL", "UNLEADED"] as const;
type FuelProduct = (typeof fuelProducts)[number];

function toNum(value: string) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function fuelVarianceLabel(value: number, baselineStatus: string) {
  if (baselineStatus === "missing") return "Missing baseline";
  if (Math.abs(value) <= 0.001) return "Balanced";
  if (value > 0) return "Fuel over";
  return "Fuel shortage";
}

function statusBadgeClass(status: string) {
  if (status === "Fuel shortage") return "border-amber-200 bg-amber-50 text-amber-800";
  if (status === "Fuel over") return "border-blue-200 bg-blue-50 text-blue-800";
  if (status === "Missing baseline") return "border-slate-300 bg-slate-100 text-slate-700";
  return "border-emerald-200 bg-emerald-50 text-emerald-700";
}

function stationAggregateStatus(variance: number, hasMissingBaseline: boolean) {
  if (hasMissingBaseline) return "Missing baseline";
  if (Math.abs(variance) <= 0.001) return "Balanced";
  return variance > 0 ? "Fuel over" : "Fuel shortage";
}

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
    const rows = result?.summaryRows ?? [];
    const grouped = new Map<string, { stationId: string; stationName: string; rows: typeof rows }>();
    rows.forEach((row) => {
      const existing = grouped.get(row.station_id);
      if (existing) {
        existing.rows.push(row);
        return;
      }
      grouped.set(row.station_id, {
        stationId: row.station_id,
        stationName: row.station_name ?? "Unknown station",
        rows: [row]
      });
    });

    return Array.from(grouped.values())
      .map((group) => ({
        ...group,
        rows: [...group.rows].sort((a, b) => fuelProducts.indexOf(a.product as FuelProduct) - fuelProducts.indexOf(b.product as FuelProduct))
      }))
      .sort((a, b) => a.stationName.localeCompare(b.stationName));
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

    if (!deliveryForm.station_id) {
      setDeliveryError("Unable to record fuel delivery: Station is required");
      return;
    }
    if (!deliveryForm.product_code) {
      setDeliveryError("Unable to record fuel delivery: Product is required");
      return;
    }
    if (!deliveryForm.delivery_date) {
      setDeliveryError("Unable to record fuel delivery: Delivery date is required");
      return;
    }
    if (toNum(deliveryForm.liters) <= 0) {
      setDeliveryError("Unable to record fuel delivery: Liters must be greater than zero");
      return;
    }

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
      setMessage("Fuel delivery recorded.");
      setDeliveryModalOpen(false);
      setDeliveryForm({
        station_id: result?.stations[0]?.id ?? "",
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
      await reload();
    } catch (nextError) {
      const errorMessage = nextError instanceof Error ? nextError.message : "Unknown error";
      setDeliveryError(`Unable to record fuel delivery: ${errorMessage}`);
    } finally {
      setDeliverySaving(false);
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-xl font-semibold text-slate-900">Fuel Inventory</h2>
          <p className="text-sm text-slate-500">Track opening balances, deliveries, meter outflow, and variance by station.</p>
        </div>
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
            <table className="w-full border-separate border-spacing-y-1 text-sm">
              <thead className="text-left text-slate-500">
                <tr>
                  <th className="py-2 pr-4">Station</th>
                  <th className="pr-4">Status</th>
                  <th className="pr-4">Baseline at</th>
                  <th className="pr-4 text-right">Diesel opening</th>
                  <th className="pr-4 text-right">Special opening</th>
                  <th className="pr-4 text-right">Unleaded opening</th>
                  <th className="min-w-32">Action</th>
                </tr>
              </thead>
              <tbody>
                {baselinePanelRows.map((row) => (
                  <tr className="rounded border bg-white" key={row.station.id}>
                    <td className="py-2 pr-4 font-medium">{row.station.name}</td>
                    <td className="pr-4 capitalize">{row.status}</td>
                    <td className="pr-4">{row.baseline?.baseline_at ? new Date(row.baseline.baseline_at).toLocaleString() : "-"}</td>
                    <td className="pr-4 text-right tabular-nums">{formatLiters(row.diesel)}</td>
                    <td className="pr-4 text-right tabular-nums">{formatLiters(row.special)}</td>
                    <td className="pr-4 text-right tabular-nums">{formatLiters(row.unleaded)}</td>
                    <td>
                      <span className="text-slate-700">
                        {row.status === "missing" ? "Create baseline" : row.status === "draft" ? "Continue draft" : "View baseline"}
                      </span>
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
            <CardTitle>{formatVariance(result?.totals?.dieselVariance ?? 0)}</CardTitle>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader>
            <CardDescription>Special variance</CardDescription>
            <CardTitle>{formatVariance(result?.totals?.specialVariance ?? 0)}</CardTitle>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader>
            <CardDescription>Unleaded variance</CardDescription>
            <CardTitle>{formatVariance(result?.totals?.unleadedVariance ?? 0)}</CardTitle>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader>
            <CardDescription>Total meter liters out</CardDescription>
            <CardTitle>{formatLiters(result?.totals?.totalMeterLitersOut ?? 0)}</CardTitle>
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
          {result && !result.stations.length ? <p className="text-sm text-slate-500">No stations found. Create stations before setting up fuel inventory.</p> : null}
          {groupedSummaryRows.map((group) => {
            const rowByProduct = new Map(group.rows.map((row) => [row.product, row]));
            const rowsForDisplay = fuelProducts.map((product) => rowByProduct.get(product)).filter(Boolean);
            const hasMissingBaseline = rowsForDisplay.some((row) => row?.baseline_status === "missing");
            const totalExpected = rowsForDisplay.reduce((sum, row) => sum + (row?.expected_ending_liters ?? 0), 0);
            const withActuals = rowsForDisplay.filter((row) => typeof row?.latest_actual_ending_liters === "number");
            const totalActual = withActuals.reduce((sum, row) => sum + (row?.latest_actual_ending_liters ?? 0), 0);
            const totalVariance = rowsForDisplay.reduce((sum, row) => sum + (row?.variance_liters ?? 0), 0);
            const aggregate = stationAggregateStatus(totalVariance, hasMissingBaseline);

            return (
              <section className="rounded-lg border" key={group.stationId}>
                <div className="space-y-3 border-b bg-slate-50 px-4 py-3">
                  <div className="flex flex-wrap items-center gap-2">
                    <h3 className="text-sm font-semibold text-slate-900">{group.stationName}</h3>
                    <Badge className={statusBadgeClass(aggregate)}>{aggregate}</Badge>
                  </div>
                  <div className="grid gap-2 text-xs text-slate-600 sm:grid-cols-2 lg:grid-cols-4">
                    <div>Baseline: {hasMissingBaseline ? "Missing" : "Ready"}</div>
                    <div className="tabular-nums">Expected ending: {formatLiters(totalExpected)} L</div>
                    <div className="tabular-nums">Latest actual: {withActuals.length ? `${formatLiters(totalActual)} L` : "-"}</div>
                    <div className="tabular-nums">Variance: {formatVariance(totalVariance)} L</div>
                  </div>
                </div>
                {hasMissingBaseline ? <p className="border-b px-4 py-2 text-xs text-amber-700">Opening baseline has not been created yet.</p> : null}
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead className="text-left text-slate-500">
                      <tr>
                        <th className="py-2 pl-4">Product</th>
                        <th className="text-right">Opening</th>
                        <th className="text-right">Delivered</th>
                        <th className="text-right">Meter out</th>
                        <th className="text-right">Expected ending</th>
                        <th className="text-right">Latest actual</th>
                        <th className="text-right">Variance</th>
                        <th className="pr-4">Status</th>
                      </tr>
                    </thead>
                    <tbody>
                      {!rowsForDisplay.length ? (
                        <tr>
                          <td className="px-4 py-3 text-sm text-slate-500" colSpan={8}>
                            No fuel inventory rows found for this station.
                          </td>
                        </tr>
                      ) : (
                        fuelProducts.map((product) => {
                          const row = rowByProduct.get(product);
                          const variance = row?.variance_liters ?? 0;
                          const status = fuelVarianceLabel(variance, row?.baseline_status ?? "missing");
                          return (
                            <tr className="border-t" key={`${group.stationId}-${product}`}>
                              <td className="py-2 pl-4 font-medium">{product}</td>
                              <td className="text-right tabular-nums">{formatLiters(row?.opening_liters ?? 0)}</td>
                              <td className="text-right tabular-nums">{formatLiters(row?.delivered_liters ?? 0)}</td>
                              <td className="text-right tabular-nums">{formatLiters(row?.meter_liters_out ?? 0)}</td>
                              <td className="text-right tabular-nums">{formatLiters(row?.expected_ending_liters ?? 0)}</td>
                              <td className="text-right tabular-nums">{row ? formatLiters(row.latest_actual_ending_liters) : "-"}</td>
                              <td className="text-right tabular-nums">{formatVariance(variance)}</td>
                              <td className="pr-4">
                                <Badge className={statusBadgeClass(status)}>{status}</Badge>
                              </td>
                            </tr>
                          );
                        })
                      )}
                    </tbody>
                  </table>
                </div>
              </section>
            );
          })}
          {result?.stations.length && !groupedSummaryRows.length ? <p className="text-sm text-slate-500">No fuel inventory rows for this filter range.</p> : null}
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
        title="Record Fuel Delivery"
      >
        <form className="space-y-3" onSubmit={handleSubmitDelivery}>
          <label className="block space-y-1 text-sm">
            <span className="text-slate-600">Station</span>
            <select className="w-full rounded-md border px-3 py-2 text-sm" value={deliveryForm.station_id} onChange={(e) => setDeliveryForm((prev) => ({ ...prev, station_id: e.target.value }))}>
              <option value="">Select station</option>
              {(result?.stations ?? []).map((station) => (
                <option key={station.id} value={station.id}>
                  {station.name}
                </option>
              ))}
            </select>
          </label>
          <label className="block space-y-1 text-sm">
            <span className="text-slate-600">Product</span>
            <select className="w-full rounded-md border px-3 py-2 text-sm" value={deliveryForm.product_code} onChange={(e) => setDeliveryForm((prev) => ({ ...prev, product_code: e.target.value }))}>
              <option>DIESEL</option>
              <option>SPECIAL</option>
              <option>UNLEADED</option>
            </select>
          </label>
          <label className="block space-y-1 text-sm">
            <span className="text-slate-600">Delivery date</span>
            <Input type="date" value={deliveryForm.delivery_date} onChange={(e) => setDeliveryForm((prev) => ({ ...prev, delivery_date: e.target.value }))} />
          </label>
          <label className="block space-y-1 text-sm">
            <span className="text-slate-600">Liters received</span>
            <Input type="number" step="0.001" placeholder="Liters" value={deliveryForm.liters} onChange={(e) => setDeliveryForm((prev) => ({ ...prev, liters: e.target.value }))} />
          </label>
          <label className="block space-y-1 text-sm">
            <span className="text-slate-600">Supplier</span>
            <Input placeholder="Supplier" value={deliveryForm.supplier_name} onChange={(e) => setDeliveryForm((prev) => ({ ...prev, supplier_name: e.target.value }))} />
          </label>
          <label className="block space-y-1 text-sm">
            <span className="text-slate-600">Invoice number</span>
            <Input placeholder="Invoice #" value={deliveryForm.invoice_number} onChange={(e) => setDeliveryForm((prev) => ({ ...prev, invoice_number: e.target.value }))} />
          </label>
          <label className="block space-y-1 text-sm">
            <span className="text-slate-600">Delivery reference</span>
            <Input placeholder="Delivery reference" value={deliveryForm.delivery_reference} onChange={(e) => setDeliveryForm((prev) => ({ ...prev, delivery_reference: e.target.value }))} />
          </label>
          <label className="block space-y-1 text-sm">
            <span className="text-slate-600">Unit cost</span>
            <Input type="number" step="0.01" placeholder="Unit cost" value={deliveryForm.unit_cost} onChange={(e) => setDeliveryForm((prev) => ({ ...prev, unit_cost: e.target.value }))} />
          </label>
          <label className="block space-y-1 text-sm">
            <span className="text-slate-600">Notes</span>
            <Textarea placeholder="Notes" value={deliveryForm.notes} onChange={(e) => setDeliveryForm((prev) => ({ ...prev, notes: e.target.value }))} />
          </label>
          <Input placeholder="Tank id (optional)" value={deliveryForm.tank_id} onChange={(e) => setDeliveryForm((prev) => ({ ...prev, tank_id: e.target.value }))} />
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
