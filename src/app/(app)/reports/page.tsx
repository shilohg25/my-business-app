import { Card, CardContent } from "@/components/ui/card";

export default function Page() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Reports</h1>
        <p className="text-sm text-slate-500">Daily, weekly, monthly, cashier, station, and product summaries.</p>
      </div>
      <Card>
        <CardContent>
          <p className="text-sm text-slate-500">Module route is scaffolded. Add server data access and forms in this directory.</p>
        </CardContent>
      </Card>
    </div>
  );
}
