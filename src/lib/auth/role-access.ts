import type { SidebarItem } from "@/lib/navigation/sidebar-items";

export type AppRole = "Owner" | "Co-Owner" | "Admin" | "User";

const USER_ALLOWED_EXACT_PATHS = ["/", "/shift-reports/"];
const USER_ALLOWED_PREFIXES = ["/shift-reports/view/"];

function normalizePathname(pathname: string) {
  if (!pathname) return "/";
  const withoutQuery = pathname.split("?")[0] ?? "/";
  if (withoutQuery === "/") return "/";
  return withoutQuery.endsWith("/") ? withoutQuery : `${withoutQuery}/`;
}

export function canAccessRoute(role: AppRole | null, pathname: string): boolean {
  const normalizedPath = normalizePathname(pathname);

  if (!role) return false;
  if (role === "Owner") return true;
  if (role === "Admin") return true;
  if (role === "Co-Owner") return true;

  if (role === "User") {
    if (USER_ALLOWED_EXACT_PATHS.includes(normalizedPath)) return true;
    return USER_ALLOWED_PREFIXES.some((prefix) => normalizedPath.startsWith(prefix));
  }

  return false;
}

export function canCreateManualShiftReport(role: AppRole | null): boolean {
  return role === "Owner" || role === "Admin";
}

export function canRecordFieldFuelDelivery(role: AppRole | null): boolean {
  return role === "Owner" || role === "Admin" || role === "User";
}

export function getDefaultRouteForRole(role: AppRole | null) {
  if (role === "User") return "/shift-reports/";
  return "/dashboard/";
}

export function getVisibleNavItemsForRole(role: AppRole | null, navItems: SidebarItem[]) {
  if (role !== "User") return navItems;

  const order = ["Daily Shift Reports"];
  const filtered = navItems.filter((item) => order.includes(item.label));
  return filtered.sort((a, b) => order.indexOf(a.label) - order.indexOf(b.label));
}
