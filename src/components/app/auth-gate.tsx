"use client";

import { useEffect, useState } from "react";
import { appPath, createSupabaseBrowserClient, currentAppPath, isSupabaseConfigured } from "@/lib/supabase/client";

interface AuthGateProps {
  children: React.ReactNode;
}

type AuthState = "checking" | "allowed" | "error";

export function AuthGate({ children }: AuthGateProps) {
  const [state, setState] = useState<AuthState>("checking");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const configured = isSupabaseConfigured();

  useEffect(() => {
    if (!configured) {
      setState("error");
      setErrorMessage("Supabase is not configured. Check GitHub Actions secrets.");
      return;
    }

    let active = true;
    const supabase = createSupabaseBrowserClient();

    function redirectToLogin() {
      const currentPath = currentAppPath();
      window.location.replace(appPath(`/login/?redirectTo=${encodeURIComponent(currentPath)}`));
    }

    supabase.auth
      .getSession()
      .then(({ data, error }) => {
        if (!active) return;
        if (error) throw error;
        if (!data.session) {
          redirectToLogin();
          return;
        }
        setState("allowed");
      })
      .catch((error: Error) => {
        if (!active) return;
        setErrorMessage(error.message);
        setState("error");
      });

    const {
      data: { subscription }
    } = supabase.auth.onAuthStateChange((_event, session) => {
      if (!active) return;
      if (!session) {
        redirectToLogin();
        return;
      }
      setState("allowed");
    });

    return () => {
      active = false;
      subscription.unsubscribe();
    };
  }, [configured]);

  if (state === "allowed") return <>{children}</>;

  if (state === "error") {
    return (
      <main className="flex min-h-screen items-center justify-center bg-slate-50 p-6">
        <div className="max-w-md rounded-2xl border bg-white p-6 shadow-sm">
          <h1 className="text-lg font-semibold text-slate-900">Authentication check failed</h1>
          <p className="mt-2 text-sm text-slate-600">{errorMessage ?? "Unable to verify the current session."}</p>
          <a className="mt-4 inline-flex h-10 items-center justify-center rounded-xl bg-slate-900 px-4 text-sm font-medium text-white" href={appPath("/login/")}>Login</a>
        </div>
      </main>
    );
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-slate-50 p-6 text-sm text-slate-600">
      Checking session...
    </main>
  );
}
