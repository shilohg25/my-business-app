export type FuelProductCode = "DIESEL" | "SPECIAL" | "UNLEADED" | "OTHER";
export type FuelBaselineStatus = "missing" | "draft" | "finalized" | "voided";

export interface StationFuelInventorySummaryRow {
  station_id: string;
  station_name: string | null;
  product: FuelProductCode;
  opening_liters: number;
  delivered_liters: number;
  meter_liters_out: number;
  expected_ending_liters: number;
  latest_actual_ending_liters: number;
  variance_liters: number;
  baseline_status: FuelBaselineStatus;
}

export interface BuildStationFuelInventorySummaryInput {
  stations: Array<{ id: string; name: string | null }>;
  baselines: Array<{ id: string; station_id: string; status: string; baseline_at: string }>;
  baselineProducts: Array<{ baseline_id: string; station_id: string; product_code_snapshot: string; opening_liters: number | string | null }>;
  deliveries: Array<{ station_id: string; product_code_snapshot: string; liters: number | string | null }>;
  tankReadings: Array<{ station_id: string; product_code_snapshot: string; actual_ending_liters: number | string | null; reading_date: string }>;
  meterReadings: Array<{ station_id: string; product_code_snapshot: string; liters_sold: number | string | null }>;
}

function asNumber(value: number | string | null | undefined) {
  const parsed = Number(value ?? Number.NaN);
  return Number.isFinite(parsed) ? parsed : 0;
}

export function normalizeFuelProductCode(code: string | null | undefined): FuelProductCode {
  const normalized = (code ?? "").trim().toUpperCase();
  if (normalized === "ADO" || normalized === "DIESEL") return "DIESEL";
  if (normalized === "SPU" || normalized === "SPECIAL") return "SPECIAL";
  if (normalized === "ULG" || normalized === "UNLEADED" || normalized === "REGULAR") return "UNLEADED";
  return "OTHER";
}

export function computeFuelExpectedEnding(opening: number, deliveries: number, meterOut: number) {
  return opening + deliveries - meterOut;
}

export function computeFuelVariance(actual: number, expected: number) {
  return actual - expected;
}

export function getBaselineStatusForStation(
  stationId: string,
  baselines: Array<{ station_id: string; status: string; baseline_at: string }>
): FuelBaselineStatus {
  const stationBaselines = baselines.filter((row) => row.station_id === stationId);
  if (!stationBaselines.length) return "missing";

  const rank = new Map<string, number>([
    ["voided", 1],
    ["draft", 2],
    ["finalized", 3]
  ]);

  const latest = stationBaselines
    .slice()
    .sort((a, b) => {
      const aRank = rank.get(a.status) ?? 0;
      const bRank = rank.get(b.status) ?? 0;
      if (aRank !== bRank) return bRank - aRank;
      return (b.baseline_at ?? "").localeCompare(a.baseline_at ?? "");
    })[0];

  if (latest.status === "finalized") return "finalized";
  if (latest.status === "draft") return "draft";
  if (latest.status === "voided") return "voided";
  return "missing";
}

export function buildStationFuelInventorySummary(input: BuildStationFuelInventorySummaryInput) {
  const targetProducts: FuelProductCode[] = ["DIESEL", "SPECIAL", "UNLEADED"];
  const stationById = new Map(input.stations.map((row) => [row.id, row.name]));

  const latestBaselineByStation = new Map<string, { id: string; status: string; baseline_at: string }>();
  input.baselines.forEach((row) => {
    const existing = latestBaselineByStation.get(row.station_id);
    if (!existing || (row.baseline_at ?? "") > (existing.baseline_at ?? "")) {
      latestBaselineByStation.set(row.station_id, row);
    }
  });

  const openingByStationProduct = new Map<string, number>();
  input.baselineProducts.forEach((row) => {
    const product = normalizeFuelProductCode(row.product_code_snapshot);
    if (product === "OTHER") return;
    const baseline = latestBaselineByStation.get(row.station_id);
    if (!baseline || baseline.id !== row.baseline_id) return;
    openingByStationProduct.set(`${row.station_id}::${product}`, asNumber(row.opening_liters));
  });

  const deliveriesByStationProduct = new Map<string, number>();
  input.deliveries.forEach((row) => {
    const product = normalizeFuelProductCode(row.product_code_snapshot);
    if (product === "OTHER") return;
    const key = `${row.station_id}::${product}`;
    deliveriesByStationProduct.set(key, (deliveriesByStationProduct.get(key) ?? 0) + asNumber(row.liters));
  });

  const meterByStationProduct = new Map<string, number>();
  input.meterReadings.forEach((row) => {
    const product = normalizeFuelProductCode(row.product_code_snapshot);
    if (product === "OTHER") return;
    const key = `${row.station_id}::${product}`;
    meterByStationProduct.set(key, (meterByStationProduct.get(key) ?? 0) + asNumber(row.liters_sold));
  });

  const actualByStationProduct = new Map<string, { reading_date: string; actual: number }>();
  input.tankReadings.forEach((row) => {
    const product = normalizeFuelProductCode(row.product_code_snapshot);
    if (product === "OTHER") return;
    const key = `${row.station_id}::${product}`;
    const current = actualByStationProduct.get(key);
    if (!current || row.reading_date > current.reading_date) {
      actualByStationProduct.set(key, { reading_date: row.reading_date, actual: asNumber(row.actual_ending_liters) });
    }
  });

  const rows: StationFuelInventorySummaryRow[] = [];
  input.stations.forEach((station) => {
    const baselineStatus = getBaselineStatusForStation(station.id, input.baselines);
    targetProducts.forEach((product) => {
      const key = `${station.id}::${product}`;
      const opening = openingByStationProduct.get(key) ?? 0;
      const delivered = deliveriesByStationProduct.get(key) ?? 0;
      const meterOut = meterByStationProduct.get(key) ?? 0;
      const expected = computeFuelExpectedEnding(opening, delivered, meterOut);
      const latestActual = actualByStationProduct.get(key)?.actual ?? opening;
      const variance = computeFuelVariance(latestActual, expected);
      rows.push({
        station_id: station.id,
        station_name: stationById.get(station.id) ?? null,
        product,
        opening_liters: opening,
        delivered_liters: delivered,
        meter_liters_out: meterOut,
        expected_ending_liters: expected,
        latest_actual_ending_liters: latestActual,
        variance_liters: variance,
        baseline_status: baselineStatus
      });
    });
  });

  const allStationsSummary = targetProducts.map((product) => {
    const grouped = rows.filter((row) => row.product === product);
    return {
      product,
      opening_liters: grouped.reduce((sum, row) => sum + row.opening_liters, 0),
      delivered_liters: grouped.reduce((sum, row) => sum + row.delivered_liters, 0),
      meter_liters_out: grouped.reduce((sum, row) => sum + row.meter_liters_out, 0),
      expected_ending_liters: grouped.reduce((sum, row) => sum + row.expected_ending_liters, 0),
      latest_actual_ending_liters: grouped.reduce((sum, row) => sum + row.latest_actual_ending_liters, 0),
      variance_liters: grouped.reduce((sum, row) => sum + row.variance_liters, 0)
    };
  });

  return {
    rows,
    allStationsSummary,
    stationSummary: input.stations.map((station) => ({
      station_id: station.id,
      station_name: station.name,
      baseline_status: getBaselineStatusForStation(station.id, input.baselines),
      products: rows.filter((row) => row.station_id === station.id)
    }))
  };
}
