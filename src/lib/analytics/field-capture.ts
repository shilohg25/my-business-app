export type DraftRow = Record<string, unknown>;
export type FuelProductCode = "DIESEL" | "SPECIAL" | "UNLEADED";

export interface PriceMap {
  DIESEL: number | null;
  SPECIAL: number | null;
  UNLEADED: number | null;
}

interface MeterProductSummary {
  litersOut: number;
  price: number | null;
  salesAmount: number;
  missingPrice: boolean;
}

export interface FieldCaptureReviewSummary {
  totals: {
    grossMeterLitersOut: number;
    netMeterLitersOut: number;
    fuelSalesAmount: number;
    lubricantSalesAmount: number;
    creditAmount: number;
    creditLiters: number;
    expensesAmount: number;
    actualCashCount: number;
    expectedCashRemittance: number;
    discrepancyAmount: number;
    totalFuelDeliveriesLiters: number;
    totalCashCount: number;
    totalExpenses: number;
    totalCreditAmount: number;
    totalLubricantSales: number;
    expectedCash: number;
    discrepancy: number;
  };
  byProduct: Record<FuelProductCode, MeterProductSummary>;
  discrepancy: { amount: number; label: "Cash overage" | "Cash shortage" | "Balanced"; tone: "positive" | "negative" | "neutral" };
  warnings: string[];
  completeness: {
    meterReadingsComplete: boolean;
    cashCountComplete: boolean;
    receiptsPresent: boolean;
    expensesPresent: boolean;
    photosPresent: boolean;
  };
  meterRows: Array<DraftRow & { opening: number; closing: number; calibration: number; litersOut: number; grossLitersOut: number; netLitersOut: number; product: FuelProductCode | "OTHER" }>;
}

export function toNumber(value: unknown) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

export function normalizeFuelProductCode(code: unknown): FuelProductCode | "OTHER" {
  const text = String(code ?? "").trim().toUpperCase();
  if (["ADO", "DIESEL"].includes(text)) return "DIESEL";
  if (["SPU", "SPECIAL"].includes(text)) return "SPECIAL";
  if (["ULG", "UNLEADED", "REGULAR"].includes(text)) return "UNLEADED";
  return "OTHER";
}

export const normalizeFieldCaptureProductCode = normalizeFuelProductCode;

function isFilled(value: unknown) {
  return String(value ?? "").trim().length > 0;
}

function emptyPrices(): PriceMap {
  return { DIESEL: null, SPECIAL: null, UNLEADED: null };
}

function sanitizePrices(input: unknown): PriceMap {
  const base = emptyPrices();
  if (!input || typeof input !== "object") return base;
  const raw = input as Record<string, unknown>;
  for (const product of ["DIESEL", "SPECIAL", "UNLEADED"] as const) {
    const value = raw[product] ?? raw[product.toLowerCase()];
    const parsed = toNumber(value);
    base[product] = parsed > 0 ? parsed : null;
  }
  return base;
}

export function calculateDraftMeterRows(meterRows: DraftRow[] = []) {
  const warnings: string[] = [];
  const byProduct = {
    DIESEL: { grossLitersOut: 0, netLitersOut: 0 },
    SPECIAL: { grossLitersOut: 0, netLitersOut: 0 },
    UNLEADED: { grossLitersOut: 0, netLitersOut: 0 },
    OTHER: { grossLitersOut: 0, netLitersOut: 0 }
  };

  const rows = meterRows.map((row, index) => {
    const openingMissing = !isFilled(row.opening_reading);
    const closingMissing = !isFilled(row.closing_reading);
    if (openingMissing || closingMissing) warnings.push(`Missing meter reading on row ${index + 1}.`);

    const opening = toNumber(row.opening_reading);
    const closing = toNumber(row.closing_reading);
    const calibration = toNumber(row.calibration_liters);
    const litersOut = closing - opening - calibration;
    if (litersOut < 0) warnings.push(`Negative liters out on row ${index + 1}.`);

    const product = normalizeFuelProductCode(row.product_code ?? row.product);
    const grossLitersOut = Math.max(0, closing - opening);
    const netLitersOut = Math.max(0, litersOut);
    byProduct[product].grossLitersOut += grossLitersOut;
    byProduct[product].netLitersOut += netLitersOut;

    return { ...row, opening, closing, calibration, litersOut, grossLitersOut, netLitersOut, product };
  });

  return {
    rows,
    warnings,
    byProduct,
    grossMeterLitersOut: rows.reduce((sum, row) => sum + row.grossLitersOut, 0),
    netMeterLitersOut: rows.reduce((sum, row) => sum + row.netLitersOut, 0)
  };
}

export function calculateFuelSalesFromMeterRows(meterRows: DraftRow[] = [], prices: unknown) {
  const meter = calculateDraftMeterRows(meterRows);
  const priceMap = sanitizePrices(prices);
  const byProduct: Record<FuelProductCode, MeterProductSummary> = {
    DIESEL: { litersOut: meter.byProduct.DIESEL.netLitersOut, price: priceMap.DIESEL, salesAmount: 0, missingPrice: false },
    SPECIAL: { litersOut: meter.byProduct.SPECIAL.netLitersOut, price: priceMap.SPECIAL, salesAmount: 0, missingPrice: false },
    UNLEADED: { litersOut: meter.byProduct.UNLEADED.netLitersOut, price: priceMap.UNLEADED, salesAmount: 0, missingPrice: false }
  };

  const warnings: string[] = [];
  let fuelSalesAmount = 0;
  for (const product of ["DIESEL", "SPECIAL", "UNLEADED"] as const) {
    const price = byProduct[product].price;
    const litersOut = byProduct[product].litersOut;
    if (litersOut > 0 && price === null) {
      byProduct[product].missingPrice = true;
      warnings.push(`Missing price for ${product.charAt(0)}${product.slice(1).toLowerCase()}.`);
      continue;
    }
    const salesAmount = litersOut * (price ?? 0);
    byProduct[product].salesAmount = salesAmount;
    fuelSalesAmount += salesAmount;
  }

  return { fuelSalesAmount, byProduct, warnings };
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
  return lubricantRows.reduce((total, row) => {
    const amount = toNumber(row.amount);
    if (amount > 0) return total + amount;
    return total + toNumber(row.quantity) * toNumber(row.unit_price);
  }, 0);
}

export function calculateDraftFuelDeliveriesTotal(deliveryRows: DraftRow[] = []) {
  return deliveryRows.reduce((total, row) => total + toNumber(row.liters_received), 0);
}

export function calculateExpectedCashRemittance(input: {
  fuelCashSales?: unknown;
  lubricantSales?: unknown;
  creditAmount?: unknown;
  expenses?: unknown;
}) {
  return toNumber(input.fuelCashSales) + toNumber(input.lubricantSales) - toNumber(input.creditAmount) - toNumber(input.expenses);
}

export function calculateCashDiscrepancy(input: { actualCashCount?: unknown; expectedCashRemittance?: unknown }) {
  return toNumber(input.actualCashCount) - toNumber(input.expectedCashRemittance);
}

export function getDiscrepancyStatus(value: unknown) {
  const amount = toNumber(value);
  if (amount > 0) return { label: "Cash overage" as const, tone: "positive" as const };
  if (amount < 0) return { label: "Cash shortage" as const, tone: "negative" as const };
  return { label: "Balanced" as const, tone: "neutral" as const };
}

export function buildFieldCaptureReviewSummary(draftPayload: Record<string, unknown> | null | undefined): FieldCaptureReviewSummary {
  const meter_readings = Array.isArray(draftPayload?.meter_readings) ? (draftPayload.meter_readings as DraftRow[]) : [];
  const cash_count = Array.isArray(draftPayload?.cash_count) ? (draftPayload.cash_count as DraftRow[]) : [];
  const expenses = Array.isArray(draftPayload?.expenses) ? (draftPayload.expenses as DraftRow[]) : [];
  const credit_receipts = Array.isArray(draftPayload?.credit_receipts) ? (draftPayload.credit_receipts as DraftRow[]) : [];
  const lubricant_sales = Array.isArray(draftPayload?.lubricant_sales) ? (draftPayload.lubricant_sales as DraftRow[]) : [];
  const fuel_deliveries = Array.isArray(draftPayload?.fuel_deliveries) ? (draftPayload.fuel_deliveries as DraftRow[]) : [];

  const meter = calculateDraftMeterRows(meter_readings);
  const fuel = calculateFuelSalesFromMeterRows(meter_readings, draftPayload?.prices);
  const actualCashCount = calculateDraftCashTotal(cash_count);
  const expensesAmount = calculateDraftExpensesTotal(expenses);
  const credit = calculateDraftCreditTotal(credit_receipts);
  const lubricantSalesAmount = calculateDraftLubricantSalesTotal(lubricant_sales);
  const totalFuelDeliveriesLiters = calculateDraftFuelDeliveriesTotal(fuel_deliveries);

  const expectedCashRemittance = calculateExpectedCashRemittance({
    fuelCashSales: fuel.fuelSalesAmount,
    lubricantSales: lubricantSalesAmount,
    creditAmount: credit.totalAmount,
    expenses: expensesAmount
  });
  const discrepancyAmount = calculateCashDiscrepancy({ actualCashCount, expectedCashRemittance });

  const warnings = [...meter.warnings, ...fuel.warnings];
  if (cash_count.length === 0) warnings.push("Missing cash count.");
  if (meter_readings.length === 0) warnings.push("Missing meter reading.");
  credit_receipts.forEach((row, index) => {
    if (!isFilled(row.amount)) warnings.push(`Credit receipt missing amount on row ${index + 1}.`);
  });
  expenses.forEach((row, index) => {
    if (!isFilled(row.amount)) warnings.push(`Expense missing amount on row ${index + 1}.`);
  });

  const discrepancy = { amount: discrepancyAmount, ...getDiscrepancyStatus(discrepancyAmount) };

  return {
    totals: {
      grossMeterLitersOut: meter.grossMeterLitersOut,
      netMeterLitersOut: meter.netMeterLitersOut,
      fuelSalesAmount: fuel.fuelSalesAmount,
      lubricantSalesAmount,
      creditAmount: credit.totalAmount,
      creditLiters: credit.totalLiters,
      expensesAmount,
      actualCashCount,
      expectedCashRemittance,
      discrepancyAmount,
      totalFuelDeliveriesLiters,
      totalCashCount: actualCashCount,
      totalExpenses: expensesAmount,
      totalCreditAmount: credit.totalAmount,
      totalLubricantSales: lubricantSalesAmount,
      expectedCash: expectedCashRemittance,
      discrepancy: discrepancyAmount
    },
    byProduct: fuel.byProduct,
    discrepancy,
    warnings,
    completeness: {
      meterReadingsComplete: meter_readings.length > 0 && !meter.warnings.some((item) => item.startsWith("Missing meter reading")),
      cashCountComplete: cash_count.length > 0,
      receiptsPresent: credit_receipts.length > 0,
      expensesPresent: expenses.length > 0,
      photosPresent: false
    },
    meterRows: meter.rows
  };
}

export function calculateDraftMeterLitersOut(meterRows: DraftRow[] = []) {
  return calculateDraftMeterRows(meterRows).netMeterLitersOut;
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

export function calculateDraftNetRemittance(input: {
  cashTotal?: unknown;
  expensesTotal?: unknown;
  creditTotal?: unknown;
  lubricantSalesTotal?: unknown;
}) {
  return toNumber(input.cashTotal) - toNumber(input.expensesTotal) - toNumber(input.creditTotal) + toNumber(input.lubricantSalesTotal);
}
