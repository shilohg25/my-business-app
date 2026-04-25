"use client";

import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { canUseLiveData, fetchShiftReportDetail, type ShiftReportDetail } from "@/lib/data/client";
import { appPath, getSupabaseConfigurationState } from "@/lib/supabase/client";
import { formatCurrency } from "@/lib/utils";

function formatNumber(value: number | string | null | undefined, digits = 2) {
  const numeric = Number(value ?? 0);
  return Number.isFinite(numeric)
    ? numeric.toLocaleString("en-US", { minimumFractionDigits: digits, maximumFractionDigits: digits })
    : "0.00";
}

function formatDate(value: string | null | undefined) {
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

function sectionEmpty(message: string) {
  return <p className="text-sm text-slate-500">{message}</p>;
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
      setError("Missing report id. Open this page from the Shift Reports list, or use ?id=<report_id> in the URL.");
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

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border bg-white p-4">
        <a className="text-sm font-medium text-slate-700 hover:text-slate-900" href={appPath("/shift-reports/")}>
          ← Back to Shift Reports
        </a>
        {id ? <p className="text-xs text-slate-500">Report ID: {id}</p> : null}
      </div>

      {loading ? <div className="rounded-2xl border bg-white p-5 text-sm text-slate-500">Loading report details...</div> : null}

      {error ? (
        <div className="rounded-2xl border border-red-200 bg-red-50 p-5 text-sm text-red-800">
          <p className="font-medium">Unable to show this report.</p>
          <p>{error}</p>
        </div>
      ) : null}

      {!loading && !error && detail ? (
        <>
          <section className="rounded-2xl border bg-white p-5">
            <h2 className="mb-3 text-lg font-semibold">Report summary</h2>
            <div className="grid gap-3 text-sm md:grid-cols-2 xl:grid-cols-3">
              <p><span className="text-slate-500">Date:</span> {detail.report.report_date}</p>
              <p><span className="text-slate-500">Station:</span> {detail.report.fuel_stations?.name ?? "-"}</p>
              <p><span className="text-slate-500">Duty / Cashier:</span> {detail.report.duty_name}</p>
              <p><span className="text-slate-500">Shift:</span> {detail.report.shift_time_label}</p>
              <p><span className="text-slate-500">Source:</span> {detail.report.source}</p>
              <p><span className="text-slate-500">Status:</span> {detail.report.status}</p>
              <p><span className="text-slate-500">Discrepancy:</span> {formatCurrency(Number(detail.report.discrepancy_amount ?? 0))}</p>
              <p><span className="text-slate-500">Created:</span> {formatDate(detail.report.created_at)}</p>
              <p><span className="text-slate-500">Updated:</span> {formatDate(detail.report.updated_at)}</p>
            </div>
          </section>

          <section className="rounded-2xl border bg-white p-5">
            <h2 className="mb-3 text-lg font-semibold">Calculated totals</h2>
            {Object.keys(detail.report.calculated_totals ?? {}).length === 0 ? (
              sectionEmpty("No calculated totals were stored for this report.")
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="text-left text-slate-500">
                    <tr>
                      <th className="py-2">Metric</th>
                      <th className="py-2 text-right">Value</th>
                    </tr>
                  </thead>
                  <tbody>
                    {Object.entries(detail.report.calculated_totals ?? {}).map(([key, value]) => (
                      <tr className="border-t" key={key}>
                        <td className="py-2 font-medium">{key}</td>
                        <td className="py-2 text-right">{typeof value === "number" ? formatNumber(value) : JSON.stringify(value)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>

          <section className="rounded-2xl border bg-white p-5">
            <h2 className="mb-3 text-lg font-semibold">Meter readings</h2>
            {detail.meterReadings.length === 0 ? sectionEmpty("No meter readings found for this report.") : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="text-left text-slate-500">
                    <tr>
                      <th className="py-2">Pump</th>
                      <th>Product</th>
                      <th className="text-right">Before</th>
                      <th className="text-right">After</th>
                      <th className="text-right">Liters sold</th>
                      <th className="text-right">Calibration</th>
                    </tr>
                  </thead>
                  <tbody>
                    {detail.meterReadings.map((row) => (
                      <tr className="border-t" key={row.id}>
                        <td className="py-2">{row.pump_label_snapshot}</td>
                        <td>{row.product_code_snapshot}</td>
                        <td className="text-right">{formatNumber(row.before_reading, 3)}</td>
                        <td className="text-right">{formatNumber(row.after_reading, 3)}</td>
                        <td className="text-right">{formatNumber(row.liters_sold, 3)}</td>
                        <td className="text-right">{formatNumber(row.calibration_liters, 3)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>

          <section className="rounded-2xl border bg-white p-5">
            <h2 className="mb-3 text-lg font-semibold">Credit receipts</h2>
            {detail.creditReceipts.length === 0 ? sectionEmpty("No credit receipts found for this report.") : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="text-left text-slate-500">
                    <tr>
                      <th className="py-2">Company</th>
                      <th>Receipt #</th>
                      <th>Product</th>
                      <th className="text-right">Liters</th>
                      <th className="text-right">Amount</th>
                    </tr>
                  </thead>
                  <tbody>
                    {detail.creditReceipts.map((row) => (
                      <tr className="border-t" key={row.id}>
                        <td className="py-2">{row.company_name}</td>
                        <td>{row.receipt_number || "-"}</td>
                        <td>{row.product_code_snapshot}</td>
                        <td className="text-right">{formatNumber(row.liters, 3)}</td>
                        <td className="text-right">{formatCurrency(Number(row.amount ?? 0))}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>

          <section className="rounded-2xl border bg-white p-5">
            <h2 className="mb-3 text-lg font-semibold">Expenses</h2>
            {detail.expenses.length === 0 ? sectionEmpty("No expenses found for this report.") : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="text-left text-slate-500">
                    <tr>
                      <th className="py-2">Description</th>
                      <th>Category</th>
                      <th className="text-right">Amount</th>
                    </tr>
                  </thead>
                  <tbody>
                    {detail.expenses.map((row) => (
                      <tr className="border-t" key={row.id}>
                        <td className="py-2">{row.description}</td>
                        <td>{row.category ?? "-"}</td>
                        <td className="text-right">{formatCurrency(Number(row.amount ?? 0))}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>

          <section className="rounded-2xl border bg-white p-5">
            <h2 className="mb-3 text-lg font-semibold">Cash count</h2>
            {detail.cashCounts.length === 0 ? sectionEmpty("No cash count rows found for this report.") : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="text-left text-slate-500">
                    <tr>
                      <th className="py-2">Denomination</th>
                      <th className="text-right">Quantity</th>
                      <th className="text-right">Amount</th>
                      <th>Note</th>
                    </tr>
                  </thead>
                  <tbody>
                    {detail.cashCounts.map((row) => (
                      <tr className="border-t" key={row.id}>
                        <td className="py-2">{formatCurrency(Number(row.denomination ?? 0))}</td>
                        <td className="text-right">{formatNumber(row.quantity, 0)}</td>
                        <td className="text-right">{formatCurrency(Number(row.amount ?? 0))}</td>
                        <td>{row.note ?? "-"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>

          <section className="rounded-2xl border bg-white p-5">
            <h2 className="mb-3 text-lg font-semibold">Lubricant sales</h2>
            {detail.lubricantSales.length === 0 ? sectionEmpty("No lubricant sales found for this report.") : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="text-left text-slate-500">
                    <tr>
                      <th className="py-2">Product</th>
                      <th className="text-right">Quantity</th>
                      <th className="text-right">Unit price</th>
                      <th className="text-right">Amount</th>
                    </tr>
                  </thead>
                  <tbody>
                    {detail.lubricantSales.map((row) => (
                      <tr className="border-t" key={row.id}>
                        <td className="py-2">{row.product_name_snapshot}</td>
                        <td className="text-right">{formatNumber(row.quantity, 2)}</td>
                        <td className="text-right">{formatCurrency(Number(row.unit_price ?? 0))}</td>
                        <td className="text-right">{formatCurrency(Number(row.amount ?? 0))}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>

          <section className="rounded-2xl border bg-white p-5">
            <h2 className="mb-3 text-lg font-semibold">Audit history</h2>
            {detail.auditHistory.length === 0 ? sectionEmpty("No audit history records found for this report.") : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="text-left text-slate-500">
                    <tr>
                      <th className="py-2">When</th>
                      <th>Action</th>
                      <th>Actor role</th>
                      <th>Details</th>
                    </tr>
                  </thead>
                  <tbody>
                    {detail.auditHistory.map((row) => (
                      <tr className="border-t" key={row.id}>
                        <td className="py-2">{formatDate(row.created_at)}</td>
                        <td>{row.action_type}</td>
                        <td>{row.actor_role ?? "-"}</td>
                        <td>{row.explanation ?? row.details ?? "-"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        </>
      ) : null}
    </div>
  );
}
