import { describe, expect, it } from "vitest";
import { sidebarItems } from "@/lib/navigation/sidebar-items";

describe("sidebar navigation", () => {
  const labels = sidebarItems.map((item) => item.label);

  it("does not include Shift Setup", () => {
    expect(labels).not.toContain("Shift Setup");
  });

  it("does not include Field Shift Capture", () => {
    expect(labels).not.toContain("Field Shift Capture");
  });

  it("includes all expected operations links", () => {
    expect(labels).toEqual(
      expect.arrayContaining([
        "Dashboard",
        "Stations",
        "Daily Shift Reports",
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
