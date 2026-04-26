"use client";

import { Suspense, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { buildFieldCaptureReviewSummary } from "@/lib/analytics/field-capture";
import { fetchCurrentProfile } from "@/lib/data/profile";
import {
  fetchCaptureSessionForReview,
  fetchCaptureSessionPhotos,
  getFieldCaptureReviewUrl,
  getPublishedShiftReportUrl,
  publishShiftCaptureSession,
  type FuelShiftCaptureSessionRow
} from "@/lib/data/field-capture";
import type { FuelShiftCapturePhotoRow } from "@/lib/data/field-capture-photos";
import { hasHandoffConfirmationInDraft } from "@/lib/analytics/field-capture-handoff";
import { fetchShiftHandoffConfirmations, type FuelShiftCaptureHandoffRow } from "@/lib/data/field-capture-handoff";

function ReviewInner() {
  const params = useSearchParams();
  const id = params.get("id") ?? "";
  const [session, setSession] = useState<FuelShiftCaptureSessionRow | null>(null);
  const [photos, setPhotos] = useState<FuelShiftCapturePhotoRow[]>([]);
  const [role, setRole] = useState<string | null>(null);
  const [handoffRows, setHandoffRows] = useState<FuelShiftCaptureHandoffRow[]>([]);
  const [publishing, setPublishing] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const loadReviewData = async () => {
    if (!id) return;
    const [sessionRow, photoRows, profile, handoff] = await Promise.all([
      fetchCaptureSessionForReview(id),
      fetchCaptureSessionPhotos(id),
      fetchCurrentProfile(),
      fetchShiftHandoffConfirmations(id).catch(() => [])
    ]);
    setSession(sessionRow);
    setPhotos(photoRows);
    setRole(profile?.role ?? null);
    setHandoffRows(handoff);
  };

  useEffect(() => {
    if (!id) return;
    loadReviewData().catch((err: Error) => setError(err.message));
  }, [id]);

  const summary = useMemo(() => {
    const built = buildFieldCaptureReviewSummary(session?.draft_payload ?? {});
    built.completeness.photosPresent = photos.length > 0;
    if (!built.completeness.photosPresent) built.warnings.push("No photo evidence if expected.");
    if (!hasHandoffConfirmationInDraft(session?.draft_payload)) {
      built.warnings.push("Opening meter handoff was not confirmed.");
    }
    return built;
  }, [session?.draft_payload, photos.length]);

  const isOwnerAdmin = role === "Owner" || role === "Admin" || role === "Co-Owner";
  const canPublish = isOwnerAdmin && session?.status === "ready_for_review";

  const handlePublish = async () => {
    if (!session || !canPublish) return;
    const confirmed = window.confirm("Publish this field capture as an official shift report?");
    if (!confirmed) return;

    setPublishing(true);
    setMessage(null);
    setError(null);
    try {
      const shiftReportId = await publishShiftCaptureSession(session.id);
      setMessage(`Published official shift report. ${getPublishedShiftReportUrl(shiftReportId)}`);
      await loadReviewData();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to publish field capture session.");
    } finally {
      setPublishing(false);
    }
  };

  if (!id) return <div className="rounded border p-3 text-sm">Missing capture session id. Use <code>?id=&lt;capture_session_id&gt;</code>.</div>;
  if (error) return <div className="rounded border border-red-200 bg-red-50 p-3 text-sm text-red-700">{error}</div>;
  if (!session) return <p className="text-sm text-slate-500">Loading capture session...</p>;

  return <div className="space-y-4 text-sm">
    {message ? <div className="rounded border border-emerald-200 bg-emerald-50 p-3 text-emerald-700">{message}</div> : null}
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
    <section className="rounded border bg-white p-3">
      <p className="font-semibold">Handoff Confirmation</p>
      {handoffRows.length === 0 ? <p>No handoff confirmation recorded.</p> : <div className="space-y-2">
        {handoffRows.map((row) => <div key={row.id} className="rounded border p-2">
          <p>Pump/Product/Nozzle: {row.pump_label_snapshot} / {row.product_code_snapshot} / {row.nozzle_label ?? "-"}</p>
          <p>Suggested opening: {row.suggested_opening_reading}</p>
          <p>Confirmed opening: {row.confirmed_opening_reading}</p>
          <p>Variance: {row.variance_from_suggested}</p>
          <p>Confirmed by: {row.confirmed_by}</p>
          <p>Confirmed at: {new Date(row.confirmed_at).toLocaleString()}</p>
          <p>Notes: {row.notes ?? "-"}</p>
        </div>)}
      </div>}
    </section>

    <section className="rounded border bg-white p-3 space-y-2"><p className="font-semibold">Review actions</p>
      {session.status === "draft" ? <p>Still in draft.</p> : null}
      {session.status === "ready_for_review" ? <>
        {!isOwnerAdmin ? <p>Only Owner/Admin can publish final shift reports.</p> : null}
        <button
          disabled={publishing || !canPublish}
          onClick={() => void handlePublish()}
          className="rounded border px-3 py-2 disabled:opacity-60"
        >
          {publishing ? "Publishing..." : "Publish final report"}
        </button>
      </> : null}
      {session.status === "published" ? <p>Published. {session.published_shift_report_id ? <a className="underline" href={getPublishedShiftReportUrl(session.published_shift_report_id)}>View final report</a> : "Final report id not available."}</p> : null}
      {session.status === "voided" ? <p>Void reason: {session.void_reason ?? "No reason provided."}</p> : null}
      <a className="underline" href={getFieldCaptureReviewUrl(session.id)}>Permalink</a>
    </section>
  </div>;
}

export default function FieldCaptureReviewClient() {
  return <Suspense fallback={<p className="text-sm text-slate-500">Loading review page...</p>}><ReviewInner /></Suspense>;
}
