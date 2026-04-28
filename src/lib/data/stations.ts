import { canUseLiveData } from "@/lib/data/client";
import { fetchCurrentProfile } from "@/lib/data/profile";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";

export interface StationMeterRow {
  id: string;
  station_id: string;
  product_type: "DIESEL" | "SPECIAL" | "UNLEADED";
  meter_label: string;
  display_order: number;
  is_active: boolean;
}

export interface ActiveStationPumpRow {
  pump_id: string;
  station_id: string;
  pump_label: string;
  product_id: string;
  product_code: "DIESEL" | "SPECIAL" | "UNLEADED";
  product_name: string;
  is_active: boolean;
}

export interface StationManagementRow {
  id: string;
  code: string;
  name: string;
  address: string | null;
  phone: string | null;
  is_active: boolean;
  inventory_location_code: string | null;
  fuel_baseline_status: "missing" | "draft" | "finalized" | "voided";
  meters: StationMeterRow[];
}

export interface StationManagementResult {
  role: string | null;
  canCreateStation: boolean;
  canManageMeters: boolean;
  rows: StationManagementRow[];
}

type ProductCode = StationMeterRow["product_type"];

const DEFAULT_PRODUCT_TYPE: ProductCode = "DIESEL";

function parseProductCode(value: string | null | undefined): ProductCode {
  if (value === "DIESEL" || value === "SPECIAL" || value === "UNLEADED") return value;
  return DEFAULT_PRODUCT_TYPE;
}

const productSortOrder: Record<ProductCode, number> = {
  DIESEL: 0,
  SPECIAL: 1,
  UNLEADED: 2
};

function sortPumpsByProductAndLabel<T extends { product_type: ProductCode; meter_label: string }>(rows: T[]) {
  return [...rows].sort((a, b) => {
    const byProduct = productSortOrder[a.product_type] - productSortOrder[b.product_type];
    if (byProduct !== 0) return byProduct;
    return a.meter_label.localeCompare(b.meter_label);
  });
}

export async function fetchStationManagementData(): Promise<StationManagementResult> {
  if (!canUseLiveData()) return { role: null, canCreateStation: false, canManageMeters: false, rows: [] };

  const supabase = createSupabaseBrowserClient();
  const [stationsResult, profile] = await Promise.all([
    supabase
      .from("fuel_stations")
      .select("id, code, name, address, phone, is_active")
      .order("name", { ascending: true }),
    fetchCurrentProfile()
  ]);

  if (stationsResult.error) throw stationsResult.error;

  const stations = (stationsResult.data ?? []) as Array<{ id: string; code: string; name: string; address: string | null; phone: string | null; is_active: boolean }>;
  const role = profile?.role ?? null;
  const canManageMeters = role === "Owner" || role === "Admin";

  if (stations.length === 0) {
    return { role, canCreateStation: role === "Owner", canManageMeters, rows: [] };
  }

  const ids = stations.map((station) => station.id);
  const [locationsResult, baselinesResult, pumpsResult] = await Promise.all([
    supabase.from("fuel_inventory_locations").select("station_id, code").eq("location_type", "station").in("station_id", ids),
    supabase.from("fuel_station_fuel_baselines").select("id, station_id, status, baseline_at").in("station_id", ids),
    canManageMeters ? supabase.from("fuel_pumps").select("id, station_id, pump_label, display_order, is_active").in("station_id", ids) : Promise.resolve({ data: [], error: null })
  ]);

  const baseErrors = [locationsResult.error, baselinesResult.error, pumpsResult.error].filter(Boolean);
  if (baseErrors.length) throw baseErrors[0];

  const pumps = (pumpsResult.data ?? []) as Array<{
    id: string;
    station_id: string;
    pump_label: string;
    display_order: number;
    is_active: boolean;
  }>;

  const pumpIds = pumps.map((pump) => pump.id);
  const assignmentsResult = canManageMeters && pumpIds.length > 0
    ? await supabase
        .from("fuel_pump_product_assignments")
        .select("id, pump_id, product_id, effective_from")
        .eq("is_active", true)
        .is("effective_to", null)
        .in("pump_id", pumpIds)
        .order("effective_from", { ascending: false })
    : { data: [], error: null };

  if (assignmentsResult.error) throw assignmentsResult.error;

  const assignmentRows = (assignmentsResult.data ?? []) as Array<{
    id: string;
    pump_id: string;
    product_id: string;
    effective_from: string;
  }>;

  const latestAssignmentByPump = new Map<string, { id: string; product_id: string; effective_from: string }>();
  assignmentRows.forEach((assignment) => {
    const existing = latestAssignmentByPump.get(assignment.pump_id);
    if (!existing || assignment.effective_from > existing.effective_from) {
      latestAssignmentByPump.set(assignment.pump_id, {
        id: assignment.id,
        product_id: assignment.product_id,
        effective_from: assignment.effective_from
      });
    }
  });

  const productIds = Array.from(new Set(Array.from(latestAssignmentByPump.values()).map((assignment) => assignment.product_id)));
  const productsResult = canManageMeters && productIds.length > 0
    ? await supabase.from("fuel_products").select("id, code").in("id", productIds)
    : { data: [], error: null };

  if (productsResult.error) throw productsResult.error;

  const productCodeById = new Map(((productsResult.data ?? []) as Array<{ id: string; code: string }>).map((product) => [product.id, product.code]));

  const locationByStation = new Map(((locationsResult.data ?? []) as Array<{ station_id: string; code: string }>).map((x) => [x.station_id, x.code]));

  const latestBaselineByStation = new Map<string, { id: string; status: "missing" | "draft" | "finalized" | "voided"; baseline_at: string }>();
  ((baselinesResult.data ?? []) as Array<{ id: string; station_id: string; status: "draft" | "finalized" | "voided"; baseline_at: string }>).forEach((row) => {
    const existing = latestBaselineByStation.get(row.station_id);
    if (!existing || row.baseline_at > existing.baseline_at) {
      latestBaselineByStation.set(row.station_id, { id: row.id, status: row.status, baseline_at: row.baseline_at });
    }
  });

  const metersByStation = new Map<string, StationMeterRow[]>();
  pumps.forEach((pump) => {
    const assignment = latestAssignmentByPump.get(pump.id);
    const productCode = parseProductCode(assignment ? productCodeById.get(assignment.product_id) : undefined);
    const meter: StationMeterRow = {
      id: pump.id,
      station_id: pump.station_id,
      product_type: productCode,
      meter_label: pump.pump_label,
      display_order: pump.display_order,
      is_active: pump.is_active
    };

    if (!metersByStation.has(pump.station_id)) metersByStation.set(pump.station_id, []);
    metersByStation.get(pump.station_id)?.push(meter);
  });

  return {
    role,
    canCreateStation: role === "Owner",
    canManageMeters,
    rows: stations.map((station) => ({
      ...station,
      inventory_location_code: locationByStation.get(station.id) ?? null,
      fuel_baseline_status: latestBaselineByStation.get(station.id)?.status ?? "missing",
      meters: sortPumpsByProductAndLabel(metersByStation.get(station.id) ?? [])
    }))
  };
}

export async function fetchActiveStationPumps(stationId: string): Promise<ActiveStationPumpRow[]> {
  if (!canUseLiveData() || !stationId) return [];

  const supabase = createSupabaseBrowserClient();
  const { data, error } = await supabase
    .from("fuel_pumps")
    .select("id, station_id, pump_label, is_active, fuel_pump_product_assignments(product_id, effective_from, fuel_products(id, code, name))")
    .eq("station_id", stationId)
    .eq("is_active", true)
    .eq("fuel_pump_product_assignments.is_active", true)
    .is("fuel_pump_product_assignments.effective_to", null);

  if (error) throw new Error(`Unable to load station pumps: ${error.message}`);

  const rows = (data ?? []) as Array<{
    id: string;
    station_id: string;
    pump_label: string;
    is_active: boolean;
    fuel_pump_product_assignments:
      | Array<{
          product_id: string;
          effective_from: string;
          fuel_products: { id: string; code: string; name: string } | Array<{ id: string; code: string; name: string }> | null;
        }>
      | null;
  }>;

  const mapped = rows
    .map((row) => {
      const activeAssignments = (row.fuel_pump_product_assignments ?? [])
        .filter((assignment) => assignment && assignment.product_id)
        .sort((a, b) => (b.effective_from ?? "").localeCompare(a.effective_from ?? ""));
      const latest = activeAssignments[0];
      const product = Array.isArray(latest?.fuel_products) ? latest?.fuel_products[0] : latest?.fuel_products;
      const productCode = parseProductCode(product?.code);
      if (!latest || !product) return null;
      return {
        pump_id: row.id,
        station_id: row.station_id,
        pump_label: row.pump_label,
        product_id: latest.product_id,
        product_code: productCode,
        product_name: product.name,
        is_active: row.is_active
      } as ActiveStationPumpRow;
    })
    .filter((row): row is ActiveStationPumpRow => Boolean(row));

  return mapped.sort((a, b) => {
    const byProduct = productSortOrder[a.product_code] - productSortOrder[b.product_code];
    if (byProduct !== 0) return byProduct;
    return a.pump_label.localeCompare(b.pump_label);
  });
}

export async function createStation(payload: {
  name: string;
  address?: string;
  phone?: string;
  official_report_header?: string;
}) {
  if (!canUseLiveData()) throw new Error("Supabase is not configured");

  const supabase = createSupabaseBrowserClient();
  const { data, error } = await supabase.rpc("fuel_create_station", {
    payload: {
      ...payload,
      default_products: true,
      create_inventory_location: true
    }
  });

  if (error) throw new Error(`Unable to create station: ${error.message}`);
  return data as { station_id: string; location_id: string | null };
}

export async function upsertStationMeter(payload: {
  id?: string;
  station_id: string;
  product_type: "DIESEL" | "SPECIAL" | "UNLEADED";
  meter_label: string;
  display_order?: number;
  is_active?: boolean;
}) {
  if (!canUseLiveData()) throw new Error("Supabase is not configured");

  const supabase = createSupabaseBrowserClient();

  const { data: product, error: productError } = await supabase
    .from("fuel_products")
    .select("id, code")
    .eq("code", payload.product_type)
    .eq("is_fuel", true)
    .limit(1)
    .maybeSingle();

  if (productError) throw new Error(`Unable to find product: ${productError.message}`);
  if (!product) throw new Error(`Unable to find product: ${payload.product_type}`);

  const nowIso = new Date().toISOString();
  const meterPatch = {
    station_id: payload.station_id,
    pump_label: payload.meter_label,
    display_order: 0,
    is_active: payload.is_active ?? true
  };

  let pumpId = payload.id;

  if (payload.id) {
    const { error } = await supabase
      .from("fuel_pumps")
      .update(meterPatch)
      .eq("id", payload.id)
      .eq("station_id", payload.station_id);

    if (error) throw new Error(`Unable to save station meter: ${error.message}`);
  } else {
    const { data, error } = await supabase
      .from("fuel_pumps")
      .insert(meterPatch)
      .select("id")
      .single();

    if (error) throw new Error(`Unable to save station meter: ${error.message}`);
    pumpId = (data as { id: string }).id;
  }

  if (!pumpId) throw new Error("Unable to save station meter: missing pump id");

  const { data: existingAssignments, error: existingAssignmentsError } = await supabase
    .from("fuel_pump_product_assignments")
    .select("id")
    .eq("pump_id", pumpId)
    .eq("is_active", true)
    .is("effective_to", null)
    .order("effective_from", { ascending: false });

  if (existingAssignmentsError) throw new Error(`Unable to save station meter product assignment: ${existingAssignmentsError.message}`);

  const [currentAssignment, ...staleAssignments] = (existingAssignments ?? []) as Array<{ id: string }>;

  if (currentAssignment) {
    const { error } = await supabase
      .from("fuel_pump_product_assignments")
      .update({
        product_id: product.id,
        is_active: true,
        effective_to: null,
        effective_from: nowIso
      })
      .eq("id", currentAssignment.id);

    if (error) throw new Error(`Unable to save station meter product assignment: ${error.message}`);

    if (staleAssignments.length > 0) {
      const staleIds = staleAssignments.map((row) => row.id);
      const { error: staleError } = await supabase
        .from("fuel_pump_product_assignments")
        .update({ is_active: false, effective_to: nowIso })
        .in("id", staleIds);

      if (staleError) throw new Error(`Unable to archive stale product assignments: ${staleError.message}`);
    }
  } else {
    const { error } = await supabase
      .from("fuel_pump_product_assignments")
      .insert({
        pump_id: pumpId,
        product_id: product.id,
        is_active: true,
        effective_to: null,
        effective_from: nowIso
      });

    if (error) throw new Error(`Unable to save station meter product assignment: ${error.message}`);
  }

  return {
    id: pumpId,
    station_id: payload.station_id,
    product_type: parseProductCode(product.code),
    meter_label: payload.meter_label,
    display_order: 0,
    is_active: payload.is_active ?? true
  } as StationMeterRow;
}

export async function archiveStationMeter(meterId: string) {
  if (!canUseLiveData()) throw new Error("Supabase is not configured");

  const supabase = createSupabaseBrowserClient();
  const archivedAt = new Date().toISOString();
  const { error } = await supabase
    .from("fuel_pumps")
    .update({ is_active: false, archived_at: archivedAt })
    .eq("id", meterId);

  if (error) throw new Error(`Unable to archive station meter: ${error.message}`);

  return meterId;
}
