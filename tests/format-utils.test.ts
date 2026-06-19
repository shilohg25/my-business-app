import { describe, expect, it } from "vitest";
import {
  formatDecimal,
  formatFixedLiters,
  formatLiters,
  formatVariance,
} from "@/lib/utils/format";

describe("format utils", () => {
  it("formats display decimals with a configurable precision and fallback", () => {
    expect(formatDecimal(1234.5)).toBe("1,234.50");
    expect(formatDecimal("7", 0)).toBe("7");
    expect(formatDecimal(null, 2, "—")).toBe("—");
  });

  it("formats fixed-width liters without grouping", () => {
    expect(formatFixedLiters(1234.5)).toBe("1234.500");
    expect(formatFixedLiters("2.3456")).toBe("2.346");
    expect(formatFixedLiters(undefined)).toBe("-");
  });

  it("keeps compact liter and variance formatting", () => {
    expect(formatLiters(10)).toBe("10");
    expect(formatLiters(10.5)).toBe("10.5");
    expect(formatVariance(2.25)).toBe("+2.25");
    expect(formatVariance(-2.25)).toBe("-2.25");
  });
});
