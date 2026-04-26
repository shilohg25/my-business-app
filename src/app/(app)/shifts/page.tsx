import { appPath } from "@/lib/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export default function Page() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Shift Setup Retired</h1>
        <p className="text-sm text-slate-500">
          Shift selection will be handled inside Field Shift Capture. Shift templates may later move to Settings.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Use Field Shift Capture</CardTitle>
        </CardHeader>
        <CardContent>
          <a className="text-sm font-medium text-blue-700 underline" href={appPath("/field-capture/")}>Open Field Shift Capture</a>
        </CardContent>
      </Card>
    </div>
  );
}
