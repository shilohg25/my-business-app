import { StationsClient } from "@/components/stations/stations-client";

export default function StationsPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Stations</h1>
        <p className="text-sm text-slate-500">
          Manage station profiles and operating status.
        </p>
      </div>
      <StationsClient />
    </div>
  );
}
