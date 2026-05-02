import { describe, expect, it } from "vitest";
import { buildTankCalibrationDisplay } from "@/lib/domain/tankCalibrationDisplay";
import { VERIFIED_TANK_PROFILES } from "@/lib/domain/tankCalibration";
import { getSeedCalibrationProfiles } from "@/lib/data/tank-calibration";
import { hasPermission } from "@/lib/auth/permissions";

const profile = VERIFIED_TANK_PROFILES[0];

describe("tank calibration integration helpers", () => {
  it("maps verified profiles for seed payload", () => {
    const seeds = getSeedCalibrationProfiles();
    expect(seeds.map((s) => s.profile_key)).toEqual([
      "ugt_16kl_202x488",
      "ugt_12kl_split_half_203x183",
      "ugt_12kl_single_203x366"
    ]);
  });

  it("enforces owner-only visibility permission", () => {
    expect(hasPermission("Owner", "tankCalibrationManage")).toBe(true);
    expect(hasPermission("User", "tankCalibrationManage")).toBe(false);
    expect(hasPermission("User", "tankCalibrationView")).toBe(false);
  });

  it("builds cross-check display metrics", () => {
    const result = buildTankCalibrationDisplay(profile, 100, 9000);
    expect(result.decimalLiters).toBeGreaterThan(0);
    expect(result.roundedLiters).toBe(Math.round(result.decimalLiters));
    expect(result.capacityPercent).toBeGreaterThan(0);
    expect(result.ullageLiters).toBeGreaterThan(0);
  });

  it("throws on invalid CMS readings", () => {
    expect(() => buildTankCalibrationDisplay(profile, -1, null)).toThrow();
    expect(() => buildTankCalibrationDisplay(profile, 9999, null)).toThrow();
  });
});
