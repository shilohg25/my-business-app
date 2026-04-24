"use client";

import { useEffect, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { canUseLiveData, listStations, type StationRow } from "@/lib/data/client";
import { getSupabaseConfigurationState } from "@/lib/supabase/client";

export function StationsClient() {
  const liveData = canUseLiveData();
  const config = getSupabaseConfigurationState();

  const [stations, setStations] = useState<StationRow[]>([]);
  const [loading, setLoading] = useState(liveData);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!liveData) {
      setLoading(false);
      return;
    }

    let active = true;
    setLoading(true);
    setError(null);

    listStations()
      .then((nextStations) => {
        if (active) setStations(nextStations);
      })
      .catch((err: Error) => {
        if (active) setError(err.message);
      })
      .finally(() => {
        if (active) setLoading(false);
      });

    return () => {
      active = false;
    };
  }, [liveData]);

  return (
    <div className="rounded-2xl border bg-white p-5">
      {!liveData ? (
        <p className="mb-4 rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
          Stations cannot load until Supabase is configured. {config.reason}
        </p>
      ) : null}

      {error ? <p className="mb-4 text-sm text-red-700">{error}</p> : null}
      {loading ? <p className="text-sm text-slate-500">Loading stations...</p> : null}

      {!loading && stations.length === 0 ? (
        <p className="text-sm text-slate-500">
          {liveData ? "No stations loaded. Run the seed SQL in Supabase." : "No live station data is available in setup mode."}
        </p>
      ) : null}

      {stations.length > 0 ? (
        <div className="grid gap-4 md:grid-cols-2">
          {stations.map((station) => (
            <div className="rounded-xl border p-4" key={station.id}>
              <div className="flex items-center justify-between gap-3">
                <div className="font-medium">{station.name}</div>
                <Badge>{station.is_active ? "Active" : "Inactive"}</Badge>
              </div>
              <div className="mt-1 text-sm text-slate-500">{station.code}</div>
              <div className="mt-3 text-sm">{station.official_report_header ?? "No report header set."}</div>
            </div>
          ))}
        </div>
      ) : null}
    </div>
  );
}
