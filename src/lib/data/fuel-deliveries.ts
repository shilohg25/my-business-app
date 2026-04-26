import { canUseLiveData } from "@/lib/data/client";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";

export interface AllowedDeliveryStation {
  station_id: string;
  station_name: string;
  station_code: string;
}

export interface FuelDeliveryBatchItemInput {
  product_code: string;
  liters: number;
  unit_cost?: number | null;
  tank_id?: string | null;
  notes?: string | null;
}

export interface FuelDeliveryBatchPayload {
  station_id: string;
  delivery_date: string;
  supplier_name?: string | null;
  invoice_number?: string | null;
  delivery_reference?: string | null;
  notes?: string | null;
  items: FuelDeliveryBatchItemInput[];
}

export function normalizeDeliveryProductCode(raw: string) {
  const normalized = String(raw ?? "").trim().toUpperCase();
  if (normalized === "REGULAR" || normalized === "ULG") return "UNLEADED";
  if (normalized === "ADO") return "DIESEL";
  if (normalized === "SPU") return "SPECIAL";
  if (["DIESEL", "SPECIAL", "UNLEADED"].includes(normalized)) return normalized;
  return normalized;
}

export function buildFuelDeliveryBatchPayload(payload: FuelDeliveryBatchPayload): FuelDeliveryBatchPayload {
  if (!payload.station_id) throw new Error("Station is required");
  if (!payload.delivery_date) throw new Error("Delivery date is required");
  if (!Array.isArray(payload.items) || payload.items.length === 0) throw new Error("At least one product row is required");

  const items = payload.items.map((item) => {
    const productCode = normalizeDeliveryProductCode(item.product_code);
    if (!["DIESEL", "SPECIAL", "UNLEADED"].includes(productCode)) throw new Error("Product must be Diesel, Special, or Unleaded");
    if (!(Number(item.liters) > 0)) throw new Error("Liters must be greater than zero");
    return {
      product_code: productCode,
      liters: Number(item.liters),
      unit_cost: item.unit_cost == null ? null : Number(item.unit_cost),
      tank_id: item.tank_id || null,
      notes: item.notes || null
    };
  });

  return { ...payload, items };
}

export async function fetchAllowedDeliveryStations() {
  if (!canUseLiveData()) return [] as AllowedDeliveryStation[];
  const supabase = createSupabaseBrowserClient();
  const { data, error } = await supabase.rpc("fuel_get_my_station_assignments");
  if (error) throw error;
  return (data ?? []) as AllowedDeliveryStation[];
}

export async function recordFuelDeliveryBatch(payload: FuelDeliveryBatchPayload) {
  if (!canUseLiveData()) throw new Error("Supabase is not configured");
  const supabase = createSupabaseBrowserClient();
  const sanitizedPayload = buildFuelDeliveryBatchPayload(payload);
  const { data, error } = await supabase.rpc("fuel_record_fuel_delivery_batch", { payload: sanitizedPayload });
  if (error) throw error;
  return data as string;
}
