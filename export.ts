"use client";

import { useState } from "react";
import { calculateShiftReport } from "@/lib/domain/calculations";
import type { ShiftReportInput } from "@/lib/domain/types";
import { Button } from "@/components/ui/button";
import { BalanceSummary } from "@/components/shift-reports/balance-summary";

export function ImportPreview() {
  const [report, setReport] = useState<ShiftReportInput | null>(null);
  const [warnings, setWarnings] = useState<{ code: string; message: string }[]>([]);
  const [error, setError] = useState<string | null>(null);

  async function handleFile(file: File) {
    const formData = new FormData();
    formData.append("file", file);

    const response = await fetch("/api/imports/osr", { method: "POST", body: formData });
    const data = await response.json();

    if (!response.ok) {
      setError(data.error ?? "Import failed.");
      return;
    }

    setError(null);
    setReport(data.report);
    setWarnings(data.warnings ?? []);
  }

  const result = report ? calculateShiftReport(report) : null;

  return (
    <div className="space-y-5">
      <div className="rounded-2xl border bg-white p-5">
        <input
          type="file"
          accept=".xlsx,.xls"
          onChange={(event) => {
            const file = event.target.files?.[0];
            if (file) void handleFile(file);
          }}
        />
        {error ? <p className="mt-3 text-sm text-red-700">{error}</p> : null}
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

      {report ? (
        <div className="rounded-2xl border bg-white p-5">
          <pre className="max-h-96 overflow-auto text-xs">{JSON.stringify(report, null, 2)}</pre>
          <Button className="mt-4">Commit import</Button>
        </div>
      ) : null}
    </div>
  );
}
