import { createClient, type Session, type SupabaseClient } from "@supabase/supabase-js";

let browserClient: SupabaseClient | null = null;

export interface SupabaseEnv {
  url: string;
  anonKey: string;
}

export type SupabaseConfigurationState =
  | {
      configured: true;
      url: string;
      anonKey: string;
      reason: null;
    }
  | {
      configured: false;
      url: string;
      anonKey: string;
      reason: string;
    };

export class SupabaseConfigurationError extends Error {
  constructor(message = "Supabase is not configured.") {
    super(message);
    this.name = "SupabaseConfigurationError";
  }
}

export function getSupabaseEnv(): SupabaseEnv {
  return {
    url: process.env.NEXT_PUBLIC_SUPABASE_URL ?? "",
    anonKey: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? ""
  };
}

export function getSupabaseConfigurationState(): SupabaseConfigurationState {
  const { url, anonKey } = getSupabaseEnv();

  if (!url || !anonKey) {
    return {
      configured: false,
      url,
      anonKey,
      reason: "Missing NEXT_PUBLIC_SUPABASE_URL or NEXT_PUBLIC_SUPABASE_ANON_KEY."
    };
  }

  let parsedUrl: URL;
  try {
    parsedUrl = new URL(url);
  } catch {
    return {
      configured: false,
      url,
      anonKey,
      reason: "NEXT_PUBLIC_SUPABASE_URL is not a valid URL."
    };
  }

  if (parsedUrl.protocol !== "https:") {
    return {
      configured: false,
      url,
      anonKey,
      reason: "NEXT_PUBLIC_SUPABASE_URL must start with https://."
    };
  }

  if (anonKey.includes("YOUR_") || anonKey.length < 20) {
    return {
      configured: false,
      url,
      anonKey,
      reason: "NEXT_PUBLIC_SUPABASE_ANON_KEY is missing or still contains an example value."
    };
  }

  return {
    configured: true,
    url,
    anonKey,
    reason: null
  };
}

export function isSupabaseConfigured() {
  return getSupabaseConfigurationState().configured;
}

export function createSupabaseBrowserClient() {
  const config = getSupabaseConfigurationState();

  if (!config.configured) {
    throw new SupabaseConfigurationError(config.reason);
  }

  if (!browserClient) {
    browserClient = createClient(config.url, config.anonKey, {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: true
      }
    });
  }

  return browserClient;
}

export async function getCurrentSupabaseSession(): Promise<Session | null> {
  if (!isSupabaseConfigured()) return null;

  const supabase = createSupabaseBrowserClient();
  const { data, error } = await supabase.auth.getSession();

  if (error) throw error;

  return data.session;
}

export async function signOutOfSupabase() {
  if (!isSupabaseConfigured()) return;

  const supabase = createSupabaseBrowserClient();
  const { error } = await supabase.auth.signOut();

  if (error) throw error;
}

export function appPath(path: string) {
  const normalizedPath = path.startsWith("/") ? path : `/${path}`;

  if (typeof window === "undefined") return normalizedPath;

  const githubPagesBasePath = "/my-business-app";
  const isGitHubPagesPath =
    window.location.pathname === githubPagesBasePath ||
    window.location.pathname.startsWith(`${githubPagesBasePath}/`);

  return `${isGitHubPagesPath ? githubPagesBasePath : ""}${normalizedPath}`;
}
