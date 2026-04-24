import { describe, expect, it } from "vitest";
import { calculateShiftReport } from "@/lib/domain/calculations";
import type { ShiftReportInput } from "@/lib/domain/types";

describe("calculateShiftReport", () => {
  it("matches the workbook-style cash balance behavior", () => {
    const input: ShiftReportInput = {
      reportDate: "2026-04-23",
      dutyName: "cashier-rosalie dave/edgar",
      shiftTimeLabel: "1-9pm",
      source: "excel_import",
      prices: [
        { productCode: "DIESEL", price: 108.96 },
        { productCode: "SPECIAL", price: 96.49 },
        { productCode: "UNLEADED", price: 96.09 }
      ],
      meterReadings: [
        { pumpLabel: "A", productCode: "DIESEL", beforeReading: 130911.73, afterReading: 131066.31 },
        { pumpLabel: "B", productCode: "DIESEL", beforeReading: 2582181.3, afterReading: 2582240.74 },
        { pumpLabel: "A", productCode: "SPECIAL", beforeReading: 680791.91, afterReading: 681004.15 },
        { pumpLabel: "B", productCode: "SPECIAL", beforeReading: 800566.82, afterReading: 800759.15 },
        { pumpLabel: "A2", productCode: "SPECIAL", beforeReading: 985879.05, afterReading: 985879.05 },
        { pumpLabel: "B2", productCode: "SPECIAL", beforeReading: 399555.91, afterReading: 399752.08 },
        { pumpLabel: "A", productCode: "UNLEADED", beforeReading: 171634.22, afterReading: 171661.15 },
        { pumpLabel: "B", productCode: "UNLEADED", beforeReading: 414657.92, afterReading: 414687.43 }
      ],
      creditReceipts: [
        { productCode: "DIESEL", companyName: "southwest", receiptNumber: "98837", liters: 50, amount: 5448 },
        { productCode: "DIESEL", companyName: "southwest", receiptNumber: "98839", liters: 50, amount: 5448 },
        { productCode: "DIESEL", companyName: "southwest", receiptNumber: "98840", liters: 45, amount: 4903.2 },
        { productCode: "DIESEL", companyName: "southwest", receiptNumber: "98841", liters: 55, amount: 5992.8 }
      ],
      expenses: [
        { description: "fare lab2x bank", amount: 40 },
        { description: "business permit BHC HAGDAN", amount: 13900 },
        { description: "DIESEL 200L X 97.45", amount: 19440 }
      ],
      cashCounts: [
        { denomination: 1000, quantity: 24, lineAmount: 24000 },
        { denomination: 500, quantity: 1, lineAmount: 500 },
        { denomination: 200, quantity: 0, lineAmount: 0 },
        { denomination: 100, quantity: 25, lineAmount: 2500 },
        { denomination: 50, quantity: 70, lineAmount: 3500 },
        { denomination: 20, quantity: 1, lineAmount: 20 }
      ],
      coinsAmount: 34787,
      lubricantSales: [{ productName: "AX7", quantity: 1, unitPrice: 390 }]
    };

    const result = calculateShiftReport(input);
    expect(result.totalCashCount).toBe(65307);
    expect(result.totalLubricantSales).toBe(390);
    expect(Math.abs(result.expectedCashBeforeExpenses - 65306.34)).toBeLessThan(0.05);
    expect(Math.abs(result.workbookStyleDiscrepancy - 0.66)).toBeLessThan(0.05);
    expect(result.operationalNetRemittance).toBe(31537);
  });

  it("allows negative liters", () => {
    const result = calculateShiftReport({
      reportDate: "2026-04-23",
      dutyName: "Test",
      shiftTimeLabel: "Test",
      source: "web_manual",
      prices: [{ productCode: "DIESEL", price: 100 }],
      meterReadings: [{ pumpLabel: "A", productCode: "DIESEL", beforeReading: 10, afterReading: 8 }],
      creditReceipts: [],
      expenses: [],
      cashCounts: [],
      lubricantSales: []
    });

    expect(result.products[0].grossLiters).toBe(-2);
  });
});
