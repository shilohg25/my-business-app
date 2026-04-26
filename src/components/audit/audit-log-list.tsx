"use client";

import { useEffect, useMemo, useState } from "react";
import { Input } from "@/components/ui/input";
import { ResetFiltersButton } from "@/components/ui/reset-filters-button";
import { listAuditLogs, type AuditLogRow } from "@/lib/data/client";
import { areFiltersDefault } from "@/lib/utils/filters";

export function AuditLogList() {
  const defaultDateRange = useMemo(() => {
    const now = new Date();
    const monthAgo = new Date();
    monthAgo.setUTCDate(now.getUTCDate() - 29);
    return { startDate: monthAgo.toISOString().slice(0, 10), endDate: now.toISOString().slice(0, 10) };
  }, []);
  const [logs, setLogs] = useState<AuditLogRow[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [actorFilter, setActorFilter] = useState("all");
  const [actionFilter, setActionFilter] = useState("all");
  const [entityFilter, setEntityFilter] = useState("all");
  const [searchText, setSearchText] = useState("");
  const [startDate, setStartDate] = useState(defaultDateRange.startDate);
  const [endDate, setEndDate] = useState(defaultDateRange.endDate);

  useEffect(() => {
    listAuditLogs().then(setLogs).catch((err: Error) => setError(err.message));
  }, []);
  const defaultFilters = { actorFilter: "all", actionFilter: "all", entityFilter: "all", searchText: "", startDate: defaultDateRange.startDate, endDate: defaultDateRange.endDate };
  const hasActiveFilters = !areFiltersDefault({ actorFilter, actionFilter, entityFilter, searchText, startDate, endDate }, defaultFilters);
  const actorOptions = useMemo(() => Array.from(new Set(logs.map((log) => log.actor_role).filter((value): value is string => Boolean(value)))), [logs]);
  const actionOptions = useMemo(() => Array.from(new Set(logs.map((log) => log.action_type).filter(Boolean))), [logs]);
  const entityOptions = useMemo(() => Array.from(new Set(logs.map((log) => log.entity_type).filter(Boolean))), [logs]);
  const filteredLogs = useMemo(() => {
    const normalized = searchText.trim().toLowerCase();
    return logs.filter((log) => {
      if (actorFilter !== "all" && log.actor_role !== actorFilter) return false;
      if (actionFilter !== "all" && log.action_type !== actionFilter) return false;
      if (entityFilter !== "all" && log.entity_type !== entityFilter) return false;
      const createdDate = log.created_at.slice(0, 10);
      if (startDate && createdDate < startDate) return false;
      if (endDate && createdDate > endDate) return false;
      if (!normalized) return true;
      return `${log.details ?? ""} ${log.explanation ?? ""}`.toLowerCase().includes(normalized);
    });
  }, [actionFilter, actorFilter, endDate, entityFilter, logs, searchText, startDate]);

  function resetFilters() {
    setActorFilter("all");
    setActionFilter("all");
    setEntityFilter("all");
    setSearchText("");
    setStartDate(defaultDateRange.startDate);
    setEndDate(defaultDateRange.endDate);
  }

  return (
    <div className="rounded-2xl border bg-white p-5">
      {error ? <p className="mb-4 text-sm text-red-700">{error}</p> : null}
      <div className="mb-4 flex flex-wrap items-end gap-2">
        <select className="h-10 rounded-xl border border-slate-300 bg-white px-3 text-sm" value={actorFilter} onChange={(event) => setActorFilter(event.target.value)}>
          <option value="all">All actors</option>
          {actorOptions.map((actor) => (
            <option key={actor} value={actor}>
              {actor}
            </option>
          ))}
        </select>
        <select className="h-10 rounded-xl border border-slate-300 bg-white px-3 text-sm" value={actionFilter} onChange={(event) => setActionFilter(event.target.value)}>
          <option value="all">All actions</option>
          {actionOptions.map((action) => (
            <option key={action} value={action}>
              {action}
            </option>
          ))}
        </select>
        <select className="h-10 rounded-xl border border-slate-300 bg-white px-3 text-sm" value={entityFilter} onChange={(event) => setEntityFilter(event.target.value)}>
          <option value="all">All entities</option>
          {entityOptions.map((entity) => (
            <option key={entity} value={entity}>
              {entity}
            </option>
          ))}
        </select>
        <Input className="w-full sm:w-64" placeholder="Search details" value={searchText} onChange={(event) => setSearchText(event.target.value)} />
        <Input type="date" value={startDate} onChange={(event) => setStartDate(event.target.value)} />
        <Input type="date" value={endDate} onChange={(event) => setEndDate(event.target.value)} />
        <ResetFiltersButton className="ml-auto" onClick={resetFilters} visible={hasActiveFilters} />
      </div>
      {logs.length === 0 ? <p className="text-sm text-slate-500">No fuel operation audit logs yet.</p> : null}
      {filteredLogs.length > 0 ? (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="text-left text-slate-500"><tr><th className="py-2">Time</th><th>Role</th><th>Action</th><th>Entity</th><th>Details</th></tr></thead>
            <tbody>{filteredLogs.map((log) => <tr className="border-t" key={log.id}><td className="py-3">{new Date(log.created_at).toLocaleString()}</td><td>{log.actor_role ?? "-"}</td><td>{log.action_type}</td><td>{log.entity_type}</td><td>{log.details ?? log.explanation ?? "-"}</td></tr>)}</tbody>
          </table>
        </div>
      ) : logs.length > 0 ? <p className="text-sm text-slate-500">No audit logs matched your filters.</p> : null}
    </div>
  );
}
