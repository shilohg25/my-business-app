import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const root = process.cwd();
const migration = fs.readFileSync(
  path.join(root, "supabase/migrations/202605200001_mobile_shift_report_payload_compatibility.sql"),
  "utf8"
);
const samplePayload = JSON.parse(
  fs.readFileSync(path.join(root, "docs/mobile-shift-report-snake-case-payload.json"), "utf8")
) as Record<string, unknown>;

describe("mobile shift report payload contract", () => {
  it("documents the canonical snake_case mobile payload", () => {
    expect(samplePayload).toMatchObject({
      station_id: expect.any(String),
      report_date: expect.any(String),
      shift_time_label: expect.any(String),
      meter_readings: expect.any(Array)
    });

    const meter = (samplePayload.meter_readings as Record<string, unknown>[])[0];
    expect(meter).toMatchObject({
      pump_id: expect.any(String),
      pump_label: expect.any(String),
      product_code: "DIESEL",
      opening_reading: expect.any(Number),
      closing_reading: expect.any(Number),
      opening_reading_source: "previous_closing",
      closing_photo_path: expect.stringContaining("/closing.jpg")
    });
    expect(JSON.stringify(samplePayload)).not.toMatch(/stationId|meterReadings|closingPhotoPath/);
  });

  it("keeps backward-compatible camelCase reads in the RPC", () => {
    [
      "stationId",
      "reportDate",
      "shiftLabel",
      "meterReadings",
      "pumpId",
      "pumpLabel",
      "productCode",
      "openingReading",
      "closingReading",
      "calibrationLiters",
      "openingReadingSource",
      "openingPhotoPath",
      "closingPhotoPath"
    ].forEach((key) => {
      expect(migration).toContain(key);
    });
  });

  it("preserves auth, assignment, private storage, and schema reload guards", () => {
    expect(migration).toContain("if actor_id is null then");
    expect(migration).toContain("raise exception 'Authentication required'");
    expect(migration).toContain("User is not assigned to this station");
    expect(migration).toContain("public.fuel_user_station_assignments");
    expect(migration).toContain("revoke all on function public.fuel_submit_mobile_shift_report(jsonb) from anon");
    expect(migration).toContain("grant execute on function public.fuel_submit_mobile_shift_report(jsonb) to authenticated");
    expect(migration).toContain("public = false");
    expect(migration).toContain("create policy fuel_meter_evidence_storage_insert");
    expect(migration).toContain("create policy fuel_meter_evidence_storage_read");
    expect(migration).toContain("notify pgrst, 'reload schema'");
  });
});
