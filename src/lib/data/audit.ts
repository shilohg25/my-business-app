export interface AuditInput {
  actionType: "create" | "edit" | "import" | "approve" | "export" | "archive";
  entityType: string;
  entityId?: string | null;
  details?: string | null;
  explanation?: string | null;
  oldSnapshot?: unknown;
  newSnapshot?: unknown;
}

export async function writeAuditLog(_input: AuditInput) {
  throw new Error("Audit writes are handled by database triggers and RPC functions in the static build.");
}
