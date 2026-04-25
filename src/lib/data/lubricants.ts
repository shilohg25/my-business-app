import { buildLubricantsAnalytics, type LubricantInventoryRow, type LubricantProduct, type LubricantSale, type LubricantStockMovement } from "@/lib/analytics/lubricants";
import { canUseLiveData } from "@/lib/data/client";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";

export interface LubricantsResult {
  products: LubricantProduct[];
  sales: Array<
    LubricantSale & {
      report_date: string | null;
      duty_name: string | null;
    }
  >;
  movements: Array<
    LubricantStockMovement & {
      created_at: string | null;
      from_station_name: string | null;
      to_station_name: string | null;
      product_name: string | null;
      reference: string | null;
      notes: string | null;
    }
  >;
  warehouseInventory: Array<
    LubricantInventoryRow & {
      product_name: string | null;
      sku: string | null;
      unit: string | null;
    }
  >;
  stationInventory: Array<
    LubricantInventoryRow & {
      station_id: string;
      station_name: string | null;
      product_name: string | null;
      sku: string | null;
      unit: string | null;
    }
  >;
  analytics: ReturnType<typeof buildLubricantsAnalytics>;
}

function emptyResult(): LubricantsResult {
  return {
    products: [],
    sales: [],
    movements: [],
    warehouseInventory: [],
    stationInventory: [],
    analytics: buildLubricantsAnalytics({ sales: [], products: [], movements: [], warehouseInventory: [], stationInventory: [] })
  };
}

export async function fetchLubricantControlData(options: { startDate: string; endDate: string }): Promise<LubricantsResult> {
  if (!canUseLiveData()) return emptyResult();

  const supabase = createSupabaseBrowserClient();

  const [productsResult, salesResult, movementResult, stationInventoryResult, warehouseInventoryResult] = await Promise.all([
    supabase.from("fuel_lubricant_products").select("id, sku, name, unit, default_unit_price, is_active").order("name", { ascending: true }),
    supabase
      .from("fuel_lubricant_sales")
      .select("id, shift_report_id, lubricant_product_id, product_name_snapshot, quantity, unit_price, amount, created_at")
      .gte("created_at", `${options.startDate}T00:00:00Z`)
      .lte("created_at", `${options.endDate}T23:59:59Z`)
      .order("created_at", { ascending: false }),
    supabase
      .from("fuel_lubricant_stock_movements")
      .select("id, lubricant_product_id, movement_type, quantity, from_station_id, to_station_id, shift_report_id, reference, notes, created_at")
      .order("created_at", { ascending: false })
      .limit(200),
    supabase.from("fuel_station_lubricant_inventory").select("id, station_id, lubricant_product_id, quantity_on_hand, reorder_level, updated_at"),
    supabase.from("fuel_warehouse_lubricant_inventory").select("id, lubricant_product_id, quantity_on_hand, reorder_level, updated_at")
  ]);

  const primaryErrors = [productsResult.error, salesResult.error, movementResult.error, stationInventoryResult.error, warehouseInventoryResult.error].filter(Boolean);
  if (primaryErrors.length > 0) {
    throw new Error(`Unable to load lubricant control data. ${primaryErrors[0]?.message ?? "Please retry or contact support."}`);
  }

  const products = (productsResult.data ?? []) as LubricantProduct[];
  const sales = (salesResult.data ?? []) as LubricantSale[];
  const movements = (movementResult.data ?? []) as Array<LubricantStockMovement & { from_station_id: string | null; to_station_id: string | null; created_at: string | null; reference: string | null; notes: string | null }>;
  const stationInventory = (stationInventoryResult.data ?? []) as Array<LubricantInventoryRow & { station_id: string; updated_at: string | null }>;
  const warehouseInventory = (warehouseInventoryResult.data ?? []) as Array<LubricantInventoryRow & { updated_at: string | null }>;

  const reportIds = Array.from(new Set(sales.map((row) => row.shift_report_id).filter(Boolean)));
  const stationIds = Array.from(
    new Set([...movements.map((row) => row.from_station_id), ...movements.map((row) => row.to_station_id), ...stationInventory.map((row) => row.station_id)].filter(Boolean))
  ) as string[];

  const [reportsResult, stationsResult] = await Promise.all([
    reportIds.length
      ? supabase.from("fuel_shift_reports").select("id, report_date, duty_name, status").in("id", reportIds)
      : Promise.resolve({ data: [], error: null }),
    stationIds.length ? supabase.from("fuel_stations").select("id, name").in("id", stationIds) : Promise.resolve({ data: [], error: null })
  ]);

  const secondaryErrors = [reportsResult.error, stationsResult.error].filter(Boolean);
  if (secondaryErrors.length > 0) {
    throw new Error(`Unable to load related report/station data. ${secondaryErrors[0]?.message ?? "Please retry or contact support."}`);
  }

  const productsById = new Map(products.map((item) => [item.id, item]));
  const reportsById = new Map(((reportsResult.data ?? []) as Array<{ id: string; report_date: string | null; duty_name: string | null }>).map((item) => [item.id, item]));
  const stationsById = new Map(((stationsResult.data ?? []) as Array<{ id: string; name: string | null }>).map((item) => [item.id, item]));

  const salesWithReport = sales.map((sale) => {
    const report = reportsById.get(sale.shift_report_id);
    return {
      ...sale,
      report_date: report?.report_date ?? null,
      duty_name: report?.duty_name ?? null
    };
  });

  const movementsWithNames = movements.map((movement) => ({
    ...movement,
    from_station_name: movement.from_station_id ? stationsById.get(movement.from_station_id)?.name ?? null : null,
    to_station_name: movement.to_station_id ? stationsById.get(movement.to_station_id)?.name ?? null : null,
    product_name: productsById.get(movement.lubricant_product_id)?.name ?? null
  }));

  const warehouseWithProduct = warehouseInventory.map((row) => {
    const product = productsById.get(row.lubricant_product_id);
    return { ...row, product_name: product?.name ?? null, sku: product?.sku ?? null, unit: product?.unit ?? null };
  });

  const stationWithProduct = stationInventory.map((row) => {
    const product = productsById.get(row.lubricant_product_id);
    return {
      ...row,
      station_name: stationsById.get(row.station_id)?.name ?? null,
      product_name: product?.name ?? null,
      sku: product?.sku ?? null,
      unit: product?.unit ?? null
    };
  });

  return {
    products,
    sales: salesWithReport,
    movements: movementsWithNames,
    warehouseInventory: warehouseWithProduct,
    stationInventory: stationWithProduct,
    analytics: buildLubricantsAnalytics({
      sales,
      products,
      movements,
      warehouseInventory,
      stationInventory
    })
  };
}
