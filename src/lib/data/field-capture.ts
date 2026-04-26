import { canUseLiveData } from "@/lib/data/client";
import { appPath, createSupabaseBrowserClient } from "@/lib/supabase/client";
import type { FuelShiftCapturePhotoRow } from "@/lib/data/field-capture-photos";

export interface StartShiftCapturePayload {
  station_id: string;
  shift_label: string;
  report_date?: string;
  previous_session_id?: string;
}

export type FuelShiftCaptureStatus = "draft" | "ready_for_review" | "published" | "voided";

export interface FuelShiftCaptureSessionRow {
  id: string;
  station_id: string;
  shift_label: string;
  report_date: string;
  status: FuelShiftCaptureStatus;
  opened_by: string;
  draft_payload: Record<string, unknown>;
  calculated_summary: Record<string, unknown>;
  published_shift_report_id?: string | null;
  void_reason?: string | null;
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
    .select("id, station_id, shift_label, report_date, status, opened_by, draft_payload, calculated_summary, published_shift_report_id, void_reason, created_at, updated_at, fuel_stations(name)")
    .in("status", ["draft", "ready_for_review"])
    .order("created_at", { ascending: false })
    .limit(50);

  if (error) throw getRpcError("Unable to load draft sessions", error);
  return (data ?? []) as unknown as FuelShiftCaptureSessionRow[];
}

export async function fetchCaptureReviewQueue() {
  const supabase = requireSupabase();
  const { data, error } = await supabase
    .from("fuel_shift_capture_sessions")
    .select("id, station_id, shift_label, report_date, status, opened_by, draft_payload, calculated_summary, published_shift_report_id, void_reason, created_at, updated_at, fuel_stations(name)")
    .eq("status", "ready_for_review")
    .order("updated_at", { ascending: false })
    .limit(100);

  if (error) throw getRpcError("Unable to load field capture review queue", error);
  return (data ?? []) as unknown as FuelShiftCaptureSessionRow[];
}

export async function fetchCaptureSessionById(id: string) {
  const supabase = requireSupabase();
  const { data, error } = await supabase
    .from("fuel_shift_capture_sessions")
    .select("id, station_id, shift_label, report_date, status, opened_by, draft_payload, calculated_summary, published_shift_report_id, void_reason, created_at, updated_at, fuel_stations(name)")
    .eq("id", id)
    .single();

  if (error) throw getRpcError("Unable to load capture session", error);
  return data as unknown as FuelShiftCaptureSessionRow;
}

export async function fetchCaptureSessionForReview(id: string) {
  if (!id) throw new Error("Capture session id is required.");
  return fetchCaptureSessionById(id);
}

export async function fetchCaptureSessionPhotos(id: string) {
  if (!id) throw new Error("Capture session id is required.");
  const supabase = requireSupabase();
  const { data, error } = await supabase
    .from("fuel_shift_capture_photos")
    .select("id, capture_session_id, station_id, uploaded_by, photo_type, storage_path, original_file_name, mime_type, file_size_bytes, ocr_status, notes, created_at, updated_at")
    .eq("capture_session_id", id)
    .order("created_at", { ascending: false });
  if (error) throw getRpcError("Unable to load capture photos", error);
  return (data ?? []) as FuelShiftCapturePhotoRow[];
}

export function getFieldCaptureReviewUrl(id: string) {
  return appPath(`/field-capture/review/?id=${id}`);
}
