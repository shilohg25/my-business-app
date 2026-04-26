import type { EntrySource } from "@/lib/domain/types";

const SOURCE_LABELS: Record<EntrySource, string> = {
  web_manual: "Manual entry",
  mobile_submission: "Mobile submission",
  // Keep legacy value for historical/audit visibility of already imported reports.
  excel_import: "Legacy Excel import"
};

export function getShiftReportSourceLabel(source: string | null | undefined) {
  if (!source) return "-";
  return SOURCE_LABELS[source as EntrySource] ?? source;
}
