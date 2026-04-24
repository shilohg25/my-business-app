import { isSupabaseConfigured } from "@/lib/supabase/client";

export function SupabaseStatus() {
  if (isSupabaseConfigured()) return null;
  return (
    <div className="no-print border-b border-amber-200 bg-amber-50 px-6 py-3 text-sm text-amber-900">
      Supabase is not connected yet. Add <code>NEXT_PUBLIC_SUPABASE_URL</code> and <code>NEXT_PUBLIC_SUPABASE_ANON_KEY</code> in GitHub repository secrets, then redeploy.
    </div>
  );
}
