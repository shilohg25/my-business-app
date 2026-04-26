"use client";

import { useEffect, useMemo, useState } from "react";
import { listStations, type StationRow } from "@/lib/data/client";
import {
  fetchCaptureSessionById,
  fetchMyDraftCaptureSessions,
  markShiftCaptureReady,
  startShiftCaptureSession,
  updateShiftCaptureDraft,
  type FuelShiftCaptureSessionRow
} from "@/lib/data/field-capture";
import {
  listCaptureSessionPhotos,
  uploadCapturePhotoFile,
  type CapturePhotoType,
  type FuelShiftCapturePhotoRow
} from "@/lib/data/field-capture-photos";
import {
  calculateDraftCashTotal,
  calculateDraftCreditTotal,
  calculateDraftDiscrepancy,
  calculateDraftExpensesTotal,
  calculateDraftMeterLitersOut,
  calculateDraftNetRemittance
} from "@/lib/analytics/field-capture";

type Row = Record<string, unknown>;

const shiftOptions = ["5am–1pm", "1pm–9pm", "9pm–5am", "Custom"];

const emptyMeterRow = () => ({ pump_label: "", product: "", opening_reading: "", closing_reading: "", calibration_liters: "", notes: "" });
const emptyCashRow = () => ({ denomination: "", quantity: "" });
const emptyExpenseRow = () => ({ category: "", description: "", amount: "", receipt_reference: "" });
const emptyCreditRow = () => ({ company_customer: "", receipt_number: "", product: "", liters: "", amount: "" });
const emptyDeliveryRow = () => ({ product: "", liters_received: "", delivery_reference: "", supplier: "", notes: "" });
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
    fuel_deliveries: Array.isArray(payload?.fuel_deliveries) ? (payload?.fuel_deliveries as Row[]) : [emptyDeliveryRow()]
  };
}

export default function FieldCaptureClient() {
  const [stations, setStations] = useState<StationRow[]>([]);
  const [selectedStationId, setSelectedStationId] = useState("");
  const [selectedShift, setSelectedShift] = useState(shiftOptions[0]);
  const [customShift, setCustomShift] = useState("");
  const [reportDate, setReportDate] = useState(new Date().toISOString().slice(0, 10));
  const [activeSession, setActiveSession] = useState<FuelShiftCaptureSessionRow | null>(null);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const [meterReadings, setMeterReadings] = useState<Row[]>([emptyMeterRow()]);
  const [cashCount, setCashCount] = useState<Row[]>([emptyCashRow()]);
  const [expenses, setExpenses] = useState<Row[]>([emptyExpenseRow()]);
  const [creditReceipts, setCreditReceipts] = useState<Row[]>([emptyCreditRow()]);
  const [fuelDeliveries, setFuelDeliveries] = useState<Row[]>([emptyDeliveryRow()]);
  const [capturePhotos, setCapturePhotos] = useState<FuelShiftCapturePhotoRow[]>([]);
  const [selectedPhotoFiles, setSelectedPhotoFiles] = useState<Partial<Record<CapturePhotoType, File>>>({});
  const [photoNotes, setPhotoNotes] = useState<Partial<Record<CapturePhotoType, string>>>({});
  const [photoStatus, setPhotoStatus] = useState<Partial<Record<CapturePhotoType, string>>>({});
  const [uploadingType, setUploadingType] = useState<CapturePhotoType | null>(null);

  const loadPhotos = async (captureSessionId: string) => {
    const rows = await listCaptureSessionPhotos(captureSessionId);
    setCapturePhotos(rows);
  };

  const loadInitialData = async () => {
    setLoading(true);
    try {
      const [stationRows, sessions] = await Promise.all([listStations(), fetchMyDraftCaptureSessions()]);
      setStations(stationRows.filter((station) => station.is_active));
      const newest = sessions[0] ?? null;
      setActiveSession(newest);
      if (newest) {
        const parsed = parseDraftPayload(newest.draft_payload);
        setMeterReadings(parsed.meter_readings);
        setCashCount(parsed.cash_count);
        setExpenses(parsed.expenses);
        setCreditReceipts(parsed.credit_receipts);
        setFuelDeliveries(parsed.fuel_deliveries);
        await loadPhotos(newest.id);
      } else {
        setCapturePhotos([]);
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

  const summary = useMemo(() => {
    const meterLitersOut = calculateDraftMeterLitersOut(meterReadings);
    const cashTotal = calculateDraftCashTotal(cashCount);
    const expensesTotal = calculateDraftExpensesTotal(expenses);
    const creditTotal = calculateDraftCreditTotal(creditReceipts);
    const netRemittance = calculateDraftNetRemittance({ cashTotal, expensesTotal, creditTotal, lubricantSalesTotal: 0 });
    const discrepancy = calculateDraftDiscrepancy({ cashTotal, expensesTotal, creditTotal, lubricantSalesTotal: 0, expectedFuelSales: 0 });
    return { meterLitersOut, cashTotal, expensesTotal, creditTotal, netRemittance, discrepancy };
  }, [meterReadings, cashCount, expenses, creditReceipts]);

  const onStartSession = async () => {
    if (!selectedStationId || !shiftLabel) {
      setMessage("Select a station and shift before starting a session.");
      return;
    }

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
      setFuelDeliveries(parsed.fuel_deliveries);
      await loadPhotos(created.id);
      setMessage("Draft session started.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Unable to start draft session.");
    } finally {
      setLoading(false);
    }
  };

  const saveDraft = async () => {
    if (!activeSession) return;
    setLoading(true);
    setMessage(null);
    try {
      const calculated_summary = {
        meter_liters_out: summary.meterLitersOut,
        cash_total: summary.cashTotal,
        expenses_total: summary.expensesTotal,
        credit_total: summary.creditTotal,
        net_remittance_estimate: summary.netRemittance,
        discrepancy_estimate: summary.discrepancy
      };
      await updateShiftCaptureDraft(activeSession.id, {
        meter_readings: meterReadings,
        cash_count: cashCount,
        expenses,
        credit_receipts: creditReceipts,
        fuel_deliveries: fuelDeliveries,
        calculated_summary
      });
      const refreshed = await fetchCaptureSessionById(activeSession.id);
      setActiveSession(refreshed);
      await loadPhotos(refreshed.id);
      setMessage("Draft saved.");
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
      const refreshed = await fetchCaptureSessionById(activeSession.id);
      setActiveSession(refreshed);
      setMessage("Draft marked ready for review. Final publishing will be enabled after review workflow is completed.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Unable to mark draft ready.");
    } finally {
      setLoading(false);
    }
  };

  const updateRow = (rows: Row[], idx: number, key: string, value: string) => rows.map((row, rowIndex) => (rowIndex === idx ? { ...row, [key]: value } : row));

  const handlePhotoUpload = async (photoType: CapturePhotoType) => {
    if (!activeSession || activeSession.status !== "draft") {
      setPhotoStatus((current) => ({ ...current, [photoType]: "No active draft session for upload." }));
      return;
    }

    const file = selectedPhotoFiles[photoType];
    if (!file) {
      setPhotoStatus((current) => ({ ...current, [photoType]: "Choose a file first." }));
      return;
    }

    setUploadingType(photoType);
    setPhotoStatus((current) => ({ ...current, [photoType]: "Uploading..." }));
    try {
      await uploadCapturePhotoFile({
        captureSessionId: activeSession.id,
        photoType,
        file,
        notes: photoNotes[photoType]
      });
      await loadPhotos(activeSession.id);
      setPhotoStatus((current) => ({
        ...current,
        [photoType]:
          "Photo uploaded. OCR extraction is not enabled yet. Cashier confirmation will be required before any OCR value can affect reports."
      }));
      setSelectedPhotoFiles((current) => {
        const next = { ...current };
        delete next[photoType];
        return next;
      });
    } catch (error) {
      setPhotoStatus((current) => ({
        ...current,
        [photoType]: error instanceof Error ? error.message : "Upload failed."
      }));
    } finally {
      setUploadingType(null);
    }
  };

  return (
    <div className="space-y-4">
      <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
        Draft capture is saved under the signed-in user. Final report publishing is not enabled until owner review/publish workflow is completed.
      </div>

      <section className="rounded-2xl border bg-white p-4 space-y-3">
        <h2 className="font-semibold">1. Start capture session</h2>
        <select className="min-h-11 w-full rounded-lg border px-3" value={selectedStationId} onChange={(e) => setSelectedStationId(e.target.value)}>
          <option value="">Select station</option>
          {stations.map((station) => <option key={station.id} value={station.id}>{station.name}</option>)}
        </select>
        <select className="min-h-11 w-full rounded-lg border px-3" value={selectedShift} onChange={(e) => setSelectedShift(e.target.value)}>
          {shiftOptions.map((option) => <option key={option}>{option}</option>)}
        </select>
        {selectedShift === "Custom" ? <input className="min-h-11 w-full rounded-lg border px-3" placeholder="Custom shift" value={customShift} onChange={(e) => setCustomShift(e.target.value)} /> : null}
        <input className="min-h-11 w-full rounded-lg border px-3" type="date" value={reportDate} onChange={(e) => setReportDate(e.target.value)} />
        <button type="button" disabled={loading} onClick={onStartSession} className="min-h-11 w-full rounded-xl bg-slate-900 text-white">Start session</button>
      </section>

      {activeSession ? (
        <>
          <section className="rounded-2xl border bg-white p-4 text-sm space-y-1">
            <h2 className="font-semibold">2. Active draft session</h2>
            <p>Station: {activeSession.fuel_stations?.name ?? activeSession.station_id}</p>
            <p>Shift: {activeSession.shift_label}</p>
            <p>Report date: {activeSession.report_date}</p>
            <p>Status: {activeSession.status}</p>
          </section>

          <section className="rounded-2xl border bg-white p-4 space-y-3"><h2 className="font-semibold">3. Meter readings draft</h2>
            {meterReadings.map((row, index) => <div key={`meter-${index}`} className="rounded-xl border p-3 grid gap-2">
              <input className="min-h-11 w-full rounded-lg border px-3" placeholder="pump label" value={String(row.pump_label ?? "")} onChange={(e) => setMeterReadings(updateRow(meterReadings, index, "pump_label", e.target.value))} />
              <input className="min-h-11 w-full rounded-lg border px-3" placeholder="product" value={String(row.product ?? "")} onChange={(e) => setMeterReadings(updateRow(meterReadings, index, "product", e.target.value))} />
              <input className="min-h-11 w-full rounded-lg border px-3" placeholder="opening reading" value={String(row.opening_reading ?? "")} onChange={(e) => setMeterReadings(updateRow(meterReadings, index, "opening_reading", e.target.value))} />
              <input className="min-h-11 w-full rounded-lg border px-3" placeholder="closing reading" value={String(row.closing_reading ?? "")} onChange={(e) => setMeterReadings(updateRow(meterReadings, index, "closing_reading", e.target.value))} />
              <input className="min-h-11 w-full rounded-lg border px-3" placeholder="calibration liters" value={String(row.calibration_liters ?? "")} onChange={(e) => setMeterReadings(updateRow(meterReadings, index, "calibration_liters", e.target.value))} />
              <input className="min-h-11 w-full rounded-lg border px-3" placeholder="notes" value={String(row.notes ?? "")} onChange={(e) => setMeterReadings(updateRow(meterReadings, index, "notes", e.target.value))} />
            </div>)}
            <button type="button" className="min-h-11 w-full rounded-xl border" onClick={() => setMeterReadings((current) => [...current, emptyMeterRow()])}>Add meter row</button>
            <button type="button" className="min-h-11 w-full rounded-xl bg-slate-900 text-white" onClick={saveDraft}>Save draft</button>
          </section>

          <section className="rounded-2xl border bg-white p-4 space-y-3"><h2 className="font-semibold">4. Cash count draft</h2>
            {cashCount.map((row, index) => <div key={`cash-${index}`} className="rounded-xl border p-3 grid gap-2">
              <input className="min-h-11 w-full rounded-lg border px-3" placeholder="denomination" value={String(row.denomination ?? "")} onChange={(e) => setCashCount(updateRow(cashCount, index, "denomination", e.target.value))} />
              <input className="min-h-11 w-full rounded-lg border px-3" placeholder="quantity" value={String(row.quantity ?? "")} onChange={(e) => setCashCount(updateRow(cashCount, index, "quantity", e.target.value))} />
            </div>)}
            <button type="button" className="min-h-11 w-full rounded-xl border" onClick={() => setCashCount((current) => [...current, emptyCashRow()])}>Add cash row</button>
            <button type="button" className="min-h-11 w-full rounded-xl bg-slate-900 text-white" onClick={saveDraft}>Save draft</button>
          </section>

          <section className="rounded-2xl border bg-white p-4 space-y-3"><h2 className="font-semibold">5. Expenses draft</h2>
            {expenses.map((row, index) => <div key={`expense-${index}`} className="rounded-xl border p-3 grid gap-2">
              <input className="min-h-11 w-full rounded-lg border px-3" placeholder="category" value={String(row.category ?? "")} onChange={(e) => setExpenses(updateRow(expenses, index, "category", e.target.value))} />
              <input className="min-h-11 w-full rounded-lg border px-3" placeholder="description" value={String(row.description ?? "")} onChange={(e) => setExpenses(updateRow(expenses, index, "description", e.target.value))} />
              <input className="min-h-11 w-full rounded-lg border px-3" placeholder="amount" value={String(row.amount ?? "")} onChange={(e) => setExpenses(updateRow(expenses, index, "amount", e.target.value))} />
              <input className="min-h-11 w-full rounded-lg border px-3" placeholder="receipt reference" value={String(row.receipt_reference ?? "")} onChange={(e) => setExpenses(updateRow(expenses, index, "receipt_reference", e.target.value))} />
            </div>)}
            <button type="button" className="min-h-11 w-full rounded-xl border" onClick={() => setExpenses((current) => [...current, emptyExpenseRow()])}>Add expense row</button>
            <button type="button" className="min-h-11 w-full rounded-xl bg-slate-900 text-white" onClick={saveDraft}>Save draft</button>
          </section>

          <section className="rounded-2xl border bg-white p-4 space-y-3"><h2 className="font-semibold">6. Credit / invoice receipts draft</h2>
            {creditReceipts.map((row, index) => <div key={`credit-${index}`} className="rounded-xl border p-3 grid gap-2">
              <input className="min-h-11 w-full rounded-lg border px-3" placeholder="company/customer" value={String(row.company_customer ?? "")} onChange={(e) => setCreditReceipts(updateRow(creditReceipts, index, "company_customer", e.target.value))} />
              <input className="min-h-11 w-full rounded-lg border px-3" placeholder="receipt number" value={String(row.receipt_number ?? "")} onChange={(e) => setCreditReceipts(updateRow(creditReceipts, index, "receipt_number", e.target.value))} />
              <input className="min-h-11 w-full rounded-lg border px-3" placeholder="product" value={String(row.product ?? "")} onChange={(e) => setCreditReceipts(updateRow(creditReceipts, index, "product", e.target.value))} />
              <input className="min-h-11 w-full rounded-lg border px-3" placeholder="liters" value={String(row.liters ?? "")} onChange={(e) => setCreditReceipts(updateRow(creditReceipts, index, "liters", e.target.value))} />
              <input className="min-h-11 w-full rounded-lg border px-3" placeholder="amount" value={String(row.amount ?? "")} onChange={(e) => setCreditReceipts(updateRow(creditReceipts, index, "amount", e.target.value))} />
            </div>)}
            <button type="button" className="min-h-11 w-full rounded-xl border" onClick={() => setCreditReceipts((current) => [...current, emptyCreditRow()])}>Add credit row</button>
            <button type="button" className="min-h-11 w-full rounded-xl bg-slate-900 text-white" onClick={saveDraft}>Save draft</button>
          </section>

          <section className="rounded-2xl border bg-white p-4 space-y-3"><h2 className="font-semibold">7. Fuel deliveries draft</h2>
            {fuelDeliveries.map((row, index) => <div key={`delivery-${index}`} className="rounded-xl border p-3 grid gap-2">
              <input className="min-h-11 w-full rounded-lg border px-3" placeholder="product" value={String(row.product ?? "")} onChange={(e) => setFuelDeliveries(updateRow(fuelDeliveries, index, "product", e.target.value))} />
              <input className="min-h-11 w-full rounded-lg border px-3" placeholder="liters received" value={String(row.liters_received ?? "")} onChange={(e) => setFuelDeliveries(updateRow(fuelDeliveries, index, "liters_received", e.target.value))} />
              <input className="min-h-11 w-full rounded-lg border px-3" placeholder="delivery reference" value={String(row.delivery_reference ?? "")} onChange={(e) => setFuelDeliveries(updateRow(fuelDeliveries, index, "delivery_reference", e.target.value))} />
              <input className="min-h-11 w-full rounded-lg border px-3" placeholder="supplier" value={String(row.supplier ?? "")} onChange={(e) => setFuelDeliveries(updateRow(fuelDeliveries, index, "supplier", e.target.value))} />
              <input className="min-h-11 w-full rounded-lg border px-3" placeholder="notes" value={String(row.notes ?? "")} onChange={(e) => setFuelDeliveries(updateRow(fuelDeliveries, index, "notes", e.target.value))} />
            </div>)}
            <button type="button" className="min-h-11 w-full rounded-xl border" onClick={() => setFuelDeliveries((current) => [...current, emptyDeliveryRow()])}>Add delivery row</button>
            <button type="button" className="min-h-11 w-full rounded-xl bg-slate-900 text-white" onClick={saveDraft}>Save draft</button>
          </section>

          <section className="rounded-2xl border bg-white p-4 space-y-3"><h2 className="font-semibold">8. Secure photo evidence upload</h2>
            {photoCards.map((card) => (
              <div key={card.type} className="rounded-xl border p-3 space-y-2">
                <p className="font-medium">{card.label}</p>
                <input
                  className="min-h-11 w-full rounded-lg border px-3 py-2"
                  type="file"
                  accept="image/jpeg,image/png,image/webp"
                  disabled={activeSession.status !== "draft" || uploadingType === card.type}
                  onChange={(event) => {
                    const file = event.target.files?.[0];
                    setSelectedPhotoFiles((current) => {
                      if (!file) {
                        const next = { ...current };
                        delete next[card.type];
                        return next;
                      }
                      return { ...current, [card.type]: file };
                    });
                  }}
                />
                <input
                  className="min-h-11 w-full rounded-lg border px-3"
                  placeholder="Optional notes"
                  value={photoNotes[card.type] ?? ""}
                  onChange={(event) => setPhotoNotes((current) => ({ ...current, [card.type]: event.target.value }))}
                  disabled={activeSession.status !== "draft" || uploadingType === card.type}
                />
                <button
                  type="button"
                  disabled={activeSession.status !== "draft" || uploadingType === card.type}
                  className="min-h-11 w-full rounded-xl bg-slate-900 text-white disabled:opacity-60"
                  onClick={() => void handlePhotoUpload(card.type)}
                >
                  {uploadingType === card.type ? "Uploading..." : "Upload photo"}
                </button>
                {photoStatus[card.type] ? <p className="text-sm text-slate-600">{photoStatus[card.type]}</p> : null}
              </div>
            ))}
            <p className="text-sm text-slate-600">
              Photo uploaded. OCR extraction is not enabled yet. Cashier confirmation will be required before any OCR value can affect reports.
            </p>
            <div className="rounded-xl border p-3 space-y-2">
              <p className="font-medium">Uploaded photos for this session</p>
              {capturePhotos.length === 0 ? <p className="text-sm text-slate-500">No photos uploaded yet.</p> : null}
              {capturePhotos.map((photo) => (
                <div key={photo.id} className="rounded-lg border p-2 text-sm space-y-1">
                  <p>File: {photo.original_file_name ?? "Unnamed file"}</p>
                  <p>Type: {photo.photo_type}</p>
                  <p>Uploaded: {new Date(photo.created_at).toLocaleString()}</p>
                  <p>OCR status: {photo.ocr_status === "not_started" ? "Not started" : photo.ocr_status}</p>
                  {photo.notes ? <p>Notes: {photo.notes}</p> : null}
                </div>
              ))}
            </div>
          </section>

          <section className="rounded-2xl border bg-white p-4 space-y-1 text-sm"><h2 className="font-semibold">9. Review summary</h2>
            <p>meter liters out: {summary.meterLitersOut.toFixed(2)}</p>
            <p>cash total: {summary.cashTotal.toFixed(2)}</p>
            <p>expenses total: {summary.expensesTotal.toFixed(2)}</p>
            <p>credit total: {summary.creditTotal.toFixed(2)}</p>
            <p>net remittance estimate: {summary.netRemittance.toFixed(2)}</p>
            <p>discrepancy estimate: {summary.discrepancy.toFixed(2)}</p>
          </section>

          <section className="rounded-2xl border bg-white p-4 space-y-2"><h2 className="font-semibold">10. Mark ready for review</h2>
            <button type="button" disabled={loading || activeSession.status !== "draft"} className="min-h-11 w-full rounded-xl bg-emerald-700 text-white" onClick={markReady}>Mark ready for review</button>
          </section>
        </>
      ) : null}

      {loading ? <p className="text-sm text-slate-500">Loading...</p> : null}
      {message ? <p className="text-sm text-slate-700">{message}</p> : null}
    </div>
  );
}
