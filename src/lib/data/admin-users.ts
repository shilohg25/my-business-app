import { canUseLiveData } from "@/lib/data/client";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import type { AppRole } from "@/types/auth";

export interface OwnerUserRow {
  id: string;
  email: string;
  username: string | null;
  role: AppRole | null;
  is_active: boolean;
  must_change_password: boolean;
  created_at: string | null;
  updated_at: string | null;
  auth_created_at: string | null;
  last_sign_in_at: string | null;
}

export async function listUsersForOwner() {
  if (!canUseLiveData()) return [] as OwnerUserRow[];
  const supabase = createSupabaseBrowserClient();
  const { data, error } = await supabase.rpc("fuel_owner_list_users");
  if (error) throw error;
  return (data ?? []) as OwnerUserRow[];
}

export async function activateProfileByEmail(email: string, role: AppRole, isActive = true, mustChangePassword = false) {
  const supabase = createSupabaseBrowserClient();
  const { data, error } = await supabase.rpc("fuel_owner_upsert_profile_by_email", {
    user_email: email,
    user_role: role,
    user_is_active: isActive,
    user_must_change_password: mustChangePassword
  });
  if (error) throw error;
  return data as string;
}

export async function updateUserRole(userId: string, role: AppRole, isActive: boolean, mustChangePassword = false) {
  const supabase = createSupabaseBrowserClient();
  const { data, error } = await supabase.rpc("fuel_owner_update_user_role", {
    target_user_id: userId,
    user_role: role,
    user_is_active: isActive,
    user_must_change_password: mustChangePassword
  });
  if (error) throw error;
  return data as string;
}

export async function deactivateUser(userId: string, reason: string) {
  const supabase = createSupabaseBrowserClient();
  const { data, error } = await supabase.rpc("fuel_owner_deactivate_user", {
    target_user_id: userId,
    reason
  });
  if (error) throw error;
  return data as string;
}
