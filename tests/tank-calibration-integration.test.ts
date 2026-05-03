import { beforeEach, describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import { buildTankCalibrationDisplay } from "@/lib/domain/tankCalibrationDisplay";
import { VERIFIED_TANK_PROFILES } from "@/lib/domain/tankCalibration";
import {
  archiveStationTank,
  createOrUpdateStationTank,
  ensureVerifiedTankCalibrationProfilesSeeded,
  isUuid,
  listOwnerTankSummary,
  listTankCalibrationProfiles,
  resolveCalibrationProfileId
} from "@/lib/data/tank-calibration";
import { hasPermission } from "@/lib/auth/permissions";
import { shouldPrepareOwnerCalibrationProfiles } from "@/components/fuel-inventory/fuel-inventory-client";

const fromMock = vi.fn();
const rpcMock = vi.fn();
vi.mock("@/lib/data/client", () => ({ canUseLiveData: () => true }));
vi.mock("@/lib/supabase/client", () => ({ createSupabaseBrowserClient: () => ({ from: fromMock, rpc: rpcMock }) }));

const profile = VERIFIED_TANK_PROFILES[0];

describe("tank calibration integration helpers", () => {
  beforeEach(() => {
    fromMock.mockReset();
    rpcMock.mockReset();
  });

  it("enforces owner-only visibility permission", () => {
    expect(hasPermission("Owner", "tankCalibrationManage")).toBe(true);
    expect(hasPermission("User", "tankCalibrationManage")).toBe(false);
    expect(hasPermission("User", "tankCalibrationView")).toBe(false);
  });

  it("builds cross-check display metrics", () => {
    const result = buildTankCalibrationDisplay(profile, 100, 9000);
    expect(result.decimalLiters).toBeGreaterThan(0);
  });

  it("validates UUID and resolves profile key to UUID", async () => {
    const resolvedId = "11111111-1111-4111-8111-111111111111";
    fromMock.mockReturnValue({ select: () => ({ eq: () => ({ is: () => ({ maybeSingle: async () => ({ data: { id: resolvedId }, error: null }) }) }) }) });
    expect(isUuid(resolvedId)).toBe(true);
    expect(await resolveCalibrationProfileId("ugt_16kl_202x488")).toBe(resolvedId);
  });

  it("saves station tank with UUID calibration_profile_id even when given profile_key", async () => {
    const resolvedId = "11111111-1111-4111-8111-111111111111";
    const insertMock = vi.fn().mockReturnValue({ select: () => ({ single: async () => ({ data: { id: "tank-1" }, error: null }) }) });
    fromMock.mockImplementation((table: string) => {
      if (table === "tank_calibration_profiles") return { select: () => ({ eq: () => ({ is: () => ({ maybeSingle: async () => ({ data: { id: resolvedId }, error: null }) }) }) }) };
      if (table === "station_tanks") return { update: () => ({ eq: vi.fn() }), insert: insertMock };
      throw new Error(`Unexpected table ${table}`);
    });

    await createOrUpdateStationTank({ station_id: "22222222-2222-4222-8222-222222222222", product_type: "DIESEL", tank_name: "Main tank", calibration_mode: "verified_profile", calibration_profile_id: "ugt_16kl_202x488" });
    expect(insertMock).toHaveBeenCalledWith(expect.objectContaining({ calibration_profile_id: resolvedId }));
  });

  it("uses RPC to seed verified profiles and does not upsert from browser", async () => {
    const rows = [{ id: "11111111-1111-4111-8111-111111111111", profile_key: "ugt_16kl_202x488", name: "A", formula_type: "horizontal_cylinder", diameter_cm: 202, radius_cm: 101, length_cm: 488, max_dipstick_cm: 202, nominal_label: "n", calculated_full_liters: 1, rounded_full_liters: 1, is_verified: true, is_owner_only: true }];
    rpcMock.mockResolvedValue({ data: rows, error: null });
    const out = await ensureVerifiedTankCalibrationProfilesSeeded();
    expect(rpcMock).toHaveBeenCalledWith("fuel_ensure_verified_tank_calibration_profiles");
    expect(fromMock).not.toHaveBeenCalledWith("tank_calibration_profiles");
    expect(out[0].id).toBe(rows[0].id);
  });

  it("lists profiles through select-only flow", async () => {
    fromMock.mockImplementation((table: string) => ({ select: () => ({ is: () => ({ order: async () => ({ data: [{ id: "11111111-1111-4111-8111-111111111111", profile_key: "ugt_16kl_202x488", name: "A", formula_type: "horizontal_cylinder", diameter_cm: 202, radius_cm: 101, length_cm: 488, max_dipstick_cm: 202, nominal_label: "n", calculated_full_liters: 1, rounded_full_liters: 1, is_verified: true, is_owner_only: true }], error: null }) }) }) }));
    await listTankCalibrationProfiles();
    expect(rpcMock).not.toHaveBeenCalled();
  });

  it("includes latest CMS reading in owner tank summary", async () => {
    fromMock.mockImplementation((table: string) => {
      if (table === "station_tanks") {
        return {
          select: () => ({
            eq: () => ({
              is: () => ({
                order: async () => ({
                  data: [{
                    id: "tank-1",
                    station_id: "station-1",
                    product_type: "DIESEL",
                    tank_name: "Main",
                    calibration_mode: "verified_profile",
                    calibration_profile_id: profile.id,
                    reorder_threshold_liters: 5000,
                    variance_tolerance_liters: 200,
                    fuel_stations: { name: "Station A" },
                    tank_calibration_profiles: { id: profile.id, profile_key: profile.profileKey, name: profile.name, max_dipstick_cm: profile.maxDipstickCm, calculated_full_liters: profile.calculatedFullLiters }
                  }],
                  error: null
                })
              })
            })
          })
        };
      }
      if (table === "tank_stick_readings") {
        return {
          select: () => ({
            in: () => ({
              order: async () => ({
                data: [{ id: "r1", station_tank_id: "tank-1", report_date: "2026-05-03", reading_cm: 94, entered_at: "2026-05-03T01:00:00Z", source: "web" }],
                error: null
              })
            })
          })
        };
      }
      throw new Error(`Unexpected table ${table}`);
    });
    const rows = await listOwnerTankSummary();
    expect(rows[0].latest_reading_cm).toBe(94);
  });

  it("archives by setting active false and archived_at", async () => {
    const eqMock = vi.fn().mockResolvedValue({ error: null });
    const updateMock = vi.fn().mockReturnValue({ eq: eqMock });
    fromMock.mockImplementation((table: string) => {
      if (table === "station_tanks") return { update: updateMock };
      throw new Error(`Unexpected table ${table}`);
    });
    await archiveStationTank("tank-1");
    expect(updateMock).toHaveBeenCalledWith(expect.objectContaining({ active: false, archived_at: expect.any(String) }));
    expect(eqMock).toHaveBeenCalledWith("id", "tank-1");
  });

  it("role gating helper blocks null/non-owner and allows owner", () => {
    expect(shouldPrepareOwnerCalibrationProfiles(false, null)).toBe(false);
    expect(shouldPrepareOwnerCalibrationProfiles(false, "User")).toBe(false);
    expect(shouldPrepareOwnerCalibrationProfiles(true, "Owner")).toBe(false);
    expect(shouldPrepareOwnerCalibrationProfiles(false, "Owner")).toBe(true);
  });

  it("uses conflict constraint syntax in seed RPC migration to avoid RETURNS TABLE ambiguity", () => {
    const migrationSql = readFileSync(
      "supabase/migrations/202605020004_tank_calibration_rls_and_seed_rpc.sql",
      "utf8"
    );

    expect(migrationSql).toContain("insert into public.tank_calibration_profiles as tcp");
    expect(migrationSql).toContain(
      "on conflict on constraint tank_calibration_profiles_profile_key_key do update"
    );
    expect(migrationSql).toContain("where tcp.is_verified = true;");
    expect(migrationSql).not.toContain("on conflict (profile_key) do update");
  });
});
