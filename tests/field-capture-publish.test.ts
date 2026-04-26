import { describe, expect, it } from "vitest";
import {
  calculateDraftCashTotal,
  calculateDraftMeterRows,
  normalizeFieldCaptureProductCode
} from "@/lib/analytics/field-capture";
import { getPublishedShiftReportUrl } from "@/lib/data/field-capture";
import { getShiftReportSourceLabel } from "@/lib/domain/source-labels";

describe("field capture publish helpers", () => {
  it("maps meter row before/after correctly", () => {
    const result = calculateDraftMeterRows([{ opening_reading: 100, closing_reading: 160, calibration_liters: 10, product_code: "ADO" }]);
    expect(result.rows[0]?.opening).toBe(100);
    expect(result.rows[0]?.closing).toBe(160);
    expect(result.rows[0]?.netLitersOut).toBe(50);
  });

  it("normalizes REGULAR to UNLEADED", () => {
    expect(normalizeFieldCaptureProductCode("Regular")).toBe("UNLEADED");
  });

  it("computes cash count amount as denomination x quantity", () => {
    expect(calculateDraftCashTotal([{ denomination: 1000, quantity: 2 }])).toBe(2000);
  });

  it("ignores invalid meter rows safely in net totals", () => {
    const result = calculateDraftMeterRows([{ opening_reading: 50, closing_reading: 40, calibration_liters: 0 }]);
    expect(result.netMeterLitersOut).toBe(0);
    expect(result.warnings.some((w) => w.includes("Negative liters out"))).toBe(true);
  });

  it("uses query param id for published report URLs", () => {
    const url = getPublishedShiftReportUrl("abc");
    expect(url).toContain("/shift-reports/view/?id=abc");
    expect(url).not.toContain("/shift-reports/view/abc");
  });

  it("maps mobile submission source label", () => {
    expect(getShiftReportSourceLabel("mobile_submission")).toBe("Mobile submission");
  });
});
