import { describe, expect, it } from "vitest";
import { buildFuelDeliveryBatchPayload, normalizeDeliveryProductCode } from "@/lib/data/fuel-deliveries";

describe("fuel delivery batch", () => {
  it("requires station", () => {
    expect(() =>
      buildFuelDeliveryBatchPayload({ station_id: "", delivery_date: "2026-04-26", items: [{ product_code: "DIESEL", liters: 10 }] })
    ).toThrow("Station is required");
  });

  it("requires at least one item", () => {
    expect(() => buildFuelDeliveryBatchPayload({ station_id: "s1", delivery_date: "2026-04-26", items: [] })).toThrow(
      "At least one product row is required"
    );
  });

  it("validates liters > 0", () => {
    expect(() =>
      buildFuelDeliveryBatchPayload({ station_id: "s1", delivery_date: "2026-04-26", items: [{ product_code: "DIESEL", liters: 0 }] })
    ).toThrow("Liters must be greater than zero");
  });

  it("normalizes Regular to UNLEADED", () => {
    expect(normalizeDeliveryProductCode("Regular")).toBe("UNLEADED");
  });

  it("supports Diesel + Special + Unleaded in one invoice", () => {
    const payload = buildFuelDeliveryBatchPayload({
      station_id: "s1",
      delivery_date: "2026-04-26",
      invoice_number: "INV-123",
      items: [
        { product_code: "Diesel", liters: 1000 },
        { product_code: "Special", liters: 500 },
        { product_code: "Regular", liters: 200 }
      ]
    });

    expect(payload.items).toHaveLength(3);
    expect(payload.items.map((item) => item.product_code)).toEqual(["DIESEL", "SPECIAL", "UNLEADED"]);
  });

  it("builds payload correctly", () => {
    const payload = buildFuelDeliveryBatchPayload({
      station_id: "station-1",
      delivery_date: "2026-04-26",
      supplier_name: "Supplier A",
      items: [{ product_code: "ADO", liters: 123.4, unit_cost: 2.5 }]
    });

    expect(payload.station_id).toBe("station-1");
    expect(payload.items[0]).toMatchObject({ product_code: "DIESEL", liters: 123.4, unit_cost: 2.5 });
  });
});
