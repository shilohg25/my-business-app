import { canUseLiveData } from "@/lib/data/client";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";

export interface BodegaInventoryRow {
  id: string;
  lubricant_product_id: string;
  quantity_on_hand: number | string | null;
  reorder_level: number | string | null;
  updated_at: string | null;
  sku: string | null;
  product_name: string | null;
  unit: string | null;
  default_unit_price: number | string | null;
}

export interface BodegaPurchaseOrderRow {
  id: string;
  order_date: string;
  received_date: string | null;
  order_number: string | null;
  status: string;
  total_amount: number | string | null;
  supplier_name: string | null;
}

export interface BodegaTransferRow {
  id: string;
  created_at: string | null;
  quantity: number | string | null;
  reference: string | null;
  notes: string | null;
  product_name: string | null;
  station_name: string | null;
}

export interface BodegaStationOption {
  id: string;
  name: string;
}

export interface BodegaDataResult {
  summary: {
    totalSkus: number;
    totalUnitsOnHand: number;
    lowStockSkus: number;
    purchasesThisMonth: number;
    transfersThisMonth: number;
  };
  inventory: BodegaInventoryRow[];
  purchaseHistory: BodegaPurchaseOrderRow[];
  recentTransfers: BodegaTransferRow[];
  stations: BodegaStationOption[];
  products: Array<{ id: string; name: string; sku: string | null }>;
}

function asNumber(value: unknown) {
  const parsed = Number(value ?? Number.NaN);
  return Number.isFinite(parsed) ? parsed : 0;
}

function monthStart() {
  const now = new Date();
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1)).toISOString().slice(0, 10);
}

export async function fetchBodegaData(): Promise<BodegaDataResult> {
  if (!canUseLiveData()) {
    return {
      summary: { totalSkus: 0, totalUnitsOnHand: 0, lowStockSkus: 0, purchasesThisMonth: 0, transfersThisMonth: 0 },
      inventory: [],
      purchaseHistory: [],
      recentTransfers: [],
      stations: [],
      products: []
    };
  }

  const supabase = createSupabaseBrowserClient();
  const start = monthStart();

  const [productsResult, warehouseResult, purchaseOrdersResult, purchaseCountResult, transferCountResult, transferResult, stationsResult] = await Promise.all([
    supabase.from("fuel_lubricant_products").select("id, name, sku, unit, default_unit_price").order("name", { ascending: true }),
    supabase.from("fuel_warehouse_lubricant_inventory").select("id, lubricant_product_id, quantity_on_hand, reorder_level, updated_at"),
    supabase
      .from("fuel_lubricant_purchase_orders")
      .select("id, order_date, received_date, order_number, status, total_amount, supplier_id")
      .order("received_date", { ascending: false })
      .limit(50),
    supabase
      .from("fuel_lubricant_purchase_orders")
      .select("id", { count: "exact", head: true })
      .gte("received_date", start),
    supabase
      .from("fuel_lubricant_stock_movements")
      .select("id", { count: "exact", head: true })
      .eq("movement_type", "transfer_out")
      .gte("created_at", `${start}T00:00:00Z`),
    supabase
      .from("fuel_lubricant_stock_movements")
      .select("id, to_station_id, lubricant_product_id, quantity, reference, notes, created_at")
      .eq("movement_type", "transfer_out")
      .order("created_at", { ascending: false })
      .limit(50),
    supabase.from("fuel_stations").select("id, name").order("name", { ascending: true })
  ]);

  const primaryErrors = [productsResult.error, warehouseResult.error, purchaseOrdersResult.error, purchaseCountResult.error, transferCountResult.error, transferResult.error, stationsResult.error].filter(Boolean);
  if (primaryErrors.length) {
    throw new Error(primaryErrors[0]?.message ?? "Unable to load bodega data");
  }

  const products = (productsResult.data ?? []) as Array<{ id: string; name: string; sku: string | null; unit: string | null; default_unit_price: number | string | null }>;
  const warehouse = (warehouseResult.data ?? []) as Array<{ id: string; lubricant_product_id: string; quantity_on_hand: number | string | null; reorder_level: number | string | null; updated_at: string | null }>;
  const purchaseHistoryRaw = (purchaseOrdersResult.data ?? []) as Array<{ id: string; order_date: string; received_date: string | null; order_number: string | null; status: string; total_amount: number | string | null; supplier_id: string | null }>;
  const transfersRaw = (transferResult.data ?? []) as Array<{ id: string; created_at: string | null; to_station_id: string | null; lubricant_product_id: string; quantity: number | string | null; reference: string | null; notes: string | null }>;
  const stations = (stationsResult.data ?? []) as Array<{ id: string; name: string }>;

  const supplierIds = Array.from(new Set(purchaseHistoryRaw.map((row) => row.supplier_id).filter(Boolean))) as string[];
  const suppliersResult = supplierIds.length
    ? await supabase.from("fuel_suppliers").select("id, name").in("id", supplierIds)
    : { data: [], error: null };

  if (suppliersResult.error) {
    throw new Error(suppliersResult.error.message);
  }

  const supplierById = new Map(((suppliersResult.data ?? []) as Array<{ id: string; name: string | null }>).map((row) => [row.id, row.name]));
  const productById = new Map(products.map((row) => [row.id, row]));
  const stationById = new Map(stations.map((row) => [row.id, row.name]));

  const inventory: BodegaInventoryRow[] = warehouse.map((row) => {
    const product = productById.get(row.lubricant_product_id);
    return {
      ...row,
      sku: product?.sku ?? null,
      product_name: product?.name ?? null,
      unit: product?.unit ?? null,
      default_unit_price: product?.default_unit_price ?? null
    };
  });

  const purchaseHistory: BodegaPurchaseOrderRow[] = purchaseHistoryRaw.map((row) => ({
    ...row,
    supplier_name: row.supplier_id ? supplierById.get(row.supplier_id) ?? null : null
  }));

  const recentTransfers: BodegaTransferRow[] = transfersRaw.map((row) => ({
    id: row.id,
    created_at: row.created_at,
    quantity: row.quantity,
    reference: row.reference,
    notes: row.notes,
    product_name: productById.get(row.lubricant_product_id)?.name ?? null,
    station_name: row.to_station_id ? stationById.get(row.to_station_id) ?? null : null
  }));

  return {
    summary: {
      totalSkus: inventory.length,
      totalUnitsOnHand: inventory.reduce((sum, row) => sum + asNumber(row.quantity_on_hand), 0),
      lowStockSkus: inventory.filter((row) => asNumber(row.quantity_on_hand) <= asNumber(row.reorder_level)).length,
      purchasesThisMonth: purchaseCountResult.count ?? 0,
      transfersThisMonth: transferCountResult.count ?? 0
    },
    inventory,
    purchaseHistory,
    recentTransfers,
    stations,
    products: products.map((row) => ({ id: row.id, name: row.name, sku: row.sku }))
  };
}
