import { describe, expect, it } from "vitest";
import { canAccessRoute } from "@/lib/auth/role-access";

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

  it("Owner can access all", () => {
    expect(canAccessRoute("Owner", "/inventory/fuel/")).toBe(true);
    expect(canAccessRoute("Owner", "/settings/")).toBe(true);
  });
});
