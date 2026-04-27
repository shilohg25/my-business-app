import { appPath } from "@/lib/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export default function Page() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Shift Setup Retired</h1>
        <p className="text-sm text-slate-500">
          Shift setup is no longer managed in the web app. Cashier field data entry is handled in the separate mobile app.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Use Daily Shift Reports</CardTitle>
        </CardHeader>
        <CardContent>
          <a className="text-sm font-medium text-blue-700 underline" href={appPath("/shift-reports/")}>Open Daily Shift Reports</a>
        </CardContent>
      </Card>
    </div>
  );
}
