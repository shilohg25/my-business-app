import { canUseLiveData } from "@/lib/data/client";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";

export interface StartShiftCapturePayload {
  station_id: string;
  shift_label: string;
  report_date?: string;
  previous_session_id?: string;
}

export interface FuelShiftCaptureSessionRow {
  id: string;
  station_id: string;
  shift_label: string;
  report_date: string;
  status: "draft" | "ready_for_review" | "published" | "voided";
  opened_by: string;
  draft_payload: Record<string, unknown>;
  calculated_summary: Record<string, unknown>;
  created_at: string;
  updated_at: string;
  fuel_stations?: { name: string } | null;
}

function requireSupabase() {
  if (!canUseLiveData()) {
    throw new Error("Supabase is not configured. Add NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY.");
  }

  return createSupabaseBrowserClient();
}

function getRpcError(prefix: string, error: { message: string }) {
  return new Error(`${prefix}: ${error.message}`);
}

export async function startShiftCaptureSession(payload: StartShiftCapturePayload) {
  const supabase = requireSupabase();
  const { data, error } = await supabase.rpc("fuel_start_shift_capture_session", { payload });
  if (error) throw getRpcError("Unable to start capture session", error);
  return data as string;
}

export async function updateShiftCaptureDraft(captureSessionId: string, patch: Record<string, unknown>) {
  const supabase = requireSupabase();
  const { data, error } = await supabase.rpc("fuel_update_shift_capture_draft", {
    capture_session_id: captureSessionId,
    patch
  });
  if (error) throw getRpcError("Unable to save draft", error);
  return data as string;
}

export async function markShiftCaptureReady(captureSessionId: string) {
  const supabase = requireSupabase();
  const { data, error } = await supabase.rpc("fuel_mark_shift_capture_ready", {
    capture_session_id: captureSessionId
  });
  if (error) throw getRpcError("Unable to mark draft ready for review", error);
  return data as string;
}

export async function voidShiftCaptureSession(captureSessionId: string, reason: string) {
  const supabase = requireSupabase();
  const { data, error } = await supabase.rpc("fuel_void_shift_capture_session", {
    capture_session_id: captureSessionId,
    reason
  });
  if (error) throw getRpcError("Unable to void draft session", error);
  return data as string;
}

export async function fetchMyDraftCaptureSessions() {
  const supabase = requireSupabase();
  const { data, error } = await supabase
    .from("fuel_shift_capture_sessions")
    .select("id, station_id, shift_label, report_date, status, opened_by, draft_payload, calculated_summary, created_at, updated_at, fuel_stations(name)")
    .in("status", ["draft", "ready_for_review"])
    .order("created_at", { ascending: false })
    .limit(50);

  if (error) throw getRpcError("Unable to load draft sessions", error);
  return (data ?? []) as unknown as FuelShiftCaptureSessionRow[];
}

export async function fetchCaptureSessionById(id: string) {
  const supabase = requireSupabase();
  const { data, error } = await supabase
    .from("fuel_shift_capture_sessions")
    .select("id, station_id, shift_label, report_date, status, opened_by, draft_payload, calculated_summary, created_at, updated_at, fuel_stations(name)")
    .eq("id", id)
    .single();

  if (error) throw getRpcError("Unable to load capture session", error);
  return data as unknown as FuelShiftCaptureSessionRow;
}
