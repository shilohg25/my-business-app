import { describe, expect, it } from "vitest";
import {
  buildFieldCaptureReviewSummary,
  calculateCashDiscrepancy,
  calculateExpectedCashRemittance,
  calculateFuelSalesFromMeterRows,
  getDiscrepancyStatus,
  normalizeFuelProductCode,
  toNumber
} from "@/lib/analytics/field-capture";

describe("field capture cash logic", () => {
  it("fuel sales = liters × price", () => {
    const result = calculateFuelSalesFromMeterRows([{ product: "Diesel", opening_reading: 10, closing_reading: 30 }], { DIESEL: 2, SPECIAL: null, UNLEADED: null });
    expect(result.fuelSalesAmount).toBe(40);
  });

  it("missing price creates warning and sales amount 0", () => {
    const summary = buildFieldCaptureReviewSummary({ meter_readings: [{ product: "Diesel", opening_reading: 0, closing_reading: 20 }] });
    expect(summary.byProduct.DIESEL.salesAmount).toBe(0);
    expect(summary.warnings.some((item) => item.includes("Missing price for Diesel"))).toBe(true);
  });

  it("credit and expenses reduce expected cash, lubricant increases", () => {
    const expected = calculateExpectedCashRemittance({ fuelCashSales: 1000, lubricantSales: 50, creditAmount: 100, expenses: 25 });
    expect(expected).toBe(925);
  });

  it("actual cash minus expected = discrepancy", () => {
    expect(calculateCashDiscrepancy({ actualCashCount: 930, expectedCashRemittance: 925 })).toBe(5);
  });

  it("discrepancy status labels are correct", () => {
    expect(getDiscrepancyStatus(10).label).toBe("Cash overage");
    expect(getDiscrepancyStatus(-10).label).toBe("Cash shortage");
    expect(getDiscrepancyStatus(0).label).toBe("Balanced");
  });

  it("invalid numbers become 0", () => {
    expect(toNumber("bad")).toBe(0);
  });

  it("Regular normalizes to UNLEADED", () => {
    expect(normalizeFuelProductCode("Regular")).toBe("UNLEADED");
  });
});
