import { canUseLiveData } from "@/lib/data/client";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";

function asNumber(value: unknown) {
  const parsed = Number(value ?? Number.NaN);
  return Number.isFinite(parsed) ? parsed : 0;
}

export interface LubricantsResult {
  warehouseInventory: Array<{ id: string; location_id: string; product_name: string | null; sku: string | null; quantity_on_hand: number | string | null; reorder_level: number | string | null }>;
  analytics: { totalSalesAmount: number; totalUnitsSold: number; stationLowStockCount: number; warehouseLowStockCount: number; warnings: string[] };
  stations: Array<{ id: string; name: string }>;
  stationInventory: Array<{ id: string; station_id: string; station_name: string | null; sku: string | null; product_name: string | null; quantity_on_hand: number | string | null; reorder_level: number | string | null }>;
  sales: Array<{ id: string; shift_report_id: string; report_date: string | null; station_id: string | null; station_name: string | null; duty_name: string | null; product_name_snapshot: string; quantity: number | string | null; unit_price: number | string | null; amount: number | string | null; lubricant_product_id: string | null }>;
  movements: Array<{ id: string; created_at: string | null; movement_type: string; quantity: number | string | null; product_name: string | null; from_location_name: string | null; to_location_name: string | null; shift_report_id: string | null; reference: string | null; notes: string | null; from_location_id: string | null; to_location_id: string | null }>;
  warnings: string[];
}

export async function fetchLubricantControlData(options: { startDate: string; endDate: string }): Promise<LubricantsResult> {
  if (!canUseLiveData()) return { stations: [], stationInventory: [], sales: [], movements: [], warnings: [], warehouseInventory: [], analytics: { totalSalesAmount: 0, totalUnitsSold: 0, stationLowStockCount: 0, warehouseLowStockCount: 0, warnings: [] } };
  const supabase = createSupabaseBrowserClient();

  const [stationsResult, productsResult, locationsResult, inventoryResult, movementResult, reportsResult] = await Promise.all([
    supabase.from("fuel_stations").select("id, name").order("name", { ascending: true }),
    supabase.from("fuel_lubricant_products").select("id, name, sku"),
    supabase.from("fuel_inventory_locations").select("id, station_id, name, location_type").eq("is_active", true),
    supabase.from("fuel_location_lubricant_inventory").select("id, location_id, lubricant_product_id, quantity_on_hand, reorder_level"),
    supabase.from("fuel_location_lubricant_movements").select("id, created_at, lubricant_product_id, movement_type, quantity, from_location_id, to_location_id, shift_report_id, reference, notes").order("created_at", { ascending: false }).limit(300),
    supabase.from("fuel_shift_reports").select("id, report_date, duty_name, station_id").gte("report_date", options.startDate).lte("report_date", options.endDate)
  ]);

  const errors = [stationsResult.error, productsResult.error, locationsResult.error, inventoryResult.error, movementResult.error, reportsResult.error].filter(Boolean);
  if (errors.length) throw errors[0];

  const reportIds = ((reportsResult.data ?? []) as Array<{ id: string }>).map((x) => x.id);
  const salesResult = reportIds.length
    ? await supabase.from("fuel_lubricant_sales").select("id, shift_report_id, lubricant_product_id, product_name_snapshot, quantity, unit_price, amount").in("shift_report_id", reportIds)
    : { data: [], error: null };
  if (salesResult.error) throw salesResult.error;

  const stations = (stationsResult.data ?? []) as Array<{ id: string; name: string }>;
  const products = new Map(((productsResult.data ?? []) as Array<{ id: string; name: string; sku: string | null }>).map((p) => [p.id, p]));
  const locations = (locationsResult.data ?? []) as Array<{ id: string; station_id: string | null; name: string; location_type: string }>;
  const locationById = new Map(locations.map((x) => [x.id, x]));
  const reports = new Map(((reportsResult.data ?? []) as Array<{ id: string; report_date: string | null; duty_name: string | null; station_id: string | null }>).map((r) => [r.id, r]));


  const warehouseInventory = ((inventoryResult.data ?? []) as Array<{ id: string; location_id: string; lubricant_product_id: string; quantity_on_hand: number | string | null; reorder_level: number | string | null }>)
    .filter((row) => locationById.get(row.location_id)?.location_type === "bodega")
    .map((row) => ({
      id: row.id,
      location_id: row.location_id,
      product_name: products.get(row.lubricant_product_id)?.name ?? null,
      sku: products.get(row.lubricant_product_id)?.sku ?? null,
      quantity_on_hand: row.quantity_on_hand,
      reorder_level: row.reorder_level
    }));

  const stationInventory = ((inventoryResult.data ?? []) as Array<{ id: string; location_id: string; lubricant_product_id: string; quantity_on_hand: number | string | null; reorder_level: number | string | null }>)
    .filter((row) => locationById.get(row.location_id)?.location_type === "station")
    .map((row) => ({
      id: row.id,
      station_id: locationById.get(row.location_id)?.station_id ?? "",
      station_name: stations.find((s) => s.id === locationById.get(row.location_id)?.station_id)?.name ?? null,
      sku: products.get(row.lubricant_product_id)?.sku ?? null,
      product_name: products.get(row.lubricant_product_id)?.name ?? null,
      quantity_on_hand: row.quantity_on_hand,
      reorder_level: row.reorder_level
    }));

  const movements = ((movementResult.data ?? []) as Array<{ id: string; created_at: string | null; movement_type: string; quantity: number | string | null; lubricant_product_id: string; from_location_id: string | null; to_location_id: string | null; shift_report_id: string | null; reference: string | null; notes: string | null }>).map((row) => ({
    ...row,
    product_name: products.get(row.lubricant_product_id)?.name ?? null,
    from_location_name: row.from_location_id ? locationById.get(row.from_location_id)?.name ?? null : null,
    to_location_name: row.to_location_id ? locationById.get(row.to_location_id)?.name ?? null : null
  }));

  const sales = ((salesResult.data ?? []) as Array<{ id: string; shift_report_id: string; lubricant_product_id: string | null; product_name_snapshot: string; quantity: number | string | null; unit_price: number | string | null; amount: number | string | null }>).map((sale) => {
    const report = reports.get(sale.shift_report_id);
    return { ...sale, report_date: report?.report_date ?? null, station_id: report?.station_id ?? null, station_name: stations.find((x) => x.id === report?.station_id)?.name ?? null, duty_name: report?.duty_name ?? null };
  });

  const missingSalesMovement = sales.filter((sale) => !movements.some((movement) => movement.movement_type === "sale" && movement.shift_report_id === sale.shift_report_id)).length;
  const lowStockCount = stationInventory.filter((row) => asNumber(row.quantity_on_hand) <= asNumber(row.reorder_level)).length;

  const warnings = [
    missingSalesMovement > 0 ? `${missingSalesMovement} lubricant sale rows have no inventory movement.` : "",
    lowStockCount > 0 ? `${lowStockCount} station inventory rows are at/below reorder level.` : ""
  ].filter(Boolean);

  return {
    stations,
    stationInventory,
    sales,
    movements,
    warnings,
    warehouseInventory,
    analytics: {
      totalSalesAmount: sales.reduce((sum, row) => sum + asNumber(row.amount), 0),
      totalUnitsSold: sales.reduce((sum, row) => sum + asNumber(row.quantity), 0),
      stationLowStockCount: lowStockCount,
      warehouseLowStockCount: warehouseInventory.filter((row) => asNumber(row.quantity_on_hand) <= asNumber(row.reorder_level)).length,
      warnings
    }
  };
}
