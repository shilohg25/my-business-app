import { canUseLiveData } from "@/lib/data/client";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";

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
