import { describe, expect, it } from "vitest";
import { calculateFuelTankVariance, calculateLubricantTransfer } from "@/lib/analytics/inventory-operations";

describe("inventory operations analytics", () => {
  it("calculates lubricant transfer math", () => {
    const result = calculateLubricantTransfer(100, 25, 10);
    expect(result).toEqual({ warehouseAfter: 75, stationAfter: 35 });
  });

  it("rejects lubricant transfer that would make warehouse inventory negative", () => {
    expect(() => calculateLubricantTransfer(10, 15, 0)).toThrow("negative");
  });

  it("calculates fuel tank expected ending and variance", () => {
    const result = calculateFuelTankVariance({
      openingLiters: 1000,
      receivedLiters: 500,
      meterLitersOut: 420,
      actualEndingLiters: 1075
    });

    expect(result.expectedEndingLiters).toBe(1080);
    expect(result.varianceLiters).toBe(-5);
  });
});
