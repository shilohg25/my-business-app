export type AppRole = "Owner" | "Co-Owner" | "Admin" | "User";

export type Permission =
  | "read"
  | "create"
  | "edit"
  | "archive"
  | "approve"
  | "export"
  | "manageUsers"
  | "viewAudit";

const rolePermissions: Record<AppRole, Permission[]> = {
  Owner: ["read", "create", "edit", "archive", "approve", "export", "manageUsers", "viewAudit"],
  "Co-Owner": ["read", "export", "viewAudit"],
  Admin: ["read", "create", "edit", "export", "viewAudit"],
  User: ["read"]
};

export function hasPermission(role: AppRole | string | null | undefined, permission: Permission) {
  if (!role || !(role in rolePermissions)) return false;
  return rolePermissions[role as AppRole].includes(permission);
}

export function requireEditReason(role: AppRole | string | null | undefined) {
  return role === "Admin";
}
