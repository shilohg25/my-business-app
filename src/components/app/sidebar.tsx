"use client";

import { usePathname } from "next/navigation";
import {
  BarChart3,
  ClipboardList,
  Database,
  FileInput,
  Fuel,
  Gauge,
  History,
  Package,
  Settings
} from "lucide-react";
import { cn } from "@/lib/utils";
import { appPath } from "@/lib/supabase/client";

const items = [
  { href: "/dashboard/", label: "Dashboard", icon: BarChart3 },
  { href: "/stations/", label: "Stations", icon: Fuel },
  { href: "/shifts/", label: "Shifts", icon: Gauge },
  { href: "/shift-reports/", label: "Shift Reports", icon: ClipboardList },
  { href: "/imports/", label: "Imports", icon: FileInput },
  { href: "/reports/", label: "Reports", icon: Database },
  { href: "/inventory/lubricants/", label: "Lubricants", icon: Package },
  { href: "/inventory/bodega/", label: "Bodega", icon: Package },
  { href: "/audit-logs/", label: "Audit Logs", icon: History },
  { href: "/settings/", label: "Settings", icon: Settings }
];

export function Sidebar() {
  const pathname = usePathname();

  return (
    <aside className="no-print hidden w-72 shrink-0 border-r bg-white px-4 py-5 lg:block">
      <div className="mb-6 flex items-center gap-3">
        <div className="relative h-14 w-14 overflow-hidden rounded-full border bg-white">
          <img src={appPath("/logo.png")} alt="AKY logo" className="h-full w-full object-contain" />
        </div>
        <div>
          <div className="font-semibold">AKY Fuel Ops</div>
          <div className="text-xs text-slate-500">Owner/Admin console</div>
        </div>
      </div>

      <nav className="space-y-1">
        {items.map((item) => {
          const normalizedItemPath = item.href.replace(/\/$/, "");
          const isActive = pathname === normalizedItemPath || pathname.startsWith(`${normalizedItemPath}/`);

          return (
            <a
              key={item.href}
              href={appPath(item.href)}
              className={cn(
                "flex items-center gap-3 rounded-xl px-3 py-2 text-sm transition",
                isActive
                  ? "bg-slate-900 text-white"
                  : "text-slate-700 hover:bg-slate-100 hover:text-slate-950"
              )}
            >
              <item.icon className="h-4 w-4" />
              {item.label}
            </a>
          );
        })}
      </nav>
    </aside>
  );
}
