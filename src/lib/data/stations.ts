import { canUseLiveData } from "@/lib/data/client";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";

export interface StationManagementRow {
  id: string;
  code: string;
  name: string;
  address: string | null;
  is_active: boolean;
  official_report_header: string | null;
  products_configured: number;
  pumps_count: number;
  shift_templates_count: number;
}

export async function fetchStationManagementData(): Promise<StationManagementRow[]> {
  if (!canUseLiveData()) return [];

  const supabase = createSupabaseBrowserClient();
  const stationsResult = await supabase
    .from("fuel_stations")
    .select("id, code, name, address, is_active, official_report_header")
    .order("name", { ascending: true });

  if (stationsResult.error) throw stationsResult.error;

  const stations = (stationsResult.data ?? []) as Array<{ id: string; code: string; name: string; address: string | null; is_active: boolean; official_report_header: string | null }>;
  if (stations.length === 0) return [];

  const ids = stations.map((station) => station.id);
  const [productsResult, pumpsResult, shiftsResult] = await Promise.all([
    supabase.from("fuel_station_products").select("station_id").in("station_id", ids),
    supabase.from("fuel_pumps").select("station_id").in("station_id", ids).is("archived_at", null),
    supabase.from("fuel_shift_templates").select("station_id").in("station_id", ids).eq("is_active", true)
  ]);

  const errors = [productsResult.error, pumpsResult.error, shiftsResult.error].filter(Boolean);
  if (errors.length) throw errors[0];

  const countBy = (rows: Array<{ station_id: string }>) => rows.reduce<Record<string, number>>((acc, row) => {
    acc[row.station_id] = (acc[row.station_id] ?? 0) + 1;
    return acc;
  }, {});

  const productsCount = countBy((productsResult.data ?? []) as Array<{ station_id: string }>);
  const pumpsCount = countBy((pumpsResult.data ?? []) as Array<{ station_id: string }>);
  const shiftsCount = countBy((shiftsResult.data ?? []) as Array<{ station_id: string }>);

  return stations.map((station) => ({
    ...station,
    products_configured: productsCount[station.id] ?? 0,
    pumps_count: pumpsCount[station.id] ?? 0,
    shift_templates_count: shiftsCount[station.id] ?? 0
  }));
}

export async function createStationViaRpc(payload: {
  code: string;
  name: string;
  address?: string;
  phone?: string;
  tin?: string;
  business_permit?: string;
  official_report_header?: string;
}) {
  if (!canUseLiveData()) throw new Error("Supabase is not configured");

  const supabase = createSupabaseBrowserClient();
  const { data, error } = await supabase.rpc("fuel_create_station", {
    payload: {
      ...payload,
      add_default_products: true
    }
  });

  if (error) throw error;
  return data as string;
}
