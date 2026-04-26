"use client";

import { useEffect, useMemo, useState } from "react";
import { listStations, type StationRow } from "@/lib/data/client";
import { fetchCurrentProfile } from "@/lib/data/profile";
import {
  fetchCaptureReviewQueue,
  fetchCaptureSessionById,
  fetchMyDraftCaptureSessions,
  getFieldCaptureReviewUrl,
  markShiftCaptureReady,
  startShiftCaptureSession,
  updateShiftCaptureDraft,
  type FuelShiftCaptureSessionRow
} from "@/lib/data/field-capture";
import { uploadCapturePhotoFile, type CapturePhotoType, type FuelShiftCapturePhotoRow } from "@/lib/data/field-capture-photos";
import { buildFieldCaptureReviewSummary } from "@/lib/analytics/field-capture";

type Row = Record<string, unknown>;
const shiftOptions = ["5am–1pm", "1pm–9pm", "9pm–5am", "Custom"];
const emptyMeterRow = () => ({ pump_label: "", product: "", opening_reading: "", closing_reading: "", calibration_liters: "", notes: "" });
const emptyCashRow = () => ({ denomination: "", quantity: "" });
const emptyExpenseRow = () => ({ category: "", description: "", amount: "", receipt_reference: "" });
const emptyCreditRow = () => ({ company_customer: "", receipt_number: "", product: "", liters: "", amount: "" });
const emptyDeliveryRow = () => ({ product: "", liters_received: "", delivery_reference: "", supplier: "", notes: "" });
const emptyLubricantRow = () => ({ item_name: "", quantity: "", amount: "" });

const photoCards: Array<{ type: CapturePhotoType; label: string }> = [
  { type: "meter_reading", label: "Meter reading photo" },
  { type: "credit_receipt", label: "Credit receipt photo" },
  { type: "expense_receipt", label: "Expense receipt photo" },
  { type: "fuel_delivery_receipt", label: "Fuel delivery receipt photo" },
  { type: "cash_count_evidence", label: "Cash count evidence" },
  { type: "other", label: "Other" }
];

function parseDraftPayload(payload: Record<string, unknown> | null | undefined) {
  return {
    meter_readings: Array.isArray(payload?.meter_readings) ? (payload?.meter_readings as Row[]) : [emptyMeterRow()],
    cash_count: Array.isArray(payload?.cash_count) ? (payload?.cash_count as Row[]) : [emptyCashRow()],
    expenses: Array.isArray(payload?.expenses) ? (payload?.expenses as Row[]) : [emptyExpenseRow()],
    credit_receipts: Array.isArray(payload?.credit_receipts) ? (payload?.credit_receipts as Row[]) : [emptyCreditRow()],
    lubricant_sales: Array.isArray(payload?.lubricant_sales) ? (payload?.lubricant_sales as Row[]) : [emptyLubricantRow()],
    fuel_deliveries: Array.isArray(payload?.fuel_deliveries) ? (payload?.fuel_deliveries as Row[]) : [emptyDeliveryRow()]
  };
}

function statusLabel(value: boolean) {
  return value ? "Complete" : "Missing";
}

export default function FieldCaptureClient() {
  const [stations, setStations] = useState<StationRow[]>([]);
  const [selectedStationId, setSelectedStationId] = useState("");
  const [selectedShift, setSelectedShift] = useState(shiftOptions[0]);
  const [customShift, setCustomShift] = useState("");
  const [reportDate, setReportDate] = useState(new Date().toISOString().slice(0, 10));
  const [activeSession, setActiveSession] = useState<FuelShiftCaptureSessionRow | null>(null);
  const [mySessions, setMySessions] = useState<FuelShiftCaptureSessionRow[]>([]);
  const [reviewQueue, setReviewQueue] = useState<FuelShiftCaptureSessionRow[]>([]);
  const [role, setRole] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const [meterReadings, setMeterReadings] = useState<Row[]>([emptyMeterRow()]);
  const [cashCount, setCashCount] = useState<Row[]>([emptyCashRow()]);
  const [expenses, setExpenses] = useState<Row[]>([emptyExpenseRow()]);
  const [creditReceipts, setCreditReceipts] = useState<Row[]>([emptyCreditRow()]);
  const [lubricantSales, setLubricantSales] = useState<Row[]>([emptyLubricantRow()]);
  const [fuelDeliveries, setFuelDeliveries] = useState<Row[]>([emptyDeliveryRow()]);
  const [capturePhotos, setCapturePhotos] = useState<FuelShiftCapturePhotoRow[]>([]);
  const [selectedPhotoFiles, setSelectedPhotoFiles] = useState<Partial<Record<CapturePhotoType, File>>>({});
  const [photoNotes, setPhotoNotes] = useState<Partial<Record<CapturePhotoType, string>>>({});
  const [photoStatus, setPhotoStatus] = useState<Partial<Record<CapturePhotoType, string>>>({});

  const isEditable = activeSession?.status === "draft";
  const isOwnerAdmin = role === "Owner" || role === "Admin" || role === "Co-Owner";

  const loadPhotos = async (captureSessionId: string) => {
    const { fetchCaptureSessionPhotos } = await import("@/lib/data/field-capture");
    setCapturePhotos(await fetchCaptureSessionPhotos(captureSessionId));
  };

  const loadInitialData = async () => {
    setLoading(true);
    try {
      const [stationRows, sessions, profile] = await Promise.all([listStations(), fetchMyDraftCaptureSessions(), fetchCurrentProfile()]);
      setStations(stationRows.filter((station) => station.is_active));
      setRole(profile?.role ?? null);
      setMySessions(sessions);
      const newest = sessions[0] ?? null;
      setActiveSession(newest);
      if (newest) {
        const parsed = parseDraftPayload(newest.draft_payload);
        setMeterReadings(parsed.meter_readings);
        setCashCount(parsed.cash_count);
        setExpenses(parsed.expenses);
        setCreditReceipts(parsed.credit_receipts);
        setLubricantSales(parsed.lubricant_sales);
        setFuelDeliveries(parsed.fuel_deliveries);
        await loadPhotos(newest.id);
      }
      if (profile?.role === "Owner" || profile?.role === "Admin" || profile?.role === "Co-Owner") {
        setReviewQueue(await fetchCaptureReviewQueue());
      }
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Unable to load field capture data.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadInitialData();
  }, []);

  const shiftLabel = selectedShift === "Custom" ? customShift.trim() : selectedShift;

  const reviewSummary = useMemo(() => {
    const draftPayload = {
      meter_readings: meterReadings,
      cash_count: cashCount,
      expenses,
      credit_receipts: creditReceipts,
      lubricant_sales: lubricantSales,
      fuel_deliveries: fuelDeliveries
    };
    const summary = buildFieldCaptureReviewSummary(draftPayload);
    summary.completeness.photosPresent = capturePhotos.length > 0;
    if (!summary.completeness.photosPresent) summary.warnings.push("No photo evidence if expected.");
    return summary;
  }, [meterReadings, cashCount, expenses, creditReceipts, lubricantSales, fuelDeliveries, capturePhotos.length]);

  const onStartSession = async () => {
    if (!selectedStationId || !shiftLabel) return setMessage("Select a station and shift before starting a session.");
    setLoading(true);
    setMessage(null);
    try {
      const id = await startShiftCaptureSession({ station_id: selectedStationId, shift_label: shiftLabel, report_date: reportDate });
      const created = await fetchCaptureSessionById(id);
      setActiveSession(created);
      const parsed = parseDraftPayload(created.draft_payload);
      setMeterReadings(parsed.meter_readings);
      setCashCount(parsed.cash_count);
      setExpenses(parsed.expenses);
      setCreditReceipts(parsed.credit_receipts);
      setLubricantSales(parsed.lubricant_sales);
      setFuelDeliveries(parsed.fuel_deliveries);
      setMessage("Draft session started.");
      await loadInitialData();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Unable to start draft session.");
    } finally {
      setLoading(false);
    }
  };

  const saveDraft = async () => {
    if (!activeSession || !isEditable) return;
    setLoading(true);
    try {
      await updateShiftCaptureDraft(activeSession.id, {
        meter_readings: meterReadings,
        cash_count: cashCount,
        expenses,
        credit_receipts: creditReceipts,
        lubricant_sales: lubricantSales,
        fuel_deliveries: fuelDeliveries,
        calculated_summary: reviewSummary.totals
      });
      setMessage("Draft saved.");
      await loadInitialData();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Unable to save draft.");
    } finally {
      setLoading(false);
    }
  };

  const markReady = async () => {
    if (!activeSession) return;
    await saveDraft();
    setLoading(true);
    try {
      await markShiftCaptureReady(activeSession.id);
      setMessage("Draft marked ready for review. Owner/Admin can review it before final publishing.");
      await loadInitialData();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Unable to mark draft ready.");
    } finally {
      setLoading(false);
    }
  };

  const updateRow = (rows: Row[], idx: number, key: string, value: string) => rows.map((row, i) => (i === idx ? { ...row, [key]: value } : row));

  const handlePhotoUpload = async (photoType: CapturePhotoType) => {
    if (!activeSession || !isEditable) return;
    const file = selectedPhotoFiles[photoType];
    if (!file) return setPhotoStatus((current) => ({ ...current, [photoType]: "Choose a file first." }));
    try {
      await uploadCapturePhotoFile({ captureSessionId: activeSession.id, photoType, file, notes: photoNotes[photoType] });
      setPhotoStatus((current) => ({ ...current, [photoType]: "Photo uploaded." }));
      await loadInitialData();
    } catch (error) {
      setPhotoStatus((current) => ({ ...current, [photoType]: error instanceof Error ? error.message : "Upload failed." }));
    }
  };

  const discrepancyLabel = reviewSummary.totals.discrepancy > 0 ? "Cash overage" : reviewSummary.totals.discrepancy < 0 ? "Cash shortage" : "Balanced";

  return <div className="space-y-4">
    <section className="rounded-2xl border bg-white p-4 space-y-2 text-sm">
      <h2 className="font-semibold">Field Capture Review Queue</h2>
      {isOwnerAdmin ? <>
        <p>Ready for review: {reviewQueue.length}</p>
        {reviewQueue.slice(0, 5).map((session) => <div key={session.id} className="rounded border p-2">
          <p>{session.report_date} • {session.fuel_stations?.name ?? session.station_id} • {session.shift_label}</p>
          <a className="underline" href={getFieldCaptureReviewUrl(session.id)}>Review draft</a>
        </div>)}
      </> : <>
        <p>My draft sessions</p>
        {mySessions.slice(0, 5).map((session) => <div key={session.id} className="rounded border p-2">
          <p>{session.report_date} • {session.status}</p>
          {session.status === "ready_for_review" ? <a className="underline" href={getFieldCaptureReviewUrl(session.id)}>View submitted draft</a> : null}
        </div>)}
      </>}
    </section>

    <section className="rounded-2xl border bg-white p-4 space-y-2">
      <h2 className="font-semibold">Start capture session</h2>
      <select className="min-h-11 w-full rounded-lg border px-3" value={selectedStationId} onChange={(e) => setSelectedStationId(e.target.value)}><option value="">Select station</option>{stations.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}</select>
      <select className="min-h-11 w-full rounded-lg border px-3" value={selectedShift} onChange={(e) => setSelectedShift(e.target.value)}>{shiftOptions.map((o) => <option key={o}>{o}</option>)}</select>
      {selectedShift === "Custom" ? <input className="min-h-11 w-full rounded-lg border px-3" value={customShift} onChange={(e) => setCustomShift(e.target.value)} /> : null}
      <input className="min-h-11 w-full rounded-lg border px-3" type="date" value={reportDate} onChange={(e) => setReportDate(e.target.value)} />
      <button type="button" disabled={loading} onClick={onStartSession} className="min-h-11 w-full rounded-xl bg-slate-900 text-white">Start session</button>
    </section>

    {activeSession ? <>
      <section className="rounded-2xl border bg-white p-4 text-sm"><p>Status: {activeSession.status}</p>{!isEditable ? <p className="text-amber-700">This session is read-only.</p> : null}</section>

      {[{ title: "Meter", rows: meterReadings, setRows: setMeterReadings, empty: emptyMeterRow, fields: ["pump_label", "product", "opening_reading", "closing_reading", "calibration_liters"] },
      { title: "Cash count", rows: cashCount, setRows: setCashCount, empty: emptyCashRow, fields: ["denomination", "quantity"] },
      { title: "Expenses", rows: expenses, setRows: setExpenses, empty: emptyExpenseRow, fields: ["category", "description", "amount", "receipt_reference"] },
      { title: "Credit receipts", rows: creditReceipts, setRows: setCreditReceipts, empty: emptyCreditRow, fields: ["company_customer", "receipt_number", "product", "liters", "amount"] },
      { title: "Lubricant sales", rows: lubricantSales, setRows: setLubricantSales, empty: emptyLubricantRow, fields: ["item_name", "quantity", "amount"] },
      { title: "Fuel deliveries", rows: fuelDeliveries, setRows: setFuelDeliveries, empty: emptyDeliveryRow, fields: ["product", "liters_received", "delivery_reference", "supplier"] }].map((section) => (
        <section key={section.title} className="rounded-2xl border bg-white p-4 space-y-2"><h3 className="font-semibold">{section.title}</h3>
          {section.rows.map((row, index) => <div key={`${section.title}-${index}`} className="rounded border p-2 grid gap-2">{section.fields.map((field) => <input key={field} disabled={!isEditable} className="min-h-11 rounded border px-3" placeholder={field} value={String(row[field] ?? "")} onChange={(e) => section.setRows(updateRow(section.rows, index, field, e.target.value))} />)}</div>)}
          <button type="button" disabled={!isEditable} className="min-h-11 w-full rounded-xl border" onClick={() => section.setRows((current: Row[]) => [...current, section.empty()])}>Add row</button>
        </section>
      ))}

      <section className="rounded-2xl border bg-white p-4 space-y-2"><h3 className="font-semibold">Photo evidence</h3>
        {photoCards.map((card) => <div key={card.type} className="rounded border p-2 space-y-2">
          <p>{card.label}</p>
          <input type="file" disabled={!isEditable} onChange={(e) => setSelectedPhotoFiles((c) => ({ ...c, [card.type]: e.target.files?.[0] }))} />
          <button type="button" disabled={!isEditable} onClick={() => void handlePhotoUpload(card.type)} className="rounded border px-3 py-2">Upload</button>
          {photoStatus[card.type] ? <p className="text-sm">{photoStatus[card.type]}</p> : null}
        </div>)}
      </section>

      <section className="rounded-2xl border bg-white p-4 space-y-2 text-sm"><h3 className="font-semibold">Review before submit</h3>
        <div className="grid sm:grid-cols-2 gap-2">
          <p>Meter liters out: {reviewSummary.totals.netMeterLitersOut.toFixed(2)}</p><p>Cash count total: {reviewSummary.totals.totalCashCount.toFixed(2)}</p>
          <p>Expenses total: {reviewSummary.totals.totalExpenses.toFixed(2)}</p><p>Credit receipts total: {reviewSummary.totals.totalCreditAmount.toFixed(2)}</p>
          <p>Lubricant sales total: {reviewSummary.totals.totalLubricantSales.toFixed(2)}</p><p>Fuel delivery liters: {reviewSummary.totals.totalFuelDeliveriesLiters.toFixed(2)}</p>
          <p>Expected cash: {reviewSummary.totals.expectedCash.toFixed(2)}</p><p>Discrepancy: {reviewSummary.totals.discrepancy.toFixed(2)} ({discrepancyLabel})</p>
        </div>
        <div className="rounded border p-2"><p className="font-medium">Warnings</p>{reviewSummary.warnings.length ? <ul className="list-disc pl-5">{reviewSummary.warnings.map((w) => <li key={w}>{w}</li>)}</ul> : <p>No review warnings detected.</p>}</div>
        <div className="rounded border p-2"><p className="font-medium">Completeness</p>
          <p>Meter readings: {statusLabel(reviewSummary.completeness.meterReadingsComplete)}</p>
          <p>Cash count: {statusLabel(reviewSummary.completeness.cashCountComplete)}</p>
          <p>Receipts: {statusLabel(reviewSummary.completeness.receiptsPresent)}</p>
          <p>Expenses: {statusLabel(reviewSummary.completeness.expensesPresent)}</p>
          <p>Photos: {statusLabel(reviewSummary.completeness.photosPresent)}</p>
        </div>
      </section>

      <section className="rounded-2xl border bg-white p-4 space-y-2"><button type="button" disabled={loading || !isEditable} className="min-h-11 w-full rounded-xl bg-slate-900 text-white" onClick={() => void saveDraft()}>Save draft</button>
        <button type="button" disabled={loading || !activeSession} className="min-h-11 w-full rounded-xl bg-emerald-700 text-white disabled:opacity-60" onClick={() => void markReady()}>Mark ready for review</button>
      </section>
    </> : null}

    {loading ? <p className="text-sm text-slate-500">Loading...</p> : null}
    {message ? <p className="text-sm text-slate-700">{message}</p> : null}
  </div>;
}
