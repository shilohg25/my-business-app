import { canUseLiveData } from "@/lib/data/client";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";

export const FIELD_CAPTURE_PHOTO_BUCKET = "field-capture-photos";
export const FIELD_CAPTURE_PHOTO_MAX_BYTES = 10 * 1024 * 1024;
export const FIELD_CAPTURE_ALLOWED_MIME_TYPES = ["image/jpeg", "image/png", "image/webp"] as const;

export type CapturePhotoType =
  | "meter_reading"
  | "credit_receipt"
  | "expense_receipt"
  | "fuel_delivery_receipt"
  | "cash_count_evidence"
  | "other";

export interface FuelShiftCapturePhotoRow {
  id: string;
  capture_session_id: string;
  station_id: string;
  uploaded_by: string;
  photo_type: CapturePhotoType;
  storage_path: string | null;
  original_file_name: string | null;
  mime_type: string | null;
  file_size_bytes: number | null;
  ocr_status: "not_started" | "queued" | "processed" | "failed" | "confirmed";
  notes: string | null;
  created_at: string;
  updated_at: string;
}

interface CreateCapturePhotoPayload {
  capture_session_id: string;
  photo_type: CapturePhotoType;
  original_file_name: string;
  mime_type: string;
  file_size_bytes: number;
  notes?: string;
}

interface CreateCapturePhotoResponse {
  photo_id: string;
  station_id: string;
  capture_session_id: string;
  photo_type: CapturePhotoType;
}

interface UploadCapturePhotoArgs {
  captureSessionId: string;
  photoType: CapturePhotoType;
  file: File;
  notes?: string;
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

export function sanitizeFileName(name: string) {
  const trimmed = name.trim().toLowerCase();
  const safe = trimmed
    .replace(/[^a-z0-9._-]/g, "-")
    .replace(/-+/g, "-")
    .replace(/^[._-]+/, "")
    .replace(/[._-]+$/g, "");
  return safe.length > 0 ? safe : "upload";
}

export function validateCapturePhotoFile(file: Pick<File, "type" | "size">) {
  if (!FIELD_CAPTURE_ALLOWED_MIME_TYPES.includes(file.type as (typeof FIELD_CAPTURE_ALLOWED_MIME_TYPES)[number])) {
    throw new Error("Unsupported file type. Use JPG, PNG, or WEBP.");
  }

  if (file.size > FIELD_CAPTURE_PHOTO_MAX_BYTES) {
    throw new Error("File exceeds 10MB limit.");
  }
}

export function buildCapturePhotoObjectPath(args: {
  stationId: string;
  captureSessionId: string;
  photoType: CapturePhotoType;
  photoId: string;
  originalFileName: string;
}) {
  const safeFileName = sanitizeFileName(args.originalFileName);
  return `${args.stationId}/${args.captureSessionId}/${args.photoType}/${args.photoId}-${safeFileName}`;
}

export async function createCapturePhotoRecord(payload: CreateCapturePhotoPayload) {
  const supabase = requireSupabase();
  const { data, error } = await supabase.rpc("fuel_create_shift_capture_photo_record", { payload });
  if (error) throw getRpcError("Unable to create photo record", error);
  return data as CreateCapturePhotoResponse;
}

export async function attachCapturePhotoStoragePath(photoId: string, storagePath: string) {
  const supabase = requireSupabase();
  const { data, error } = await supabase.rpc("fuel_attach_shift_capture_photo_storage_path", {
    photo_id: photoId,
    storage_path: storagePath
  });
  if (error) throw getRpcError("Unable to attach photo storage path", error);
  return data as string;
}

export async function uploadCapturePhotoFile(args: UploadCapturePhotoArgs) {
  if (!args.captureSessionId) {
    throw new Error("No active draft session. Start or load a draft session first.");
  }

  validateCapturePhotoFile(args.file);

  const photo = await createCapturePhotoRecord({
    capture_session_id: args.captureSessionId,
    photo_type: args.photoType,
    original_file_name: args.file.name,
    mime_type: args.file.type,
    file_size_bytes: args.file.size,
    notes: args.notes
  });

  const path = buildCapturePhotoObjectPath({
    stationId: photo.station_id,
    captureSessionId: photo.capture_session_id,
    photoType: photo.photo_type,
    photoId: photo.photo_id,
    originalFileName: args.file.name
  });

  const supabase = requireSupabase();
  const { error: uploadError } = await supabase.storage.from(FIELD_CAPTURE_PHOTO_BUCKET).upload(path, args.file, {
    contentType: args.file.type,
    upsert: false
  });
  if (uploadError) throw new Error(`Unable to upload photo file: ${uploadError.message}`);

  const storagePath = `${FIELD_CAPTURE_PHOTO_BUCKET}/${path}`;
  await attachCapturePhotoStoragePath(photo.photo_id, storagePath);

  return {
    ...photo,
    storage_path: storagePath
  };
}

export async function listCaptureSessionPhotos(captureSessionId: string) {
  const supabase = requireSupabase();
  const { data, error } = await supabase
    .from("fuel_shift_capture_photos")
    .select("id, capture_session_id, station_id, uploaded_by, photo_type, storage_path, original_file_name, mime_type, file_size_bytes, ocr_status, notes, created_at, updated_at")
    .eq("capture_session_id", captureSessionId)
    .order("created_at", { ascending: false });

  if (error) throw getRpcError("Unable to load capture photos", error);
  return (data ?? []) as FuelShiftCapturePhotoRow[];
}
