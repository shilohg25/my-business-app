import { describe, expect, it } from "vitest";
import { formatSignedCurrency, getDiscrepancyLabel, getDiscrepancyStatus } from "@/lib/analytics/discrepancy";

describe("discrepancy analytics", () => {
  it("returns cash overage label and plus currency for positive discrepancy", () => {
    expect(getDiscrepancyStatus(123.45)).toEqual({ tone: "positive", label: "Cash overage" });
    expect(getDiscrepancyLabel(123.45)).toBe("Cash overage");
    expect(formatSignedCurrency(123.45)).toBe("+₱123.45");
  });

  it("returns cash shortage label and minus currency for negative discrepancy", () => {
    expect(getDiscrepancyStatus(-123.45)).toEqual({ tone: "negative", label: "Cash shortage" });
    expect(getDiscrepancyLabel(-123.45)).toBe("Cash shortage");
    expect(formatSignedCurrency(-123.45)).toBe("-₱123.45");
  });

  it("returns balanced label and zero currency for zero discrepancy", () => {
    expect(getDiscrepancyStatus(0)).toEqual({ tone: "neutral", label: "Balanced" });
    expect(getDiscrepancyLabel(0)).toBe("Balanced");
    expect(formatSignedCurrency(0)).toBe("₱0.00");
  });
});
