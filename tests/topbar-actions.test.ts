import { describe, expect, it } from "vitest";
import { getTopbarPrimaryAction } from "@/components/app/topbar";

describe("topbar role actions", () => {
  it("User role does not render Manual Shift Report and gets Start Field Capture off field page", () => {
    const action = getTopbarPrimaryAction("User", "/shift-reports/");
    expect(action?.label).toBe("Start Field Capture");
  });

  it("User role has no topbar action on /field-capture/", () => {
    expect(getTopbarPrimaryAction("User", "/field-capture/")).toBeNull();
  });

  it("Owner/Admin can render Manual Shift Report fallback", () => {
    expect(getTopbarPrimaryAction("Owner", "/dashboard/")?.label).toBe("Manual Shift Report");
    expect(getTopbarPrimaryAction("Admin", "/dashboard/")?.label).toBe("Manual Shift Report");
  });
});
