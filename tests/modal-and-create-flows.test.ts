import fs from "node:fs";
import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { createElement } from "react";
import { SimpleModal } from "@/components/ui/simple-modal";
import { isBlank } from "@/lib/utils/forms";

const stationsClientSource = fs.readFileSync("src/components/stations/stations-client.tsx", "utf8");
const bodegaClientSource = fs.readFileSync("src/components/bodega/bodega-client.tsx", "utf8");

describe("simple modal", () => {
  it("renders when open and hides when closed", () => {
    const opened = renderToStaticMarkup(
      createElement(SimpleModal, {
        open: true,
        title: "New Station",
        description: "Station code is generated automatically from the station name.",
        onClose: () => undefined,
        children: createElement("div", null, "Body")
      })
    );

    const closed = renderToStaticMarkup(
      createElement(SimpleModal, {
        open: false,
        title: "New Station",
        onClose: () => undefined,
        children: createElement("div", null, "Body")
      })
    );

    expect(opened).toContain("New Station");
    expect(opened).toContain("Body");
    expect(closed).toBe("");
  });
});

describe("station and bodega create flow UI", () => {
  it("does not include inline station code/tin/business permit fields", () => {
    expect(stationsClientSource).not.toContain("placeholder=\"Code\"");
    expect(stationsClientSource).not.toMatch(/placeholder=\"\s*tin\s*\"/i);
    expect(stationsClientSource).not.toMatch(/business\s+permit/i);
  });

  it("does not include inline bodega code field", () => {
    expect(bodegaClientSource).not.toContain("placeholder=\"Code\"");
  });

  it("shows owner-only create buttons and helper copy", () => {
    expect(stationsClientSource).toContain("New Station");
    expect(bodegaClientSource).toContain("New Bodega");
    expect(stationsClientSource).toContain("Only Owner profiles can create stations.");
    expect(bodegaClientSource).toContain("Only Owner profiles can create bodegas.");
  });

  it("keeps checking role text", () => {
    expect(stationsClientSource).toContain("Checking role...");
    expect(bodegaClientSource).toContain("Checking role...");
  });
});

describe("blank name validation", () => {
  it("blocks blank station name", () => {
    expect(isBlank("   ")).toBe(true);
    expect(isBlank("Station 1")).toBe(false);
  });

  it("blocks blank bodega name", () => {
    expect(isBlank("\n\t")).toBe(true);
    expect(isBlank("Bodega A")).toBe(false);
  });
});
