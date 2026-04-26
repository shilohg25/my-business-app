function toNumber(value: unknown) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

export function calculateDraftMeterLitersOut(meterRows: Array<Record<string, unknown>> = []) {
  return meterRows.reduce((total, row) => {
    const opening = toNumber(row.opening_reading);
    const closing = toNumber(row.closing_reading);
    const calibration = toNumber(row.calibration_liters);
    return total + Math.max(0, closing - opening - calibration);
  }, 0);
}

export function calculateDraftFuelSales(meterRows: Array<Record<string, unknown>> = [], prices?: Record<string, number>) {
  return meterRows.reduce((total, row) => {
    const litersOut = Math.max(0, toNumber(row.closing_reading) - toNumber(row.opening_reading) - toNumber(row.calibration_liters));
    const productCode = String(row.product ?? "").trim().toUpperCase();
    const unitPrice = prices ? toNumber(prices[productCode]) : 0;
    return total + litersOut * unitPrice;
  }, 0);
}

export function calculateDraftCashTotal(cashRows: Array<Record<string, unknown>> = []) {
  return cashRows.reduce((total, row) => total + toNumber(row.denomination) * toNumber(row.quantity), 0);
}

export function calculateDraftExpensesTotal(expenseRows: Array<Record<string, unknown>> = []) {
  return expenseRows.reduce((total, row) => total + toNumber(row.amount), 0);
}

export function calculateDraftCreditTotal(receiptRows: Array<Record<string, unknown>> = []) {
  return receiptRows.reduce((total, row) => total + toNumber(row.amount), 0);
}

export function calculateDraftLubricantSalesTotal(lubricantRows: Array<Record<string, unknown>> = []) {
  return lubricantRows.reduce((total, row) => total + toNumber(row.amount), 0);
}

export function calculateDraftNetRemittance(input: {
  cashTotal?: unknown;
  expensesTotal?: unknown;
  creditTotal?: unknown;
  lubricantSalesTotal?: unknown;
}) {
  const cashTotal = toNumber(input.cashTotal);
  const expensesTotal = toNumber(input.expensesTotal);
  const creditTotal = toNumber(input.creditTotal);
  const lubricantSalesTotal = toNumber(input.lubricantSalesTotal);
  return cashTotal - expensesTotal - creditTotal + lubricantSalesTotal;
}

export function calculateDraftDiscrepancy(input: {
  cashTotal?: unknown;
  expensesTotal?: unknown;
  creditTotal?: unknown;
  lubricantSalesTotal?: unknown;
  expectedFuelSales?: unknown;
}) {
  const expectedFuelSales = toNumber(input.expectedFuelSales);
  const netRemittance = calculateDraftNetRemittance(input);
  return netRemittance - expectedFuelSales;
}
