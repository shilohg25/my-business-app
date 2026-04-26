"use client";

import { Suspense, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { buildFieldCaptureReviewSummary } from "@/lib/analytics/field-capture";
import {
  fetchCaptureSessionForReview,
  fetchCaptureSessionPhotos,
  getFieldCaptureReviewUrl,
  type FuelShiftCaptureSessionRow
} from "@/lib/data/field-capture";
import type { FuelShiftCapturePhotoRow } from "@/lib/data/field-capture-photos";

function ReviewInner() {
  const params = useSearchParams();
  const id = params.get("id") ?? "";
  const [session, setSession] = useState<FuelShiftCaptureSessionRow | null>(null);
  const [photos, setPhotos] = useState<FuelShiftCapturePhotoRow[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!id) return;
    Promise.all([fetchCaptureSessionForReview(id), fetchCaptureSessionPhotos(id)])
      .then(([sessionRow, photoRows]) => {
        setSession(sessionRow);
        setPhotos(photoRows);
      })
      .catch((err: Error) => setError(err.message));
  }, [id]);

  const summary = useMemo(() => {
    const built = buildFieldCaptureReviewSummary(session?.draft_payload ?? {});
    built.completeness.photosPresent = photos.length > 0;
    if (!built.completeness.photosPresent) built.warnings.push("No photo evidence if expected.");
    return built;
  }, [session?.draft_payload, photos.length]);

  if (!id) return <div className="rounded border p-3 text-sm">Missing capture session id. Use <code>?id=&lt;capture_session_id&gt;</code>.</div>;
  if (error) return <div className="rounded border border-red-200 bg-red-50 p-3 text-sm text-red-700">{error}</div>;
  if (!session) return <p className="text-sm text-slate-500">Loading capture session...</p>;

  return <div className="space-y-4 text-sm">
    <section className="rounded border bg-white p-3">
      <p>Status: {session.status}</p>
      <p>Station: {session.fuel_stations?.name ?? session.station_id}</p>
      <p>Shift: {session.shift_label}</p>
      <p>Report date: {session.report_date}</p>
      <p>Opened by: {session.opened_by}</p>
      <p>Created: {new Date(session.created_at).toLocaleString()}</p>
      <p>Updated: {new Date(session.updated_at).toLocaleString()}</p>
    </section>

    <section className="rounded border bg-white p-3 grid sm:grid-cols-2 gap-2">
      <p>Meter liters out: {summary.totals.netMeterLitersOut.toFixed(2)}</p>
      <p>Cash count total: {summary.totals.totalCashCount.toFixed(2)}</p>
      <p>Expenses total: {summary.totals.totalExpenses.toFixed(2)}</p>
      <p>Credit receipts total: {summary.totals.totalCreditAmount.toFixed(2)}</p>
      <p>Lubricant sales total: {summary.totals.totalLubricantSales.toFixed(2)}</p>
      <p>Fuel delivery liters: {summary.totals.totalFuelDeliveriesLiters.toFixed(2)}</p>
      <p>Expected cash: {summary.totals.expectedCash.toFixed(2)}</p>
      <p>Discrepancy: {summary.totals.discrepancy.toFixed(2)}</p>
    </section>

    <section className="rounded border bg-white p-3"><p className="font-semibold">Warnings</p>
      {summary.warnings.length ? <ul className="list-disc pl-5">{summary.warnings.map((warning) => <li key={warning}>{warning}</li>)}</ul> : <p>No review warnings detected.</p>}
    </section>

    <section className="rounded border bg-white p-3"><p className="font-semibold">Meter readings</p><pre>{JSON.stringify((session.draft_payload?.meter_readings ?? []), null, 2)}</pre></section>
    <section className="rounded border bg-white p-3"><p className="font-semibold">Cash count</p><pre>{JSON.stringify((session.draft_payload?.cash_count ?? []), null, 2)}</pre></section>
    <section className="rounded border bg-white p-3"><p className="font-semibold">Credit/invoice receipts</p><pre>{JSON.stringify((session.draft_payload?.credit_receipts ?? []), null, 2)}</pre></section>
    <section className="rounded border bg-white p-3"><p className="font-semibold">Expenses</p><pre>{JSON.stringify((session.draft_payload?.expenses ?? []), null, 2)}</pre></section>
    <section className="rounded border bg-white p-3"><p className="font-semibold">Lubricant sales</p><pre>{JSON.stringify((session.draft_payload?.lubricant_sales ?? []), null, 2)}</pre></section>
    <section className="rounded border bg-white p-3"><p className="font-semibold">Fuel deliveries</p><pre>{JSON.stringify((session.draft_payload?.fuel_deliveries ?? []), null, 2)}</pre></section>

    <section className="rounded border bg-white p-3"><p className="font-semibold">Photo evidence</p>
      {photos.length === 0 ? <p>No photos uploaded.</p> : photos.map((photo) => <div key={photo.id} className="rounded border p-2 mb-2">
        <p>File name: {photo.original_file_name ?? "Unnamed file"}</p>
        <p>Photo type: {photo.photo_type}</p>
        <p>OCR status: {photo.ocr_status}</p>
        <p>Uploaded date: {new Date(photo.created_at).toLocaleString()}</p>
      </div>)}
    </section>

    <section className="rounded border bg-white p-3 space-y-2"><p className="font-semibold">Review actions</p>
      {session.status === "draft" ? <p>Still in draft.</p> : null}
      {session.status === "ready_for_review" ? <><p>Owner/Admin review area.</p><button disabled className="rounded border px-3 py-2 opacity-60">Publish final report</button><p>Publishing final reports is not enabled yet.</p></> : null}
      {session.status === "published" ? <p>Published. {session.published_shift_report_id ? `Final report: ${session.published_shift_report_id}` : "Final report id not available."}</p> : null}
      {session.status === "voided" ? <p>Void reason: {session.void_reason ?? "No reason provided."}</p> : null}
      <a className="underline" href={getFieldCaptureReviewUrl(session.id)}>Permalink</a>
    </section>
  </div>;
}

export default function FieldCaptureReviewClient() {
  return <Suspense fallback={<p className="text-sm text-slate-500">Loading review page...</p>}><ReviewInner /></Suspense>;
}
