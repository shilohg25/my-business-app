import { LubricantsClient } from "@/components/lubricants/lubricants-client";

export default function Page() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Station Lubricants</h1>
        <p className="text-sm text-slate-500">Station lubricant stock, sales, refills, and movement history.</p>
      </div>
      <LubricantsClient />
    </div>
  );
}
