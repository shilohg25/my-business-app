"use client";

import { Menu } from "lucide-react";
import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import { Button } from "@/components/ui/button";
import { canCreateManualShiftReport } from "@/lib/auth/role-access";
import { fetchCurrentProfile, type AppRole } from "@/lib/data/profile";
import { appPath, createSupabaseBrowserClient, isSupabaseConfigured, signOutOfSupabase } from "@/lib/supabase/client";

type TopbarProps = {
  onOpenMobileNav?: () => void;
};

export function getTopbarPrimaryAction(role: AppRole | null, currentPath: string) {
  if (canCreateManualShiftReport(role)) {
    return { href: appPath("/shift-reports/new/"), label: "Manual Shift Report" } as const;
  }
  return null;
}

export function Topbar({ onOpenMobileNav }: TopbarProps) {
  const pathname = usePathname();
  const [email, setEmail] = useState<string | null>(null);
  const [role, setRole] = useState<AppRole | null>(null);
  const [authReady, setAuthReady] = useState(false);
  const [authError, setAuthError] = useState<string | null>(null);
  const configured = isSupabaseConfigured();
  const primaryAction = getTopbarPrimaryAction(role, pathname ?? "/");

  useEffect(() => {
    fetchCurrentProfile()
      .then((profile) => setRole((profile?.role as AppRole | null) ?? null))
      .catch(() => setRole(null));
  }, []);

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
    <header className="no-print border-b bg-white px-4 py-3 sm:px-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <Button className="lg:hidden" size="sm" variant="outline" type="button" onClick={onOpenMobileNav}>
              <Menu className="mr-2 h-4 w-4" />
              Menu
            </Button>
            <div className="text-sm font-medium text-slate-900">Operations Console</div>
          </div>
          <div className="text-xs text-slate-500">Shift reports, remittance, inventory, and audit</div>
          {authError ? <div className="mt-1 text-xs text-red-700">{authError}</div> : null}
        </div>

        <div className="flex w-full flex-wrap items-center gap-2 sm:w-auto sm:justify-end">
          {configured && authReady && email ? (
            <span className="max-w-full truncate rounded-full border bg-slate-50 px-3 py-1 text-xs text-slate-600 sm:max-w-56">
              {email}
            </span>
          ) : null}

          <Button variant="outline" onClick={() => window.print()}>
            Print
          </Button>

          {primaryAction ? (
            <a
              className="inline-flex h-11 items-center justify-center rounded-xl bg-slate-900 px-4 text-sm font-medium text-white hover:bg-slate-800"
              href={primaryAction.href}
            >
              {primaryAction.label}
            </a>
          ) : null}

          {!configured ? (
            <a className="inline-flex h-11 items-center justify-center rounded-xl border px-4 text-sm font-medium" href={appPath("/login/")}>Setup</a>
          ) : email ? (
            <Button variant="outline" onClick={signOut}>
              Sign out
            </Button>
          ) : (
            <a className="inline-flex h-11 items-center justify-center rounded-xl border px-4 text-sm font-medium" href={appPath("/login/")}>Login</a>
          )}
        </div>
      </div>
    </header>
  );
}
