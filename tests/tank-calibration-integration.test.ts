import { beforeEach, describe, expect, it, vi } from "vitest";
import { buildTankCalibrationDisplay } from "@/lib/domain/tankCalibrationDisplay";
import { VERIFIED_TANK_PROFILES } from "@/lib/domain/tankCalibration";
import {
  createOrUpdateStationTank,
  ensureVerifiedTankCalibrationProfilesSeeded,
  getSeedCalibrationProfiles,
  isUuid,
  listTankCalibrationProfiles,
  resolveCalibrationProfileId
} from "@/lib/data/tank-calibration";
import { hasPermission } from "@/lib/auth/permissions";

const fromMock = vi.fn();
vi.mock("@/lib/data/client", () => ({ canUseLiveData: () => true }));
vi.mock("@/lib/supabase/client", () => ({ createSupabaseBrowserClient: () => ({ from: fromMock }) }));

const profile = VERIFIED_TANK_PROFILES[0];

describe("tank calibration integration helpers", () => {
  beforeEach(() => {
    fromMock.mockReset();
  });

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

  it("validates UUID and resolves profile key to UUID", async () => {
    const resolvedId = "11111111-1111-4111-8111-111111111111";
    fromMock.mockReturnValue({
      select: () => ({
        eq: () => ({
          is: () => ({
            maybeSingle: async () => ({ data: { id: resolvedId }, error: null })
          })
        })
      })
    });

    expect(isUuid(resolvedId)).toBe(true);
    expect(await resolveCalibrationProfileId("ugt_16kl_202x488")).toBe(resolvedId);
  });

  it("saves station tank with UUID calibration_profile_id even when given profile_key", async () => {
    const resolvedId = "11111111-1111-4111-8111-111111111111";
    const updateEqMock = vi.fn().mockReturnValue({ select: () => ({ single: async () => ({ data: { id: "tank-1" }, error: null }) }) });
    const insertMock = vi.fn().mockReturnValue({ select: () => ({ single: async () => ({ data: { id: "tank-1" }, error: null }) }) });

    fromMock.mockImplementation((table: string) => {
      if (table === "tank_calibration_profiles") {
        return {
          select: () => ({ eq: () => ({ is: () => ({ maybeSingle: async () => ({ data: { id: resolvedId }, error: null }) }) }) })
        };
      }
      if (table === "station_tanks") {
        return { update: () => ({ eq: updateEqMock }), insert: insertMock };
      }
      throw new Error(`Unexpected table ${table}`);
    });

    await createOrUpdateStationTank({
      station_id: "22222222-2222-4222-8222-222222222222",
      product_type: "DIESEL",
      tank_name: "Main tank",
      calibration_profile_id: "ugt_16kl_202x488"
    });

    expect(insertMock).toHaveBeenCalledWith(expect.objectContaining({ calibration_profile_id: resolvedId }));
  });

  it("auto-seeds when no calibration rows are found and returns database UUID ids", async () => {
    const dbRows = [
      { id: "11111111-1111-4111-8111-111111111111", profile_key: "ugt_16kl_202x488", name: "A", formula_type: "horizontal_cylinder", diameter_cm: 202, radius_cm: 101, length_cm: 488, max_dipstick_cm: 202, nominal_label: "n", calculated_full_liters: 1, rounded_full_liters: 1, is_verified: true, is_owner_only: true },
      { id: "22222222-2222-4222-8222-222222222222", profile_key: "ugt_12kl_split_half_203x183", name: "B", formula_type: "horizontal_cylinder", diameter_cm: 203, radius_cm: 101.5, length_cm: 183, max_dipstick_cm: 203, nominal_label: "n", calculated_full_liters: 1, rounded_full_liters: 1, is_verified: true, is_owner_only: true },
      { id: "33333333-3333-4333-8333-333333333333", profile_key: "ugt_12kl_single_203x366", name: "C", formula_type: "horizontal_cylinder", diameter_cm: 203, radius_cm: 101.5, length_cm: 366, max_dipstick_cm: 203, nominal_label: "n", calculated_full_liters: 1, rounded_full_liters: 1, is_verified: true, is_owner_only: true }
    ];
    const upsert = vi.fn().mockResolvedValue({ error: null });
    let fetchCall = 0;
    fromMock.mockImplementation((table: string) => {
      if (table !== "tank_calibration_profiles") throw new Error(`Unexpected table ${table}`);
      return {
        select: () => ({
          is: () => ({
            order: async () => ({ data: fetchCall++ === 0 ? [] : dbRows, error: null }),
            then: undefined
          })
        }),
        upsert
      } as any;
    });
    const rows = await listTankCalibrationProfiles();
    expect(upsert).toHaveBeenCalled();
    expect(rows[0].id).toMatch(/[0-9a-f-]{36}/i);
  });

  it("seeds when verified set is partially missing and uses profile_key conflict handling", async () => {
    const upsert = vi.fn().mockResolvedValue({ error: null });
    let callCount = 0;
    fromMock.mockImplementation((table: string) => {
      if (table !== "tank_calibration_profiles") throw new Error(`Unexpected table ${table}`);
      return {
        select: () => ({
          is: () => ({
            order: async () => ({
              data:
                callCount++ === 0
                  ? [{ id: "11111111-1111-4111-8111-111111111111", profile_key: "ugt_16kl_202x488", name: "A", formula_type: "horizontal_cylinder", diameter_cm: 202, radius_cm: 101, length_cm: 488, max_dipstick_cm: 202, nominal_label: "n", calculated_full_liters: 1, rounded_full_liters: 1, is_verified: true, is_owner_only: true }]
                  : [{ id: "11111111-1111-4111-8111-111111111111", profile_key: "ugt_16kl_202x488", name: "A", formula_type: "horizontal_cylinder", diameter_cm: 202, radius_cm: 101, length_cm: 488, max_dipstick_cm: 202, nominal_label: "n", calculated_full_liters: 1, rounded_full_liters: 1, is_verified: true, is_owner_only: true }],
              error: null
            }),
            then: (resolve: any) => resolve({ data: [{ profile_key: "ugt_16kl_202x488" }], error: null })
          })
        }),
        upsert
      };
    });
    await ensureVerifiedTankCalibrationProfilesSeeded();
    expect(upsert).toHaveBeenCalledWith(expect.any(Array), { onConflict: "profile_key" });
  });
});
