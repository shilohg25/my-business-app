import { canUseLiveData } from "@/lib/data/client";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import type { AppRole } from "@/types/auth";

export interface CurrentProfile {
  id: string;
  email: string | null;
  username: string | null;
  role: AppRole | null;
  is_active: boolean;
  must_change_password: boolean;
}

export async function fetchCurrentProfile() {
  if (!canUseLiveData()) return null;
  const supabase = createSupabaseBrowserClient();
  const { data, error } = await supabase.rpc("fuel_get_current_profile");
  if (error) throw new Error(error.message);
  const row = Array.isArray(data) ? data[0] : data;
  return (row ?? null) as CurrentProfile | null;
}

export async function isCurrentUserOwner() {
  const profile = await fetchCurrentProfile();
  return profile?.role === "Owner" && profile?.is_active === true;
}
