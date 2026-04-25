import { canUseLiveData } from "@/lib/data/client";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";

function asNumber(value: unknown) {
  const parsed = Number(value ?? Number.NaN);
  return Number.isFinite(parsed) ? parsed : 0;
}

export function normalizeFuelProductCode(code: string | null | undefined) {
  const normalized = (code ?? "").trim().toUpperCase();
  if (normalized === "ADO" || normalized === "DIESEL") return "DIESEL";
  if (normalized === "SPU" || normalized === "SPECIAL") return "SPECIAL";
  if (normalized === "ULG" || normalized === "UNLEADED") return "UNLEADED";
  return "OTHER";
}

function monthStart() {
  const now = new Date();
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1)).toISOString().slice(0, 10);
}

export interface FuelInventoryResult {
  summary: {
    dieselVariance: number;
    specialVariance: number;
    unleadedVariance: number;
    deliveriesThisMonth: number;
    grossLitersOutThisMonth: number;
  };
  productInventory: Array<{
    station_id: string;
    station_name: string | null;
    product: string;
    delivered_liters: number;
    gross_liters_out: number;
    latest_actual_ending: number;
    latest_expected_ending: number;
    variance_liters: number;
  }>;
  deliveries: Array<{
    id: string;
    delivery_date: string;
    station_name: string | null;
    product_code_snapshot: string;
    supplier_name: string | null;
    invoice_number: string | null;
    delivery_reference: string | null;
    liters: number | string | null;
    unit_cost: number | string | null;
    total_cost: number | string | null;
  }>;
  readings: Array<{
    id: string;
    reading_date: string;
    station_name: string | null;
    product_code_snapshot: string;
    opening_liters: number | string | null;
    received_liters: number | string | null;
    meter_liters_out: number | string | null;
    expected_ending_liters: number | string | null;
    actual_ending_liters: number | string | null;
    variance_liters: number | string | null;
    notes: string | null;
  }>;
  stations: Array<{ id: string; name: string }>;
}

export function buildFuelInventorySummary(input: {
  deliveries: Array<{ station_id: string; station_name: string | null; product_code_snapshot: string; liters: number | string | null }>;
  meterReports: Array<{ station_id: string; fuel_meter_readings: Array<{ product_code_snapshot: string; liters_sold: number | string | null }> | null }>;
  readings: Array<{
    station_id: string;
    station_name: string | null;
    product_code_snapshot: string;
    actual_ending_liters: number | string | null;
    expected_ending_liters: number | string | null;
    variance_liters: number | string | null;
  }>;
}) {
  const aggregate = new Map<string, FuelInventoryResult["productInventory"][number]>();

  input.deliveries.forEach((row) => {
    const product = normalizeFuelProductCode(row.product_code_snapshot);
    const key = `${row.station_id}::${product}`;
    const existing = aggregate.get(key) ?? {
      station_id: row.station_id,
      station_name: row.station_name,
      product,
      delivered_liters: 0,
      gross_liters_out: 0,
      latest_actual_ending: 0,
      latest_expected_ending: 0,
      variance_liters: 0
    };
    existing.delivered_liters += asNumber(row.liters);
    aggregate.set(key, existing);
  });

  input.meterReports.forEach((report) => {
    (report.fuel_meter_readings ?? []).forEach((reading) => {
      const product = normalizeFuelProductCode(reading.product_code_snapshot);
      const key = `${report.station_id}::${product}`;
      const existing = aggregate.get(key) ?? {
        station_id: report.station_id,
        station_name: null,
        product,
        delivered_liters: 0,
        gross_liters_out: 0,
        latest_actual_ending: 0,
        latest_expected_ending: 0,
        variance_liters: 0
      };
      existing.gross_liters_out += asNumber(reading.liters_sold);
      aggregate.set(key, existing);
    });
  });

  input.readings.forEach((row) => {
    const product = normalizeFuelProductCode(row.product_code_snapshot);
    const key = `${row.station_id}::${product}`;
    const existing = aggregate.get(key) ?? {
      station_id: row.station_id,
      station_name: row.station_name,
      product,
      delivered_liters: 0,
      gross_liters_out: 0,
      latest_actual_ending: 0,
      latest_expected_ending: 0,
      variance_liters: 0
    };
    existing.latest_actual_ending = asNumber(row.actual_ending_liters);
    existing.latest_expected_ending = asNumber(row.expected_ending_liters);
    existing.variance_liters = asNumber(row.variance_liters);
    aggregate.set(key, existing);
  });

  return Array.from(aggregate.values());
}

export async function fetchFuelInventoryData(): Promise<FuelInventoryResult> {
  if (!canUseLiveData()) {
    return {
      summary: { dieselVariance: 0, specialVariance: 0, unleadedVariance: 0, deliveriesThisMonth: 0, grossLitersOutThisMonth: 0 },
      productInventory: [],
      deliveries: [],
      readings: [],
      stations: []
    };
  }

  const supabase = createSupabaseBrowserClient();
  const start = monthStart();

  const [deliveriesResult, readingsResult, stationsResult, meterResult] = await Promise.all([
    supabase
      .from("fuel_deliveries")
      .select("id, station_id, product_code_snapshot, supplier_id, delivery_date, invoice_number, delivery_reference, liters, unit_cost, total_cost")
      .order("delivery_date", { ascending: false })
      .limit(100),
    supabase
      .from("fuel_tank_readings")
      .select("id, station_id, product_code_snapshot, reading_date, opening_liters, received_liters, meter_liters_out, expected_ending_liters, actual_ending_liters, variance_liters, notes")
      .order("reading_date", { ascending: false })
      .limit(100),
    supabase.from("fuel_stations").select("id, name").order("name", { ascending: true }),
    supabase
      .from("fuel_shift_reports")
      .select("id, report_date, station_id, fuel_meter_readings(product_code_snapshot, liters_sold)")
      .gte("report_date", start)
      .order("report_date", { ascending: false })
  ]);

  const errors = [deliveriesResult.error, readingsResult.error, stationsResult.error, meterResult.error].filter(Boolean);
  if (errors.length) throw new Error(errors[0]?.message ?? "Unable to load fuel inventory data");

  const deliveriesRaw = (deliveriesResult.data ?? []) as Array<{ id: string; station_id: string; product_code_snapshot: string; supplier_id: string | null; delivery_date: string; invoice_number: string | null; delivery_reference: string | null; liters: number | string | null; unit_cost: number | string | null; total_cost: number | string | null }>;
  const readingsRaw = (readingsResult.data ?? []) as Array<{ id: string; station_id: string; product_code_snapshot: string; reading_date: string; opening_liters: number | string | null; received_liters: number | string | null; meter_liters_out: number | string | null; expected_ending_liters: number | string | null; actual_ending_liters: number | string | null; variance_liters: number | string | null; notes: string | null }>;
  const stations = (stationsResult.data ?? []) as Array<{ id: string; name: string }>;
  const stationById = new Map(stations.map((station) => [station.id, station.name]));

  const supplierIds = Array.from(new Set(deliveriesRaw.map((row) => row.supplier_id).filter(Boolean))) as string[];
  const suppliersResult = supplierIds.length
    ? await supabase.from("fuel_suppliers").select("id, name").in("id", supplierIds)
    : { data: [], error: null };
  if (suppliersResult.error) throw new Error(suppliersResult.error.message);
  const supplierById = new Map(((suppliersResult.data ?? []) as Array<{ id: string; name: string | null }>).map((supplier) => [supplier.id, supplier.name]));

  const deliveries = deliveriesRaw.map((row) => ({
    ...row,
    station_name: stationById.get(row.station_id) ?? null,
    supplier_name: row.supplier_id ? supplierById.get(row.supplier_id) ?? null : null
  }));

  const readings = readingsRaw.map((row) => ({
    ...row,
    station_name: stationById.get(row.station_id) ?? null
  }));

  const productInventory = buildFuelInventorySummary({
    deliveries,
    readings,
    meterReports: (meterResult.data ?? []) as Array<{
      station_id: string;
      fuel_meter_readings: Array<{ product_code_snapshot: string; liters_sold: number | string | null }> | null;
    }>
  }).map((row) => ({ ...row, station_name: row.station_name ?? stationById.get(row.station_id) ?? null }));
  const sumVariance = (product: string) => productInventory.filter((row) => row.product === product).reduce((sum, row) => sum + row.variance_liters, 0);

  return {
    summary: {
      dieselVariance: sumVariance("DIESEL"),
      specialVariance: sumVariance("SPECIAL"),
      unleadedVariance: sumVariance("UNLEADED"),
      deliveriesThisMonth: deliveries.filter((row) => row.delivery_date >= start).length,
      grossLitersOutThisMonth: productInventory.reduce((sum, row) => sum + row.gross_liters_out, 0)
    },
    productInventory,
    deliveries,
    readings,
    stations
  };
}
