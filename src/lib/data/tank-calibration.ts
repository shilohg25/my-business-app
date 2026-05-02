import { VERIFIED_TANK_PROFILES, type TankCalibrationProfile } from "@/lib/domain/tankCalibration";
import { canUseLiveData } from "@/lib/data/client";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";

export type StationTankRecord = {
  id: string;
  station_id: string;
  station_name: string;
  product_type: string;
  tank_name: string;
  calibration_profile_id: string;
  reorder_threshold_liters: number | null;
  variance_tolerance_liters: number | null;
  profile_key: string;
  profile_name: string;
  max_dipstick_cm: number;
  calculated_full_liters: number;
};

function mapVerifiedProfile(profile: TankCalibrationProfile) {
  return {
    profile_key: profile.profileKey,
    name: profile.name,
    formula_type: profile.formulaType,
    diameter_cm: profile.diameterCm,
    radius_cm: profile.radiusCm,
    length_cm: profile.lengthCm,
    max_dipstick_cm: profile.maxDipstickCm,
    nominal_label: profile.nominalLabel,
    calculated_full_liters: profile.calculatedFullLiters,
    rounded_full_liters: profile.roundedFullLiters,
    is_verified: profile.isVerified,
    is_owner_only: profile.isOwnerOnly
  };
}

export function listTankCalibrationProfiles() {
  return VERIFIED_TANK_PROFILES;
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
    .select(
      "id, station_id, product_type, tank_name, reorder_threshold_liters, variance_tolerance_liters, fuel_stations!inner(name), tank_calibration_profiles!inner(id, profile_key, name, max_dipstick_cm, calculated_full_liters)"
    )
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
    calibration_profile_id: row.tank_calibration_profiles.id,
    reorder_threshold_liters: row.reorder_threshold_liters == null ? null : Number(row.reorder_threshold_liters),
    variance_tolerance_liters: row.variance_tolerance_liters == null ? null : Number(row.variance_tolerance_liters),
    profile_key: row.tank_calibration_profiles.profile_key,
    profile_name: row.tank_calibration_profiles.name,
    max_dipstick_cm: Number(row.tank_calibration_profiles.max_dipstick_cm),
    calculated_full_liters: Number(row.tank_calibration_profiles.calculated_full_liters)
  }));
}

export async function createOrUpdateStationTank(payload: {
  id?: string;
  station_id: string;
  product_type: string;
  tank_name: string;
  calibration_profile_id: string;
  reorder_threshold_liters?: number | null;
  variance_tolerance_liters?: number | null;
}) {
  if (!canUseLiveData()) throw new Error("Supabase is not configured");
  const supabase = createSupabaseBrowserClient();
  const record = {
    station_id: payload.station_id,
    product_type: payload.product_type,
    tank_name: payload.tank_name,
    calibration_profile_id: payload.calibration_profile_id,
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

export function getSeedCalibrationProfiles() {
  return VERIFIED_TANK_PROFILES.map(mapVerifiedProfile);
}
