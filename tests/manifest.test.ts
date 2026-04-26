import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";

describe("PWA manifest", () => {
  it("exists with AKY Fuel Ops GitHub Pages settings", () => {
    const manifestPath = path.join(process.cwd(), "public", "manifest.webmanifest");
    expect(fs.existsSync(manifestPath)).toBe(true);

    const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8")) as {
      name?: string;
      start_url?: string;
      display?: string;
    };

    expect(manifest.name).toBe("AKY Fuel Ops");
    expect(manifest.start_url).toBe("/my-business-app/");
    expect(manifest.display).toBe("standalone");
  });
});
