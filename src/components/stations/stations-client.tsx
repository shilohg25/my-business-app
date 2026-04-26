"use client";

import { useEffect, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { SimpleModal } from "@/components/ui/simple-modal";
import { createStation, fetchStationManagementData, type StationManagementRow } from "@/lib/data/stations";
import { canUseLiveData } from "@/lib/data/client";
import { isBlank, getErrorMessage } from "@/lib/utils/forms";
import { appPath, getSupabaseConfigurationState } from "@/lib/supabase/client";

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

  const [name, setName] = useState("");
  const [address, setAddress] = useState("");
  const [phone, setPhone] = useState("");
  const [header, setHeader] = useState("");
  const [modalError, setModalError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [openModal, setOpenModal] = useState(false);

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
      .catch((err) => setError(getErrorMessage(err)))
      .finally(() => setLoading(false));
  }, [liveData]);

  function closeCreateModal() {
    if (submitting) return;
    setOpenModal(false);
  }

  async function submitCreateStation(event: React.FormEvent) {
    event.preventDefault();
    if (!liveData || !canCreateStation) return;

    if (isBlank(name)) {
      setModalError("Station name is required.");
      return;
    }

    setSubmitting(true);
    setError(null);
    setMessage(null);
    setModalError(null);

    try {
      const created = await createStation({
        name: name.trim(),
        address,
        phone,
        official_report_header: header
      });
      setMessage(`Station created. Station id: ${created.station_id}`);
      setName("");
      setAddress("");
      setPhone("");
      setHeader("");
      setOpenModal(false);
      await reload();
    } catch (err) {
      setModalError(getErrorMessage(err));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="space-y-4 overflow-x-hidden">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Stations</h1>
          <p className="text-sm text-slate-500">Manage multiple station profiles, setup readiness, and onboarding.</p>
        </div>
        {canCreateStation ? (
          <Button onClick={() => setOpenModal(true)} type="button">
            New Station
          </Button>
        ) : null}
      </div>

      {!liveData ? <p className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">Stations cannot load until Supabase is configured. {config.reason}</p> : null}
      {error ? <p className="text-sm text-red-700">{error}</p> : null}
      {message ? <p className="text-sm text-emerald-700">{message}</p> : null}
      {loading ? <p className="text-sm text-slate-500">Loading stations...</p> : null}
      {roleChecking ? <p className="text-sm text-slate-500">Checking role...</p> : null}
      {!roleChecking && !canCreateStation && role ? <p className="text-sm text-amber-700">Only Owner profiles can create stations.</p> : null}

      <SimpleModal
        description="Station code is generated automatically from the station name."
        onClose={closeCreateModal}
        open={openModal}
        title="New Station"
      >
        <form className="space-y-3" onSubmit={submitCreateStation}>
          <div className="grid gap-2">
            <Input aria-label="Station name" placeholder="Station name" value={name} onChange={(event) => setName(event.target.value)} />
            <Input aria-label="Address" placeholder="Address" value={address} onChange={(event) => setAddress(event.target.value)} />
            <Input aria-label="Phone" placeholder="Phone" value={phone} onChange={(event) => setPhone(event.target.value)} />
            <Input
              aria-label="Official report header"
              placeholder="Official report header"
              value={header}
              onChange={(event) => setHeader(event.target.value)}
            />
          </div>
          {modalError ? <p className="text-sm text-red-700">{modalError}</p> : null}
          <div className="flex justify-end gap-2">
            <Button disabled={submitting} onClick={closeCreateModal} type="button" variant="outline">
              Cancel
            </Button>
            <Button disabled={submitting} type="submit">
              {submitting ? "Creating..." : "Create station"}
            </Button>
          </div>
        </form>
      </SimpleModal>

      <div className="rounded-2xl border bg-white p-4 sm:p-5">
        <h2 className="text-lg font-semibold">Station list</h2>
        {stations.length === 0 ? <p className="mt-2 text-sm text-slate-500">No stations found.</p> : null}
        {stations.length > 0 ? (
          <div className="mt-3 overflow-x-auto">
            <table className="w-full min-w-[860px] text-sm">
              <thead className="text-left text-slate-500">
                <tr>
                  <th className="py-2">Station</th>
                  <th>Address</th>
                  <th>Phone</th>
                  <th>Active</th>
                  <th>Fuel baseline status</th>
                  <th>Linked inventory location</th>
                  <th>Action</th>
                </tr>
              </thead>
              <tbody>
                {stations.map((station) => (
                  <tr className="border-t" key={station.id}>
                    <td className="py-2">
                      <div className="font-medium">{station.name}</div>
                      <div className="text-xs text-slate-500">Code: {station.code}</div>
                    </td>
                    <td>{station.address ?? "-"}</td>
                    <td>{station.phone ?? "-"}</td>
                    <td>
                      <Badge>{station.is_active ? "Active" : "Inactive"}</Badge>
                    </td>
                    <td>{station.fuel_baseline_status}</td>
                    <td>{station.inventory_location_code ?? "-"}</td>
                    <td>
                      <a className="text-blue-700 underline" href={`${appPath("/inventory/fuel/")}?station_id=${station.id}`}>
                        View Fuel Inventory
                      </a>
                    </td>
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
