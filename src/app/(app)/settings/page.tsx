import { UsersAndRolesClient } from "@/components/settings/users-and-roles-client";

export default function Page() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Settings</h1>
        <p className="text-sm text-slate-500">Role-aware application settings and user access management.</p>
      </div>

      <section className="rounded-2xl border bg-white p-4">
        <h2 className="font-semibold">Operational setup</h2>
        <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-slate-600">
          <li>Users and Roles</li>
          <li>Future: Shift Options</li>
          <li>Future: Station Defaults</li>
        </ul>
      </section>

      <UsersAndRolesClient />
    </div>
  );
}
