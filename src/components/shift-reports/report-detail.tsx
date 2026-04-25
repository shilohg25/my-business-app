"use client";

import { useEffect, useMemo, useState, type ReactNode } from "react";
import { useSearchParams } from "next/navigation";
import { canUseLiveData, fetchShiftReportDetail, type ShiftReportDetail } from "@/lib/data/client";
import { appPath, getSupabaseConfigurationState } from "@/lib/supabase/client";
import { formatCurrency } from "@/lib/utils";

function formatNumber(value: number | string | null | undefined, digits = 2) {
  const numeric = Number(value ?? Number.NaN);
  if (!Number.isFinite(numeric)) return "-";
  return numeric.toLocaleString("en-US", { minimumFractionDigits: digits, maximumFractionDigits: digits });
}

function formatDateTime(value: string | null | undefined) {
  if (!value) return "-";

  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return value;

  return parsed.toLocaleString("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit"
  });
}

function formatDate(value: string | null | undefined) {
  if (!value) return "-";

  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return value;

  return parsed.toLocaleDateString("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric"
  });
}

function formatValue(value: unknown, kind: "currency" | "number" | "liters" = "number") {
  if (value === null || value === undefined || value === "") return "-";

  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return "-";

  if (kind === "currency") return formatCurrency(numeric);
  if (kind === "liters") return formatNumber(numeric, 3);
  return formatNumber(numeric, 2);
}

type SummaryMetricProps = {
  label: string;
  value: string;
  tone?: "default" | "success" | "warning";
};

function SummaryMetric({ label, value, tone = "default" }: SummaryMetricProps) {
  const toneClass =
    tone === "warning"
      ? "border-amber-300 bg-amber-50"
      : tone === "success"
        ? "border-emerald-300 bg-emerald-50"
        : "border-slate-200 bg-white";

  return (
    <article className={`rounded-xl border px-4 py-3 ${toneClass}`}>
      <p className="text-xs font-medium uppercase tracking-wide text-slate-500">{label}</p>
      <p className="mt-1 text-lg font-semibold text-slate-900">{value}</p>
    </article>
  );
}

function EmptyState({ message }: { message: string }) {
  return <p className="text-sm text-slate-500">{message}</p>;
}

type SectionCardProps = {
  title: string;
  description?: string;
  emptyMessage?: string;
  isEmpty?: boolean;
  subtle?: boolean;
  children: ReactNode;
};

function SectionCard({ title, description, emptyMessage, isEmpty, subtle = false, children }: SectionCardProps) {
  return (
    <section className={`rounded-2xl border bg-white ${subtle ? "p-4" : "p-5"}`}>
      <div className="mb-3">
        <h2 className={`${subtle ? "text-base" : "text-lg"} font-semibold text-slate-900`}>{title}</h2>
        {description ? <p className="mt-1 text-xs text-slate-500">{description}</p> : null}
      </div>
      {isEmpty ? <EmptyState message={emptyMessage ?? "No records found."} /> : children}
    </section>
  );
}

function DataTable({ headers, children }: { headers: ReactNode; children: ReactNode }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead className="text-left text-xs uppercase tracking-wide text-slate-500">{headers}</thead>
        <tbody className="text-slate-700">{children}</tbody>
      </table>
    </div>
  );
}

function ReviewFlags({ flags }: { flags: string[] }) {
  return (
    <SectionCard title="Review flags" description="Signals that may need manager attention." isEmpty={flags.length === 0} emptyMessage="No review flags detected.">
      <div className="flex flex-wrap gap-2">
        {flags.map((flag) => (
          <span className="rounded-full border border-amber-300 bg-amber-50 px-3 py-1 text-xs font-medium text-amber-800" key={flag}>
            {flag}
          </span>
        ))}
      </div>
    </SectionCard>
  );
}

function ReviewHeader({ detail, id }: { detail: ShiftReportDetail; id: string }) {
  const status = detail.report.status || "Unknown";

  return (
    <section className="rounded-2xl border bg-white p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <a className="text-sm font-medium text-slate-700 hover:text-slate-900" href={appPath("/shift-reports/")}>
            ← Back to Daily Shift Reports
          </a>
          <h2 className="mt-2 text-lg font-semibold text-slate-900">Shift report review</h2>
          <p className="text-xs text-slate-500">Report ID: {id}</p>
        </div>

        <div className="flex items-center gap-2">
          <span className="rounded-full border border-slate-300 bg-slate-100 px-3 py-1 text-xs font-semibold uppercase tracking-wide text-slate-700">
            {status}
          </span>
          <button
            className="rounded-lg border border-slate-300 px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50"
            onClick={() => window.print()}
            type="button"
          >
            Print
          </button>
        </div>
      </div>

      <div className="mt-4 grid gap-2 text-sm sm:grid-cols-2 lg:grid-cols-4">
        <p><span className="text-slate-500">Report date:</span> {formatDate(detail.report.report_date)}</p>
        <p><span className="text-slate-500">Shift time:</span> {detail.report.shift_time_label || "-"}</p>
        <p><span className="text-slate-500">Duty/Cashier:</span> {detail.report.duty_name || "-"}</p>
        <p><span className="text-slate-500">Station:</span> {detail.report.fuel_stations?.name ?? "-"}</p>
        <p><span className="text-slate-500">Source:</span> {detail.report.source || "-"}</p>
        <p><span className="text-slate-500">Created:</span> {formatDateTime(detail.report.created_at)}</p>
      </div>
    </section>
  );
}

export function ReportDetail() {
  const searchParams = useSearchParams();
  const id = useMemo(() => searchParams.get("id")?.trim() ?? "", [searchParams]);

  const liveData = canUseLiveData();
  const config = getSupabaseConfigurationState();

  const [detail, setDetail] = useState<ShiftReportDetail | null>(null);
  const [loading, setLoading] = useState(liveData && id.length > 0);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!id) {
      setLoading(false);
      setDetail(null);
      setError("Missing report id. Open this page from the Daily Shift Reports list, or use ?id=<report_id> in the URL.");
      return;
    }

    if (!liveData) {
      setLoading(false);
      setDetail(null);
      setError(`Live report details are unavailable. ${config.reason}`);
      return;
    }

    let active = true;
    setLoading(true);
    setError(null);

    fetchShiftReportDetail(id)
      .then((result) => {
        if (!active) return;
        setDetail(result);
      })
      .catch((nextError: Error) => {
        if (!active) return;
        setDetail(null);
        setError(nextError.message || "Unable to load report details.");
      })
      .finally(() => {
        if (active) setLoading(false);
      });

    return () => {
      active = false;
    };
  }, [config.reason, id, liveData]);

  const totals = detail?.report.calculated_totals ?? {};
  const hasNestedDetails = Object.entries(totals).some(([, value]) => typeof value === "object" && value !== null);

  const discrepancy = Number(totals.workbookStyleDiscrepancy ?? detail?.report.discrepancy_amount ?? 0);
  const hasDiscrepancy = Number.isFinite(discrepancy) && discrepancy !== 0;

  const reviewFlags = [
    hasDiscrepancy ? "Workbook discrepancy is not zero." : null,
    detail && detail.meterReadings.length === 0 ? "No meter readings recorded." : null,
    detail && detail.cashCounts.length === 0 ? "No cash count rows recorded." : null,
    detail && !detail.report.fuel_stations?.name ? "No station linked to this report." : null,
    detail && detail.auditHistory.length === 0 ? "No audit history found." : null
  ].filter((item): item is string => Boolean(item));

  const summaryMetrics = [
    { label: "Operational net remittance", value: formatValue(totals.operationalNetRemittance, "currency") },
    { label: "Cash count", value: formatValue(totals.totalCashCount, "currency") },
    { label: "Expected cash before expenses", value: formatValue(totals.expectedCashBeforeExpenses, "currency") },
    {
      label: "Workbook discrepancy",
      value: formatValue(totals.workbookStyleDiscrepancy, "currency"),
      tone: hasDiscrepancy ? ("warning" as const) : ("success" as const)
    },
    { label: "Fuel cash sales", value: formatValue(totals.totalFuelCashSales, "currency") },
    { label: "Lubricant sales", value: formatValue(totals.totalLubricantSales, "currency") },
    { label: "Credit liters", value: formatValue(totals.totalCreditLiters, "liters") },
    { label: "Net fuel liters", value: formatValue(totals.totalNetCashLiters, "liters") }
  ];

  return (
    <div className="space-y-5">
      {loading ? <div className="rounded-2xl border bg-white p-5 text-sm text-slate-500">Loading report details...</div> : null}

      {error ? (
        <div className="rounded-2xl border border-red-200 bg-red-50 p-5 text-sm text-red-800">
          <p className="font-medium">Unable to show this report.</p>
          <p>{error}</p>
        </div>
      ) : null}

      {!loading && !error && detail ? (
        <>
          <ReviewHeader detail={detail} id={id} />

          <SectionCard title="Approval Summary" description="Key totals for quick manager review.">
            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
              {summaryMetrics.map((metric) => (
                <SummaryMetric key={metric.label} label={metric.label} tone={metric.tone} value={metric.value} />
              ))}
            </div>
          </SectionCard>

          <ReviewFlags flags={reviewFlags} />

          {hasNestedDetails ? (
            <SectionCard
              description="Expanded data from calculated totals for secondary reference."
              subtle
              title="Detailed calculation data"
            >
              <details>
                <summary className="cursor-pointer text-sm font-medium text-slate-700">Show detailed calculation data</summary>
                <pre className="mt-3 overflow-x-auto rounded-lg bg-slate-50 p-3 text-xs text-slate-700">
                  {JSON.stringify(
                    Object.fromEntries(Object.entries(totals).filter(([, value]) => typeof value === "object" && value !== null)),
                    null,
                    2
                  )}
                </pre>
              </details>
            </SectionCard>
          ) : null}

          <SectionCard title="Meter readings" isEmpty={detail.meterReadings.length === 0} emptyMessage="No meter readings found for this report.">
            <DataTable
              headers={
                <tr>
                  <th className="py-2">Pump</th>
                  <th className="py-2">Product</th>
                  <th className="py-2 text-right">Before</th>
                  <th className="py-2 text-right">After</th>
                  <th className="py-2 text-right">Gross liters</th>
                  <th className="py-2 text-right">Calibration</th>
                </tr>
              }
            >
              {detail.meterReadings.map((row) => (
                <tr className="border-t border-slate-100" key={row.id}>
                  <td className="py-2">{row.pump_label_snapshot}</td>
                  <td className="py-2">{row.product_code_snapshot}</td>
                  <td className="py-2 text-right tabular-nums">{formatNumber(row.before_reading, 3)}</td>
                  <td className="py-2 text-right tabular-nums">{formatNumber(row.after_reading, 3)}</td>
                  <td className="py-2 text-right tabular-nums">{formatNumber(row.liters_sold, 3)}</td>
                  <td className="py-2 text-right tabular-nums">{formatNumber(row.calibration_liters, 3)}</td>
                </tr>
              ))}
            </DataTable>
          </SectionCard>

          <SectionCard title="Credit receipts" isEmpty={detail.creditReceipts.length === 0} emptyMessage="No credit receipts found for this report.">
            <DataTable
              headers={
                <tr>
                  <th className="py-2">Company</th>
                  <th className="py-2">Receipt #</th>
                  <th className="py-2">Product</th>
                  <th className="py-2 text-right">Liters</th>
                  <th className="py-2 text-right">Amount</th>
                </tr>
              }
            >
              {detail.creditReceipts.map((row) => (
                <tr className="border-t border-slate-100" key={row.id}>
                  <td className="py-2">{row.company_name}</td>
                  <td className="py-2">{row.receipt_number || "-"}</td>
                  <td className="py-2">{row.product_code_snapshot}</td>
                  <td className="py-2 text-right tabular-nums">{formatNumber(row.liters, 3)}</td>
                  <td className="py-2 text-right tabular-nums">{formatCurrency(Number(row.amount ?? 0))}</td>
                </tr>
              ))}
            </DataTable>
          </SectionCard>

          <SectionCard title="Cash count" isEmpty={detail.cashCounts.length === 0} emptyMessage="No cash count rows found for this report.">
            <DataTable
              headers={
                <tr>
                  <th className="py-2">Denomination</th>
                  <th className="py-2 text-right">Quantity</th>
                  <th className="py-2 text-right">Amount</th>
                  <th className="py-2">Note</th>
                </tr>
              }
            >
              {detail.cashCounts.map((row) => (
                <tr className="border-t border-slate-100" key={row.id}>
                  <td className="py-2">{formatCurrency(Number(row.denomination ?? 0))}</td>
                  <td className="py-2 text-right tabular-nums">{formatNumber(row.quantity, 0)}</td>
                  <td className="py-2 text-right tabular-nums">{formatCurrency(Number(row.amount ?? 0))}</td>
                  <td className="py-2">{row.note ?? "-"}</td>
                </tr>
              ))}
            </DataTable>
          </SectionCard>

          <SectionCard title="Expenses" isEmpty={detail.expenses.length === 0} emptyMessage="No expenses found for this report.">
            <DataTable
              headers={
                <tr>
                  <th className="py-2">Description</th>
                  <th className="py-2">Category</th>
                  <th className="py-2 text-right">Amount</th>
                </tr>
              }
            >
              {detail.expenses.map((row) => (
                <tr className="border-t border-slate-100" key={row.id}>
                  <td className="py-2">{row.description}</td>
                  <td className="py-2">{row.category ?? "-"}</td>
                  <td className="py-2 text-right tabular-nums">{formatCurrency(Number(row.amount ?? 0))}</td>
                </tr>
              ))}
            </DataTable>
          </SectionCard>

          <SectionCard title="Lubricant sales" isEmpty={detail.lubricantSales.length === 0} emptyMessage="No lubricant sales found for this report.">
            <DataTable
              headers={
                <tr>
                  <th className="py-2">Product</th>
                  <th className="py-2 text-right">Quantity</th>
                  <th className="py-2 text-right">Unit price</th>
                  <th className="py-2 text-right">Amount</th>
                </tr>
              }
            >
              {detail.lubricantSales.map((row) => (
                <tr className="border-t border-slate-100" key={row.id}>
                  <td className="py-2">{row.product_name_snapshot}</td>
                  <td className="py-2 text-right tabular-nums">{formatNumber(row.quantity, 2)}</td>
                  <td className="py-2 text-right tabular-nums">{formatCurrency(Number(row.unit_price ?? 0))}</td>
                  <td className="py-2 text-right tabular-nums">{formatCurrency(Number(row.amount ?? 0))}</td>
                </tr>
              ))}
            </DataTable>
          </SectionCard>

          <SectionCard
            title="Audit history"
            description="Recent report lifecycle events."
            subtle
            isEmpty={detail.auditHistory.length === 0}
            emptyMessage="No audit history records found for this report."
          >
            <DataTable
              headers={
                <tr>
                  <th className="py-2">When</th>
                  <th className="py-2">Action</th>
                  <th className="py-2">Actor role</th>
                  <th className="py-2">Details</th>
                </tr>
              }
            >
              {detail.auditHistory.map((row) => (
                <tr className="border-t border-slate-100" key={row.id}>
                  <td className="py-2">{formatDateTime(row.created_at)}</td>
                  <td className="py-2">{row.action_type}</td>
                  <td className="py-2">{row.actor_role ?? "-"}</td>
                  <td className="py-2">{row.explanation ?? row.details ?? "-"}</td>
                </tr>
              ))}
            </DataTable>
          </SectionCard>
        </>
      ) : null}
    </div>
  );
}
