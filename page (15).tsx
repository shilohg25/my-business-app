"use server";

import { revalidatePath } from "next/cache";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { calculateShiftReport } from "@/lib/domain/calculations";
import { shiftReportSchema } from "@/lib/domain/validation";
import type { ShiftReportInput } from "@/lib/domain/types";
import { writeAuditLog } from "./audit";

export async function createShiftReport(input: ShiftReportInput) {
  const parsed = shiftReportSchema.parse(input);
  const calculated = calculateShiftReport(parsed);
  const supabase = await createSupabaseServerClient();

  const { data: report, error } = await supabase
    .from("fuel_shift_reports")
    .insert({
      station_id: parsed.stationId,
      report_date: parsed.reportDate,
      duty_name: parsed.dutyName,
      shift_time_label: parsed.shiftTimeLabel,
      source: parsed.source,
      status: "draft",
      calculated_totals: calculated,
      discrepancy_amount: calculated.workbookStyleDiscrepancy,
      edit_reason: parsed.editReason ?? null
    })
    .select("id")
    .single();

  if (error) throw error;

  const reportId = report.id as string;

  const insertOperations: Array<PromiseLike<{ error: unknown }>> = [];

  if (parsed.meterReadings.length > 0) {
    insertOperations.push(
      supabase.from("fuel_meter_readings").insert(
        parsed.meterReadings.map((line) => ({
          shift_report_id: reportId,
          pump_id: line.pumpId ?? null,
          pump_label_snapshot: line.pumpLabel,
          product_code_snapshot: line.productCode,
          before_reading: line.beforeReading,
          after_reading: line.afterReading,
          calibration_liters: line.calibrationLiters ?? 0
        }))
      )
    );
  }

  if (parsed.creditReceipts.length > 0) {
    insertOperations.push(
      supabase.from("fuel_credit_receipts").insert(
        parsed.creditReceipts.map((line) => ({
          shift_report_id: reportId,
          product_code_snapshot: line.productCode,
          customer_id: line.externalCustomerId ?? null,
          company_name: line.companyName,
          external_reference: line.externalReference ?? null,
          receipt_number: line.receiptNumber ?? null,
          liters: line.liters,
          amount: line.amount ?? null,
          attachment_path: line.attachmentPath ?? null
        }))
      )
    );
  }

  if (parsed.expenses.length > 0) {
    insertOperations.push(
      supabase.from("fuel_expenses").insert(
        parsed.expenses.map((line) => ({
          shift_report_id: reportId,
          description: line.description,
          category: line.category ?? null,
          amount: line.amount
        }))
      )
    );
  }

  if (parsed.cashCounts.length > 0) {
    insertOperations.push(
      supabase.from("fuel_cash_counts").insert(
        parsed.cashCounts.map((line) => ({
          shift_report_id: reportId,
          denomination: line.denomination,
          quantity: line.quantity,
          amount: line.lineAmount ?? line.denomination * line.quantity
        }))
      )
    );
  }

  if (parsed.lubricantSales.length > 0) {
    insertOperations.push(
      supabase.from("fuel_lubricant_sales").insert(
        parsed.lubricantSales.map((line) => ({
          shift_report_id: reportId,
          product_name_snapshot: line.productName,
          quantity: line.quantity,
          unit_price: line.unitPrice
        }))
      )
    );
  }

  if (parsed.coinsAmount) {
    insertOperations.push(
      supabase.from("fuel_cash_counts").insert({
        shift_report_id: reportId,
        denomination: 1,
        quantity: 0,
        amount: parsed.coinsAmount,
        note: "Coins / loose cash"
      })
    );
  }

  const insertResults = await Promise.all(insertOperations);
  const insertError = insertResults.find((result) => result.error)?.error;
  if (insertError) throw insertError;

  await writeAuditLog({
    actionType: parsed.source === "excel_import" ? "import" : "create",
    entityType: "fuel_shift_report",
    entityId: reportId,
    newSnapshot: { input: parsed, calculated }
  });

  revalidatePath("/shift-reports");
  return { id: reportId, calculated };
}

export async function listRecentShiftReports() {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("fuel_shift_reports")
    .select("id, report_date, duty_name, shift_time_label, source, status, discrepancy_amount, stations:fuel_stations(name)")
    .order("report_date", { ascending: false })
    .limit(25);

  if (error) throw error;
  return data ?? [];
}
