import { describe, expect, it } from "vitest";
import { buildExecutiveAnalytics, normalizeProductCode } from "@/lib/analytics/executive";

describe("executive analytics", () => {
  it("groups daily expenses by report_date, not expense created_at", () => {
    const analytics = buildExecutiveAnalytics({
      reports: [
        { id: "r1", report_date: "2026-04-10", duty_name: "A", status: "approved", calculated_totals: {}, discrepancy_amount: 0 }
      ],
      expenses: [
        {
          id: "e1",
          shift_report_id: "r1",
          category: "Fuel",
          description: "desc",
          amount: 100,
          receipt_reference: "RCPT-1",
          created_at: "2026-05-01T10:00:00Z"
        }
      ],
      meterReadings: [],
      creditReceipts: []
    });

    expect(analytics.dailyExpenses).toEqual([{ date: "2026-04-10", amount: 100, count: 1 }]);
  });

  it("aggregates monthly expenses", () => {
    const analytics = buildExecutiveAnalytics({
      reports: [
        { id: "r1", report_date: "2026-04-10", duty_name: "A", status: "approved", calculated_totals: {}, discrepancy_amount: 0 },
        { id: "r2", report_date: "2026-04-12", duty_name: "B", status: "approved", calculated_totals: {}, discrepancy_amount: 0 },
        { id: "r3", report_date: "2026-05-01", duty_name: "C", status: "approved", calculated_totals: {}, discrepancy_amount: 0 }
      ],
      expenses: [
        { id: "e1", shift_report_id: "r1", category: null, description: null, amount: 100, receipt_reference: null, created_at: null },
        { id: "e2", shift_report_id: "r2", category: null, description: null, amount: 50, receipt_reference: null, created_at: null },
        { id: "e3", shift_report_id: "r3", category: null, description: null, amount: 25, receipt_reference: null, created_at: null }
      ],
      meterReadings: [],
      creditReceipts: []
    });

    expect(analytics.monthlyExpenses).toEqual([
      { month: "2026-05", amount: 25, count: 1 },
      { month: "2026-04", amount: 150, count: 2 }
    ]);
  });

  it("normalizes product aliases", () => {
    expect(normalizeProductCode("ADO")).toBe("DIESEL");
    expect(normalizeProductCode("SPU")).toBe("SPECIAL");
    expect(normalizeProductCode("ULG")).toBe("UNLEADED");
    expect(normalizeProductCode("unknown")).toBe("OTHER");
  });


  it("normalizes station product code values with whitespace/case", () => {
    expect(normalizeProductCode("  diesel  ")).toBe("DIESEL");
    expect(normalizeProductCode(" spu ")).toBe("SPECIAL");
    expect(normalizeProductCode(" ulg ")).toBe("UNLEADED");
  });
  it("sums gross liters and subtracts credit and calibration for net cash liters", () => {
    const analytics = buildExecutiveAnalytics({
      reports: [{ id: "r1", report_date: "2026-04-10", duty_name: "A", status: "approved", calculated_totals: {}, discrepancy_amount: 0 }],
      expenses: [],
      meterReadings: [
        {
          id: "m1",
          shift_report_id: "r1",
          product_code_snapshot: "DIESEL",
          before_reading: 100,
          after_reading: 112,
          liters_sold: null,
          calibration_liters: 2
        }
      ],
      creditReceipts: [{ id: "c1", shift_report_id: "r1", product_code_snapshot: "DIESEL", liters: 3, amount: 0, company_name: null, receipt_number: null }]
    });

    expect(analytics.productLiters.DIESEL.grossLitersOut).toBe(12);
    expect(analytics.productLiters.DIESEL.calibrationLiters).toBe(2);
    expect(analytics.productLiters.DIESEL.creditLiters).toBe(3);
    expect(analytics.productLiters.DIESEL.netCashLiters).toBe(7);
  });

  it("uses liters_sold when available instead of computing after-before fallback", () => {
    const analytics = buildExecutiveAnalytics({
      reports: [{ id: "r1", report_date: "2026-04-10", duty_name: "A", status: "approved", calculated_totals: {}, discrepancy_amount: 0 }],
      expenses: [],
      meterReadings: [
        {
          id: "m1",
          shift_report_id: "r1",
          product_code_snapshot: "DIESEL",
          before_reading: 100,
          after_reading: 110,
          liters_sold: 7,
          calibration_liters: 0
        }
      ],
      creditReceipts: []
    });

    expect(analytics.productLiters.DIESEL.grossLitersOut).toBe(7);
  });

  it("groups unknown products as OTHER", () => {
    const analytics = buildExecutiveAnalytics({
      reports: [{ id: "r1", report_date: "2026-04-10", duty_name: "A", status: "approved", calculated_totals: {}, discrepancy_amount: 0 }],
      expenses: [],
      meterReadings: [
        {
          id: "m1",
          shift_report_id: "r1",
          product_code_snapshot: "KEROSENE",
          before_reading: 0,
          after_reading: 10,
          liters_sold: null,
          calibration_liters: 0
        }
      ],
      creditReceipts: []
    });

    expect(analytics.productLiters.OTHER.grossLitersOut).toBe(10);
  });


  it("calculates discrepancy totals and counts", () => {
    const analytics = buildExecutiveAnalytics({
      reports: [
        { id: "r1", report_date: "2026-04-10", duty_name: "A", status: "approved", calculated_totals: {}, discrepancy_amount: 100 },
        { id: "r2", report_date: "2026-04-11", duty_name: "B", status: "approved", calculated_totals: {}, discrepancy_amount: -40 },
        { id: "r3", report_date: "2026-04-12", duty_name: "C", status: "approved", calculated_totals: {}, discrepancy_amount: 0 }
      ],
      expenses: [],
      meterReadings: [],
      creditReceipts: []
    });

    expect(analytics.totals.totalCashOverage).toBe(100);
    expect(analytics.totals.totalCashShortage).toBe(40);
    expect(analytics.totals.netDiscrepancy).toBe(60);
    expect(analytics.totals.discrepancyReportCount).toBe(2);
    expect(analytics.totals.balancedReportCount).toBe(1);
  });

});
