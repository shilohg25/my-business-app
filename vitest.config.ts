import { ImportPreview } from "@/components/imports/import-preview";

export default function ImportsPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Excel Import</h1>
        <p className="text-sm text-slate-500">Upload the OSR workbook, preview parsed data, then commit.</p>
      </div>
      <ImportPreview />
    </div>
  );
}
