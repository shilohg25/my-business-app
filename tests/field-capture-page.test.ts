import { describe, expect, it } from "vitest";
import FieldCapturePage from "@/app/(app)/field-capture/page";

describe("FieldCapturePage", () => {
  it("renders a static page component", () => {
    const rendered = FieldCapturePage();
    expect(rendered).toBeTruthy();
  });
});
