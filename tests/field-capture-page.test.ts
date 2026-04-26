import { describe, expect, it } from "vitest";
import FieldCapturePage from "@/app/(app)/field-capture/page";

function flattenText(node: unknown): string {
  if (node === null || node === undefined || typeof node === "boolean") return "";
  if (typeof node === "string" || typeof node === "number") return String(node);
  if (Array.isArray(node)) return node.map(flattenText).join(" ");
  if (typeof node === "object" && node && "props" in node) {
    return flattenText((node as { props?: { children?: unknown } }).props?.children);
  }
  return "";
}

describe("FieldCapturePage", () => {
  it("contains staged shift workflow labels", () => {
    const rendered = FieldCapturePage();
    const text = flattenText(rendered);

    expect(text).toContain("Select station");
    expect(text).toContain("Select shift");
    expect(text).toContain("Opening / closing meter readings");
    expect(text).toContain("Cash count");
    expect(text).toContain("Receipts and expenses");
    expect(text).toContain("Fuel delivery received during shift");
    expect(text).toContain("Review summary");
  });
});
