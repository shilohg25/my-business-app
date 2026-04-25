import { BodegaClient } from "@/components/bodega/bodega-client";

export default function Page() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Bodega Inventory</h1>
        <p className="text-sm text-slate-500">Main lubricant warehouse for supplier orders and station refills.</p>
      </div>
      <BodegaClient />
    </div>
  );
}
