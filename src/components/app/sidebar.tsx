"use client";

import { useEffect, useMemo, useState } from "react";
import { X } from "lucide-react";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import { appPath } from "@/lib/supabase/client";
import { sidebarItems } from "@/lib/navigation/sidebar-items";
import { getVisibleNavItemsForRole } from "@/lib/auth/role-access";
import { fetchCurrentProfile, type AppRole } from "@/lib/data/profile";

type SidebarProps = {
  mobileOpen?: boolean;
  onCloseMobile?: () => void;
};

function SidebarContent({ pathname, onNavigate }: { pathname: string; onNavigate?: () => void }) {
  const [role, setRole] = useState<AppRole | null>(null);

  useEffect(() => {
    fetchCurrentProfile()
      .then((profile) => setRole((profile?.role as AppRole | null) ?? null))
      .catch(() => setRole(null));
  }, []);

  const visibleItems = useMemo(() => getVisibleNavItemsForRole(role, sidebarItems), [role]);

  return (
    <>
      <div className="mb-6 flex items-center gap-3">
        <div className="relative h-12 w-12 overflow-hidden rounded-full border bg-white sm:h-14 sm:w-14">
          <img src={appPath("/logo.png")} alt="AKY logo" className="h-full w-full object-contain" />
        </div>
        <div>
          <div className="font-semibold">AKY Fuel Ops</div>
          <div className="text-xs text-slate-500">Owner/Admin console</div>
        </div>
      </div>

      <nav className="space-y-1">
        {visibleItems.map((item) => {
          const normalizedItemPath = item.href.replace(/\/$/, "");
          const isActive = pathname === normalizedItemPath || pathname.startsWith(`${normalizedItemPath}/`);

          return (
            <a
              key={item.href}
              href={appPath(item.href)}
              onClick={onNavigate}
              className={cn(
                "flex min-h-11 items-center gap-3 rounded-xl px-3 py-2 text-sm transition",
                isActive ? "bg-slate-900 text-white" : "text-slate-700 hover:bg-slate-100 hover:text-slate-950"
              )}
            >
              <item.icon className="h-4 w-4" />
              {item.label}
            </a>
          );
        })}
      </nav>
    </>
  );
}

export function Sidebar({ mobileOpen = false, onCloseMobile }: SidebarProps) {
  const pathname = usePathname();

  return (
    <>
      <aside className="no-print hidden w-72 shrink-0 border-r bg-white px-4 py-5 lg:block">
        <SidebarContent pathname={pathname} />
      </aside>

      {mobileOpen ? (
        <div className="no-print fixed inset-0 z-50 flex lg:hidden" role="dialog" aria-modal="true" aria-label="Navigation menu">
          <button className="flex-1 bg-black/40" onClick={onCloseMobile} aria-label="Close navigation" type="button" />
          <aside className="relative h-full w-[85vw] max-w-xs border-l bg-white px-4 py-5 shadow-xl">
            <button
              type="button"
              onClick={onCloseMobile}
              className="absolute right-3 top-3 inline-flex h-10 w-10 items-center justify-center rounded-xl border border-slate-200 bg-white text-slate-700"
              aria-label="Close menu"
            >
              <X className="h-4 w-4" />
            </button>
            <SidebarContent pathname={pathname} onNavigate={onCloseMobile} />
          </aside>
        </div>
      ) : null}
    </>
  );
}
