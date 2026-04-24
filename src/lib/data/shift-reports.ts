import type { ShiftReportInput } from "@/lib/domain/types";
import { commitShiftReport, listShiftReports } from "./client";

export async function createShiftReport(input: ShiftReportInput) {
  const id = await commitShiftReport(input);
  return { id };
}

export async function listRecentShiftReports() {
  return listShiftReports(25);
}
