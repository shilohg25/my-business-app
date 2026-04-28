import {
  BarChart3,
  ClipboardList,
  Database,
  Fuel,
  ReceiptText,
  History,
  Package,
  Settings,
  UserCheck,
  Warehouse,
  type LucideIcon
} from "lucide-react";

export interface SidebarItem {
  href: string;
  label: string;
  icon: LucideIcon;
}

export const sidebarItems: SidebarItem[] = [
  { href: "/dashboard/", label: "Dashboard", icon: BarChart3 },
  { href: "/stations/", label: "Stations", icon: Fuel },
  { href: "/shift-reports/", label: "Daily Shift Reports", icon: ClipboardList },
  { href: "/expenses/", label: "Expenses", icon: ReceiptText },
  { href: "/inventory/bodega/", label: "Bodega Inventory", icon: Warehouse },
  { href: "/inventory/lubricants/", label: "Station Lubricants", icon: Package },
  { href: "/inventory/fuel/", label: "Fuel Inventory", icon: Fuel },
  { href: "/reports/", label: "Management Reports", icon: Database },
  { href: "/audit-logs/", label: "Audit Logs", icon: History },
  { href: "/station-assignments/", label: "Station Assignments", icon: UserCheck },
  { href: "/settings/", label: "Settings", icon: Settings }
];
