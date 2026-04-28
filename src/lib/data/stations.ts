import { canUseLiveData } from "@/lib/data/client";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import { fetchCurrentProfile } from "@/lib/data/profile";

export interface StationMeterRow {
  id: string;
  station_id: string;
  product_type: "DIESEL" | "SPECIAL" | "UNLEADED";
  meter_label: string;
  display_order: number;
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
  const [locationsResult, baselinesResult, metersResult] = await Promise.all([
    supabase.from("fuel_inventory_locations").select("station_id, code").eq("location_type", "station").in("station_id", ids),
    supabase.from("fuel_station_fuel_baselines").select("id, station_id, status, baseline_at").in("station_id", ids),
    canManageMeters
      ? supabase.from("fuel_station_meters").select("id, station_id, product_type, meter_label, display_order, is_active").in("station_id", ids).order("display_order", { ascending: true })
      : Promise.resolve({ data: [], error: null })
  ]);

  const errors = [locationsResult.error, baselinesResult.error, metersResult.error].filter(Boolean);
  if (errors.length) throw errors[0];

  const locationByStation = new Map(((locationsResult.data ?? []) as Array<{ station_id: string; code: string }>).map((x) => [x.station_id, x.code]));

  const latestBaselineByStation = new Map<string, { id: string; status: "missing" | "draft" | "finalized" | "voided"; baseline_at: string }>();
  ((baselinesResult.data ?? []) as Array<{ id: string; station_id: string; status: "draft" | "finalized" | "voided"; baseline_at: string }>).forEach((row) => {
    const existing = latestBaselineByStation.get(row.station_id);
    if (!existing || row.baseline_at > existing.baseline_at) {
      latestBaselineByStation.set(row.station_id, { id: row.id, status: row.status, baseline_at: row.baseline_at });
    }
  });

  const meterRows = (metersResult.data ?? []) as StationMeterRow[];
  const metersByStation = new Map<string, StationMeterRow[]>();
  meterRows.forEach((meter) => {
    if (!metersByStation.has(meter.station_id)) metersByStation.set(meter.station_id, []);
    metersByStation.get(meter.station_id)?.push(meter);
  });

  return {
    role,
    canCreateStation: role === "Owner",
    canManageMeters,
    rows: stations.map((station) => ({
      ...station,
      inventory_location_code: locationByStation.get(station.id) ?? null,
      fuel_baseline_status: latestBaselineByStation.get(station.id)?.status ?? "missing",
      meters: metersByStation.get(station.id) ?? []
    }))
  };
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
  const { data, error } = await supabase.rpc("fuel_upsert_station_meter", { payload });
  if (error) throw new Error(`Unable to save station meter: ${error.message}`);

  return data as StationMeterRow;
}

export async function archiveStationMeter(meterId: string) {
  if (!canUseLiveData()) throw new Error("Supabase is not configured");

  const supabase = createSupabaseBrowserClient();
  const { data, error } = await supabase.rpc("fuel_archive_station_meter", { meter_id: meterId });
  if (error) throw new Error(`Unable to archive station meter: ${error.message}`);

  return data as string;
}
