import "server-only";

import { createClient, type User } from "@supabase/supabase-js";
import { getSupabaseAdminClient } from "@/lib/supabase/server-admin";

function getPublicSupabaseClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY?.trim();

  if (!url || !anonKey) {
    throw new Error("Missing NEXT_PUBLIC_SUPABASE_URL or NEXT_PUBLIC_SUPABASE_ANON_KEY for server auth checks.");
  }

  return createClient(url, anonKey, {
    auth: { autoRefreshToken: false, persistSession: false }
  });
}

function getBearerToken(request: Request) {
  const auth = request.headers.get("authorization") ?? request.headers.get("Authorization");
  if (!auth) return null;
  const [scheme, token] = auth.split(" ");
  if (scheme?.toLowerCase() !== "bearer" || !token) return null;
  return token.trim();
}

export async function getUserFromAuthorizationHeader(request: Request): Promise<User> {
  const token = getBearerToken(request);
  if (!token) {
    throw new Response("Unauthorized", { status: 401 });
  }

  const supabase = getPublicSupabaseClient();
  const { data, error } = await supabase.auth.getUser(token);

  if (error || !data.user) {
    throw new Response("Unauthorized", { status: 401 });
  }

  return data.user;
}

export async function requireOwnerFromRequest(request: Request) {
  const user = await getUserFromAuthorizationHeader(request);
  const admin = getSupabaseAdminClient();

  const { data, error } = await admin
    .from("profiles")
    .select("id, role, is_active")
    .eq("id", user.id)
    .maybeSingle();

  if (error || !data) {
    throw new Response("Unauthorized", { status: 401 });
  }

  if (data.role !== "Owner" || data.is_active !== true) {
    throw new Response("Forbidden", { status: 403 });
  }

  return { user, profile: data };
}
