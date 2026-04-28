import { canUseLiveData } from "@/lib/data/client";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";

export const STATION_ASSIGNMENT_RPC_MISSING_MESSAGE = "Station assignment database functions are missing. Run the latest Supabase SQL migration.";

export interface AssignableUser {
  user_id: string;
  email: string | null;
  username: string | null;
  role: string | null;
  is_active: boolean;
}

export interface AssignableStation {
  id: string;
  name: string;
  code: string;
  is_active: boolean;
}

export interface StationAssignmentRow {
  id: string;
  user_id: string;
  user_email: string | null;
  username: string | null;
  station_id: string;
  station_name: string;
  station_code: string;
  is_active: boolean;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

function isRpcSchemaMissingError(error: unknown) {
  if (!error || typeof error !== "object") return false;

  const errorWithMetadata = error as { code?: string; message?: string; details?: string; hint?: string };
  const searchableText = [errorWithMetadata.message, errorWithMetadata.details, errorWithMetadata.hint]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();

  return (
    errorWithMetadata.code === "PGRST202" ||
    errorWithMetadata.code === "42883" ||
    searchableText.includes("could not find the function") ||
    searchableText.includes("function") && searchableText.includes("does not exist") ||
    searchableText.includes("schema cache") && searchableText.includes("reload")
  );
}

export function normalizeStationAssignmentError(error: unknown, fallback: string) {
  if (isRpcSchemaMissingError(error)) {
    return STATION_ASSIGNMENT_RPC_MISSING_MESSAGE;
  }

  if (error instanceof Error && error.message) {
    return error.message;
  }

  return fallback;
}

export async function listAssignableUsers() {
  if (!canUseLiveData()) return [] as AssignableUser[];
  const supabase = createSupabaseBrowserClient();
  const { data, error } = await supabase.rpc("fuel_list_assignable_users");
  if (error) throw error;
  return (data ?? []) as AssignableUser[];
}

export async function listAssignableStations() {
  if (!canUseLiveData()) return [] as AssignableStation[];
  const supabase = createSupabaseBrowserClient();
  const { data, error } = await supabase
    .from("fuel_stations")
    .select("id,name,code,is_active")
    .eq("is_active", true)
    .order("name", { ascending: true });
  if (error) throw error;
  return (data ?? []) as AssignableStation[];
}

export async function listStationAssignments() {
  if (!canUseLiveData()) return [] as StationAssignmentRow[];
  const supabase = createSupabaseBrowserClient();
  const { data, error } = await supabase.rpc("fuel_list_station_assignments");
  if (error) throw error;
  return (data ?? []) as StationAssignmentRow[];
}

export async function setStationAssignment(targetUserId: string, targetStationId: string, isActive: boolean) {
  const supabase = createSupabaseBrowserClient();
  const { data, error } = await supabase.rpc("fuel_set_station_assignment", {
    target_user_id: targetUserId,
    target_station_id: targetStationId,
    assignment_is_active: isActive
  });
  if (error) throw error;
  return data as string;
}
