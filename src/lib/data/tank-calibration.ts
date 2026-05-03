import { VERIFIED_TANK_PROFILES } from "@/lib/domain/tankCalibration";
import { canUseLiveData } from "@/lib/data/client";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";

export type StationTankRecord = {
  id: string;
  station_id: string;
  station_name: string;
  product_type: string;
  tank_name: string;
  calibration_profile_id: string | null;
  calibration_mode: "verified_profile" | "manual_table" | "historical_emptying";
  reorder_threshold_liters: number | null;
  variance_tolerance_liters: number | null;
  profile_key: string;
  profile_name: string;
  max_dipstick_cm: number;
  calculated_full_liters: number;
};

export type OwnerTankSummaryRecord = StationTankRecord & {
  station_tank_id: string;
  latest_reading_id: string | null;
  latest_reading_cm: number | null;
  latest_reading_at: string | null;
  latest_reading_report_date: string | null;
  latest_reading_source: string | null;
};

export type TankCalibrationProfileOption = {
  id: string;
  profileKey: string;
  name: string;
  formulaType: "horizontal_cylinder" | "manual_table";
  diameterCm: number | null;
  radiusCm: number | null;
  lengthCm: number | null;
  maxDipstickCm: number;
  nominalLabel: string;
  calculatedFullLiters: number;
  roundedFullLiters: number;
  isVerified: boolean;
  isOwnerOnly: boolean;
};

export function isUuid(value: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

function mapDbProfile(profile: any): TankCalibrationProfileOption {
  return {
    id: profile.id,
    profileKey: profile.profile_key,
    name: profile.name,
    formulaType: profile.formula_type,
    diameterCm: profile.diameter_cm == null ? null : Number(profile.diameter_cm),
    radiusCm: profile.radius_cm == null ? null : Number(profile.radius_cm),
    lengthCm: profile.length_cm == null ? null : Number(profile.length_cm),
    maxDipstickCm: Number(profile.max_dipstick_cm),
    nominalLabel: profile.nominal_label,
    calculatedFullLiters: Number(profile.calculated_full_liters),
    roundedFullLiters: Number(profile.rounded_full_liters),
    isVerified: Boolean(profile.is_verified),
    isOwnerOnly: Boolean(profile.is_owner_only)
  };
}

const TANK_PROFILE_SELECT =
  "id, profile_key, name, formula_type, diameter_cm, radius_cm, length_cm, max_dipstick_cm, nominal_label, calculated_full_liters, rounded_full_liters, is_verified, is_owner_only";

async function fetchDbTankCalibrationProfiles() {
  const supabase = createSupabaseBrowserClient();
  const { data, error } = await supabase
    .from("tank_calibration_profiles")
    .select(TANK_PROFILE_SELECT)
    .is("archived_at", null)
    .order("name", { ascending: true });
  if (error) throw error;
  return (data ?? []).map(mapDbProfile);
}

export async function ensureVerifiedTankCalibrationProfilesSeeded(): Promise<TankCalibrationProfileOption[]> {
  if (!canUseLiveData()) return [];
  const supabase = createSupabaseBrowserClient();
  const { data, error } = await supabase.rpc("fuel_ensure_verified_tank_calibration_profiles");
  if (error) throw error;
  return (data ?? []).map(mapDbProfile);
}

export async function listTankCalibrationProfiles(): Promise<TankCalibrationProfileOption[]> {
  if (!canUseLiveData()) return VERIFIED_TANK_PROFILES;
  return fetchDbTankCalibrationProfiles();
}

export async function resolveCalibrationProfileId(profileIdOrKey: string) {
  if (isUuid(profileIdOrKey)) return profileIdOrKey;
  if (!canUseLiveData()) {
    const fallback = VERIFIED_TANK_PROFILES.find((profile) => profile.profileKey === profileIdOrKey);
    if (!fallback) throw new Error(`Unknown calibration profile: ${profileIdOrKey}`);
    return fallback.id;
  }
  const supabase = createSupabaseBrowserClient();
  const { data, error } = await supabase
    .from("tank_calibration_profiles")
    .select("id")
    .eq("profile_key", profileIdOrKey)
    .is("archived_at", null)
    .maybeSingle();
  if (error) throw error;
  if (!data?.id) throw new Error(`Unknown calibration profile: ${profileIdOrKey}`);
  return data.id as string;
}

export async function listStationsForTankSetup() {
  if (!canUseLiveData()) return [];
  const supabase = createSupabaseBrowserClient();
  const { data, error } = await supabase.from("fuel_stations").select("id, name, is_active").eq("is_active", true).order("name", { ascending: true });
  if (error) throw error;
  return data ?? [];
}

export async function listStationTanks(): Promise<StationTankRecord[]> {
  if (!canUseLiveData()) return [];
  const supabase = createSupabaseBrowserClient();
  const { data, error } = await supabase
    .from("station_tanks")
    .select("id, station_id, product_type, tank_name, calibration_mode, calibration_profile_id, reorder_threshold_liters, variance_tolerance_liters, fuel_stations!inner(name), tank_calibration_profiles(id, profile_key, name, max_dipstick_cm, calculated_full_liters)")
    .eq("active", true)
    .is("archived_at", null)
    .order("created_at", { ascending: true });
  if (error) throw error;
  return (data ?? []).map((row: any) => ({
    id: row.id,
    station_id: row.station_id,
    station_name: row.fuel_stations?.name ?? "Unknown station",
    product_type: row.product_type,
    tank_name: row.tank_name,
    calibration_mode: row.calibration_mode ?? "verified_profile",
    calibration_profile_id: row.calibration_profile_id ?? null,
    reorder_threshold_liters: row.reorder_threshold_liters == null ? null : Number(row.reorder_threshold_liters),
    variance_tolerance_liters: row.variance_tolerance_liters == null ? null : Number(row.variance_tolerance_liters),
    profile_key: row.tank_calibration_profiles?.profile_key ?? "",
    profile_name: row.tank_calibration_profiles?.name ?? "No calibration profile",
    max_dipstick_cm: Number(row.tank_calibration_profiles?.max_dipstick_cm ?? 0),
    calculated_full_liters: Number(row.tank_calibration_profiles?.calculated_full_liters ?? 0)
  }));
}

export async function listOwnerTankSummary(): Promise<OwnerTankSummaryRecord[]> {
  const tanks = await listStationTanks();
  if (!canUseLiveData() || !tanks.length) return tanks.map((tank) => ({ ...tank, station_tank_id: tank.id, latest_reading_id: null, latest_reading_cm: null, latest_reading_at: null, latest_reading_report_date: null, latest_reading_source: null }));
  const supabase = createSupabaseBrowserClient();
  const tankIds = tanks.map((tank) => tank.id);
  const { data, error } = await supabase
    .from("tank_stick_readings")
    .select("id, station_tank_id, report_date, reading_cm, entered_at, source")
    .in("station_tank_id", tankIds)
    .order("entered_at", { ascending: false });
  if (error) throw error;
  const latestByTank = new Map<string, any>();
  for (const row of data ?? []) {
    if (!latestByTank.has(row.station_tank_id)) latestByTank.set(row.station_tank_id, row);
  }
  return tanks.map((tank) => {
    const latest = latestByTank.get(tank.id);
    return {
      ...tank,
      station_tank_id: tank.id,
      latest_reading_id: latest?.id ?? null,
      latest_reading_cm: latest?.reading_cm == null ? null : Number(latest.reading_cm),
      latest_reading_at: latest?.entered_at ?? null,
      latest_reading_report_date: latest?.report_date ?? null,
      latest_reading_source: latest?.source ?? null
    };
  });
}

export async function createOrUpdateStationTank(payload: {
  id?: string;
  station_id: string;
  product_type: string;
  tank_name: string;
  calibration_profile_id: string | null;
  calibration_mode: "verified_profile" | "manual_table" | "historical_emptying";
  reorder_threshold_liters?: number | null;
  variance_tolerance_liters?: number | null;
}) {
  if (!canUseLiveData()) throw new Error("Supabase is not configured");
  const supabase = createSupabaseBrowserClient();
  const record = {
    station_id: payload.station_id,
    product_type: payload.product_type,
    tank_name: payload.tank_name,
    calibration_mode: payload.calibration_mode,
    calibration_profile_id: payload.calibration_profile_id ? await resolveCalibrationProfileId(payload.calibration_profile_id) : null,
    reorder_threshold_liters: payload.reorder_threshold_liters ?? null,
    variance_tolerance_liters: payload.variance_tolerance_liters ?? null,
    active: true
  };
  if (payload.id) {
    const { data, error } = await supabase.from("station_tanks").update(record).eq("id", payload.id).select("id").single();
    if (error) throw error;
    return data?.id as string;
  }
  const { data, error } = await supabase.from("station_tanks").insert(record).select("id").single();
  if (error) throw error;
  return data?.id as string;
}

export async function archiveStationTank(stationTankId: string) {
  if (!canUseLiveData()) throw new Error("Supabase is not configured");
  const supabase = createSupabaseBrowserClient();
  const { error } = await supabase.from("station_tanks").update({ active: false, archived_at: new Date().toISOString() }).eq("id", stationTankId);
  if (error) throw error;
}

export async function getLatestTankStickReading(stationTankId: string) {
  if (!canUseLiveData() || !stationTankId) return null;
  const supabase = createSupabaseBrowserClient();
  const { data, error } = await supabase
    .from("tank_stick_readings")
    .select("id, station_tank_id, report_date, reading_cm, entered_at")
    .eq("station_tank_id", stationTankId)
    .order("entered_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  return data;
}

export async function saveTankStickReading(payload: { station_tank_id: string; report_date: string; reading_cm: number; source: string; notes?: string | null }) {
  if (!canUseLiveData()) throw new Error("Supabase is not configured");
  const supabase = createSupabaseBrowserClient();
  const { data, error } = await supabase.from("tank_stick_readings").insert(payload).select("id").single();
  if (error) throw error;
  return data?.id as string;
}

export async function saveTankCrossCheck(payload: {
  station_tank_id: string;
  report_date: string;
  opening_reading_cm: number;
  opening_liters: number;
  delivery_liters: number;
  pump_meter_sales_liters: number;
  closing_reading_cm: number;
  closing_liters: number;
  expected_closing_liters: number;
  variance_liters: number;
  status: "balanced" | "short" | "surplus";
  tolerance_liters: number;
  explanation?: string | null;
}) {
  if (!canUseLiveData()) throw new Error("Supabase is not configured");
  const supabase = createSupabaseBrowserClient();
  const { data, error } = await supabase.from("tank_reconciliation_audits").insert(payload).select("id").single();
  if (error) throw error;
  return data?.id as string;
}

export type EmpiricalCalibrationPointInput = {
  station_tank_id: string;
  audit_date: string;
  reading_cm: number;
  actual_pulled_liters: number;
  remaining_after_pullout_liters?: number;
  observed_liters: number;
  base_calibration_profile_id?: string | null;
  base_expected_liters?: number | null;
  variance_liters?: number | null;
  status: "balanced" | "short" | "surplus" | "anchor_only";
  confidence?: "exact_at_anchor";
  notes?: string | null;
};

export async function saveEmpiricalCalibrationPoint(payload: EmpiricalCalibrationPointInput) {
  if (!canUseLiveData()) throw new Error("Supabase is not configured");
  const supabase = createSupabaseBrowserClient();
  const { data, error } = await supabase.from("tank_empirical_calibration_points").insert({
    ...payload,
    remaining_after_pullout_liters: payload.remaining_after_pullout_liters ?? 0,
    confidence: payload.confidence ?? "exact_at_anchor"
  }).select("id").single();
  if (error) throw error;
  return data?.id as string;
}
