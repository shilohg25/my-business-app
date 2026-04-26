import { describe, expect, it } from "vitest";
import { sidebarItems } from "@/lib/navigation/sidebar-items";

describe("sidebar navigation", () => {
  const labels = sidebarItems.map((item) => item.label);

  it("does not include Shift Setup", () => {
    expect(labels).not.toContain("Shift Setup");
  });

  it("includes key operations routes", () => {
    expect(labels).toContain("Field Shift Capture");
    expect(labels).toContain("Bodega Inventory");
    expect(labels).toContain("Fuel Inventory");
  });
});
