import { describe, expect, it } from "vitest";
import {
  canAccessRoute,
  canCreateManualShiftReport,
  canRecordFieldFuelDelivery,
  getVisibleNavItemsForRole
} from "@/lib/auth/role-access";
import { sidebarItems } from "@/lib/navigation/sidebar-items";

describe("role access", () => {
  it("User can access /shift-reports/", () => {
    expect(canAccessRoute("User", "/shift-reports/")).toBe(true);
  });

  it("User can access /shift-reports/view/", () => {
    expect(canAccessRoute("User", "/shift-reports/view/?id=abc")).toBe(true);
  });

  it("User cannot access /shift-reports/new/", () => {
    expect(canAccessRoute("User", "/shift-reports/new/")).toBe(false);
  });

  it("User cannot access /inventory/fuel/", () => {
    expect(canAccessRoute("User", "/inventory/fuel/")).toBe(false);
  });

  it("User cannot access /settings/", () => {
    expect(canAccessRoute("User", "/settings/")).toBe(false);
  });

  it("User cannot access /dashboard/", () => {
    expect(canAccessRoute("User", "/dashboard/")).toBe(false);
  });


  it("audit logs and settings are owner-only routes", () => {
    expect(canAccessRoute("Owner", "/audit-logs/")).toBe(true);
    expect(canAccessRoute("Admin", "/audit-logs/")).toBe(false);
    expect(canAccessRoute("Co-Owner", "/settings/")).toBe(false);
  });

  it("Owner can access all", () => {
    expect(canAccessRoute("Owner", "/inventory/fuel/")).toBe(true);
    expect(canAccessRoute("Owner", "/settings/")).toBe(true);
  });

  it("non-user roles can create manual shift reports", () => {
    expect(canCreateManualShiftReport("Owner")).toBe(true);
    expect(canCreateManualShiftReport("Admin")).toBe(true);
    expect(canCreateManualShiftReport("Co-Owner")).toBe(true);
    expect(canCreateManualShiftReport("User")).toBe(false);
  });

  it("field fuel delivery is limited to Owner/Admin/User", () => {
    expect(canRecordFieldFuelDelivery("Owner")).toBe(true);
    expect(canRecordFieldFuelDelivery("Admin")).toBe(true);
    expect(canRecordFieldFuelDelivery("User")).toBe(true);
    expect(canRecordFieldFuelDelivery("Co-Owner")).toBe(false);
  });

  it("User nav only includes Daily Shift Reports", () => {
    const labels = getVisibleNavItemsForRole("User", sidebarItems).map((item) => item.label);
    expect(labels).toEqual(["Daily Shift Reports"]);
  });
});
