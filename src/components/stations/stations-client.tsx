"use client";

import { useEffect, useMemo, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { SimpleModal } from "@/components/ui/simple-modal";
import {
  archiveStationMeter,
  createStation,
  fetchStationManagementData,
  upsertStationMeter,
  type StationManagementRow,
  type StationMeterRow
} from "@/lib/data/stations";
import { canUseLiveData } from "@/lib/data/client";
import { isBlank, getErrorMessage } from "@/lib/utils/forms";
import { appPath, getSupabaseConfigurationState } from "@/lib/supabase/client";

const PRODUCT_OPTIONS: Array<StationMeterRow["product_type"]> = ["DIESEL", "SPECIAL", "UNLEADED"];

type DraftByStation = Record<string, { product_type: StationMeterRow["product_type"]; meter_label: string; is_active: boolean }>;

export function StationsClient() {
  const liveData = canUseLiveData();
  const config = getSupabaseConfigurationState();

  const [stations, setStations] = useState<StationManagementRow[]>([]);
  const [role, setRole] = useState<string | null>(null);
  const [canCreateStation, setCanCreateStation] = useState(false);
  const [canManageMeters, setCanManageMeters] = useState(false);
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

  const [meterDrafts, setMeterDrafts] = useState<DraftByStation>({});
  const [meterSubmitting, setMeterSubmitting] = useState<string | null>(null);

  const reload = async () => {
    if (!liveData) return;
    const data = await fetchStationManagementData();
    setStations(data.rows);
    setRole(data.role);
    setCanCreateStation(data.canCreateStation);
    setCanManageMeters(data.canManageMeters);
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

  const stationOrder = useMemo(() => [...stations].sort((a, b) => a.name.localeCompare(b.name)), [stations]);

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

  function readStationDraft(stationId: string) {
    return meterDrafts[stationId] ?? { product_type: "DIESEL", meter_label: "", is_active: true };
  }

  function patchDraft(stationId: string, next: Partial<DraftByStation[string]>) {
    const current = readStationDraft(stationId);
    setMeterDrafts((prev) => ({
      ...prev,
      [stationId]: { ...current, ...next }
    }));
  }

  async function submitNewMeter(stationId: string) {
    if (!canManageMeters) return;
    const draft = readStationDraft(stationId);
    if (isBlank(draft.meter_label)) {
      setError("Meter label is required.");
      return;
    }

    setMeterSubmitting(stationId);
    setError(null);
    setMessage(null);
    try {
      await upsertStationMeter({
        station_id: stationId,
        product_type: draft.product_type,
        meter_label: draft.meter_label.trim(),
        is_active: draft.is_active
      });
      setMessage("Station meter saved.");
      setMeterDrafts((prev) => ({
        ...prev,
        [stationId]: { product_type: "DIESEL", meter_label: "", is_active: true }
      }));
      await reload();
    } catch (err) {
      setError(getErrorMessage(err));
    } finally {
      setMeterSubmitting(null);
    }
  }

  async function updateMeterField(stationId: string, meter: StationMeterRow, patch: Partial<StationMeterRow>) {
    if (!canManageMeters) return;
    setMeterSubmitting(stationId);
    setError(null);
    setMessage(null);
    try {
      await upsertStationMeter({
        id: meter.id,
        station_id: meter.station_id,
        product_type: patch.product_type ?? meter.product_type,
        meter_label: patch.meter_label ?? meter.meter_label,
        is_active: patch.is_active ?? meter.is_active
      });
      setMessage("Station meter updated.");
      await reload();
    } catch (err) {
      setError(getErrorMessage(err));
    } finally {
      setMeterSubmitting(null);
    }
  }

  async function archiveMeter(stationId: string, meterId: string) {
    if (!canManageMeters) return;
    setMeterSubmitting(stationId);
    setError(null);
    setMessage(null);
    try {
      await archiveStationMeter(meterId);
      setMessage("Station meter archived.");
      await reload();
    } catch (err) {
      setError(getErrorMessage(err));
    } finally {
      setMeterSubmitting(null);
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

      {canManageMeters ? (
        <div className="rounded-2xl border bg-white p-4 sm:p-5">
          <h2 className="text-lg font-semibold">Station meter setup</h2>
          <p className="mt-1 text-sm text-slate-500">Owner/Admin can manage product assignment, meter label, and active status.</p>

          <div className="mt-4 space-y-6">
            {stationOrder.map((station) => {
              const draft = readStationDraft(station.id);
              return (
                <div className="rounded-xl border p-3" key={station.id}>
                  <div className="mb-3 flex items-center justify-between gap-2">
                    <div>
                      <p className="font-medium">{station.name}</p>
                      <p className="text-xs text-slate-500">Code: {station.code}</p>
                    </div>
                    <Badge>{station.meters.filter((meter) => meter.is_active).length} active</Badge>
                  </div>

                  <div className="overflow-x-auto">
                    <table className="w-full min-w-[720px] text-sm">
                      <thead className="text-left text-slate-500">
                        <tr>
                          <th className="py-2">Product</th>
                          <th>Meter label</th>
                          <th>Active</th>
                          <th>Actions</th>
                        </tr>
                      </thead>
                      <tbody>
                        {station.meters.map((meter) => (
                          <tr className="border-t" key={meter.id}>
                            <td className="py-2">
                              <select
                                className="h-9 rounded-md border border-input bg-background px-2 text-sm"
                                onChange={(event) => updateMeterField(station.id, meter, { product_type: event.target.value as StationMeterRow["product_type"] })}
                                value={meter.product_type}
                              >
                                {PRODUCT_OPTIONS.map((value) => (
                                  <option key={value} value={value}>
                                    {value}
                                  </option>
                                ))}
                              </select>
                            </td>
                            <td>
                              <Input
                                onBlur={(event) => {
                                  const next = event.target.value.trim();
                                  if (next && next !== meter.meter_label) {
                                    void updateMeterField(station.id, meter, { meter_label: next });
                                  }
                                }}
                                defaultValue={meter.meter_label}
                              />
                            </td>
                            <td>
                              <label className="inline-flex items-center gap-2 text-sm">
                                <input
                                  type="checkbox"
                                  checked={meter.is_active}
                                  onChange={(event) => updateMeterField(station.id, meter, { is_active: event.target.checked })}
                                />
                                {meter.is_active ? "Yes" : "No"}
                              </label>
                            </td>
                            <td>
                              <Button
                                disabled={!meter.is_active || meterSubmitting === station.id}
                                onClick={() => archiveMeter(station.id, meter.id)}
                                size="sm"
                                type="button"
                                variant="outline"
                              >
                                Archive
                              </Button>
                            </td>
                          </tr>
                        ))}
                        {station.meters.length === 0 ? (
                          <tr className="border-t">
                            <td className="py-2 text-slate-500" colSpan={4}>
                              No station meters configured.
                            </td>
                          </tr>
                        ) : null}
                      </tbody>
                    </table>
                  </div>

                  <div className="mt-3 grid gap-2 sm:grid-cols-4">
                    <select
                      className="h-10 rounded-md border border-input bg-background px-2 text-sm"
                      value={draft.product_type}
                      onChange={(event) => patchDraft(station.id, { product_type: event.target.value as StationMeterRow["product_type"] })}
                    >
                      {PRODUCT_OPTIONS.map((value) => (
                        <option key={value} value={value}>
                          {value}
                        </option>
                      ))}
                    </select>
                    <Input
                      placeholder="Meter label (e.g., D1)"
                      value={draft.meter_label}
                      onChange={(event) => patchDraft(station.id, { meter_label: event.target.value })}
                    />
                    <label className="inline-flex items-center gap-2 rounded-md border px-3 text-sm">
                      <input
                        type="checkbox"
                        checked={draft.is_active}
                        onChange={(event) => patchDraft(station.id, { is_active: event.target.checked })}
                      />
                      Active
                    </label>
                    <Button disabled={meterSubmitting === station.id} onClick={() => submitNewMeter(station.id)} type="button">
                      {meterSubmitting === station.id ? "Saving..." : "Add meter"}
                    </Button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      ) : null}
    </div>
  );
}
