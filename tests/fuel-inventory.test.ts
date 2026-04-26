import { describe, expect, it } from "vitest";
import { normalizeFuelProductCode } from "@/lib/data/fuel-inventory";
import { computeFuelExpectedEnding, computeFuelVariance } from "@/lib/analytics/fuel-inventory";

describe("fuel inventory analytics", () => {
  it("calculates expected ending and variance", () => {
    const expected = computeFuelExpectedEnding(1000, 500, 420);
    const variance = computeFuelVariance(1075, expected);

    expect(expected).toBe(1080);
    expect(variance).toBe(-5);
  });

  it("normalizes diesel/special/unleaded aliases", () => {
    expect(normalizeFuelProductCode("ADO")).toBe("DIESEL");
    expect(normalizeFuelProductCode("SPU")).toBe("SPECIAL");
    expect(normalizeFuelProductCode("ULG")).toBe("UNLEADED");
  });
});
