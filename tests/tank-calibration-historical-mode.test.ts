import fs from "node:fs";
import { describe, expect, it } from "vitest";

describe("historical emptying schema guards", () => {
  const migration = fs.readFileSync("supabase/migrations/202605030001_historical_emptying_mode.sql", "utf8");

  it("allows null profile for historical_emptying and requires profile otherwise", () => {
    expect(migration).toContain("calibration_mode = 'historical_emptying' and calibration_profile_id is null");
    expect(migration).toContain("calibration_mode in ('verified_profile', 'manual_table') and calibration_profile_id is not null");
  });

  it("creates owner-only empirical calibration points with rls", () => {
    expect(migration).toContain("create table if not exists public.tank_empirical_calibration_points");
    expect(migration).toContain("fuel_current_role() in ('Owner', 'Co-Owner')");
    expect(migration).toContain("fuel_current_role() = 'Owner'");
  });
});
