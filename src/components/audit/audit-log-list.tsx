"use client";

import { useEffect, useState } from "react";
import { listAuditLogs, type AuditLogRow } from "@/lib/data/client";

export function AuditLogList() {
  const [logs, setLogs] = useState<AuditLogRow[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    listAuditLogs().then(setLogs).catch((err: Error) => setError(err.message));
  }, []);

  return (
    <div className="rounded-2xl border bg-white p-5">
      {error ? <p className="mb-4 text-sm text-red-700">{error}</p> : null}
      {logs.length === 0 ? <p className="text-sm text-slate-500">No fuel operation audit logs yet.</p> : null}
      {logs.length > 0 ? (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="text-left text-slate-500"><tr><th className="py-2">Time</th><th>Role</th><th>Action</th><th>Entity</th><th>Details</th></tr></thead>
            <tbody>{logs.map((log) => <tr className="border-t" key={log.id}><td className="py-3">{new Date(log.created_at).toLocaleString()}</td><td>{log.actor_role ?? "-"}</td><td>{log.action_type}</td><td>{log.entity_type}</td><td>{log.details ?? log.explanation ?? "-"}</td></tr>)}</tbody>
          </table>
        </div>
      ) : null}
    </div>
  );
}
