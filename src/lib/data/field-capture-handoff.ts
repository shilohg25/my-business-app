import { canUseLiveData } from "@/lib/data/client";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import type { LatestMeterHandoffRow, ShiftHandoffConfirmRowInput } from "@/lib/analytics/field-capture-handoff";

export interface FuelShiftCaptureHandoffRow {
  id: string;
  capture_session_id: string;
  station_id: string;
  source_session_id: string | null;
  source_shift_report_id: string | null;
  pump_id: string | null;
  pump_label_snapshot: string;
  product_code_snapshot: string;
  nozzle_label: string | null;
  suggested_opening_reading: number;
  confirmed_opening_reading: number;
  variance_from_suggested: number;
  confirmed_by: string;
  confirmed_at: string;
  notes: string | null;
  created_at: string;
}

function requireSupabase() {
  if (!canUseLiveData()) {
    throw new Error("Supabase is not configured. Add NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY.");
  }
  return createSupabaseBrowserClient();
}

function rpcError(prefix: string, error: { message: string }) {
  return new Error(`${prefix}: ${error.message}`);
}

export async function fetchLatestMeterHandoff(stationId: string) {
  if (!stationId) throw new Error("Station is required to fetch latest handoff readings.");
  const supabase = requireSupabase();
  const { data, error } = await supabase.rpc("fuel_get_latest_meter_handoff", { station_id: stationId });
  if (error) throw rpcError("Unable to load latest shift handoff readings", error);
  return (data ?? []) as LatestMeterHandoffRow[];
}

export async function confirmShiftHandoff(captureSessionId: string, rows: ShiftHandoffConfirmRowInput[]) {
  if (!captureSessionId) throw new Error("Capture session id is required.");
  if (rows.length === 0) throw new Error("At least one handoff row is required.");
  const supabase = requireSupabase();
  const { data, error } = await supabase.rpc("fuel_confirm_shift_handoff", {
    capture_session_id: captureSessionId,
    handoff_rows: rows
  });
  if (error) throw rpcError("Unable to confirm opening handoff readings", error);
  return data as string;
}

export async function fetchShiftHandoffConfirmations(captureSessionId: string) {
  if (!captureSessionId) throw new Error("Capture session id is required.");
  const supabase = requireSupabase();
  const { data, error } = await supabase
    .from("fuel_shift_capture_handoffs")
    .select("id, capture_session_id, station_id, source_session_id, source_shift_report_id, pump_id, pump_label_snapshot, product_code_snapshot, nozzle_label, suggested_opening_reading, confirmed_opening_reading, variance_from_suggested, confirmed_by, confirmed_at, notes, created_at")
    .eq("capture_session_id", captureSessionId)
    .order("created_at", { ascending: true });

  if (error) throw rpcError("Unable to load handoff confirmations", error);
  return (data ?? []) as FuelShiftCaptureHandoffRow[];
}
