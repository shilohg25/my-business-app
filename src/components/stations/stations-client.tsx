"use client";

import { useEffect, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { listStations, type StationRow } from "@/lib/data/client";

export function StationsClient() {
  const [stations, setStations] = useState<StationRow[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    listStations().then(setStations).catch((err: Error) => setError(err.message));
  }, []);

  return (
    <div className="rounded-2xl border bg-white p-5">
      {error ? <p className="mb-4 text-sm text-red-700">{error}</p> : null}
      {stations.length === 0 ? <p className="text-sm text-slate-500">No stations loaded. Run the seed SQL in Supabase.</p> : null}
      <div className="grid gap-4 md:grid-cols-2">
        {stations.map((station) => (
          <div className="rounded-xl border p-4" key={station.id}>
            <div className="flex items-center justify-between"><div className="font-medium">{station.name}</div><Badge>{station.is_active ? "Active" : "Inactive"}</Badge></div>
            <div className="mt-1 text-sm text-slate-500">{station.code}</div>
            <div className="mt-3 text-sm">{station.official_report_header ?? "No report header set."}</div>
          </div>
        ))}
      </div>
    </div>
  );
}
