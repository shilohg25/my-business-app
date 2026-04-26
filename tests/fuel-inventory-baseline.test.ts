import { describe, expect, it } from "vitest";
import {
  buildStationFuelInventorySummary,
  computeFuelExpectedEnding,
  computeFuelVariance,
  getBaselineStatusForStation,
  normalizeFuelProductCode
} from "@/lib/analytics/fuel-inventory";

describe("fuel inventory opening baseline analytics", () => {
  it("expected ending formula is opening + deliveries - meterOut", () => {
    expect(computeFuelExpectedEnding(1000, 250, 75)).toBe(1175);
  });

  it("variance formula is actual - expected", () => {
    expect(computeFuelVariance(900, 950)).toBe(-50);
  });

  it("missing baseline status", () => {
    expect(getBaselineStatusForStation("s1", [])).toBe("missing");
  });

  it("draft baseline status", () => {
    expect(getBaselineStatusForStation("s1", [{ station_id: "s1", status: "draft", baseline_at: "2026-04-01T00:00:00Z" }])).toBe("draft");
  });

  it("finalized baseline status", () => {
    expect(getBaselineStatusForStation("s1", [{ station_id: "s1", status: "finalized", baseline_at: "2026-04-01T00:00:00Z" }])).toBe("finalized");
  });

  it("normalizes product aliases", () => {
    expect(normalizeFuelProductCode("ADO")).toBe("DIESEL");
    expect(normalizeFuelProductCode("SPU")).toBe("SPECIAL");
    expect(normalizeFuelProductCode("ULG")).toBe("UNLEADED");
    expect(normalizeFuelProductCode("REGULAR")).toBe("UNLEADED");
  });

  it("baseline does not count as meter liters out", () => {
    const result = buildStationFuelInventorySummary({
      stations: [{ id: "s1", name: "Main" }],
      baselines: [{ id: "b1", station_id: "s1", status: "finalized", baseline_at: "2026-04-01T00:00:00Z" }],
      baselineProducts: [{ baseline_id: "b1", station_id: "s1", product_code_snapshot: "DIESEL", opening_liters: 1000 }],
      deliveries: [],
      tankReadings: [{ station_id: "s1", product_code_snapshot: "DIESEL", actual_ending_liters: 1000, reading_date: "2026-04-01" }],
      meterReadings: []
    });

    const diesel = result.rows.find((row) => row.product === "DIESEL");
    expect(diesel?.meter_liters_out).toBe(0);
  });

  it("all-stations summary aggregates per station/product", () => {
    const result = buildStationFuelInventorySummary({
      stations: [{ id: "s1", name: "One" }, { id: "s2", name: "Two" }],
      baselines: [],
      baselineProducts: [],
      deliveries: [
        { station_id: "s1", product_code_snapshot: "DIESEL", liters: 100 },
        { station_id: "s2", product_code_snapshot: "DIESEL", liters: 50 }
      ],
      tankReadings: [],
      meterReadings: [
        { station_id: "s1", product_code_snapshot: "DIESEL", liters_sold: 40 },
        { station_id: "s2", product_code_snapshot: "DIESEL", liters_sold: 10 }
      ]
    });

    const dieselAll = result.allStationsSummary.find((row) => row.product === "DIESEL");
    expect(dieselAll?.delivered_liters).toBe(150);
    expect(dieselAll?.meter_liters_out).toBe(50);
  });
});
