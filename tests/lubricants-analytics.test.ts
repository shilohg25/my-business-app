import { describe, expect, it } from "vitest";
import { buildLubricantsAnalytics } from "@/lib/analytics/lubricants";

describe("lubricants analytics", () => {
  it("calculates sales amount and quantity totals", () => {
    const analytics = buildLubricantsAnalytics({
      products: [{ id: "p1", name: "AX7", sku: "AX7", unit: "bottle", default_unit_price: 100, is_active: true }],
      sales: [
        { id: "s1", shift_report_id: "r1", lubricant_product_id: "p1", product_name_snapshot: "AX7", quantity: 2, unit_price: 100, amount: 200, created_at: null },
        { id: "s2", shift_report_id: "r2", lubricant_product_id: "p1", product_name_snapshot: "AX7", quantity: 1, unit_price: 120, amount: 120, created_at: null }
      ],
      movements: [],
      warehouseInventory: [],
      stationInventory: []
    });

    expect(analytics.totalSalesAmount).toBe(320);
    expect(analytics.totalUnitsSold).toBe(3);
  });

  it("detects low stock counts and groups stock movement type", () => {
    const analytics = buildLubricantsAnalytics({
      products: [{ id: "p1", name: "AX7", sku: "AX7", unit: "bottle", default_unit_price: 100, is_active: true }],
      sales: [],
      movements: [
        { id: "m1", lubricant_product_id: "p1", movement_type: "sale", quantity: 1, shift_report_id: "r1" },
        { id: "m2", lubricant_product_id: "p1", movement_type: "transfer_out", quantity: 2, shift_report_id: null }
      ],
      warehouseInventory: [{ id: "w1", lubricant_product_id: "p1", quantity_on_hand: 2, reorder_level: 3 }],
      stationInventory: [{ id: "i1", lubricant_product_id: "p1", quantity_on_hand: 0, reorder_level: 1 }]
    });

    expect(analytics.warehouseLowStockCount).toBe(1);
    expect(analytics.stationLowStockCount).toBe(1);
    expect(analytics.movementByType).toEqual({ sale: 1, transfer_out: 1 });
  });

  it("returns bodega and station inventory summaries independently", () => {
    const analytics = buildLubricantsAnalytics({
      products: [{ id: "p1", name: "AX7", sku: "AX7", unit: "bottle", default_unit_price: 100, is_active: true }],
      sales: [],
      movements: [],
      warehouseInventory: [{ id: "w1", lubricant_product_id: "p1", quantity_on_hand: 10, reorder_level: 2 }],
      stationInventory: [{ id: "s1", lubricant_product_id: "p1", quantity_on_hand: 1, reorder_level: 2 }]
    });

    expect(analytics.warehouseLowStockCount).toBe(0);
    expect(analytics.stationLowStockCount).toBe(1);
  });

  it("adds unmatched sale warning when sale snapshot cannot match active product", () => {
    const analytics = buildLubricantsAnalytics({
      products: [{ id: "p1", name: "ACTIVE", sku: "A", unit: "bottle", default_unit_price: 100, is_active: true }],
      sales: [{ id: "s1", shift_report_id: "r1", lubricant_product_id: "p-missing", product_name_snapshot: "OLD-PRODUCT", quantity: 1, unit_price: 10, amount: 10, created_at: null }],
      movements: [],
      warehouseInventory: [],
      stationInventory: []
    });

    expect(analytics.warnings).toContain("Lubricant sale snapshot does not match an active product");
  });
});
