import { canUseLiveData } from "@/lib/data/client";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";

export interface StationManagementRow {
  id: string;
  code: string;
  name: string;
  address: string | null;
  is_active: boolean;
  products_configured: number;
  pumps_count: number;
  shift_templates_count: number;
  inventory_location_code: string | null;
}

export interface StationManagementResult {
  role: string | null;
  canCreateStation: boolean;
  rows: StationManagementRow[];
}

export async function fetchStationManagementData(): Promise<StationManagementResult> {
  if (!canUseLiveData()) return { role: null, canCreateStation: false, rows: [] };

  const supabase = createSupabaseBrowserClient();
  const authResult = await supabase.auth.getUser();
  const userId = authResult.data.user?.id ?? null;

  const [stationsResult, roleResult] = await Promise.all([
    supabase
      .from("fuel_stations")
      .select("id, code, name, address, is_active")
      .order("name", { ascending: true }),
    userId ? supabase.from("profiles").select("role").eq("id", userId).single() : Promise.resolve({ data: null, error: null })
  ]);

  if (stationsResult.error) throw stationsResult.error;

  const stations = (stationsResult.data ?? []) as Array<{ id: string; code: string; name: string; address: string | null; is_active: boolean }>;
  if (stations.length === 0) {
    return { role: (roleResult.data as { role?: string } | null)?.role ?? null, canCreateStation: ((roleResult.data as { role?: string } | null)?.role ?? null) === "Owner", rows: [] };
  }

  const ids = stations.map((station) => station.id);
  const [productsResult, pumpsResult, shiftsResult, locationsResult] = await Promise.all([
    supabase.from("fuel_station_products").select("station_id").in("station_id", ids),
    supabase.from("fuel_pumps").select("station_id").in("station_id", ids).is("archived_at", null),
    supabase.from("fuel_shift_templates").select("station_id").in("station_id", ids).eq("is_active", true),
    supabase.from("fuel_inventory_locations").select("station_id, code").eq("location_type", "station").in("station_id", ids)
  ]);

  const errors = [productsResult.error, pumpsResult.error, shiftsResult.error, locationsResult.error].filter(Boolean);
  if (errors.length) throw errors[0];

  const countBy = (rows: Array<{ station_id: string }>) => rows.reduce<Record<string, number>>((acc, row) => {
    acc[row.station_id] = (acc[row.station_id] ?? 0) + 1;
    return acc;
  }, {});

  const productsCount = countBy((productsResult.data ?? []) as Array<{ station_id: string }>);
  const pumpsCount = countBy((pumpsResult.data ?? []) as Array<{ station_id: string }>);
  const shiftsCount = countBy((shiftsResult.data ?? []) as Array<{ station_id: string }>);
  const locationByStation = new Map(((locationsResult.data ?? []) as Array<{ station_id: string; code: string }>).map((x) => [x.station_id, x.code]));

  const role = (roleResult.data as { role?: string } | null)?.role ?? null;

  return {
    role,
    canCreateStation: role === "Owner",
    rows: stations.map((station) => ({
      ...station,
      products_configured: productsCount[station.id] ?? 0,
      pumps_count: pumpsCount[station.id] ?? 0,
      shift_templates_count: shiftsCount[station.id] ?? 0,
      inventory_location_code: locationByStation.get(station.id) ?? null
    }))
  };
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
      default_products: true,
      create_inventory_location: true
    }
  });

  if (error) throw error;
  return data as { station_id: string; location_id: string | null };
}
