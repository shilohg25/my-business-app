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

  return (data ?? []) as ShiftReportRow[];
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
