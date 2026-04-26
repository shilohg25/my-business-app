import { describe, expect, it } from "vitest";
import { calculateFuelTankVariance, calculateLubricantTransfer } from "@/lib/analytics/inventory-operations";
import { normalizeFuelProductCode } from "@/lib/data/fuel-inventory";

describe("multi-location inventory foundation math", () => {
  it("bodega transfer decreases source and increases station", () => {
    const result = calculateLubricantTransfer(80, 15, 5);
    expect(result).toEqual({ warehouseAfter: 65, stationAfter: 20 });
  });

  it("cannot transfer more than available stock", () => {
    expect(() => calculateLubricantTransfer(5, 7, 0)).toThrow();
  });

  it("station fuel expected formula is opening + received - meter out", () => {
    const result = calculateFuelTankVariance({ openingLiters: 1200, receivedLiters: 400, meterLitersOut: 250, actualEndingLiters: 1380 });
    expect(result.expectedEndingLiters).toBe(1350);
  });

  it("fuel variance formula is actual - expected", () => {
    const result = calculateFuelTankVariance({ openingLiters: 1000, receivedLiters: 200, meterLitersOut: 100, actualEndingLiters: 1090 });
    expect(result.varianceLiters).toBe(-10);
  });

  it("normalizes diesel/special/unleaded aliases", () => {
    expect(normalizeFuelProductCode("ADO")).toBe("DIESEL");
    expect(normalizeFuelProductCode("SPU")).toBe("SPECIAL");
    expect(normalizeFuelProductCode("ULG")).toBe("UNLEADED");
  });
});
