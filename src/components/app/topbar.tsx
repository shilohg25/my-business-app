"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { appPath, createSupabaseBrowserClient, isSupabaseConfigured, signOutOfSupabase } from "@/lib/supabase/client";

export function Topbar() {
  const [email, setEmail] = useState<string | null>(null);
  const [authReady, setAuthReady] = useState(false);
  const [authError, setAuthError] = useState<string | null>(null);
  const configured = isSupabaseConfigured();

  useEffect(() => {
    if (!configured) {
      setAuthReady(true);
      setEmail(null);
      return;
    }

    const supabase = createSupabaseBrowserClient();

    supabase.auth
      .getSession()
      .then(({ data, error }) => {
        if (error) throw error;
        setEmail(data.session?.user.email ?? null);
      })
      .catch((error: Error) => setAuthError(error.message))
      .finally(() => setAuthReady(true));

    const {
      data: { subscription }
    } = supabase.auth.onAuthStateChange((_event, session) => {
      setEmail(session?.user.email ?? null);
      setAuthReady(true);
    });

    return () => subscription.unsubscribe();
  }, [configured]);

  async function signOut() {
    setAuthError(null);

    try {
      await signOutOfSupabase();
      setEmail(null);
      window.location.assign(appPath("/login/"));
    } catch (error) {
      setAuthError(error instanceof Error ? error.message : "Unable to sign out.");
    }
  }

  return (
    <header className="no-print flex min-h-16 items-center justify-between gap-4 border-b bg-white px-6 py-3">
      <div>
        <div className="text-sm font-medium text-slate-900">Operations Console</div>
        <div className="text-xs text-slate-500">Shift reports, remittance, inventory, and audit</div>
        {authError ? <div className="mt-1 text-xs text-red-700">{authError}</div> : null}
      </div>

      <div className="flex flex-wrap items-center justify-end gap-2">
        {configured && authReady && email ? (
          <span className="max-w-56 truncate rounded-full border bg-slate-50 px-3 py-1 text-xs text-slate-600">
            {email}
          </span>
        ) : null}

        <Button variant="outline" onClick={() => window.print()}>
          Print
        </Button>

        <Link
          className="inline-flex h-10 items-center justify-center rounded-xl bg-slate-900 px-4 text-sm font-medium text-white hover:bg-slate-800"
          href="/shift-reports/new"
        >
          New Shift Report
        </Link>

        {!configured ? (
          <Link className="inline-flex h-10 items-center justify-center rounded-xl border px-4 text-sm font-medium" href="/login">
            Setup
          </Link>
        ) : email ? (
          <Button variant="outline" onClick={signOut}>
            Sign out
          </Button>
        ) : (
          <Link className="inline-flex h-10 items-center justify-center rounded-xl border px-4 text-sm font-medium" href="/login">
            Login
          </Link>
        )}
      </div>
    </header>
  );
}
