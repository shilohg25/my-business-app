import { describe, expect, it } from "vitest";
import FieldCapturePage from "@/app/(app)/field-capture/page";
import FieldCaptureClient from "@/components/field-capture/field-capture-client";

describe("FieldCapturePage", () => {
  it("renders the mobile field capture client workflow", () => {
    const rendered = FieldCapturePage();
    expect(rendered.type).toBe(FieldCaptureClient);
  });
});
