import { StationAssignmentsClient } from "@/components/station-assignments/station-assignments-client";

export default function StationAssignmentsPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Station Assignments</h1>
        <p className="text-sm text-slate-500">Owner/Admin tools for assigning cashiers to active stations.</p>
      </div>

      <StationAssignmentsClient />
    </div>
  );
}
