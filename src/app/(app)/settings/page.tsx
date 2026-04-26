import { UsersAndRolesClient } from "@/components/settings/users-and-roles-client";

export default function Page() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Settings</h1>
        <p className="text-sm text-slate-500">Role-aware application settings and user access management.</p>
      </div>
      <UsersAndRolesClient />
    </div>
  );
}
