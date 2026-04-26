import { buildStationFuelInventorySummary, normalizeFuelProductCode } from "@/lib/analytics/fuel-inventory";
import { canUseLiveData } from "@/lib/data/client";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";

function asNumber(value: unknown) {
  const parsed = Number(value ?? Number.NaN);
  return Number.isFinite(parsed) ? parsed : 0;
}

function todayIso() {
  return new Date().toISOString().slice(0, 10);
}

function monthStartIso() {
  const now = new Date();
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1)).toISOString().slice(0, 10);
}

export interface FetchFuelInventoryDashboardOptions {
  stationId?: string | null;
  product?: string | null;
  startDate?: string;
  endDate?: string;
}

export async function fetchFuelInventoryBaselines() {
  if (!canUseLiveData()) return { baselines: [], baselineProducts: [], meterBaselines: [] };

  const supabase = createSupabaseBrowserClient();
  const [baselineResult, productResult, meterResult] = await Promise.all([
    supabase.from("fuel_station_fuel_baselines").select("id, station_id, baseline_at, status, notes, finalized_by, finalized_at, created_by, created_at").order("baseline_at", { ascending: false }),
    supabase.from("fuel_station_fuel_baseline_products").select("id, baseline_id, station_id, product_id, product_code_snapshot, opening_liters, tank_id, notes, created_at"),
    supabase.from("fuel_station_meter_baselines").select("id, baseline_id, station_id, pump_id, pump_label_snapshot, product_id, product_code_snapshot, nozzle_label, opening_meter_reading, notes, created_at")
  ]);

  const errors = [baselineResult.error, productResult.error, meterResult.error].filter(Boolean);
  if (errors.length) throw new Error(errors[0]?.message ?? "Unable to fetch fuel baselines");

  return {
    baselines: baselineResult.data ?? [],
    baselineProducts: productResult.data ?? [],
    meterBaselines: meterResult.data ?? []
  };
}

export async function fetchFuelInventoryDashboard(options: FetchFuelInventoryDashboardOptions = {}) {
  if (!canUseLiveData()) {
    return {
      stations: [],
      products: [],
      tanks: [],
      baselines: [],
      baselineProducts: [],
      meterBaselines: [],
      deliveries: [],
      readings: [],
      meterReadings: [],
      summaryRows: [],
      allStationsSummary: []
    };
  }

  const supabase = createSupabaseBrowserClient();
  const startDate = options.startDate ?? monthStartIso();
  const endDate = options.endDate ?? todayIso();

  const stationsResult = await supabase.from("fuel_stations").select("id, name, is_active").eq("is_active", true).order("name", { ascending: true });
  if (stationsResult.error) throw new Error(stationsResult.error.message);

  const stations = (stationsResult.data ?? []) as Array<{ id: string; name: string; is_active: boolean }>;
  const stationIds = stations.map((row) => row.id);
  if (!stationIds.length) {
    return {
      stations: [],
      products: [],
      tanks: [],
      baselines: [],
      baselineProducts: [],
      meterBaselines: [],
      deliveries: [],
      readings: [],
      meterReadings: [],
      summaryRows: [],
      allStationsSummary: []
    };
  }

  const [productsResult, tanksResult, baselineData, deliveriesResult, readingsResult, shiftReportsResult] = await Promise.all([
    supabase.from("fuel_products").select("id, code, name, is_active").eq("is_fuel", true).eq("is_active", true).order("code", { ascending: true }),
    supabase.from("fuel_tanks").select("id, station_id, product_id, product_code_snapshot, tank_label, is_active").in("station_id", stationIds).eq("is_active", true),
    fetchFuelInventoryBaselines(),
    supabase.from("fuel_deliveries").select("id, station_id, tank_id, product_id, product_code_snapshot, delivery_date, liters, invoice_number, delivery_reference, notes").in("station_id", stationIds).gte("delivery_date", startDate).lte("delivery_date", endDate).order("delivery_date", { ascending: false }),
    supabase.from("fuel_tank_readings").select("id, station_id, tank_id, product_id, product_code_snapshot, reading_date, opening_liters, received_liters, meter_liters_out, expected_ending_liters, actual_ending_liters, variance_liters, source, notes").in("station_id", stationIds).gte("reading_date", startDate).lte("reading_date", endDate).order("reading_date", { ascending: false }),
    supabase.from("fuel_shift_reports").select("station_id, report_date, fuel_meter_readings(product_code_snapshot, liters_sold)").in("station_id", stationIds).gte("report_date", startDate).lte("report_date", endDate)
  ]);

  const errors = [productsResult.error, tanksResult.error, deliveriesResult.error, readingsResult.error, shiftReportsResult.error].filter(Boolean);
  if (errors.length) throw new Error(errors[0]?.message ?? "Unable to fetch fuel inventory dashboard data");

  const meterReadings = ((shiftReportsResult.data ?? []) as Array<{ station_id: string; fuel_meter_readings: Array<{ product_code_snapshot: string; liters_sold: number | string | null }> | null }>).flatMap(
    (report) => (report.fuel_meter_readings ?? []).map((row) => ({ station_id: report.station_id, product_code_snapshot: row.product_code_snapshot, liters_sold: row.liters_sold }))
  );

  const summary = buildStationFuelInventorySummary({
    stations: stations.map((row) => ({ id: row.id, name: row.name })),
    baselines: baselineData.baselines as Array<{ id: string; station_id: string; status: string; baseline_at: string }>,
    baselineProducts: baselineData.baselineProducts as Array<{ baseline_id: string; station_id: string; product_code_snapshot: string; opening_liters: number | string | null }>,
    deliveries: (deliveriesResult.data ?? []) as Array<{ station_id: string; product_code_snapshot: string; liters: number | string | null }>,
    tankReadings: (readingsResult.data ?? []) as Array<{ station_id: string; product_code_snapshot: string; actual_ending_liters: number | string | null; reading_date: string }>,
    meterReadings
  });

  const filteredRows = summary.rows.filter((row) => {
    const stationMatch = !options.stationId || row.station_id === options.stationId;
    const productMatch = !options.product || options.product === "ALL" || row.product === normalizeFuelProductCode(options.product);
    return stationMatch && productMatch;
  });

  return {
    stations,
    products: productsResult.data ?? [],
    tanks: tanksResult.data ?? [],
    baselines: baselineData.baselines,
    baselineProducts: baselineData.baselineProducts,
    meterBaselines: baselineData.meterBaselines,
    deliveries: deliveriesResult.data ?? [],
    readings: readingsResult.data ?? [],
    meterReadings,
    summaryRows: filteredRows,
    allStationsSummary: summary.allStationsSummary,
    totals: {
      totalMeterLitersOut: filteredRows.reduce((sum, row) => sum + asNumber(row.meter_liters_out), 0),
      dieselVariance: filteredRows.filter((row) => row.product === "DIESEL").reduce((sum, row) => sum + asNumber(row.variance_liters), 0),
      specialVariance: filteredRows.filter((row) => row.product === "SPECIAL").reduce((sum, row) => sum + asNumber(row.variance_liters), 0),
      unleadedVariance: filteredRows.filter((row) => row.product === "UNLEADED").reduce((sum, row) => sum + asNumber(row.variance_liters), 0),
      missingBaselineStations: stations.filter((station) => !summary.rows.some((row) => row.station_id === station.id && row.baseline_status !== "missing")).length,
      shortageAlerts: filteredRows.filter((row) => row.variance_liters < 0).length
    }
  };
}

export async function createFuelOpeningBaseline(payload: {
  station_id: string;
  baseline_at: string;
  notes?: string | null;
  products: Array<{ product_code: string; opening_liters: number; tank_label?: string | null; notes?: string | null }>;
  meters: Array<{ pump_id?: string | null; pump_label: string; product_code: string; nozzle_label?: string | null; opening_meter_reading: number; notes?: string | null }>;
  allow_replace?: boolean;
  allow_partial?: boolean;
}) {
  if (!canUseLiveData()) throw new Error("Supabase is not configured");
  const supabase = createSupabaseBrowserClient();
  const { data, error } = await supabase.rpc("fuel_create_fuel_opening_baseline", { payload });
  if (error) throw error;
  return data as string;
}

export async function finalizeFuelOpeningBaseline(baselineId: string) {
  if (!canUseLiveData()) throw new Error("Supabase is not configured");
  const supabase = createSupabaseBrowserClient();
  const { data, error } = await supabase.rpc("fuel_finalize_fuel_opening_baseline", { baseline_id: baselineId });
  if (error) throw error;
  return data as string;
}

export async function voidFuelOpeningBaseline(baselineId: string, reason: string) {
  if (!canUseLiveData()) throw new Error("Supabase is not configured");
  const supabase = createSupabaseBrowserClient();
  const { data, error } = await supabase.rpc("fuel_void_fuel_opening_baseline", { baseline_id: baselineId, reason });
  if (error) throw error;
  return data as string;
}

export async function recordFuelDelivery(payload: {
  station_id: string;
  tank_id?: string | null;
  product_code: string;
  supplier_name?: string | null;
  delivery_date: string;
  invoice_number?: string | null;
  delivery_reference?: string | null;
  liters: number;
  unit_cost?: number | null;
  notes?: string | null;
}) {
  if (!canUseLiveData()) throw new Error("Supabase is not configured");
  if (!payload.station_id) throw new Error("Station is required");
  if (!payload.product_code) throw new Error("Product is required");
  const supabase = createSupabaseBrowserClient();
  const { data, error } = await supabase.rpc("fuel_record_fuel_delivery", { payload });
  if (error) throw error;
  return data as string;
}

export async function recordTankReading(payload: {
  station_id: string;
  tank_id?: string | null;
  product_code: string;
  reading_date: string;
  opening_liters: number;
  actual_ending_liters: number;
  notes?: string | null;
}) {
  if (!canUseLiveData()) throw new Error("Supabase is not configured");
  if (!payload.station_id) throw new Error("Station is required");
  if (!payload.product_code) throw new Error("Product is required");
  const supabase = createSupabaseBrowserClient();
  const { data, error } = await supabase.rpc("fuel_record_tank_reading", { payload });
  if (error) throw error;
  return data as string;
}

export { normalizeFuelProductCode };
