import { describe, expect, it } from "vitest";

function canCreateStation(role: string | null) {
  return role === "Owner";
}

function canCreateBodega(role: string | null) {
  return role === "Owner";
}

describe("station/bodega owner-only access", () => {
  it("non-owner cannot create station", () => {
    expect(canCreateStation("Admin")).toBe(false);
    expect(canCreateStation("User")).toBe(false);
  });

  it("owner can create station", () => {
    expect(canCreateStation("Owner")).toBe(true);
  });

  it("non-owner cannot create bodega", () => {
    expect(canCreateBodega("Co-Owner")).toBe(false);
  });

  it("owner can create bodega", () => {
    expect(canCreateBodega("Owner")).toBe(true);
  });
});
