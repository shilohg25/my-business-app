import Image from "next/image";
import Link from "next/link";
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

const items = [
  { href: "/dashboard", label: "Dashboard", icon: BarChart3 },
  { href: "/stations", label: "Stations", icon: Fuel },
  { href: "/shifts", label: "Shifts", icon: Gauge },
  { href: "/shift-reports", label: "Shift Reports", icon: ClipboardList },
  { href: "/imports", label: "Imports", icon: FileInput },
  { href: "/reports", label: "Reports", icon: Database },
  { href: "/inventory/lubricants", label: "Lubricants", icon: Package },
  { href: "/inventory/bodega", label: "Bodega", icon: Package },
  { href: "/audit-logs", label: "Audit Logs", icon: History },
  { href: "/settings", label: "Settings", icon: Settings }
];

export function Sidebar() {
  return (
    <aside className="no-print hidden w-72 shrink-0 border-r bg-white px-4 py-5 lg:block">
      <div className="mb-6 flex items-center gap-3">
        <div className="relative h-14 w-14 overflow-hidden rounded-full border bg-white">
          <Image src="/logo.png" alt="AKY logo" fill className="object-contain" priority />
        </div>
        <div>
          <div className="font-semibold">AKY Fuel Ops</div>
          <div className="text-xs text-slate-500">Owner/Admin console</div>
        </div>
      </div>
      <nav className="space-y-1">
        {items.map((item) => (
          <Link
            key={item.href}
            href={item.href}
            className="flex items-center gap-3 rounded-xl px-3 py-2 text-sm text-slate-700 hover:bg-slate-100"
          >
            <item.icon className="h-4 w-4" />
            {item.label}
          </Link>
        ))}
      </nav>
    </aside>
  );
}
