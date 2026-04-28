"use client";

import { useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { fetchCurrentProfile } from "@/lib/data/profile";
import {
  listAssignableStations,
  listAssignableUsers,
  listStationAssignments,
  setStationAssignment,
  normalizeStationAssignmentError,
  type AssignableStation,
  type AssignableUser,
  type StationAssignmentRow
} from "@/lib/data/station-assignments";

export function StationAssignmentsClient() {
  const [profile, setProfile] = useState<Awaited<ReturnType<typeof fetchCurrentProfile>>>(null);
  const [users, setUsers] = useState<AssignableUser[]>([]);
  const [stations, setStations] = useState<AssignableStation[]>([]);
  const [assignments, setAssignments] = useState<StationAssignmentRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const [selectedUserId, setSelectedUserId] = useState("");
  const [selectedStationId, setSelectedStationId] = useState("");
  const [isActive, setIsActive] = useState(true);

  const canManage = profile?.role === "Owner" || profile?.role === "Admin";

  const groupedAssignments = useMemo(() => {
    return assignments.map((assignment) => ({
      ...assignment,
      label: `${assignment.user_email ?? "No email"} · ${assignment.station_name}`
    }));
  }, [assignments]);

  async function loadAll() {
    const current = await fetchCurrentProfile();
    setProfile(current);

    if (current?.role === "Owner" || current?.role === "Admin") {
      const [userRows, stationRows, assignmentRows] = await Promise.all([
        listAssignableUsers(),
        listAssignableStations(),
        listStationAssignments()
      ]);
      setUsers(userRows);
      setStations(stationRows);
      setAssignments(assignmentRows);
      if (!selectedUserId && userRows.length > 0) setSelectedUserId(userRows[0]?.user_id ?? "");
      if (!selectedStationId && stationRows.length > 0) setSelectedStationId(stationRows[0]?.id ?? "");
      return;
    }

    setUsers([]);
    setStations([]);
    setAssignments([]);
  }

  useEffect(() => {
    loadAll()
      .catch((err) => setError(normalizeStationAssignmentError(err, "Failed to load station assignments")))
      .finally(() => setLoading(false));
  }, []);

  async function handleSave() {
    setError(null);
    setMessage(null);

    if (!selectedUserId || !selectedStationId) {
      setError("Select both a user and a station.");
      return;
    }

    setSubmitting(true);
    try {
      await setStationAssignment(selectedUserId, selectedStationId, isActive);
      setMessage(isActive ? "Assignment saved as active." : "Assignment saved as inactive.");
      await loadAll();
    } catch (err) {
      setError(normalizeStationAssignmentError(err, "Unable to save assignment"));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="space-y-4">
      {loading ? <p className="text-sm text-slate-500">Loading station assignment tools...</p> : null}
      {error ? <p className="text-sm text-red-700">{error}</p> : null}
      {message ? <p className="text-sm text-emerald-700">{message}</p> : null}

      <section className="rounded-2xl border bg-white p-4">
        <h2 className="font-semibold">Manage assignment</h2>
        {!canManage ? (
          <p className="mt-2 text-sm text-amber-700">Only Owner/Admin profiles can manage station assignments.</p>
        ) : (
          <div className="mt-3 grid gap-3 md:grid-cols-3">
            <label className="space-y-1 text-sm">
              <span>User</span>
              <select className="h-10 w-full rounded border px-2 py-1" value={selectedUserId} onChange={(e) => setSelectedUserId(e.target.value)}>
                {users.length === 0 ? <option value="">No active cashier users found</option> : null}
                {users.map((user) => (
                  <option key={user.user_id} value={user.user_id}>
                    {user.email ?? "No email"}
                  </option>
                ))}
              </select>
            </label>

            <label className="space-y-1 text-sm">
              <span>Station</span>
              <select className="h-10 w-full rounded border px-2 py-1" value={selectedStationId} onChange={(e) => setSelectedStationId(e.target.value)}>
                {stations.length === 0 ? <option value="">No active stations found</option> : null}
                {stations.map((station) => (
                  <option key={station.id} value={station.id}>
                    {station.name} ({station.code})
                  </option>
                ))}
              </select>
            </label>

            <label className="flex min-h-11 items-center gap-2 text-sm">
              <input type="checkbox" checked={isActive} onChange={(e) => setIsActive(e.target.checked)} />
              Active assignment
            </label>

            <div className="md:col-span-3">
              <Button type="button" disabled={submitting || !canManage} onClick={handleSave}>
                {submitting ? "Saving..." : "Save assignment"}
              </Button>
            </div>
          </div>
        )}
      </section>

      <section className="rounded-2xl border bg-white p-4">
        <h2 className="font-semibold">Existing assignments</h2>
        {!canManage ? null : groupedAssignments.length === 0 ? (
          <p className="mt-2 text-sm text-slate-500">No assignments yet. Add a user-station assignment above.</p>
        ) : (
          <div className="mt-3 overflow-x-auto">
            <table className="w-full min-w-[820px] text-sm">
              <thead>
                <tr>
                  <th className="text-left">User</th>
                  <th className="text-left">Station</th>
                  <th className="text-left">Status</th>
                  <th className="text-left">Updated</th>
                  <th className="text-left">Quick action</th>
                </tr>
              </thead>
              <tbody>
                {groupedAssignments.map((assignment) => (
                  <tr key={assignment.id} className="border-t">
                    <td>{assignment.user_email ?? "No email"}</td>
                    <td>{assignment.station_name} ({assignment.station_code})</td>
                    <td>{assignment.is_active ? "Active" : "Inactive"}</td>
                    <td>{new Date(assignment.updated_at).toLocaleString()}</td>
                    <td>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={async () => {
                          try {
                            await setStationAssignment(assignment.user_id, assignment.station_id, !assignment.is_active);
                            setMessage(!assignment.is_active ? "Assignment activated." : "Assignment deactivated.");
                            await loadAll();
                          } catch (err) {
                            setError(normalizeStationAssignmentError(err, "Unable to update assignment status"));
                          }
                        }}
                      >
                        {assignment.is_active ? "Deactivate" : "Activate"}
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
