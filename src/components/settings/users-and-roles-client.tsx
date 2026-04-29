"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { fetchCurrentProfile } from "@/lib/data/profile";
import type { AppRole } from "@/types/auth";
import { deactivateUser, listUsersForOwner, updateUserRole, type OwnerUserRow } from "@/lib/data/admin-users";

const roles: AppRole[] = ["Owner", "Co-Owner", "Admin", "User"];

export function UsersAndRolesClient() {
  const [profile, setProfile] = useState<Awaited<ReturnType<typeof fetchCurrentProfile>>>(null);
  const [users, setUsers] = useState<OwnerUserRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);


  const isOwner = profile?.role === "Owner";

  async function reload() {
    const current = await fetchCurrentProfile();
    setProfile(current);
    if (current?.role === "Owner") {
      setUsers(await listUsersForOwner());
    } else {
      setUsers([]);
    }
  }

  useEffect(() => {
    reload().catch((err) => setError(err instanceof Error ? err.message : "Failed to load"))
      .finally(() => setLoading(false));
  }, []);

  return (
    <div className="space-y-4">
      {loading ? <p className="text-sm text-slate-500">Checking role...</p> : null}
      {error ? <p className="text-sm text-red-700">{error}</p> : null}
      {message ? <p className="text-sm text-emerald-700">{message}</p> : null}

      <section className="rounded-2xl border bg-white p-4">
        <h2 className="font-semibold">Current user</h2>
        <p className="text-sm">Email: {profile?.email ?? "No active profile found for this login."}</p>
        <p className="text-sm">Role: {profile?.role ?? "-"}</p>
        <p className="text-sm">Active: {profile?.is_active ? "Yes" : "No"}</p>
      </section>

      <section className="rounded-2xl border bg-white p-4">
        <h2 className="font-semibold">Users and Roles</h2>
        {!isOwner ? <p className="mt-2 text-sm text-amber-700">Only Owner profiles can manage users and roles.</p> : null}
        {isOwner ? <p className="mt-2 text-sm text-slate-600">Create users in Supabase Authentication first. Then assign their app role here.</p> : null}

        {isOwner ? (
          <>
            <div className="mt-3 overflow-x-auto">
              <table className="w-full min-w-[900px] text-sm">
                <thead><tr><th>Email</th><th>Username</th><th>Role</th><th className="text-center align-middle">Active</th><th className="text-center align-middle">Must change password</th><th>Last sign-in</th><th>Actions</th></tr></thead>
                <tbody>
                  {users.map((user) => (
                    <tr key={user.id} className="border-t">
                      <td>{user.email}</td>
                      <td>{user.username ?? "-"}</td>
                      <td>
                        <select defaultValue={user.role ?? "User"} onChange={(e) => user.role = e.target.value as AppRole} className="h-10 rounded border px-2 py-1">
                          {roles.map((r) => <option key={r} value={r}>{r}</option>)}
                        </select>
                      </td>
                      <td className="text-center align-middle"><div className="flex justify-center"><input type="checkbox" defaultChecked={user.is_active} onChange={(e) => user.is_active = e.target.checked} /></div></td>
                      <td className="text-center align-middle"><div className="flex justify-center"><input type="checkbox" defaultChecked={user.must_change_password} onChange={(e) => user.must_change_password = e.target.checked} /></div></td>
                      <td>{user.last_sign_in_at ? new Date(user.last_sign_in_at).toLocaleString() : "Never"}</td>
                      <td className="flex flex-wrap gap-2">
                        <Button size="sm" onClick={async () => {
                          setError(null);
                          try {
                            await updateUserRole(user.id, (user.role ?? "User") as AppRole, user.is_active, user.must_change_password);
                            setMessage(`Saved ${user.email}`);
                            await reload();
                          } catch (err) {
                            setError(err instanceof Error ? err.message : String(err));
                          }
                        }}>Save</Button>
                        <Button size="sm" variant="outline" onClick={async () => {
                          setError(null);
                          try {
                            await deactivateUser(user.id, "Owner deactivated profile");
                            setMessage(`Deactivated ${user.email}`);
                            await reload();
                          } catch (err) {
                            setError(err instanceof Error ? err.message : String(err));
                          }
                        }}>Deactivate</Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>


          </>
        ) : null}
      </section>

      <section className="rounded-2xl border bg-white p-4 text-sm">
        <h2 className="font-semibold">Role explanation</h2>
        <ul className="mt-2 list-disc space-y-1 pl-5">
          <li><strong>Owner:</strong> Full access, create stations/bodegas, manage users, approve final reports, finalize/void baselines.</li>
          <li><strong>Admin:</strong> Operate reports/inventory and deliveries/transfers; cannot manage users or create stations/bodegas.</li>
          <li><strong>Co-Owner:</strong> Read/export/review visibility; no write by default.</li>
          <li><strong>User:</strong> Field/cashier workflow with limited access.</li>
        </ul>
      </section>
    </div>
  );
}
