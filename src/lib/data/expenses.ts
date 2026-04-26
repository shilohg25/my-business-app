import { canUseLiveData } from "@/lib/data/client";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";

export interface StationExpenseFetchOptions {
  stationId?: string;
  startDate: string;
  endDate: string;
}

export interface StationExpenseRow {
  id: string;
  shift_report_id: string;
  station_id: string | null;
  station_name: string;
  report_date: string | null;
  duty_name: string | null;
  shift_time_label: string | null;
  category: string | null;
  description: string | null;
  receipt_reference: string | null;
  amount: number | string | null;
  created_at: string | null;
}

export interface ExpenseStationOption {
  id: string;
  code: string;
  name: string;
  is_active: boolean;
}

export interface StationExpenseResult {
  rows: StationExpenseRow[];
  stations: ExpenseStationOption[];
}

export async function fetchStationExpenses(options: StationExpenseFetchOptions): Promise<StationExpenseResult> {
  if (!canUseLiveData()) return { rows: [], stations: [] };

  const supabase = createSupabaseBrowserClient();

  const stationsResult = await supabase
    .from("fuel_stations")
    .select("id, code, name, is_active")
    .order("name", { ascending: true });

  if (stationsResult.error) throw stationsResult.error;

  const stations = (stationsResult.data ?? []) as ExpenseStationOption[];

  let reportsQuery = supabase
    .from("fuel_shift_reports")
    .select("id, station_id, report_date, duty_name, shift_time_label, status, archived_at")
    .is("archived_at", null)
    .gte("report_date", options.startDate)
    .lte("report_date", options.endDate)
    .order("report_date", { ascending: false });

  if (options.stationId) {
    reportsQuery = reportsQuery.eq("station_id", options.stationId);
  }

  const reportsResult = await reportsQuery;
  if (reportsResult.error) throw reportsResult.error;

  const reports = (reportsResult.data ?? []) as Array<{
    id: string;
    station_id: string | null;
    report_date: string | null;
    duty_name: string | null;
    shift_time_label: string | null;
  }>;

  const reportIds = reports.map((report) => report.id);
  if (reportIds.length === 0) {
    return { rows: [], stations };
  }

  const expensesResult = await supabase
    .from("fuel_expenses")
    .select("id, shift_report_id, category, description, amount, receipt_reference, created_at")
    .in("shift_report_id", reportIds)
    .order("created_at", { ascending: false });

  if (expensesResult.error) throw expensesResult.error;

  const reportById = new Map(reports.map((report) => [report.id, report]));
  const stationById = new Map(stations.map((station) => [station.id, station]));

  const rows = ((expensesResult.data ?? []) as Array<{
    id: string;
    shift_report_id: string;
    category: string | null;
    description: string | null;
    amount: number | string | null;
    receipt_reference: string | null;
    created_at: string | null;
  }>).map((expense) => {
    const report = reportById.get(expense.shift_report_id);
    const stationId = report?.station_id ?? null;
    const stationName = stationId ? stationById.get(stationId)?.name ?? "Unknown station" : "Unknown station";

    return {
      id: expense.id,
      shift_report_id: expense.shift_report_id,
      station_id: stationId,
      station_name: stationName,
      report_date: report?.report_date ?? null,
      duty_name: report?.duty_name ?? null,
      shift_time_label: report?.shift_time_label ?? null,
      category: expense.category,
      description: expense.description,
      receipt_reference: expense.receipt_reference,
      amount: expense.amount,
      created_at: expense.created_at
    };
  });

  return { rows, stations };
}
