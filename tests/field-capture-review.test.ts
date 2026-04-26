import { describe, expect, it } from "vitest";
import { buildFieldCaptureReviewSummary, calculateDraftMeterRows } from "@/lib/analytics/field-capture";
import { getFieldCaptureReviewUrl } from "@/lib/data/field-capture";

describe("field capture review", () => {
  it("calculates meter liters out", () => {
    const result = calculateDraftMeterRows([{ opening_reading: 10, closing_reading: 60, calibration_liters: 5 }]);
    expect(result.netMeterLitersOut).toBe(45);
  });

  it("adds negative liters warning", () => {
    const result = calculateDraftMeterRows([{ opening_reading: 100, closing_reading: 10, calibration_liters: 0 }]);
    expect(result.warnings.some((w) => w.includes("Negative liters out"))).toBe(true);
  });

  it("adds missing cash count warning", () => {
    const result = buildFieldCaptureReviewSummary({ meter_readings: [] });
    expect(result.warnings).toContain("Missing cash count.");
  });

  it("supports discrepancy labeling directions", () => {
    const overage = buildFieldCaptureReviewSummary({ cash_count: [{ denomination: 100, quantity: 2 }], meter_readings: [{ opening_reading: 0, closing_reading: 100 }] });
    expect(overage.totals.discrepancy > 0).toBe(true);
    const shortage = buildFieldCaptureReviewSummary({ cash_count: [{ denomination: 1, quantity: 1 }], meter_readings: [{ opening_reading: 0, closing_reading: 100 }] });
    expect(shortage.totals.discrepancy < 0).toBe(true);
    const balanced = buildFieldCaptureReviewSummary({ cash_count: [{ denomination: 100, quantity: 1 }], meter_readings: [{ opening_reading: 0, closing_reading: 100 }] });
    expect(balanced.totals.discrepancy).toBe(0);
  });

  it("handles missing arrays in payload", () => {
    const result = buildFieldCaptureReviewSummary(undefined);
    expect(result.totals.totalCreditAmount).toBe(0);
  });

  it("uses review query param URL", () => {
    const url = getFieldCaptureReviewUrl("abc");
    expect(url).toContain("/field-capture/review/?id=abc");
    expect(url).not.toContain("/field-capture/review/abc");
  });
});
