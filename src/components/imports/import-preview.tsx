"use client";

import { useState } from "react";
import { calculateShiftReport } from "@/lib/domain/calculations";
import type { ShiftReportInput } from "@/lib/domain/types";
import { Button } from "@/components/ui/button";
import { BalanceSummary } from "@/components/shift-reports/balance-summary";
import { parseOsrWorkbook, type ImportWarning } from "@/lib/imports/osr-parser";
import { canUseLiveData, commitShiftReport } from "@/lib/data/client";
import { appPath, getSupabaseConfigurationState } from "@/lib/supabase/client";
import { formatCurrency } from "@/lib/utils";

export function ImportPreview() {
  const liveData = canUseLiveData();
  const config = getSupabaseConfigurationState();

  const [fileName, setFileName] = useState<string | null>(null);
  const [report, setReport] = useState<ShiftReportInput | null>(null);
  const [warnings, setWarnings] = useState<ImportWarning[]>([]);
  const [workbookTotals, setWorkbookTotals] = useState<Record<string, number | undefined>>({});
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [savedReportId, setSavedReportId] = useState<string | null>(null);
  const [committing, setCommitting] = useState(false);

  async function handleFile(file: File) {
    setError(null);
    setMessage(null);
    setSavedReportId(null);
    setFileName(file.name);

    try {
      const buffer = await file.arrayBuffer();
      const parsed = parseOsrWorkbook(buffer);

      setReport(parsed.report);
      setWarnings(parsed.warnings ?? []);
      setWorkbookTotals(parsed.workbookTotals ?? {});
    } catch (err) {
      setReport(null);
      setWarnings([]);
      setWorkbookTotals({});
      setError(err instanceof Error ? err.message : "Unable to parse workbook.");
    }
  }

  async function commit() {
    if (!report) return;

    if (!liveData) {
      setError(config.reason);
      return;
    }

    setCommitting(true);
    setMessage(null);
    setError(null);

    try {
      const reportId = await commitShiftReport(report, {
        sourceFileName: fileName,
        parserVersion: "osr-v1-client",
        warnings,
        workbookTotals
      });

      setSavedReportId(reportId);
      setMessage("Import committed successfully.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Commit failed.");
    } finally {
      setCommitting(false);
    }
  }

  const result = report ? calculateShiftReport(report) : null;
  const lubricantSummary = report
    ? {
        totalQuantity: report.lubricantSales.reduce((sum, row) => sum + Number(row.quantity ?? 0), 0),
        totalAmount: report.lubricantSales.reduce((sum, row) => sum + Number(row.quantity ?? 0) * Number(row.unitPrice ?? 0), 0),
        missingNameCount: report.lubricantSales.filter((row) => !(row.productName ?? "").trim()).length,
        zeroPriceCount: report.lubricantSales.filter((row) => Number(row.unitPrice ?? 0) <= 0).length
      }
    : null;


  return (
    <div className="space-y-5">
      <div className="rounded-2xl border bg-white p-5">
        {!liveData ? (
          <p className="mb-4 rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
            Workbook preview works locally, but committing imports requires Supabase. {config.reason}
          </p>
        ) : null}

        <input
          type="file"
          accept=".xlsx,.xls"
          onChange={(event) => {
            const file = event.target.files?.[0];
            if (file) void handleFile(file);
          }}
        />

        {fileName ? <p className="mt-2 text-sm text-slate-500">Selected: {fileName}</p> : null}
        {error ? <p className="mt-3 text-sm text-red-700">{error}</p> : null}
        {message ? <p className="mt-3 text-sm text-green-700">{message}</p> : null}

        {savedReportId ? (
          <div className="mt-4 rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-900">
            <p className="font-semibold">Import committed successfully.</p>
            <p className="mt-1">Saved report id: {savedReportId}</p>
            <div className="mt-3 flex flex-wrap gap-2">
              <a
                href={appPath(`/shift-reports/view/?id=${savedReportId}`)}
                className="inline-flex h-9 items-center justify-center rounded-lg border border-emerald-300 bg-white px-3 text-xs font-medium hover:bg-emerald-100"
              >
                View saved report
              </a>
              <a
                href={appPath("/shift-reports/")}
                className="inline-flex h-9 items-center justify-center rounded-lg border border-emerald-300 bg-white px-3 text-xs font-medium hover:bg-emerald-100"
              >
                Open Daily Shift Reports
              </a>
            </div>
          </div>
        ) : null}
      </div>

      {warnings.length > 0 ? (
        <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm">
          <div className="font-medium">Parsing warnings</div>
          <ul className="mt-2 list-disc pl-5">
            {warnings.map((warning) => (
              <li key={`${warning.code}-${warning.message}`}>{warning.message}</li>
            ))}
          </ul>
        </div>
      ) : null}

      {result ? <BalanceSummary result={result} /> : null}

      {lubricantSummary ? (
        <div className="rounded-2xl border bg-white p-5 text-sm">
          <h3 className="font-semibold text-slate-900">Lubricant sales summary</h3>
          <p className="mt-1 text-slate-600">Total lubricant quantity: <span className="font-medium text-slate-900">{lubricantSummary.totalQuantity.toFixed(2)}</span></p>
          <p className="text-slate-600">Total lubricant amount: <span className="font-medium text-slate-900">{formatCurrency(lubricantSummary.totalAmount)}</span></p>
          {lubricantSummary.missingNameCount > 0 || lubricantSummary.zeroPriceCount > 0 ? (
            <p className="mt-2 text-amber-700">
              Warning: workbook has lubricant rows with missing product names ({lubricantSummary.missingNameCount}) or zero unit price ({lubricantSummary.zeroPriceCount}).
            </p>
          ) : null}
        </div>
      ) : null}

      {report ? (
        <div className="rounded-2xl border bg-white p-5">
          <div className="mb-3 grid gap-3 text-sm md:grid-cols-3">
            <div>
              <span className="text-slate-500">Date:</span> {report.reportDate}
            </div>
            <div>
              <span className="text-slate-500">Duty:</span> {report.dutyName || "-"}
            </div>
            <div>
              <span className="text-slate-500">Shift:</span> {report.shiftTimeLabel || "-"}
            </div>
          </div>

          <pre className="max-h-96 overflow-auto rounded-xl bg-slate-950 p-4 text-xs text-slate-100">
            {JSON.stringify(report, null, 2)}
          </pre>

          <Button className="mt-4" onClick={commit} disabled={committing || !liveData || Boolean(savedReportId)}>
            {committing ? "Committing..." : savedReportId ? "Import committed" : liveData ? "Commit import" : "Connect Supabase to commit"}
          </Button>
        </div>
      ) : null}
    </div>
  );
}
