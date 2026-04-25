import { describe, expect, it } from "vitest";
import { calculateFuelTankVariance } from "@/lib/analytics/inventory-operations";
import { buildFuelInventorySummary, normalizeFuelProductCode } from "@/lib/data/fuel-inventory";

describe("fuel inventory analytics", () => {
  it("calculates expected ending and variance", () => {
    const result = calculateFuelTankVariance({
      openingLiters: 1000,
      receivedLiters: 500,
      meterLitersOut: 420,
      actualEndingLiters: 1075
    });

    expect(result.expectedEndingLiters).toBe(1080);
    expect(result.varianceLiters).toBe(-5);
  });

  it("normalizes diesel/special/unleaded aliases", () => {
    expect(normalizeFuelProductCode("ADO")).toBe("DIESEL");
    expect(normalizeFuelProductCode("SPU")).toBe("SPECIAL");
    expect(normalizeFuelProductCode("ULG")).toBe("UNLEADED");
  });

  it("includes delivery liters and meter liters out in grouped summary", () => {
    const summary = buildFuelInventorySummary({
      deliveries: [
        { station_id: "s1", station_name: "Main", product_code_snapshot: "ADO", liters: 1000 },
        { station_id: "s1", station_name: "Main", product_code_snapshot: "DIESEL", liters: 50 }
      ],
      meterReports: [
        { station_id: "s1", fuel_meter_readings: [{ product_code_snapshot: "DIESEL", liters_sold: 400 }] }
      ],
      readings: [
        {
          station_id: "s1",
          station_name: "Main",
          product_code_snapshot: "DIESEL",
          actual_ending_liters: 700,
          expected_ending_liters: 650,
          variance_liters: 50
        }
      ]
    });

    expect(summary).toHaveLength(1);
    expect(summary[0]).toMatchObject({
      product: "DIESEL",
      delivered_liters: 1050,
      gross_liters_out: 400,
      latest_actual_ending: 700,
      latest_expected_ending: 650,
      variance_liters: 50
    });
  });
});
