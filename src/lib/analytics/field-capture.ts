export type DraftRow = Record<string, unknown>;

export interface FieldCaptureReviewSummary {
  totals: {
    grossMeterLitersOut: number;
    netMeterLitersOut: number;
    totalCashCount: number;
    totalExpenses: number;
    totalCreditAmount: number;
    totalCreditLiters: number;
    totalLubricantSales: number;
    totalFuelDeliveriesLiters: number;
    expectedCash: number;
    discrepancy: number;
  };
  byProduct: Record<"DIESEL" | "SPECIAL" | "UNLEADED" | "OTHER", { grossLitersOut: number; netLitersOut: number }>;
  warnings: string[];
  completeness: {
    meterReadingsComplete: boolean;
    cashCountComplete: boolean;
    receiptsPresent: boolean;
    expensesPresent: boolean;
    photosPresent: boolean;
  };
  meterRows: Array<DraftRow & { opening: number; closing: number; calibration: number; litersOut: number; grossLitersOut: number; netLitersOut: number; product: string }>;
}

export function toNumber(value: unknown) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

export function normalizeFieldCaptureProductCode(product: unknown): "DIESEL" | "SPECIAL" | "UNLEADED" | "OTHER" {
  const text = String(product ?? "").trim().toUpperCase();
  if (text === "ADO" || text === "DIESEL") return "DIESEL";
  if (text === "SPU" || text === "SPECIAL") return "SPECIAL";
  if (text === "ULG" || text === "UNLEADED" || text === "REGULAR") return "UNLEADED";
  return "OTHER";
}

function isFilled(value: unknown) {
  return String(value ?? "").trim().length > 0;
}

export function calculateDraftMeterRows(meterRows: DraftRow[] = []) {
  const warnings: string[] = [];
  const byProduct: Record<"DIESEL" | "SPECIAL" | "UNLEADED" | "OTHER", { grossLitersOut: number; netLitersOut: number }> = {
    DIESEL: { grossLitersOut: 0, netLitersOut: 0 },
    SPECIAL: { grossLitersOut: 0, netLitersOut: 0 },
    UNLEADED: { grossLitersOut: 0, netLitersOut: 0 },
    OTHER: { grossLitersOut: 0, netLitersOut: 0 }
  };

  const rows = meterRows.map((row, index) => {
    const openingMissing = !isFilled(row.opening_reading);
    const closingMissing = !isFilled(row.closing_reading);
    if (openingMissing || closingMissing) {
      warnings.push(`Missing meter reading on row ${index + 1}.`);
    }

    const opening = toNumber(row.opening_reading);
    const closing = toNumber(row.closing_reading);
    const calibration = toNumber(row.calibration_liters);
    const litersOut = closing - opening - calibration;
    if (litersOut < 0) {
      warnings.push(`Negative liters out on row ${index + 1}.`);
    }

    const product = normalizeFieldCaptureProductCode(row.product_code ?? row.product);
    const grossLitersOut = Math.max(0, closing - opening);
    const netLitersOut = Math.max(0, litersOut);
    byProduct[product].grossLitersOut += grossLitersOut;
    byProduct[product].netLitersOut += netLitersOut;

    return { ...row, opening, closing, calibration, litersOut, grossLitersOut, netLitersOut, product };
  });

  const grossMeterLitersOut = rows.reduce((sum, row) => sum + row.grossLitersOut, 0);
  const netMeterLitersOut = rows.reduce((sum, row) => sum + row.netLitersOut, 0);

  return { rows, warnings, byProduct, grossMeterLitersOut, netMeterLitersOut };
}

export function calculateDraftCashTotal(cashRows: DraftRow[] = []) {
  return cashRows.reduce((total, row) => total + toNumber(row.denomination) * toNumber(row.quantity), 0);
}

export function calculateDraftExpensesTotal(expenseRows: DraftRow[] = []) {
  return expenseRows.reduce((total, row) => total + toNumber(row.amount), 0);
}

export function calculateDraftCreditTotal(receiptRows: DraftRow[] = []) {
  return receiptRows.reduce<{ totalAmount: number; totalLiters: number }>(
    (acc, row) => ({ totalAmount: acc.totalAmount + toNumber(row.amount), totalLiters: acc.totalLiters + toNumber(row.liters) }),
    { totalAmount: 0, totalLiters: 0 }
  );
}

export function calculateDraftLubricantSalesTotal(lubricantRows: DraftRow[] = []) {
  return lubricantRows.reduce((total, row) => total + toNumber(row.amount), 0);
}

export function calculateDraftFuelDeliveriesTotal(deliveryRows: DraftRow[] = []) {
  return deliveryRows.reduce((total, row) => total + toNumber(row.liters_received), 0);
}

export function calculateDraftExpectedCash(input: {
  netMeterLitersOut?: unknown;
  totalCreditAmount?: unknown;
  totalExpenses?: unknown;
  totalLubricantSales?: unknown;
}) {
  return toNumber(input.netMeterLitersOut) - toNumber(input.totalCreditAmount) - toNumber(input.totalExpenses) + toNumber(input.totalLubricantSales);
}

export function calculateDraftDiscrepancy(input: { totalCashCount?: unknown; expectedCash?: unknown }) {
  return toNumber(input.totalCashCount) - toNumber(input.expectedCash);
}

export function buildFieldCaptureReviewSummary(draftPayload: Record<string, unknown> | null | undefined): FieldCaptureReviewSummary {
  const meter_readings = Array.isArray(draftPayload?.meter_readings) ? (draftPayload.meter_readings as DraftRow[]) : [];
  const cash_count = Array.isArray(draftPayload?.cash_count) ? (draftPayload.cash_count as DraftRow[]) : [];
  const expenses = Array.isArray(draftPayload?.expenses) ? (draftPayload.expenses as DraftRow[]) : [];
  const credit_receipts = Array.isArray(draftPayload?.credit_receipts) ? (draftPayload.credit_receipts as DraftRow[]) : [];
  const lubricant_sales = Array.isArray(draftPayload?.lubricant_sales) ? (draftPayload.lubricant_sales as DraftRow[]) : [];
  const fuel_deliveries = Array.isArray(draftPayload?.fuel_deliveries) ? (draftPayload.fuel_deliveries as DraftRow[]) : [];

  const meter = calculateDraftMeterRows(meter_readings);
  const totalCashCount = calculateDraftCashTotal(cash_count);
  const totalExpenses = calculateDraftExpensesTotal(expenses);
  const credit = calculateDraftCreditTotal(credit_receipts);
  const totalLubricantSales = calculateDraftLubricantSalesTotal(lubricant_sales);
  const totalFuelDeliveriesLiters = calculateDraftFuelDeliveriesTotal(fuel_deliveries);
  const expectedCash = calculateDraftExpectedCash({
    netMeterLitersOut: meter.netMeterLitersOut,
    totalCreditAmount: credit.totalAmount,
    totalExpenses,
    totalLubricantSales
  });
  const discrepancy = calculateDraftDiscrepancy({ totalCashCount, expectedCash });

  const warnings = [...meter.warnings];
  if (cash_count.length === 0) warnings.push("Missing cash count.");
  credit_receipts.forEach((row, index) => {
    if (!isFilled(row.receipt_number)) warnings.push(`Missing receipt number on credit row ${index + 1}.`);
  });
  fuel_deliveries.forEach((row, index) => {
    if (toNumber(row.liters_received) > 0 && !isFilled(row.product)) warnings.push(`Delivery liters missing product on row ${index + 1}.`);
  });

  const completeness = {
    meterReadingsComplete: meter_readings.length > 0 && !meter.warnings.some((item) => item.startsWith("Missing meter reading")),
    cashCountComplete: cash_count.length > 0,
    receiptsPresent: credit_receipts.length > 0,
    expensesPresent: expenses.length > 0,
    photosPresent: false
  };

  return {
    totals: {
      grossMeterLitersOut: meter.grossMeterLitersOut,
      netMeterLitersOut: meter.netMeterLitersOut,
      totalCashCount,
      totalExpenses,
      totalCreditAmount: credit.totalAmount,
      totalCreditLiters: credit.totalLiters,
      totalLubricantSales,
      totalFuelDeliveriesLiters,
      expectedCash,
      discrepancy
    },
    byProduct: meter.byProduct,
    warnings,
    completeness,
    meterRows: meter.rows
  };
}

export function calculateDraftMeterLitersOut(meterRows: DraftRow[] = []) {
  return calculateDraftMeterRows(meterRows).netMeterLitersOut;
}

export function calculateDraftNetRemittance(input: {
  cashTotal?: unknown;
  expensesTotal?: unknown;
  creditTotal?: unknown;
  lubricantSalesTotal?: unknown;
}) {
  return toNumber(input.cashTotal) - toNumber(input.expensesTotal) - toNumber(input.creditTotal) + toNumber(input.lubricantSalesTotal);
}
