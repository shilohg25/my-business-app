import { describe, expect, it } from "vitest";

const validRoles = ["Owner", "Co-Owner", "Admin", "User"] as const;

function isValidRole(role: string) {
  return validRoles.includes(role as (typeof validRoles)[number]);
}

function canDeactivateSelf(actorId: string, targetId: string) {
  return actorId !== targetId;
}

describe("roles", () => {
  it("accepts valid roles", () => {
    validRoles.forEach((role) => expect(isValidRole(role)).toBe(true));
  });

  it("rejects invalid role", () => {
    expect(isValidRole("SuperAdmin")).toBe(false);
  });

  it("prevents self-deactivation", () => {
    expect(canDeactivateSelf("u1", "u1")).toBe(false);
    expect(canDeactivateSelf("u1", "u2")).toBe(true);
  });
});
