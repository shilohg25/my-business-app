import { createClient, type Session, type SupabaseClient } from "@supabase/supabase-js";

let browserClient: SupabaseClient | null = null;

const githubPagesBasePath = "/my-business-app";

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

function cleanEnvValue(value: string | undefined) {
  const trimmed = (value ?? "").trim();

  if (
    (trimmed.startsWith('"') && trimmed.endsWith('"')) ||
    (trimmed.startsWith("'") && trimmed.endsWith("'"))
  ) {
    return trimmed.slice(1, -1).trim();
  }

  return trimmed;
}

export function getSupabaseEnv(): SupabaseEnv {
  return {
    url: cleanEnvValue(process.env.NEXT_PUBLIC_SUPABASE_URL),
    anonKey: cleanEnvValue(process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY)
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

  if (parsedUrl.pathname !== "/" && parsedUrl.pathname !== "") {
    return {
      configured: false,
      url,
      anonKey,
      reason: "NEXT_PUBLIC_SUPABASE_URL must be the Supabase project root URL, not /rest/v1/."
    };
  }

  if (url.includes("YOUR_PROJECT_REF") || anonKey.includes("YOUR_SUPABASE") || anonKey.includes("YOUR_") || anonKey.length < 20) {
    return {
      configured: false,
      url,
      anonKey,
      reason: "Supabase environment variables are missing or still contain example values."
    };
  }

  if (anonKey.startsWith("sb_secret_")) {
    return {
      configured: false,
      url,
      anonKey,
      reason: "Do not use a Supabase service-role or secret key in the public frontend."
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

export function stripAppBasePath(path: string) {
  if (path === githubPagesBasePath) return "/";
  if (path.startsWith(`${githubPagesBasePath}/`)) return path.slice(githubPagesBasePath.length);
  return path;
}

export function currentAppPath() {
  if (typeof window === "undefined") return "/";
  return `${stripAppBasePath(window.location.pathname)}${window.location.search}`;
}

export function appPath(path: string) {
  const normalizedPath = path.startsWith("/") ? path : `/${path}`;

  if (typeof window === "undefined") {
    return process.env.GITHUB_ACTIONS === "true" ? `${githubPagesBasePath}${normalizedPath}` : normalizedPath;
  }

  const isGitHubPagesPath =
    window.location.pathname === githubPagesBasePath ||
    window.location.pathname.startsWith(`${githubPagesBasePath}/`);

  return `${isGitHubPagesPath ? githubPagesBasePath : ""}${normalizedPath}`;
}
