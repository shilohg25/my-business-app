import * as XLSX from "xlsx";
import type {
  CashCountInput,
  CreditReceiptInput,
  ExpenseInput,
  LubricantSaleInput,
  MeterReadingInput,
  ProductPriceInput,
  ShiftReportInput
} from "@/lib/domain/types";
import { calculateShiftReport } from "@/lib/domain/calculations";

type CellValue = string | number | boolean | Date | null | undefined;

export interface ImportWarning {
  code: string;
  message: string;
  cell?: string;
}

export interface ParsedWorkbookReport {
  report: ShiftReportInput;
  warnings: ImportWarning[];
  workbookTotals: {
    expectedCashBeforeExpenses?: number;
    cashCount?: number;
    discrepancy?: number;
  };
}

const codeMap: Record<string, string> = {
  ADO: "DIESEL",
  DIESEL: "DIESEL",
  SPU: "SPECIAL",
  SPECIAL: "SPECIAL",
  ULG: "UNLEADED",
  UNLEADED: "UNLEADED"
};

function value(sheet: XLSX.WorkSheet, cell: string): CellValue {
  return sheet[cell]?.v;
}

function text(sheet: XLSX.WorkSheet, cell: string) {
  const raw = value(sheet, cell);
  return raw == null ? "" : String(raw).trim();
}

function number(sheet: XLSX.WorkSheet, cell: string, fallback = 0) {
  const raw = value(sheet, cell);
  const parsed = typeof raw === "number" ? raw : Number(raw);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function normalizeDate(raw: CellValue) {
  if (raw instanceof Date) return raw.toISOString().slice(0, 10);
  const asText = raw == null ? "" : String(raw).trim();
  const parsed = new Date(asText);
  if (!Number.isNaN(parsed.valueOf())) return parsed.toISOString().slice(0, 10);
  return asText;
}

function parsePrices(osr1: XLSX.WorkSheet): ProductPriceInput[] {
  const rows = [5, 6, 7];
  return rows
    .map((row) => {
      const code = codeMap[text(osr1, `F${row}`).toUpperCase()];
      const price = number(osr1, `I${row}`);
      return code ? { productCode: code, price } : null;
    })
    .filter((line): line is ProductPriceInput => Boolean(line));
}

function parseCreditTable(
  osr1: XLSX.WorkSheet,
  headingCell: string,
  productCode: string,
  startRow: number,
  endRow: number
): CreditReceiptInput[] {
  const heading = text(osr1, headingCell).toUpperCase();
  if (!heading.includes("CREDIT")) return [];

  const lines: CreditReceiptInput[] = [];
  for (let row = startRow; row <= endRow; row++) {
    const companyName = text(osr1, `O${row}`);
    const receiptNumber = text(osr1, `P${row}`);
    const liters = number(osr1, `Q${row}`, NaN);
    const amount = number(osr1, `R${row}`, NaN);

    if (!companyName && !receiptNumber && !Number.isFinite(liters) && !Number.isFinite(amount)) continue;
    if (companyName.toUpperCase().startsWith("TOTAL")) continue;

    lines.push({
      productCode,
      companyName: companyName || "Unknown credit customer",
      receiptNumber: receiptNumber || undefined,
      liters: Number.isFinite(liters) ? liters : 0,
      amount: Number.isFinite(amount) ? amount : undefined
    });
  }
  return lines;
}

function parseCashCount(osr1: XLSX.WorkSheet): { cashCounts: CashCountInput[]; coinsAmount: number } {
  const cashCounts: CashCountInput[] = [];
  for (let row = 16; row <= 21; row++) {
    const denomination = number(osr1, `F${row}`, NaN);
    const quantity = number(osr1, `H${row}`, NaN);
    const lineAmount = number(osr1, `I${row}`, NaN);

    if (!Number.isFinite(denomination)) continue;
    cashCounts.push({
      denomination,
      quantity: Number.isFinite(quantity) ? quantity : 0,
      lineAmount: Number.isFinite(lineAmount) ? lineAmount : undefined
    });
  }

  return {
    cashCounts,
    coinsAmount: number(osr1, "I22")
  };
}

function parseLubricants(osr1: XLSX.WorkSheet): LubricantSaleInput[] {
  const lines: LubricantSaleInput[] = [];
  for (let row = 26; row <= 35; row++) {
    const productName = text(osr1, `A${row}`);
    const quantity = number(osr1, `C${row}`, NaN);
    const unitPrice = number(osr1, `D${row}`, NaN);
    if (!productName && !Number.isFinite(quantity)) continue;

    lines.push({
      productName: productName || "Unlabeled lubricant",
      quantity: Number.isFinite(quantity) ? quantity : 0,
      unitPrice: Number.isFinite(unitPrice) ? unitPrice : 0
    });
  }
  return lines;
}

function parseExpenses(osr1: XLSX.WorkSheet): ExpenseInput[] {
  const lines: ExpenseInput[] = [];
  for (let row = 38; row <= 51; row++) {
    const description = text(osr1, `A${row}`);
    const amount = number(osr1, `E${row}`, NaN);
    if (!description && !Number.isFinite(amount)) continue;

    lines.push({
      description: description || "Unlabeled expense",
      amount: Number.isFinite(amount) ? amount : 0
    });
  }
  return lines;
}

function parseMeterReadingsFromOsr(osr: XLSX.WorkSheet): MeterReadingInput[] {
  const blocks = [
    { productCode: "DIESEL", labelCol: "C", valueCol: "D" },
    { productCode: "SPECIAL", labelCol: "F", valueCol: "G" },
    { productCode: "UNLEADED", labelCol: "H", valueCol: "I" },
    { productCode: "SPECIAL", labelCol: "J", valueCol: "K" }
  ];

  const readings: MeterReadingInput[] = [];
  for (const block of blocks) {
    for (const rowPair of [
      { labelRow: 17, beforeRow: 17, afterRow: 19 },
      { labelRow: 18, beforeRow: 18, afterRow: 20 }
    ]) {
      const pumpLabel = text(osr, `${block.labelCol}${rowPair.labelRow}`);
      if (!pumpLabel) continue;
      readings.push({
        pumpLabel,
        productCode: block.productCode,
        beforeReading: number(osr, `${block.valueCol}${rowPair.beforeRow}`),
        afterReading: number(osr, `${block.valueCol}${rowPair.afterRow}`)
      });
    }
  }

  return readings;
}

export function parseOsrWorkbook(buffer: ArrayBuffer): ParsedWorkbookReport {
  const workbook = XLSX.read(buffer, { type: "array", cellDates: true });
  const osr1 = workbook.Sheets.OSR1;
  const osr = workbook.Sheets.OSR;
  const warnings: ImportWarning[] = [];

  if (!osr1) {
    throw new Error("Workbook is missing required sheet OSR1.");
  }
  if (!osr) {
    throw new Error("Workbook is missing required sheet OSR.");
  }

  const prices = parsePrices(osr1);
  if (prices.length === 0) {
    warnings.push({ code: "missing_prices", message: "No product prices were detected in OSR1 F5:I7." });
  }

  const { cashCounts, coinsAmount } = parseCashCount(osr1);

  const report: ShiftReportInput = {
    reportDate: normalizeDate(value(osr1, "C1")),
    dutyName: text(osr1, "C2"),
    shiftTimeLabel: text(osr1, "C3"),
    source: "excel_import",
    prices,
    meterReadings: parseMeterReadingsFromOsr(osr),
    creditReceipts: [
      ...parseCreditTable(osr1, "O1", "DIESEL", 2, 18),
      ...parseCreditTable(osr1, "O20", "SPECIAL", 21, 43),
      ...parseCreditTable(osr1, "O44", "UNLEADED", 45, 51)
    ],
    expenses: parseExpenses(osr1),
    cashCounts,
    coinsAmount,
    lubricantSales: parseLubricants(osr1)
  };

  const calculated = calculateShiftReport(report);
  const workbookTotals = {
    expectedCashBeforeExpenses: number(osr, "M17", NaN),
    cashCount: number(osr, "M20", NaN),
    discrepancy: number(osr, "M21", NaN)
  };

  if (
    Number.isFinite(workbookTotals.discrepancy) &&
    Math.abs(calculated.workbookStyleDiscrepancy - workbookTotals.discrepancy) > 1
  ) {
    warnings.push({
      code: "formula_mismatch",
      message: `Parsed discrepancy ${calculated.workbookStyleDiscrepancy} differs from workbook discrepancy ${workbookTotals.discrepancy}.`
    });
  }

  return { report, warnings, workbookTotals };
}
