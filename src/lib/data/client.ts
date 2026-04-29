import { calculateShiftReport } from "@/lib/domain/calculations";
import type { ShiftReportInput } from "@/lib/domain/types";
import { createSupabaseBrowserClient, isSupabaseConfigured } from "@/lib/supabase/client";

export interface DashboardSummary {
  openShifts: number;
  pendingReview: number;
  discrepancyAlerts: number;
  inventoryWarnings: number;
}

export interface ShiftReportRow {
  id: string;
  report_date: string;
  duty_name: string;
  shift_time_label: string;
  status: string;
  source: string;
  discrepancy_amount: number;
  calculated_totals: Record<string, unknown>;
  created_at: string;
  fuel_stations?: { name: string } | null;
}

export interface ShiftReportDetail extends Record<string, unknown> {
  report: {
    id: string;
    report_date: string;
    duty_name: string;
    shift_time_label: string;
    source: string;
    status: string;
    discrepancy_amount: number;
    calculated_totals: Record<string, unknown>;
    created_at: string;
    updated_at: string;
    fuel_stations?: { name: string } | null;
  };
  meterReadings: Array<{
    id: string;
    pump_id: string | null;
    pump_label_snapshot: string;
    product_code_snapshot: string;
    before_reading: number;
    after_reading: number;
    liters_sold: number;
    calibration_liters: number;
    source: string;
    created_at: string;
  }>;
  meterPhotoEvidence: Array<{
    id: string;
    shift_report_id: string;
    station_id: string;
    pump_id: string | null;
    product_code_snapshot: string;
    phase: "opening" | "closing";
    storage_bucket: string;
    storage_path: string;
    original_file_name: string | null;
    mime_type: string | null;
    file_size_bytes: number | null;
    captured_at: string | null;
    uploaded_by: string;
    ocr_status: string;
    ocr_reading: number | null;
    user_confirmed_reading: number | null;
    created_at: string;
    signed_url?: string | null;
  }>;
  creditReceipts: Array<{
    id: string;
    company_name: string;
    receipt_number: string | null;
    product_code_snapshot: string;
    liters: number;
    amount: number | null;
    created_at: string;
  }>;
  expenses: Array<{
    id: string;
    category: string | null;
    description: string;
    receipt_reference: string | null;
    amount: number;
    created_at: string;
  }>;
  cashCounts: Array<{
    id: string;
    denomination: number;
    quantity: number;
    amount: number;
    note: string | null;
    created_at: string;
  }>;
  lubricantSales: Array<{
    id: string;
    product_name_snapshot: string;
    quantity: number;
    unit_price: number;
    amount: number;
    created_at: string;
  }>;
  auditHistory: AuditLogRow[];
}

export interface StationRow {
  id: string;
  code: string;
  name: string;
  official_report_header: string | null;
  is_active: boolean;
}

export interface AuditLogRow {
  id: string;
  actor_role: string | null;
  action_type: string;
  entity_type: string;
  entity_id: string | null;
  details: string | null;
  explanation: string | null;
  created_at: string;
}

export function canUseLiveData() {
  return isSupabaseConfigured();
}

function requireLiveData() {
  if (!canUseLiveData()) {
    throw new Error("Supabase is not configured. Add NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY.");
  }

  return createSupabaseBrowserClient();
}

export async function getDashboardSummary(): Promise<DashboardSummary> {
  if (!canUseLiveData()) {
    return {
      openShifts: 0,
      pendingReview: 0,
      discrepancyAlerts: 0,
      inventoryWarnings: 0
    };
  }

  const supabase = createSupabaseBrowserClient();

  const [draftResult, reviewResult, discrepancyResult, inventoryResult] = await Promise.all([
    supabase.from("fuel_shift_reports").select("id", { count: "exact", head: true }).eq("status", "draft"),
    supabase.from("fuel_shift_reports").select("id", { count: "exact", head: true }).in("status", ["submitted", "reviewed"]),
    supabase.from("fuel_shift_reports").select("id", { count: "exact", head: true }).neq("discrepancy_amount", 0),
    supabase.from("fuel_station_lubricant_inventory").select("id", { count: "exact", head: true }).lte("quantity_on_hand", 0)
  ]);

  const results = [draftResult, reviewResult, discrepancyResult, inventoryResult];
  const failedResult = results.find((result) => result.error);

  if (failedResult?.error) {
    throw failedResult.error;
  }

  return {
    openShifts: draftResult.count ?? 0,
    pendingReview: reviewResult.count ?? 0,
    discrepancyAlerts: discrepancyResult.count ?? 0,
    inventoryWarnings: inventoryResult.count ?? 0
  };
}

export async function listStations() {
  if (!canUseLiveData()) return [] as StationRow[];

  const supabase = createSupabaseBrowserClient();
  const { data, error } = await supabase
    .from("fuel_stations")
    .select("id, code, name, official_report_header, is_active")
    .order("name", { ascending: true });

  if (error) throw error;

  return (data ?? []) as StationRow[];
}

export async function listShiftReports(limit = 25) {
  if (!canUseLiveData()) return [] as ShiftReportRow[];

  const supabase = createSupabaseBrowserClient();
  const { data, error } = await supabase
    .from("fuel_shift_reports")
    .select("id, report_date, duty_name, shift_time_label, status, source, discrepancy_amount, calculated_totals, created_at, fuel_stations(name)")
    .order("report_date", { ascending: false })
    .order("created_at", { ascending: false })
    .limit(limit);

  if (error) throw error;

  return (data ?? []) as unknown as ShiftReportRow[];
}

export async function fetchShiftReportDetail(reportId: string): Promise<ShiftReportDetail> {
  if (!canUseLiveData()) {
    throw new Error("Supabase is not configured. Add NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY.");
  }

  if (!reportId.trim()) {
    throw new Error("Report id is required.");
  }

  const supabase = createSupabaseBrowserClient();

  const [reportResult, meterResult, evidenceResult, creditResult, expenseResult, cashResult, lubricantResult, auditResult] = await Promise.all([
    supabase
      .from("fuel_shift_reports")
      .select("id, report_date, duty_name, shift_time_label, source, status, discrepancy_amount, calculated_totals, created_at, updated_at, fuel_stations(name)")
      .eq("id", reportId)
      .single(),
    supabase
      .from("fuel_meter_readings")
      .select("id, pump_id, pump_label_snapshot, product_code_snapshot, before_reading, after_reading, liters_sold, calibration_liters, source, created_at")
      .eq("shift_report_id", reportId)
      .order("created_at", { ascending: true }),
    supabase
      .from("fuel_meter_photo_evidence")
      .select("id, shift_report_id, station_id, pump_id, product_code_snapshot, phase, storage_bucket, storage_path, original_file_name, mime_type, file_size_bytes, captured_at, uploaded_by, ocr_status, ocr_reading, user_confirmed_reading, created_at")
      .eq("shift_report_id", reportId)
      .order("created_at", { ascending: true }),
    supabase
      .from("fuel_credit_receipts")
      .select("id, company_name, receipt_number, product_code_snapshot, liters, amount, created_at")
      .eq("shift_report_id", reportId)
      .order("created_at", { ascending: true }),
    supabase
      .from("fuel_expenses")
      .select("id, category, description, receipt_reference, amount, created_at")
      .eq("shift_report_id", reportId)
      .order("created_at", { ascending: true }),
    supabase
      .from("fuel_cash_counts")
      .select("id, denomination, quantity, amount, note, created_at")
      .eq("shift_report_id", reportId)
      .order("denomination", { ascending: false }),
    supabase
      .from("fuel_lubricant_sales")
      .select("id, product_name_snapshot, quantity, unit_price, amount, created_at")
      .eq("shift_report_id", reportId)
      .order("created_at", { ascending: true }),
    supabase
      .from("audit_logs")
      .select("id, actor_role, action_type, entity_type, entity_id, details, explanation, created_at")
      .eq("entity_type", "fuel_shift_reports")
      .eq("entity_id", reportId)
      .order("created_at", { ascending: false })
  ]);

  const results = [reportResult, meterResult, evidenceResult, creditResult, expenseResult, cashResult, lubricantResult, auditResult];
  const failedResult = results.find((result) => result.error);

  if (failedResult?.error) {
    throw failedResult.error;
  }

  if (!reportResult.data) {
    throw new Error("Shift report was not found.");
  }

  const stationRelation = reportResult.data.fuel_stations as { name: string } | { name: string }[] | null | undefined;
  const normalizedStation = Array.isArray(stationRelation) ? stationRelation[0] ?? null : stationRelation ?? null;
  const evidenceRows = (evidenceResult.data ?? []) as ShiftReportDetail["meterPhotoEvidence"];
  const signedEvidence = await Promise.all(
    evidenceRows.map(async (row) => {
      const signed = await supabase.storage.from(row.storage_bucket).createSignedUrl(row.storage_path, 60 * 60);
      return { ...row, signed_url: signed.data?.signedUrl ?? null };
    })
  );

  return {
    report: {
      ...(reportResult.data as Omit<ShiftReportDetail["report"], "fuel_stations">),
      fuel_stations: normalizedStation
    },
    meterReadings: (meterResult.data ?? []) as ShiftReportDetail["meterReadings"],
    meterPhotoEvidence: signedEvidence,
    creditReceipts: (creditResult.data ?? []) as ShiftReportDetail["creditReceipts"],
    expenses: (expenseResult.data ?? []) as ShiftReportDetail["expenses"],
    cashCounts: (cashResult.data ?? []) as ShiftReportDetail["cashCounts"],
    lubricantSales: (lubricantResult.data ?? []) as ShiftReportDetail["lubricantSales"],
    auditHistory: (auditResult.data ?? []) as ShiftReportDetail["auditHistory"]
  };
}

export async function listAuditLogs(limit = 50) {
  if (!canUseLiveData()) return [] as AuditLogRow[];

  const supabase = createSupabaseBrowserClient();
  const { data, error } = await supabase
    .from("audit_logs")
    .select("id, actor_role, action_type, entity_type, entity_id, details, explanation, created_at")
    .like("entity_type", "fuel_%")
    .order("created_at", { ascending: false })
    .limit(limit);

  if (error) throw error;

  return (data ?? []) as AuditLogRow[];
}

export async function commitShiftReport(report: ShiftReportInput, importContext?: Record<string, unknown>) {
  const supabase = requireLiveData();

  const payload = {
    ...report,
    calculatedPreview: calculateShiftReport(report)
  };

  const { data, error } = await supabase.rpc("fuel_commit_shift_report", {
    payload,
    import_context: importContext ?? null
  });

  if (error) throw error;
  if (!data) throw new Error("Supabase did not return a report id.");

  return data as string;
}

export async function markReportStatus(
  reportId: string,
  status: "submitted" | "reviewed" | "approved",
  explanation?: string
) {
  const supabase = requireLiveData();

  const { error } = await supabase.rpc("fuel_transition_shift_report", {
    report_id: reportId,
    next_status: status,
    explanation: explanation ?? `${status} from web app`
  });

  if (error) throw error;
}

export async function recordExport(reportId: string | null, reportType: string, exportFormat: string) {
  if (!canUseLiveData()) return;

  const supabase = createSupabaseBrowserClient();
  const { error } = await supabase.from("fuel_report_exports").insert({
    shift_report_id: reportId,
    report_type: reportType,
    export_format: exportFormat
  });

  if (error) throw error;
}
