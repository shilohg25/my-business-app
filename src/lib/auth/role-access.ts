import type { AppRole } from "@/types/auth";
import type { SidebarItem } from "@/lib/navigation/sidebar-items";
import { hasPermission } from "@/lib/auth/permissions";

const USER_ALLOWED_EXACT_PATHS = ["/", "/shift-reports/"];
const USER_ALLOWED_PREFIXES = ["/shift-reports/view/"];
const OWNER_ONLY_EXACT_PATHS = ["/audit-logs/", "/settings/"];

function normalizePathname(pathname: string) {
  if (!pathname) return "/";
  const withoutQuery = pathname.split("?")[0] ?? "/";
  if (withoutQuery === "/") return "/";
  return withoutQuery.endsWith("/") ? withoutQuery : `${withoutQuery}/`;
}

export function canAccessRoute(role: AppRole | null, pathname: string): boolean {
  const normalizedPath = normalizePathname(pathname);

  if (!role) return false;

  if (role === "User") {
    if (USER_ALLOWED_EXACT_PATHS.includes(normalizedPath)) return true;
    return USER_ALLOWED_PREFIXES.some((prefix) => normalizedPath.startsWith(prefix));
  }

  if (OWNER_ONLY_EXACT_PATHS.includes(normalizedPath)) {
    return role === "Owner";
  }

  return true;
}

export function canCreateManualShiftReport(role: AppRole | null): boolean {
  return hasPermission(role, "create") && role !== "User";
}

export function canRecordFieldFuelDelivery(role: AppRole | null): boolean {
  return role === "Owner" || role === "Admin" || role === "User";
}

export function getDefaultRouteForRole(role: AppRole | null) {
  if (role === "User") return "/shift-reports/";
  return "/dashboard/";
}

export function getVisibleNavItemsForRole(role: AppRole | null, navItems: SidebarItem[]) {
  if (role === "User") {
    const order = ["Daily Shift Reports"];
    const filtered = navItems.filter((item) => order.includes(item.label));
    return filtered.sort((a, b) => order.indexOf(a.label) - order.indexOf(b.label));
  }

  if (role !== "Owner") {
    return navItems.filter((item) => !OWNER_ONLY_EXACT_PATHS.includes(item.href));
  }

  return navItems;
}
