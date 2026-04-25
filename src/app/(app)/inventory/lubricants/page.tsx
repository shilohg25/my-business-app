import { LubricantsClient } from "@/components/lubricants/lubricants-client";

export default function Page() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Lubricant Control</h1>
        <p className="text-sm text-slate-500">Track lubricant sales, station stock, warehouse stock, movements, and reorder warnings.</p>
      </div>
      <LubricantsClient />
    </div>
  );
}
