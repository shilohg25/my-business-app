export interface ExecutiveDateRange {
  startDate: string;
  endDate: string;
}

export interface ExecutiveReportRow {
  id: string;
  report_date: string | null;
  duty_name: string | null;
  status: string | null;
  calculated_totals: Record<string, unknown> | null;
  discrepancy_amount: number | string | null;
}

export interface ExecutiveExpenseRow {
  id: string;
  shift_report_id: string;
  category: string | null;
  description: string | null;
  amount: number | string | null;
  receipt_reference: string | null;
  created_at: string | null;
}

export interface ExecutiveMeterReadingRow {
  id: string;
  shift_report_id: string;
  product_code_snapshot: string | null;
  before_reading: number | string | null;
  after_reading: number | string | null;
  liters_sold: number | string | null;
  calibration_liters: number | string | null;
}

export interface ExecutiveCreditReceiptRow {
  id: string;
  shift_report_id: string;
  product_code_snapshot: string | null;
  liters: number | string | null;
  amount: number | string | null;
  company_name: string | null;
  receipt_number: string | null;
}

export interface ProductLiterSummary {
  product: string;
  grossLitersOut: number;
  calibrationLiters: number;
  creditLiters: number;
  netCashLiters: number;
}

export interface ExpenseSummary {
  category: string;
  amount: number;
  count: number;
}

export interface ExecutiveAnalytics {
  totals: {
    reportCount: number;
    approvedCount: number;
    pendingReviewCount: number;
    totalExpenses: number;
    totalFuelCashSales: number;
    totalLubricantSales: number;
    totalCashCount: number;
    totalNetRemittance: number;
    totalDiscrepancy: number;
  };
  productLiters: Record<string, ProductLiterSummary>;
  dailyExpenses: Array<{ date: string; amount: number; count: number }>;
  monthlyExpenses: Array<{ month: string; amount: number; count: number }>;
  expensesByCategory: ExpenseSummary[];
  dailySummary: Array<{
    date: string;
    reportCount: number;
    totalExpenses: number;
    totalFuelCashSales: number;
    totalCashCount: number;
    totalNetRemittance: number;
    totalDiscrepancy: number;
    dieselGrossLiters: number;
    specialGrossLiters: number;
    unleadedGrossLiters: number;
  }>;
  cashierSummary: Array<{
    dutyName: string;
    reportCount: number;
    totalExpenses: number;
    totalNetRemittance: number;
    totalDiscrepancy: number;
  }>;
}

export function toNumber(value: unknown) {
  const parsed = Number(value ?? Number.NaN);
  return Number.isFinite(parsed) ? parsed : 0;
}

export function normalizeProductCode(code: string | null | undefined) {
  const normalized = (code ?? "").trim().toUpperCase();
  if (!normalized) return "OTHER";
  if (normalized === "DIESEL" || normalized === "ADO") return "DIESEL";
  if (normalized === "SPECIAL" || normalized === "SPU") return "SPECIAL";
  if (normalized === "UNLEADED" || normalized === "ULG") return "UNLEADED";
  return "OTHER";
}

function createProductSummary(product: string): ProductLiterSummary {
  return {
    product,
    grossLitersOut: 0,
    calibrationLiters: 0,
    creditLiters: 0,
    netCashLiters: 0
  };
}

export function buildExecutiveAnalytics(input: {
  reports: ExecutiveReportRow[];
  expenses: ExecutiveExpenseRow[];
  meterReadings: ExecutiveMeterReadingRow[];
  creditReceipts: ExecutiveCreditReceiptRow[];
}): ExecutiveAnalytics {
  const reports = input.reports ?? [];
  const expenses = input.expenses ?? [];
  const meterReadings = input.meterReadings ?? [];
  const creditReceipts = input.creditReceipts ?? [];

  const reportById = new Map(reports.map((report) => [report.id, report]));

  const totals = {
    reportCount: reports.length,
    approvedCount: reports.filter((report) => report.status === "approved").length,
    pendingReviewCount: reports.filter((report) => report.status !== "approved").length,
    totalExpenses: expenses.reduce((sum, row) => sum + toNumber(row.amount), 0),
    totalFuelCashSales: reports.reduce((sum, report) => sum + toNumber(report.calculated_totals?.totalFuelCashSales), 0),
    totalLubricantSales: reports.reduce((sum, report) => sum + toNumber(report.calculated_totals?.totalLubricantSales), 0),
    totalCashCount: reports.reduce((sum, report) => sum + toNumber(report.calculated_totals?.totalCashCount), 0),
    totalNetRemittance: reports.reduce((sum, report) => sum + toNumber(report.calculated_totals?.operationalNetRemittance), 0),
    totalDiscrepancy: reports.reduce((sum, report) => sum + toNumber(report.discrepancy_amount), 0)
  };

  const productLiters: Record<string, ProductLiterSummary> = {
    DIESEL: createProductSummary("DIESEL"),
    SPECIAL: createProductSummary("SPECIAL"),
    UNLEADED: createProductSummary("UNLEADED")
  };

  meterReadings.forEach((row) => {
    const product = normalizeProductCode(row.product_code_snapshot);
    const grossFromFallback = toNumber(row.after_reading) - toNumber(row.before_reading);
    const grossLitersOut = row.liters_sold === null || row.liters_sold === undefined ? grossFromFallback : toNumber(row.liters_sold);
    const calibrationLiters = toNumber(row.calibration_liters);

    if (!productLiters[product]) {
      productLiters[product] = createProductSummary(product);
    }

    productLiters[product].grossLitersOut += grossLitersOut;
    productLiters[product].calibrationLiters += calibrationLiters;
  });

  creditReceipts.forEach((row) => {
    const product = normalizeProductCode(row.product_code_snapshot);
    if (!productLiters[product]) {
      productLiters[product] = createProductSummary(product);
    }

    productLiters[product].creditLiters += toNumber(row.liters);
  });

  Object.values(productLiters).forEach((summary) => {
    summary.netCashLiters = summary.grossLitersOut - summary.calibrationLiters - summary.creditLiters;
  });

  const dailyExpensesMap = new Map<string, { amount: number; count: number }>();
  const monthlyExpensesMap = new Map<string, { amount: number; count: number }>();
  const expensesByCategoryMap = new Map<string, { amount: number; count: number }>();

  expenses.forEach((row) => {
    const report = reportById.get(row.shift_report_id);
    const reportDate = report?.report_date ?? "";
    if (!reportDate) {
      return;
    }

    const amount = toNumber(row.amount);
    const month = reportDate.slice(0, 7);
    const category = (row.category ?? "Uncategorized").trim() || "Uncategorized";

    const daily = dailyExpensesMap.get(reportDate) ?? { amount: 0, count: 0 };
    daily.amount += amount;
    daily.count += 1;
    dailyExpensesMap.set(reportDate, daily);

    const monthly = monthlyExpensesMap.get(month) ?? { amount: 0, count: 0 };
    monthly.amount += amount;
    monthly.count += 1;
    monthlyExpensesMap.set(month, monthly);

    const categorySummary = expensesByCategoryMap.get(category) ?? { amount: 0, count: 0 };
    categorySummary.amount += amount;
    categorySummary.count += 1;
    expensesByCategoryMap.set(category, categorySummary);
  });

  const grossByReportAndProduct = new Map<string, Record<string, number>>();
  meterReadings.forEach((row) => {
    const product = normalizeProductCode(row.product_code_snapshot);
    const grossFromFallback = toNumber(row.after_reading) - toNumber(row.before_reading);
    const grossLitersOut = row.liters_sold === null || row.liters_sold === undefined ? grossFromFallback : toNumber(row.liters_sold);

    const entry = grossByReportAndProduct.get(row.shift_report_id) ?? {};
    entry[product] = (entry[product] ?? 0) + grossLitersOut;
    grossByReportAndProduct.set(row.shift_report_id, entry);
  });

  const dailySummaryMap = new Map<
    string,
    {
      reportCount: number;
      totalExpenses: number;
      totalFuelCashSales: number;
      totalCashCount: number;
      totalNetRemittance: number;
      totalDiscrepancy: number;
      dieselGrossLiters: number;
      specialGrossLiters: number;
      unleadedGrossLiters: number;
    }
  >();

  reports.forEach((report) => {
    const date = report.report_date ?? "";
    if (!date) return;

    const row = dailySummaryMap.get(date) ?? {
      reportCount: 0,
      totalExpenses: 0,
      totalFuelCashSales: 0,
      totalCashCount: 0,
      totalNetRemittance: 0,
      totalDiscrepancy: 0,
      dieselGrossLiters: 0,
      specialGrossLiters: 0,
      unleadedGrossLiters: 0
    };

    row.reportCount += 1;
    row.totalFuelCashSales += toNumber(report.calculated_totals?.totalFuelCashSales);
    row.totalCashCount += toNumber(report.calculated_totals?.totalCashCount);
    row.totalNetRemittance += toNumber(report.calculated_totals?.operationalNetRemittance);
    row.totalDiscrepancy += toNumber(report.discrepancy_amount);

    const grossForReport = grossByReportAndProduct.get(report.id) ?? {};
    row.dieselGrossLiters += grossForReport.DIESEL ?? 0;
    row.specialGrossLiters += grossForReport.SPECIAL ?? 0;
    row.unleadedGrossLiters += grossForReport.UNLEADED ?? 0;

    dailySummaryMap.set(date, row);
  });

  dailyExpensesMap.forEach((expense, date) => {
    const row = dailySummaryMap.get(date) ?? {
      reportCount: 0,
      totalExpenses: 0,
      totalFuelCashSales: 0,
      totalCashCount: 0,
      totalNetRemittance: 0,
      totalDiscrepancy: 0,
      dieselGrossLiters: 0,
      specialGrossLiters: 0,
      unleadedGrossLiters: 0
    };

    row.totalExpenses += expense.amount;
    dailySummaryMap.set(date, row);
  });

  const cashierSummaryMap = new Map<
    string,
    { reportCount: number; totalExpenses: number; totalNetRemittance: number; totalDiscrepancy: number }
  >();

  reports.forEach((report) => {
    const key = (report.duty_name ?? "Unassigned").trim() || "Unassigned";
    const row = cashierSummaryMap.get(key) ?? { reportCount: 0, totalExpenses: 0, totalNetRemittance: 0, totalDiscrepancy: 0 };
    row.reportCount += 1;
    row.totalNetRemittance += toNumber(report.calculated_totals?.operationalNetRemittance);
    row.totalDiscrepancy += toNumber(report.discrepancy_amount);
    cashierSummaryMap.set(key, row);
  });

  expenses.forEach((expense) => {
    const report = reportById.get(expense.shift_report_id);
    const key = (report?.duty_name ?? "Unassigned").trim() || "Unassigned";
    const row = cashierSummaryMap.get(key) ?? { reportCount: 0, totalExpenses: 0, totalNetRemittance: 0, totalDiscrepancy: 0 };
    row.totalExpenses += toNumber(expense.amount);
    cashierSummaryMap.set(key, row);
  });

  const hasOtherProduct = Boolean(productLiters.OTHER);

  return {
    totals,
    productLiters: hasOtherProduct
      ? productLiters
      : {
          DIESEL: productLiters.DIESEL,
          SPECIAL: productLiters.SPECIAL,
          UNLEADED: productLiters.UNLEADED
        },
    dailyExpenses: Array.from(dailyExpensesMap.entries())
      .map(([date, value]) => ({ date, amount: value.amount, count: value.count }))
      .sort((a, b) => b.date.localeCompare(a.date)),
    monthlyExpenses: Array.from(monthlyExpensesMap.entries())
      .map(([month, value]) => ({ month, amount: value.amount, count: value.count }))
      .sort((a, b) => b.month.localeCompare(a.month)),
    expensesByCategory: Array.from(expensesByCategoryMap.entries())
      .map(([category, value]) => ({ category, amount: value.amount, count: value.count }))
      .sort((a, b) => b.amount - a.amount),
    dailySummary: Array.from(dailySummaryMap.entries())
      .map(([date, value]) => ({ date, ...value }))
      .sort((a, b) => b.date.localeCompare(a.date)),
    cashierSummary: Array.from(cashierSummaryMap.entries())
      .map(([dutyName, value]) => ({ dutyName, ...value }))
      .sort((a, b) => b.totalNetRemittance - a.totalNetRemittance)
  };
}
