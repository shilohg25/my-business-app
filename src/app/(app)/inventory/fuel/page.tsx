import { FuelInventoryClient } from "@/components/fuel-inventory/fuel-inventory-client";

export default function Page() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Fuel Inventory</h1>
        <p className="text-sm text-slate-500">Station fuel stock for Diesel, Special, and Unleaded.</p>
      </div>
      <FuelInventoryClient />
    </div>
  );
}
