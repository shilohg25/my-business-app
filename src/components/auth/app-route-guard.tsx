"use client";

import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import { Button } from "@/components/ui/button";
import { canAccessRoute, getDefaultRouteForRole } from "@/lib/auth/role-access";
import { fetchCurrentProfile, type AppRole } from "@/lib/data/profile";
import { appPath, stripAppBasePath } from "@/lib/supabase/client";

export function AppRouteGuard({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const [loading, setLoading] = useState(true);
  const [role, setRole] = useState<AppRole | null>(null);
  const [hasProfile, setHasProfile] = useState(true);

  useEffect(() => {
    let mounted = true;

    fetchCurrentProfile()
      .then((profile) => {
        if (!mounted) return;
        setRole((profile?.role as AppRole | null) ?? null);
        setHasProfile(Boolean(profile));
      })
      .catch(() => {
        if (!mounted) return;
        setHasProfile(false);
        setRole(null);
      })
      .finally(() => {
        if (mounted) setLoading(false);
      });

    return () => {
      mounted = false;
    };
  }, []);

  const currentPath = stripAppBasePath(pathname ?? "/");

  useEffect(() => {
    if (loading || role !== "User") return;
    if (currentPath === "/" || currentPath === "/dashboard") {
      window.location.replace(appPath(getDefaultRouteForRole(role)));
    }
  }, [loading, role, currentPath]);

  if (loading) {
    return <div className="rounded-xl border bg-white p-3 text-sm text-slate-600">Checking access...</div>;
  }

  if (!hasProfile) {
    return <div className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">No active profile found for this login.</div>;
  }

  if (canAccessRoute(role, currentPath)) {
    return <>{children}</>;
  }

  return (
    <div className="mx-auto max-w-xl rounded-2xl border border-red-200 bg-white p-6 text-center">
      <h2 className="text-lg font-semibold text-slate-900">Access denied</h2>
      <p className="mt-2 text-sm text-slate-600">This page is restricted for your role.</p>
      <div className="mt-4 flex justify-center gap-3">
        <a href={appPath("/shift-reports/")}><Button type="button">Go to Daily Shift Reports</Button></a>
      </div>
    </div>
  );
}
