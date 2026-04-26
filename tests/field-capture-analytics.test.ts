import { describe, expect, it } from "vitest";
import {
  buildFieldCaptureReviewSummary,
  calculateDraftCashTotal,
  calculateDraftCreditTotal,
  calculateDraftExpensesTotal,
  calculateDraftMeterLitersOut,
  calculateDraftNetRemittance
} from "@/lib/analytics/field-capture";

describe("field capture analytics", () => {
  it("calculates meter liters out as closing - opening - calibration", () => {
    const result = calculateDraftMeterLitersOut([{ opening_reading: 100, closing_reading: 160, calibration_liters: 5 }]);
    expect(result).toBe(55);
  });

  it("sums cash as denomination x quantity", () => {
    const result = calculateDraftCashTotal([{ denomination: 100, quantity: 3 }, { denomination: 50, quantity: 2 }]);
    expect(result).toBe(400);
  });

  it("sums expenses and credit amounts", () => {
    expect(calculateDraftExpensesTotal([{ amount: 100 }, { amount: 50.5 }])).toBe(150.5);
    expect(calculateDraftCreditTotal([{ amount: 20 }, { amount: 30 }]).totalAmount).toBe(50);
  });

  it("calculates net remittance", () => {
    const result = calculateDraftNetRemittance({ cashTotal: 1000, expensesTotal: 100, creditTotal: 150, lubricantSalesTotal: 50 });
    expect(result).toBe(800);
  });

  it("handles missing arrays in summary", () => {
    const result = buildFieldCaptureReviewSummary({});
    expect(result.totals.actualCashCount).toBe(0);
  });
});
