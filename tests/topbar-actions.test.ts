import { describe, expect, it } from "vitest";
import { getTopbarPrimaryAction } from "@/components/app/topbar";

describe("topbar role actions", () => {
  it("User role has no primary action", () => {
    expect(getTopbarPrimaryAction("User", "/shift-reports/")).toBeNull();
  });

  it("Owner/Admin can render Manual Shift Report fallback", () => {
    expect(getTopbarPrimaryAction("Owner", "/dashboard/")?.label).toBe("Manual Shift Report");
    expect(getTopbarPrimaryAction("Admin", "/dashboard/")?.label).toBe("Manual Shift Report");
  });
});
