import { createSupabaseServerClient } from "@/lib/supabase/server";

interface AuditInput {
  actionType: "create" | "edit" | "import" | "approve" | "export" | "archive";
  entityType: string;
  entityId?: string | null;
  details?: string | null;
  explanation?: string | null;
  oldSnapshot?: unknown;
  newSnapshot?: unknown;
}

export async function writeAuditLog(input: AuditInput) {
  const supabase = await createSupabaseServerClient();
  const { data: userData } = await supabase.auth.getUser();

  const actorId = userData.user?.id ?? null;
  const { data: profile } = actorId
    ? await supabase.from("profiles").select("role").eq("id", actorId).maybeSingle()
    : { data: null };

  const { error } = await supabase.from("audit_logs").insert({
    actor_id: actorId,
    actor_role: profile?.role ?? null,
    action_type: input.actionType,
    entity_type: input.entityType,
    entity_id: input.entityId ?? null,
    details: input.details ?? null,
    explanation: input.explanation ?? null,
    old_snapshot: input.oldSnapshot ?? null,
    new_snapshot: input.newSnapshot ?? null
  });

  if (error) throw error;
}
