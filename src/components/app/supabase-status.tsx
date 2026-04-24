"use client";

import { getSupabaseConfigurationState } from "@/lib/supabase/client";

export function SupabaseStatus() {
  const config = getSupabaseConfigurationState();

  if (config.configured) return null;

  return (
    <div className="no-print border-b border-amber-200 bg-amber-50 px-6 py-3 text-sm text-amber-900">
      <strong>Live data is disabled.</strong>{" "}
      {config.reason} Add <code>NEXT_PUBLIC_SUPABASE_URL</code> and{" "}
      <code>NEXT_PUBLIC_SUPABASE_ANON_KEY</code> as GitHub repository secrets, then redeploy with GitHub Actions.
    </div>
  );
}
