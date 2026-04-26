import { type StationExpenseRow } from "@/lib/data/expenses";

export interface ExpenseAggregateRow {
  key: string;
  station_id?: string | null;
  station_name?: string;
  report_date?: string;
  month?: string;
  category?: string;
  count: number;
  amount: number;
}

export interface ExpenseAnalytics {
  totalExpenses: number;
  expenseCount: number;
  highestExpenseDay: ExpenseAggregateRow | null;
  topExpenseCategory: ExpenseAggregateRow | null;
  byStation: ExpenseAggregateRow[];
  byDay: ExpenseAggregateRow[];
  byMonth: ExpenseAggregateRow[];
  byCategory: ExpenseAggregateRow[];
  detailRows: StationExpenseRow[];
}

function toAmount(value: unknown) {
  const parsed = Number(value ?? Number.NaN);
  return Number.isFinite(parsed) ? parsed : 0;
}

function normalizedCategory(value: string | null | undefined) {
  const trimmed = (value ?? "").trim();
  return trimmed || "Uncategorized";
}

function sortByNewestReportDate<T extends { report_date?: string | null }>(rows: T[]) {
  return [...rows].sort((a, b) => (b.report_date ?? "").localeCompare(a.report_date ?? ""));
}

export function groupExpensesByStation(expenseRows: StationExpenseRow[]): ExpenseAggregateRow[] {
  const map = new Map<string, ExpenseAggregateRow>();

  expenseRows.forEach((row) => {
    const stationName = row.station_name?.trim() || "Unknown station";
    const stationId = row.station_id ?? null;
    const key = stationId ?? stationName;
    const entry = map.get(key) ?? { key, station_id: stationId, station_name: stationName, count: 0, amount: 0 };
    entry.count += 1;
    entry.amount += toAmount(row.amount);
    map.set(key, entry);
  });

  return Array.from(map.values()).sort((a, b) => b.amount - a.amount);
}

export function groupExpensesByDay(expenseRows: StationExpenseRow[]): ExpenseAggregateRow[] {
  const map = new Map<string, ExpenseAggregateRow>();

  expenseRows.forEach((row) => {
    const reportDate = row.report_date ?? "";
    if (!reportDate) return;
    const stationName = row.station_name?.trim() || "Unknown station";
    const stationId = row.station_id ?? null;
    const key = `${reportDate}|${stationId ?? stationName}`;
    const entry = map.get(key) ?? {
      key,
      report_date: reportDate,
      station_id: stationId,
      station_name: stationName,
      count: 0,
      amount: 0
    };
    entry.count += 1;
    entry.amount += toAmount(row.amount);
    map.set(key, entry);
  });

  return Array.from(map.values()).sort((a, b) => {
    const dateSort = (b.report_date ?? "").localeCompare(a.report_date ?? "");
    if (dateSort !== 0) return dateSort;
    return (a.station_name ?? "").localeCompare(b.station_name ?? "");
  });
}

export function groupExpensesByMonth(expenseRows: StationExpenseRow[]): ExpenseAggregateRow[] {
  const map = new Map<string, ExpenseAggregateRow>();

  expenseRows.forEach((row) => {
    const reportDate = row.report_date ?? "";
    if (!reportDate) return;
    const month = reportDate.slice(0, 7);
    const stationName = row.station_name?.trim() || "Unknown station";
    const stationId = row.station_id ?? null;
    const key = `${month}|${stationId ?? stationName}`;
    const entry = map.get(key) ?? { key, month, station_id: stationId, station_name: stationName, count: 0, amount: 0 };
    entry.count += 1;
    entry.amount += toAmount(row.amount);
    map.set(key, entry);
  });

  return Array.from(map.values()).sort((a, b) => {
    const monthSort = (b.month ?? "").localeCompare(a.month ?? "");
    if (monthSort !== 0) return monthSort;
    return (a.station_name ?? "").localeCompare(b.station_name ?? "");
  });
}

export function groupExpensesByCategory(expenseRows: StationExpenseRow[]): ExpenseAggregateRow[] {
  const map = new Map<string, ExpenseAggregateRow>();

  expenseRows.forEach((row) => {
    const category = normalizedCategory(row.category);
    const entry = map.get(category) ?? { key: category, category, count: 0, amount: 0 };
    entry.count += 1;
    entry.amount += toAmount(row.amount);
    map.set(category, entry);
  });

  return Array.from(map.values()).sort((a, b) => b.amount - a.amount);
}

export function buildExpenseAnalytics(expenseRows: StationExpenseRow[]): ExpenseAnalytics {
  const byStation = groupExpensesByStation(expenseRows);
  const byDay = groupExpensesByDay(expenseRows);
  const byMonth = groupExpensesByMonth(expenseRows);
  const byCategory = groupExpensesByCategory(expenseRows);

  const totalExpenses = expenseRows.reduce((sum, row) => sum + toAmount(row.amount), 0);
  const detailRows = sortByNewestReportDate(expenseRows);

  return {
    totalExpenses,
    expenseCount: expenseRows.length,
    highestExpenseDay: byDay[0] ?? null,
    topExpenseCategory: byCategory[0] ?? null,
    byStation,
    byDay,
    byMonth,
    byCategory,
    detailRows
  };
}
