import { describe, expect, it } from "vitest";
import { makeDisplayCode } from "@/lib/utils/codes";

describe("makeDisplayCode", () => {
  it("generates code for station name", () => {
    expect(makeDisplayCode("AKY Main Station")).toBe("AKY_MAIN_STATION");
  });

  it("trims and strips punctuation", () => {
    expect(makeDisplayCode("  Main Bodega!! ")).toBe("MAIN_BODEGA");
  });

  it("falls back to ITEM for empty value", () => {
    expect(makeDisplayCode("")).toBe("ITEM");
  });
});
