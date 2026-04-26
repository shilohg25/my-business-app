import { describe, expect, it } from "vitest";
import {
  canAccessRoute,
  canCreateManualShiftReport,
  canRecordFieldFuelDelivery,
  canUseFieldCapture,
  getVisibleNavItemsForRole
} from "@/lib/auth/role-access";
import { sidebarItems } from "@/lib/navigation/sidebar-items";

describe("role access", () => {
  it("User can access /field-capture/", () => {
    expect(canAccessRoute("User", "/field-capture/")).toBe(true);
  });

  it("User can access /shift-reports/", () => {
    expect(canAccessRoute("User", "/shift-reports/")).toBe(true);
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

  it("Owner can access all", () => {
    expect(canAccessRoute("Owner", "/inventory/fuel/")).toBe(true);
    expect(canAccessRoute("Owner", "/settings/")).toBe(true);
  });

  it("only Owner/Admin can create manual shift reports", () => {
    expect(canCreateManualShiftReport("Owner")).toBe(true);
    expect(canCreateManualShiftReport("Admin")).toBe(true);
    expect(canCreateManualShiftReport("Co-Owner")).toBe(false);
    expect(canCreateManualShiftReport("User")).toBe(false);
  });

  it("field capture is available to all active app roles", () => {
    expect(canUseFieldCapture("Owner")).toBe(true);
    expect(canUseFieldCapture("Admin")).toBe(true);
    expect(canUseFieldCapture("Co-Owner")).toBe(true);
    expect(canUseFieldCapture("User")).toBe(true);
  });

  it("field fuel delivery is limited to Owner/Admin/User", () => {
    expect(canRecordFieldFuelDelivery("Owner")).toBe(true);
    expect(canRecordFieldFuelDelivery("Admin")).toBe(true);
    expect(canRecordFieldFuelDelivery("User")).toBe(true);
    expect(canRecordFieldFuelDelivery("Co-Owner")).toBe(false);
  });

  it("User nav only includes Field Shift Capture and Daily Shift Reports", () => {
    const labels = getVisibleNavItemsForRole("User", sidebarItems).map((item) => item.label);
    expect(labels).toEqual(["Field Shift Capture", "Daily Shift Reports"]);
  });
});
