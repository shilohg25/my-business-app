import { canUseLiveData } from "@/lib/data/client";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";

export interface BodegaInventoryRow {
  id: string;
  location_id: string;
  bodega_name: string | null;
  lubricant_product_id: string;
  quantity_on_hand: number | string | null;
  reorder_level: number | string | null;
  updated_at: string | null;
  sku: string | null;
  product_name: string | null;
}

export interface BodegaDataResult {
  locations: Array<{ id: string; code: string; name: string; address: string | null; is_active: boolean }>;
  stations: Array<{ id: string; code: string; name: string }>;
  inventory: BodegaInventoryRow[];
  products: Array<{ id: string; name: string; sku: string | null }>;
}

export async function fetchBodegaData(): Promise<BodegaDataResult> {
  if (!canUseLiveData()) return { locations: [], stations: [], inventory: [], products: [] };

  const supabase = createSupabaseBrowserClient();
  const [locationsResult, inventoryResult, productsResult, stationsResult] = await Promise.all([
    supabase.from("fuel_inventory_locations").select("id, code, name, address, is_active").eq("location_type", "bodega").order("name", { ascending: true }),
    supabase.from("fuel_location_lubricant_inventory").select("id, location_id, lubricant_product_id, quantity_on_hand, reorder_level, updated_at"),
    supabase.from("fuel_lubricant_products").select("id, name, sku").order("name", { ascending: true }),
    supabase.from("fuel_inventory_locations").select("id, code, name").eq("location_type", "station").order("name", { ascending: true })
  ]);

  const errors = [locationsResult.error, inventoryResult.error, productsResult.error, stationsResult.error].filter(Boolean);
  if (errors.length) throw errors[0];

  const locations = (locationsResult.data ?? []) as Array<{ id: string; code: string; name: string; address: string | null; is_active: boolean }>;
  const stations = (stationsResult.data ?? []) as Array<{ id: string; code: string; name: string }>;
  const products = (productsResult.data ?? []) as Array<{ id: string; name: string; sku: string | null }>;
  const inventoryRaw = (inventoryResult.data ?? []) as Array<{ id: string; location_id: string; lubricant_product_id: string; quantity_on_hand: number | string | null; reorder_level: number | string | null; updated_at: string | null }>;

  const productsById = new Map(products.map((row) => [row.id, row]));
  const bodegaById = new Map(locations.map((row) => [row.id, row.name]));

  const inventory = inventoryRaw
    .filter((row) => bodegaById.has(row.location_id))
    .map((row) => ({
      ...row,
      bodega_name: bodegaById.get(row.location_id) ?? null,
      sku: productsById.get(row.lubricant_product_id)?.sku ?? null,
      product_name: productsById.get(row.lubricant_product_id)?.name ?? null
    }));

  return { locations, stations, inventory, products };
}

export async function createBodega(payload: { code: string; name: string; address?: string; notes?: string }) {
  const supabase = createSupabaseBrowserClient();
  const { data, error } = await supabase.rpc("fuel_create_bodega", { payload });
  if (error) throw error;
  return data as string;
}
