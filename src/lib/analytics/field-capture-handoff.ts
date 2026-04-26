import { normalizeFieldCaptureProductCode, toNumber, type DraftRow } from "@/lib/analytics/field-capture";

export interface MeterIdentity {
  pump_id: string | null;
  pump_label: string;
  product_code_normalized: string;
  nozzle_label: string | null;
}

export interface LatestMeterHandoffRow {
  station_id: string;
  source_type: "field_capture" | "final_shift_report";
  source_session_id: string | null;
  source_shift_report_id: string | null;
  source_report_date: string;
  source_shift_label: string | null;
  pump_id: string | null;
  pump_label_snapshot: string;
  product_code_snapshot: string;
  product_code_normalized: string;
  nozzle_label: string | null;
  closing_meter_reading: number;
}

export interface ShiftHandoffConfirmRowInput {
  source_session_id?: string | null;
  source_shift_report_id?: string | null;
  pump_id?: string | null;
  pump_label: string;
  product_code: string;
  nozzle_label?: string | null;
  suggested_opening_reading: number;
  confirmed_opening_reading: number;
  notes?: string | null;
}

export function normalizeHandoffProductCode(product: unknown) {
  return normalizeFieldCaptureProductCode(product);
}

export function buildMeterIdentity(input: {
  pump_id?: unknown;
  pump_label?: unknown;
  pump_label_snapshot?: unknown;
  product_code?: unknown;
  product?: unknown;
  product_code_snapshot?: unknown;
  product_code_normalized?: unknown;
  nozzle_label?: unknown;
}): MeterIdentity {
  const pumpLabel = String(input.pump_label ?? input.pump_label_snapshot ?? "").trim();
  const normalized = String(input.product_code_normalized ?? normalizeHandoffProductCode(input.product_code ?? input.product ?? input.product_code_snapshot));
  const nozzle = String(input.nozzle_label ?? "").trim();
  const pumpId = String(input.pump_id ?? "").trim();

  return {
    pump_id: pumpId || null,
    pump_label: pumpLabel,
    product_code_normalized: normalized,
    nozzle_label: nozzle || null
  };
}

export function meterIdentityKey(identity: MeterIdentity) {
  return [identity.pump_id ?? identity.pump_label, identity.product_code_normalized, identity.nozzle_label ?? ""].join("|");
}

export function buildDefaultHandoffConfirmRows(rows: LatestMeterHandoffRow[]): ShiftHandoffConfirmRowInput[] {
  return rows.map((row) => ({
    source_session_id: row.source_session_id,
    source_shift_report_id: row.source_shift_report_id,
    pump_id: row.pump_id,
    pump_label: row.pump_label_snapshot,
    product_code: row.product_code_normalized,
    nozzle_label: row.nozzle_label,
    suggested_opening_reading: toNumber(row.closing_meter_reading),
    confirmed_opening_reading: toNumber(row.closing_meter_reading),
    notes: ""
  }));
}

export function calculateHandoffVariance(suggested: unknown, confirmed: unknown) {
  return toNumber(confirmed) - toNumber(suggested);
}

export function requiresHandoffNotes(variance: number) {
  return Math.abs(variance) >= 50;
}

export function hasHandoffConfirmationInDraft(draftPayload: Record<string, unknown> | null | undefined) {
  const meterRows = Array.isArray(draftPayload?.meter_readings) ? (draftPayload.meter_readings as DraftRow[]) : [];
  return meterRows.some((row) => Boolean(row.handoff_confirmed));
}

export function mergeHandoffOpeningsIntoMeterRows(meterRows: DraftRow[], handoffRows: ShiftHandoffConfirmRowInput[]) {
  const nextRows = meterRows.map((row) => ({ ...row }));
  const indexByIdentity = new Map<string, number>();
  nextRows.forEach((row, index) => {
    indexByIdentity.set(meterIdentityKey(buildMeterIdentity(row)), index);
  });

  handoffRows.forEach((handoff) => {
    const identity = buildMeterIdentity({
      pump_id: handoff.pump_id,
      pump_label: handoff.pump_label,
      product_code: handoff.product_code,
      nozzle_label: handoff.nozzle_label
    });
    const key = meterIdentityKey(identity);
    const opening = toNumber(handoff.confirmed_opening_reading);
    const existingIndex = indexByIdentity.get(key);

    if (typeof existingIndex === "number") {
      const existing = nextRows[existingIndex] ?? {};
      nextRows[existingIndex] = {
        ...existing,
        pump_id: identity.pump_id,
        pump_label: identity.pump_label,
        product_code: identity.product_code_normalized,
        nozzle_label: identity.nozzle_label,
        opening_reading: opening,
        before_reading: opening,
        handoff_confirmed: true
      };
      return;
    }

    nextRows.push({
      pump_id: identity.pump_id,
      pump_label: identity.pump_label,
      product_code: identity.product_code_normalized,
      nozzle_label: identity.nozzle_label,
      opening_reading: opening,
      closing_reading: "",
      calibration_liters: 0,
      handoff_confirmed: true
    });
  });

  return nextRows;
}
