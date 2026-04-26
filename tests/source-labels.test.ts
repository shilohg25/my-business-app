import { describe, expect, it } from "vitest";
import { getShiftReportSourceLabel } from "@/lib/domain/source-labels";

describe("getShiftReportSourceLabel", () => {
  it("maps known source values to user-friendly labels", () => {
    expect(getShiftReportSourceLabel("web_manual")).toBe("Manual entry");
    expect(getShiftReportSourceLabel("mobile_submission")).toBe("Mobile submission");
    expect(getShiftReportSourceLabel("excel_import")).toBe("Legacy Excel import");
  });

  it("falls back safely for unknown or missing values", () => {
    expect(getShiftReportSourceLabel("custom_source")).toBe("custom_source");
    expect(getShiftReportSourceLabel(null)).toBe("-");
  });
});
