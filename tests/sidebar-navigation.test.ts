import { describe, expect, it } from "vitest";
import { sidebarItems } from "@/lib/navigation/sidebar-items";

describe("sidebar navigation", () => {
  const labels = sidebarItems.map((item) => item.label);

  it("does not include Shift Setup", () => {
    expect(labels).not.toContain("Shift Setup");
  });

  it("includes all expected operations links", () => {
    expect(labels).toEqual(
      expect.arrayContaining([
        "Dashboard",
        "Stations",
        "Daily Shift Reports",
        "Field Shift Capture",
        "Expenses",
        "Bodega Inventory",
        "Station Lubricants",
        "Fuel Inventory",
        "Management Reports",
        "Audit Logs",
        "Settings"
      ])
    );
  });
});
