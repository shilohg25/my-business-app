import { createClient, type SupabaseClient } from "@supabase/supabase-js";

let browserClient: SupabaseClient | null = null;

export function getSupabaseEnv() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "";
  return { url, anonKey };
}

export function isSupabaseConfigured() {
  const { url, anonKey } = getSupabaseEnv();
  return Boolean(url && anonKey && url.startsWith("https://") && !anonKey.includes("YOUR_"));
}

export function createSupabaseBrowserClient() {
  const { url, anonKey } = getSupabaseEnv();
  if (!isSupabaseConfigured()) {
    throw new Error("Missing NEXT_PUBLIC_SUPABASE_URL or NEXT_PUBLIC_SUPABASE_ANON_KEY.");
  }
  if (!browserClient) {
    browserClient = createClient(url, anonKey, {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: true
      }
    });
  }
  return browserClient;
}

export function appPath(path: string) {
  if (typeof window === "undefined") return path;
  const prefix = window.location.pathname.startsWith("/my-business-app") ? "/my-business-app" : "";
  return `${prefix}${path.startsWith("/") ? path : `/${path}`}`;
}
