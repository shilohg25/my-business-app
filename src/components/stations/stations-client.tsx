"use client";

import { useEffect, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { canUseLiveData } from "@/lib/data/client";
import { appPath, getSupabaseConfigurationState } from "@/lib/supabase/client";
import { createStation, fetchStationManagementData, type StationManagementRow } from "@/lib/data/stations";

export function StationsClient() {
  const liveData = canUseLiveData();
  const config = getSupabaseConfigurationState();

  const [stations, setStations] = useState<StationManagementRow[]>([]);
  const [role, setRole] = useState<string | null>(null);
  const [canCreateStation, setCanCreateStation] = useState(false);
  const [loading, setLoading] = useState(liveData);
  const [roleChecking, setRoleChecking] = useState(liveData);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const [code, setCode] = useState("");
  const [name, setName] = useState("");
  const [address, setAddress] = useState("");
  const [phone, setPhone] = useState("");
  const [tin, setTin] = useState("");
  const [businessPermit, setBusinessPermit] = useState("");
  const [header, setHeader] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const reload = async () => {
    if (!liveData) return;
    const data = await fetchStationManagementData();
    setStations(data.rows);
    setRole(data.role);
    setCanCreateStation(data.canCreateStation);
    setRoleChecking(false);
  };

  useEffect(() => {
    if (!liveData) {
      setLoading(false);
      return;
    }

    setLoading(true);
    setRoleChecking(true);
    setError(null);

    reload()
      .catch((err: Error) => setError(err.message))
      .finally(() => setLoading(false));
  }, [liveData]);

  async function submitCreateStation(event: React.FormEvent) {
    event.preventDefault();
    if (!liveData) return;

    setSubmitting(true);
    setError(null);
    setMessage(null);
    try {
      const created = await createStation({
        code,
        name,
        address,
        phone,
        tin,
        business_permit: businessPermit,
        official_report_header: header
      });
      setMessage(`Station created. Station id: ${created.station_id}`);
      setCode("");
      setName("");
      setAddress("");
      setPhone("");
      setTin("");
      setBusinessPermit("");
      setHeader("");
      await reload();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to create station");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="space-y-4">
      {!liveData ? <p className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">Stations cannot load until Supabase is configured. {config.reason}</p> : null}
      {error ? <p className="text-sm text-red-700">{error}</p> : null}
      {message ? <p className="text-sm text-emerald-700">{message}</p> : null}
      {loading ? <p className="text-sm text-slate-500">Loading stations...</p> : null}
      {roleChecking ? <p className="text-sm text-slate-500">Checking role...</p> : null}

      <div className="rounded-2xl border bg-white p-5">
        <h2 className="text-lg font-semibold">Add station</h2>
        {!canCreateStation && !roleChecking ? <p className="mt-2 text-sm text-amber-700">{role ? "Only Owner profiles can create stations." : "No active profile found for this login."}</p> : null}
        <form className="mt-3 space-y-2" onSubmit={submitCreateStation}>
          <div className="grid gap-2 md:grid-cols-2">
            <Input placeholder="Code" value={code} onChange={(e) => setCode(e.target.value)} required />
            <Input placeholder="Name" value={name} onChange={(e) => setName(e.target.value)} required />
            <Input placeholder="Address" value={address} onChange={(e) => setAddress(e.target.value)} />
            <Input placeholder="Phone" value={phone} onChange={(e) => setPhone(e.target.value)} />
            <Input placeholder="TIN" value={tin} onChange={(e) => setTin(e.target.value)} />
            <Input placeholder="Business permit" value={businessPermit} onChange={(e) => setBusinessPermit(e.target.value)} />
          </div>
          <Input placeholder="Official report header" value={header} onChange={(e) => setHeader(e.target.value)} />
          <Button type="submit" disabled={submitting || !canCreateStation}>{submitting ? "Creating..." : "Create station"}</Button>
        </form>
      </div>

      <div className="rounded-2xl border bg-white p-5">
        <h2 className="text-lg font-semibold">Station list</h2>
        {stations.length === 0 ? <p className="mt-2 text-sm text-slate-500">No stations found.</p> : null}
        {stations.length > 0 ? (
          <div className="mt-3 overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="text-left text-slate-500"><tr><th className="py-2">Code</th><th>Name</th><th>Address</th><th>Active</th><th className="text-right">Products configured</th><th className="text-right">Pumps count</th><th className="text-right">Shift templates count</th><th>Linked inventory location</th><th>Fuel baseline</th><th>DSP baseline present</th><th>Action</th></tr></thead>
              <tbody>
                {stations.map((station) => (
                  <tr className="border-t" key={station.id}>
                    <td className="py-2">{station.code}</td>
                    <td>{station.name}</td>
                    <td>{station.address ?? "-"}</td>
                    <td><Badge>{station.is_active ? "Active" : "Inactive"}</Badge></td>
                    <td className="text-right">{station.products_configured}</td>
                    <td className="text-right">{station.pumps_count}</td>
                    <td className="text-right">{station.shift_templates_count}</td>
                    <td>{station.inventory_location_code ?? "-"}</td>
                    <td>{station.fuel_baseline_status}</td>
                    <td>{station.has_diesel_baseline ? "D" : "-"}/{station.has_special_baseline ? "S" : "-"}/{station.has_unleaded_baseline ? "U" : "-"}</td>
                    <td><a className="text-blue-700 underline" href={`${appPath("/inventory/fuel/")}?station_id=${station.id}`}>Set Fuel Opening Baseline</a></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : null}
      </div>
    </div>
  );
}
