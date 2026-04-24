import { Button } from "@/components/ui/button";

export function Topbar() {
  return (
    <header className="no-print flex h-16 items-center justify-between border-b bg-white px-6">
      <div>
        <div className="text-sm font-medium text-slate-900">Operations Console</div>
        <div className="text-xs text-slate-500">Shift reports, remittance, inventory, and audit</div>
      </div>
      <div className="flex items-center gap-2">
        <Button variant="outline">Print</Button>
        <Button>New Shift Report</Button>
      </div>
    </header>
  );
}
