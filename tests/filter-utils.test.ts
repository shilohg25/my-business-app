import { describe, expect, it, vi } from "vitest";
import { areFiltersDefault, getCurrentMonthDateRange } from "@/lib/utils/filters";

describe("filter utils", () => {
  it("getCurrentMonthDateRange returns first day of month and today", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-04-26T12:00:00Z"));

    expect(getCurrentMonthDateRange()).toEqual({
      startDate: "2026-04-01",
      endDate: "2026-04-26"
    });

    vi.useRealTimers();
  });

  it("areFiltersDefault returns true for matching filters", () => {
    const defaults = { station: "all", product: "all", startDate: "2026-04-01", endDate: "2026-04-26" };
    const current = { station: "all", product: "all", startDate: "2026-04-01", endDate: "2026-04-26" };

    expect(areFiltersDefault(current, defaults)).toBe(true);
  });

  it("areFiltersDefault returns false when filters differ", () => {
    const defaults = { station: "all", product: "all", startDate: "2026-04-01", endDate: "2026-04-26" };

    expect(areFiltersDefault({ ...defaults, station: "st-1" }, defaults)).toBe(false);
    expect(areFiltersDefault({ ...defaults, product: "DIESEL" }, defaults)).toBe(false);
    expect(areFiltersDefault({ ...defaults, startDate: "2026-04-02" }, defaults)).toBe(false);
  });

  it("normalizes empty string and nullish values", () => {
    const defaults: Record<string, unknown> = { station: "all", search: "" };

    expect(areFiltersDefault({ station: "all", search: undefined }, defaults)).toBe(true);
    expect(areFiltersDefault({ station: "all", search: null }, defaults)).toBe(true);
  });
});
