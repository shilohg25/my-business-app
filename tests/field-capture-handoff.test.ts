import { describe, expect, it } from "vitest";
import {
  buildDefaultHandoffConfirmRows,
  calculateHandoffVariance,
  hasHandoffConfirmationInDraft,
  mergeHandoffOpeningsIntoMeterRows,
  normalizeHandoffProductCode,
  requiresHandoffNotes
} from "@/lib/analytics/field-capture-handoff";

describe("field capture handoff", () => {
  it("defaults confirmed opening readings to previous closing", () => {
    const rows = buildDefaultHandoffConfirmRows([
      {
        station_id: "station-1",
        source_type: "field_capture",
        source_session_id: "session-1",
        source_shift_report_id: null,
        source_report_date: "2026-04-26",
        source_shift_label: "1pm-9pm",
        pump_id: null,
        pump_label_snapshot: "Pump 1",
        product_code_snapshot: "REGULAR",
        product_code_normalized: "UNLEADED",
        nozzle_label: null,
        closing_meter_reading: 123.45
      }
    ]);

    expect(rows[0]?.suggested_opening_reading).toBe(123.45);
    expect(rows[0]?.confirmed_opening_reading).toBe(123.45);
  });

  it("computes variance as confirmed minus suggested", () => {
    expect(calculateHandoffVariance(200, 206.5)).toBe(6.5);
  });

  it("normalizes Regular to UNLEADED", () => {
    expect(normalizeHandoffProductCode("Regular")).toBe("UNLEADED");
  });

  it("returns safe empty state when no handoff rows exist", () => {
    expect(buildDefaultHandoffConfirmRows([])).toEqual([]);
  });

  it("flags review warning when no handoff was confirmed", () => {
    expect(hasHandoffConfirmationInDraft({ meter_readings: [{ opening_reading: 10 }] })).toBe(false);
    expect(hasHandoffConfirmationInDraft({ meter_readings: [{ opening_reading: 10, handoff_confirmed: true }] })).toBe(true);
  });

  it("merges confirmed openings into matching meter rows", () => {
    const merged = mergeHandoffOpeningsIntoMeterRows(
      [{ pump_label: "P1", product_code: "REGULAR", opening_reading: 10, closing_reading: 20 }],
      [{ pump_label: "P1", product_code: "UNLEADED", suggested_opening_reading: 20, confirmed_opening_reading: 30 }]
    );

    expect(merged[0]?.opening_reading).toBe(30);
    expect(merged[0]?.handoff_confirmed).toBe(true);
  });

  it("requires notes for large differences", () => {
    expect(requiresHandoffNotes(49.99)).toBe(false);
    expect(requiresHandoffNotes(50)).toBe(true);
  });
});
