#!/usr/bin/env bash
set -euo pipefail

# Run this in the project root, not in the Supabase SQL Editor.
# Step 2: stabilize Supabase env setup and document required existing shared tables.

test -f package.json
test -d src
test -d supabase

cat > .env.example <<'ENV'
NEXT_PUBLIC_SUPABASE_URL=https://YOUR_PROJECT_REF.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=YOUR_SUPABASE_ANON_OR_PUBLISHABLE_KEY
ENV

mkdir -p scripts

cat > scripts/check-supabase-env.mjs <<'JS'
import fs from "node:fs";

function loadEnvFile(file) {
  if (!fs.existsSync(file)) return;

  const lines = fs.readFileSync(file, "utf8").split(/\r?\n/);
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#") || !trimmed.includes("=")) continue;

    const index = trimmed.indexOf("=");
    const key = trimmed.slice(0, index).trim();
    let value = trimmed.slice(index + 1).trim();

    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }

    if (!process.env[key]) process.env[key] = value;
  }
}

loadEnvFile(".env.local");
loadEnvFile(".env");

function fail(message) {
  console.error(`Supabase env check failed: ${message}`);
  process.exit(1);
}

const urlValue = (process.env.NEXT_PUBLIC_SUPABASE_URL ?? "").trim();
const keyValue = (process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "").trim();

if (!urlValue) fail("NEXT_PUBLIC_SUPABASE_URL is missing.");
if (!keyValue) fail("NEXT_PUBLIC_SUPABASE_ANON_KEY is missing.");

if (urlValue.includes("YOUR_PROJECT_REF")) {
  fail("NEXT_PUBLIC_SUPABASE_URL still contains the placeholder project ref.");
}

if (keyValue.includes("YOUR_SUPABASE")) {
  fail("NEXT_PUBLIC_SUPABASE_ANON_KEY still contains the placeholder key.");
}

let parsedUrl;
try {
  parsedUrl = new URL(urlValue);
} catch {
  fail("NEXT_PUBLIC_SUPABASE_URL is not a valid URL.");
}

if (parsedUrl.protocol !== "https:") {
  fail("NEXT_PUBLIC_SUPABASE_URL must start with https://.");
}

if (parsedUrl.pathname !== "/" && parsedUrl.pathname !== "") {
  fail("NEXT_PUBLIC_SUPABASE_URL must be the project root URL, for example https://YOUR_PROJECT_REF.supabase.co. Do not use /rest/v1/.");
}

if (!parsedUrl.hostname.endsWith(".supabase.co")) {
  fail("NEXT_PUBLIC_SUPABASE_URL should be the Supabase project URL ending in .supabase.co.");
}

if (keyValue.startsWith("sb_secret_")) {
  fail("NEXT_PUBLIC_SUPABASE_ANON_KEY must not be a service-role or secret key.");
}

if (keyValue.length < 20) {
  fail("NEXT_PUBLIC_SUPABASE_ANON_KEY looks too short.");
}

console.log("Supabase public env check passed.");
JS

node <<'NODE'
const fs = require("fs");

const packagePath = "package.json";
const packageJson = JSON.parse(fs.readFileSync(packagePath, "utf8"));
packageJson.scripts = packageJson.scripts || {};
packageJson.scripts["check:supabase-env"] = "node scripts/check-supabase-env.mjs";
fs.writeFileSync(packagePath, `${JSON.stringify(packageJson, null, 2)}\n`);

const workflowPath = ".github/workflows/pages.yml";
if (fs.existsSync(workflowPath)) {
  let workflow = fs.readFileSync(workflowPath, "utf8");

  if (!workflow.includes("Validate Supabase public env")) {
    workflow = workflow.replace(
      /(\n      - name: Typecheck\n)/,
      "\n      - name: Validate Supabase public env\n        run: npm run check:supabase-env\n$1"
    );
  }

  fs.writeFileSync(workflowPath, workflow);
}
NODE

cat > src/lib/supabase/client.ts <<'TS'
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
      reason: "NEXT_PUBLIC_SUPABASE_URL must be the Supabase project root URL, not the /rest/v1/ endpoint."
    };
  }

  if (url.includes("YOUR_PROJECT_REF") || anonKey.includes("YOUR_SUPABASE") || anonKey.length < 20) {
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

  if (typeof window === "undefined") return normalizedPath;

  const isGitHubPagesPath =
    window.location.pathname === githubPagesBasePath ||
    window.location.pathname.startsWith(`${githubPagesBasePath}/`);

  return `${isGitHubPagesPath ? githubPagesBasePath : ""}${normalizedPath}`;
}
TS

cat > SUPABASE_SETUP.md <<'MD'
# Supabase setup for AKY Fuel Ops

This app is a static GitHub Pages frontend. Supabase is the backend. Critical create/import validation is handled by PostgreSQL RPC functions in `supabase/migrations/004_fuel_ops_rpc.sql`.

## Database prerequisites

This package is not a fully standalone Supabase schema.

Before running the fuel-ops SQL, the Supabase project must already have:

- `public.profiles`
  - primary key `id uuid`
  - `id` references `auth.users(id)`
  - `role text`
  - `is_active boolean`
  - roles used by this app: `Owner`, `Co-Owner`, `Admin`, `User`
- `public.customers`
  - primary key `id uuid`
  - used by `fuel_credit_receipts.customer_id`
- `auth.users`
  - provided by Supabase Auth

Do not remove those shared tables unless the fuel schema is also changed.

## 1. Run the SQL schema

Open your Supabase project.

1. Go to Supabase Dashboard.
2. Open your project.
3. Open SQL Editor.
4. Create a new query.
5. Paste the full contents of `supabase/RUN_THIS_IN_SUPABASE.sql`.
6. Run it.

The SQL creates or updates:

- fuel station tables
- shift report tables
- pump and product tables
- credit receipt, expense, cash count, and lubricant tables
- import batch and export tracking tables
- RLS policies
- audit triggers using the existing `audit_logs` table
- `fuel_calculate_shift_report(payload jsonb)`
- `fuel_commit_shift_report(payload jsonb, import_context jsonb)`

## 2. Verify your user profile role

The signed-in user must have an active profile. `Owner` or `Admin` is required to create reports.

Run:

```sql
select id, email, username, role, is_active
from public.profiles
order by created_at desc;
