import { describe, expect, it } from "vitest";
import {
  VERIFIED_TANK_PROFILES,
  calculateTankReconciliation,
  calculateHistoricalAnchorAudit,
  dipstickCmFromLiters,
  getHistoricalLitersEstimate,
  litersFromDipstickCm,
  roundedLitersFromDipstickCm,
  type TankCalibrationProfile
} from "@/lib/domain/tankCalibration";

const p16 = VERIFIED_TANK_PROFILES[0];
const pSplit = VERIFIED_TANK_PROFILES[1];
const p12 = VERIFIED_TANK_PROFILES[2];

describe("tank calibration anchors", () => {
  it("matches rounded anchor rows", () => {
    const anchors: Array<[TankCalibrationProfile, number, number]> = [
      [p16, 0, 0],[p16, 1, 9],[p16, 20, 802],[p16, 60, 3892],[p16, 94, 7130],[p16, 120, 9681],[p16, 150, 12453],[p16, 175, 14395],[p16, 180, 14717],[p16, 188, 15165],[p16, 202, 15639],
      [pSplit,0,0],[pSplit,1,3],[pSplit,20,302],[pSplit,38,767],[pSplit,50,1134],[pSplit,88,2461],[pSplit,100,2906],[pSplit,150,4692],[pSplit,176,5455],[pSplit,187,5706],[pSplit,199,5895],[pSplit,203,5923],
      [p12,0,0],[p12,1,7],[p12,20,603],[p12,38,1534],[p12,50,2268],[p12,88,4923],[p12,92,5218],[p12,100,5811],[p12,142,8850],[p12,150,9384],[p12,187,11411],[p12,197,11744],[p12,199,11790],[p12,203,11846]
    ];
    anchors.forEach(([profile, cm, expected]) => {
      expect(roundedLitersFromDipstickCm(profile, cm)).toBe(expected);
    });
  });

  it("matches full capacities", () => {
    VERIFIED_TANK_PROFILES.forEach((profile) => {
      expect(litersFromDipstickCm(profile, profile.maxDipstickCm)).toBeCloseTo(profile.calculatedFullLiters, 6);
    });
  });

  it("is monotonic", () => {
    VERIFIED_TANK_PROFILES.forEach((profile) => {
      let prev = -1;
      for (let cm = 0; cm <= profile.maxDipstickCm; cm += 1) {
        const liters = litersFromDipstickCm(profile, cm);
        expect(liters).toBeGreaterThanOrEqual(prev);
        prev = liters;
      }
    });
  });

  it("rejects invalid readings", () => {
    expect(() => litersFromDipstickCm(p16, Number.NaN)).toThrow();
    expect(() => litersFromDipstickCm(p16, Number.POSITIVE_INFINITY)).toThrow();
    expect(() => litersFromDipstickCm(p16, -0.1)).toThrow();
    expect(() => litersFromDipstickCm(p16, 999)).toThrow();
  });

  it("inverts liters via bisection", () => {
    const cm = 92.4;
    const liters = litersFromDipstickCm(p12, cm);
    const back = dipstickCmFromLiters(p12, liters);
    expect(back).toBeCloseTo(cm, 4);
  });

  it("supports manual table interpolation", () => {
    const manual: TankCalibrationProfile = {
      id: "m1", profileKey: "m1", name: "Manual", formulaType: "manual_table", diameterCm: null, radiusCm: null, lengthCm: null,
      maxDipstickCm: 10, nominalLabel: "Manual", calculatedFullLiters: 100, roundedFullLiters: 100, isVerified: false, isOwnerOnly: true,
      manualTableRows: [{ readingCm: 0, liters: 0 }, { readingCm: 5, liters: 40 }, { readingCm: 10, liters: 100 }]
    };
    expect(litersFromDipstickCm(manual, 2.5)).toBeCloseTo(20, 6);
    expect(() => litersFromDipstickCm(manual, 11)).toThrow();
  });

  it("computes reconciliation", () => {
    const result = calculateTankReconciliation({ profile: p16, openingReadingCm: 120, closingReadingCm: 118, deliveryLiters: 2000, pumpMeterSalesLiters: 1900, toleranceLiters: 50 });
    expect(result.status).toBeTypeOf("string");
    expect(result.expectedClosingLiters).toBeCloseTo(result.openingLiters + 100, 6);
  });

  it("computes historical audit surplus against expected liters", () => {
    const result = calculateHistoricalAnchorAudit({ readingCm: 15, actualPulledLiters: 825, remainingAfterPulloutLiters: 0, expectedLiters: 525, toleranceLiters: 10 });
    expect(result.observedLiters).toBe(825);
    expect(result.varianceLiters).toBe(300);
    expect(result.status).toBe("surplus");
  });

  it("supports anchor-only historical audit when base profile is absent", () => {
    const result = calculateHistoricalAnchorAudit({ readingCm: 15, actualPulledLiters: 825, toleranceLiters: 10 });
    expect(result.expectedLiters).toBeNull();
    expect(result.varianceLiters).toBeNull();
    expect(result.status).toBe("anchor_only");
  });

  it("interpolates only within bracketing historical points and does not extrapolate", () => {
    const points = [{ readingCm: 10, observedLiters: 500 }, { readingCm: 20, observedLiters: 900 }];
    expect(getHistoricalLitersEstimate(points, 10)).toEqual({ status: "exact_anchor", liters: 500 });
    expect(getHistoricalLitersEstimate(points, 15)).toEqual({ status: "interpolated_estimate", liters: 700 });
    expect(getHistoricalLitersEstimate(points, 25)).toEqual({ status: "unavailable", liters: null });
  });
});
