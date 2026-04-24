import type {
  CashCountInput,
  CreditReceiptInput,
  ExpenseInput,
  LubricantSaleInput,
  MeterReadingInput,
  ProductCalculation,
  ProductPriceInput,
  ShiftCalculationResult,
  ShiftReportInput
} from "./types";

export function round(value: number, digits = 2) {
  const factor = 10 ** digits;
  return Math.round((value + Number.EPSILON) * factor) / factor;
}

export function sum(values: number[]) {
  return values.reduce((acc, value) => acc + (Number.isFinite(value) ? value : 0), 0);
}

export function meterLiters(reading: MeterReadingInput) {
  // Negative liters are allowed because the current process permits them.
  return round(reading.afterReading - reading.beforeReading, 3);
}

export function cashLineAmount(line: CashCountInput) {
  return round(line.lineAmount ?? line.denomination * line.quantity, 2);
}

export function lubricantLineAmount(line: LubricantSaleInput) {
  return round(line.quantity * line.unitPrice, 2);
}

export function expenseAmount(line: ExpenseInput) {
  return round(line.amount, 2);
}

export function creditAmount(line: CreditReceiptInput, fallbackPrice = 0) {
  return round(line.amount ?? line.liters * fallbackPrice, 2);
}

export function calculateProduct(
  productCode: string,
  readings: MeterReadingInput[],
  creditReceipts: CreditReceiptInput[],
  prices: ProductPriceInput[]
): ProductCalculation {
  const productReadings = readings.filter((line) => line.productCode === productCode);
  const productCredits = creditReceipts.filter((line) => line.productCode === productCode);
  const price = prices.find((line) => line.productCode === productCode)?.price ?? 0;

  const grossLiters = round(sum(productReadings.map(meterLiters)), 3);
  const creditLiters = round(sum(productCredits.map((line) => line.liters)), 3);
  const calibrationLiters = round(sum(productReadings.map((line) => line.calibrationLiters ?? 0)), 3);
  const netCashLiters = round(grossLiters - creditLiters - calibrationLiters, 3);
  const fuelCashAmount = round(netCashLiters * price, 2);
  const productCreditAmount = round(sum(productCredits.map((line) => creditAmount(line, price))), 2);

  return {
    productCode,
    grossLiters,
    creditLiters,
    calibrationLiters,
    netCashLiters,
    price,
    fuelCashAmount,
    creditAmount: productCreditAmount
  };
}

export function calculateShiftReport(input: ShiftReportInput): ShiftCalculationResult {
  const productCodes = Array.from(
    new Set([
      ...input.prices.map((line) => line.productCode),
      ...input.meterReadings.map((line) => line.productCode),
      ...input.creditReceipts.map((line) => line.productCode)
    ])
  );

  const products = productCodes.map((code) =>
    calculateProduct(code, input.meterReadings, input.creditReceipts, input.prices)
  );

  const totalFuelCashSales = round(sum(products.map((line) => line.fuelCashAmount)), 2);
  const totalCreditAmount = round(sum(products.map((line) => line.creditAmount)), 2);
  const totalLubricantSales = round(sum(input.lubricantSales.map(lubricantLineAmount)), 2);
  const totalExpenses = round(sum(input.expenses.map(expenseAmount)), 2);
  const totalCashCount = round(sum(input.cashCounts.map(cashLineAmount)) + (input.coinsAmount ?? 0), 2);

  const expectedCashBeforeExpenses = round(totalFuelCashSales + totalLubricantSales, 2);

  return {
    products,
    totalGrossLiters: round(sum(products.map((line) => line.grossLiters)), 3),
    totalCreditLiters: round(sum(products.map((line) => line.creditLiters)), 3),
    totalCalibrationLiters: round(sum(products.map((line) => line.calibrationLiters)), 3),
    totalNetCashLiters: round(sum(products.map((line) => line.netCashLiters)), 3),
    totalFuelCashSales,
    totalCreditAmount,
    totalLubricantSales,
    totalExpenses,
    totalCashCount,
    expectedCashBeforeExpenses,
    workbookStyleDiscrepancy: round(totalCashCount - expectedCashBeforeExpenses, 2),
    operationalNetRemittance: round(totalCashCount - totalLubricantSales - totalExpenses, 2)
  };
}

export function assertBalanced(input: ShiftReportInput, tolerance = 1) {
  const result = calculateShiftReport(input);

  if (Math.abs(result.workbookStyleDiscrepancy) > tolerance) {
    return {
      ok: false as const,
      result,
      message: `Report does not balance. Difference is ${result.workbookStyleDiscrepancy}.`
    };
  }

  return { ok: true as const, result, message: "Balanced." };
}
