import { LubricantsClient } from "@/components/lubricants/lubricants-client";

export default function Page() {
  return (
    <div className="space-y-6">
      <div className="space-y-1">
        <h1 className="text-2xl font-semibold tracking-tight">Station Lubricants</h1>
        <p className="text-sm text-slate-500">Clean station-level lubricant inventory, movement tracking, and reconciliation visibility.</p>
      </div>
      <LubricantsClient />
    </div>
  );
}
