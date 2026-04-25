import {
  buildExecutiveAnalytics,
  type ExecutiveAnalytics,
  type ExecutiveCreditReceiptRow,
  type ExecutiveExpenseRow,
  type ExecutiveMeterReadingRow,
  type ExecutiveReportRow
} from "@/lib/analytics/executive";
import { canUseLiveData } from "@/lib/data/client";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";

export interface ExecutiveAnalyticsResult {
  analytics: ExecutiveAnalytics;
  reports: ExecutiveReportRow[];
  expenses: ExecutiveExpenseRow[];
  meterReadings: ExecutiveMeterReadingRow[];
  creditReceipts: ExecutiveCreditReceiptRow[];
}

function emptyAnalyticsResult(): ExecutiveAnalyticsResult {
  return {
    analytics: buildExecutiveAnalytics({ reports: [], expenses: [], meterReadings: [], creditReceipts: [] }),
    reports: [],
    expenses: [],
    meterReadings: [],
    creditReceipts: []
  };
}

export async function fetchExecutiveAnalytics(options: { startDate: string; endDate: string }): Promise<ExecutiveAnalyticsResult> {
  if (!canUseLiveData()) {
    return emptyAnalyticsResult();
  }

  const supabase = createSupabaseBrowserClient();

  const reportsResult = await supabase
    .from("fuel_shift_reports")
    .select("id, report_date, duty_name, status, calculated_totals, discrepancy_amount, archived_at")
    .is("archived_at", null)
    .gte("report_date", options.startDate)
    .lte("report_date", options.endDate)
    .order("report_date", { ascending: false });

  if (reportsResult.error) {
    throw reportsResult.error;
  }

  const reports = ((reportsResult.data ?? []) as ExecutiveReportRow[]).map((row) => ({
    ...row,
    calculated_totals: row.calculated_totals ?? {}
  }));
  const reportIds = reports.map((row) => row.id);

  if (reportIds.length === 0) {
    return {
      ...emptyAnalyticsResult(),
      reports
    };
  }

  const [expensesResult, meterResult, creditResult] = await Promise.all([
    supabase
      .from("fuel_expenses")
      .select("id, shift_report_id, category, description, amount, receipt_reference, created_at")
      .in("shift_report_id", reportIds)
      .order("created_at", { ascending: false }),
    supabase
      .from("fuel_meter_readings")
      .select("id, shift_report_id, product_code_snapshot, before_reading, after_reading, liters_sold, calibration_liters")
      .in("shift_report_id", reportIds),
    supabase
      .from("fuel_credit_receipts")
      .select("id, shift_report_id, product_code_snapshot, liters, amount, company_name, receipt_number")
      .in("shift_report_id", reportIds)
  ]);

  const errors = [expensesResult.error, meterResult.error, creditResult.error].filter(Boolean);
  if (errors.length > 0) {
    throw errors[0];
  }

  const expenses = (expensesResult.data ?? []) as ExecutiveExpenseRow[];
  const meterReadings = (meterResult.data ?? []) as ExecutiveMeterReadingRow[];
  const creditReceipts = (creditResult.data ?? []) as ExecutiveCreditReceiptRow[];

  return {
    analytics: buildExecutiveAnalytics({ reports, expenses, meterReadings, creditReceipts }),
    reports,
    expenses,
    meterReadings,
    creditReceipts
  };
}
