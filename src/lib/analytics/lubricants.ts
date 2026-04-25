export interface LubricantProduct {
  id: string;
  name: string;
  sku: string | null;
  unit: string | null;
  default_unit_price: number | string | null;
  is_active: boolean | null;
}

export interface LubricantSale {
  id: string;
  shift_report_id: string;
  lubricant_product_id: string | null;
  product_name_snapshot: string | null;
  quantity: number | string | null;
  unit_price: number | string | null;
  amount: number | string | null;
  created_at: string | null;
}

export interface LubricantStockMovement {
  id: string;
  lubricant_product_id: string;
  movement_type: string;
  quantity: number | string | null;
  shift_report_id: string | null;
}

export interface LubricantInventoryRow {
  id: string;
  lubricant_product_id: string;
  quantity_on_hand: number | string | null;
  reorder_level: number | string | null;
}

export interface LubricantsAnalytics {
  totalSalesAmount: number;
  totalUnitsSold: number;
  warehouseLowStockCount: number;
  stationLowStockCount: number;
  recentMovementCount: number;
  movementByType: Record<string, number>;
  warnings: string[];
}

function asNumber(value: unknown) {
  const parsed = Number(value ?? Number.NaN);
  return Number.isFinite(parsed) ? parsed : 0;
}

export function isLowStock(row: { quantity_on_hand: unknown; reorder_level: unknown }) {
  const qty = asNumber(row.quantity_on_hand);
  const reorder = asNumber(row.reorder_level);
  return qty <= reorder;
}

export function buildLubricantsAnalytics(input: {
  sales: LubricantSale[];
  products: LubricantProduct[];
  movements: LubricantStockMovement[];
  warehouseInventory: LubricantInventoryRow[];
  stationInventory: LubricantInventoryRow[];
}): LubricantsAnalytics {
  const sales = input.sales ?? [];
  const products = input.products ?? [];
  const movements = input.movements ?? [];
  const warehouseInventory = input.warehouseInventory ?? [];
  const stationInventory = input.stationInventory ?? [];

  const activeProducts = products.filter((item) => item.is_active !== false);
  const activeById = new Set(activeProducts.map((item) => item.id));
  const activeByName = new Set(activeProducts.map((item) => (item.name ?? "").trim().toLowerCase()).filter(Boolean));

  const totalSalesAmount = sales.reduce((sum, sale) => {
    if (sale.amount !== null && sale.amount !== undefined) return sum + asNumber(sale.amount);
    return sum + asNumber(sale.quantity) * asNumber(sale.unit_price);
  }, 0);
  const totalUnitsSold = sales.reduce((sum, sale) => sum + asNumber(sale.quantity), 0);

  const warehouseLowStockCount = warehouseInventory.filter(isLowStock).length;
  const stationLowStockCount = stationInventory.filter(isLowStock).length;

  const movementByType = movements.reduce<Record<string, number>>((acc, row) => {
    const type = (row.movement_type ?? "unknown").trim() || "unknown";
    acc[type] = (acc[type] ?? 0) + 1;
    return acc;
  }, {});

  const movementByReportAndProduct = new Set(
    movements
      .filter((item) => item.shift_report_id)
      .map((item) => `${item.shift_report_id}::${item.lubricant_product_id}`)
  );

  const warnings = new Set<string>();

  sales.forEach((sale) => {
    const productName = (sale.product_name_snapshot ?? "").trim().toLowerCase();
    const hasActiveProductMatch = (sale.lubricant_product_id && activeById.has(sale.lubricant_product_id)) || activeByName.has(productName);

    if (!hasActiveProductMatch) {
      warnings.add("Lubricant sale snapshot does not match an active product");
    }

    if (sale.shift_report_id && sale.lubricant_product_id) {
      const key = `${sale.shift_report_id}::${sale.lubricant_product_id}`;
      if (!movementByReportAndProduct.has(key)) {
        warnings.add("Sales recorded but inventory movement not found");
      }
    }
  });

  [...warehouseInventory, ...stationInventory].forEach((row) => {
    const reorder = row.reorder_level;
    if (reorder === null || reorder === undefined) {
      warnings.add("Inventory row has no reorder level");
    }
    if (isLowStock(row)) {
      warnings.add("Low stock detected");
    }
  });

  return {
    totalSalesAmount,
    totalUnitsSold,
    warehouseLowStockCount,
    stationLowStockCount,
    recentMovementCount: movements.length,
    movementByType,
    warnings: Array.from(warnings)
  };
}
