import type { AppRole } from "@/types/auth";
export type Permission =
  | "read"
  | "create"
  | "edit"
  | "archive"
  | "approve"
  | "export"
  | "manageUsers"
  | "viewAudit"
  | "manageCriticalSettings"
  | "restoreRecords"
  | "tankCalibrationView"
  | "tankCalibrationManage"
  | "tankReconciliationView"
  | "tankReconciliationManage";

const rolePermissions: Record<AppRole, Permission[]> = {
  Owner: [
    "read",
    "create",
    "edit",
    "archive",
    "approve",
    "export",
    "manageUsers",
    "viewAudit",
    "manageCriticalSettings",
    "restoreRecords",
    "tankCalibrationView",
    "tankCalibrationManage",
    "tankReconciliationView",
    "tankReconciliationManage"
  ],
  "Co-Owner": ["read", "create", "edit", "archive", "approve", "export", "tankCalibrationView", "tankReconciliationView"],
  Admin: ["read", "create", "edit", "archive", "export"],
  User: ["read"]
};

export function hasPermission(role: AppRole | string | null | undefined, permission: Permission) {
  if (!role || !(role in rolePermissions)) return false;
  return rolePermissions[role as AppRole].includes(permission);
}

export function requiresActionExplanation(role: AppRole | string | null | undefined) {
  return role === "Admin" || role === "Co-Owner";
}

export function isOwnerRole(role: AppRole | string | null | undefined) {
  return role === "Owner";
}
