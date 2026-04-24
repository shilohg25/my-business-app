import { AuditLogList } from "@/components/audit/audit-log-list";

export default function AuditLogsPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Audit Logs</h1>
        <p className="text-sm text-slate-500">Append-only create, edit, import, approval, archive, and export events.</p>
      </div>
      <AuditLogList />
    </div>
  );
}
