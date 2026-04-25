import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

const setupSections = [
  {
    title: "Shift templates",
    description: "Create reusable shift windows such as 6am–2pm, 2pm–10pm, 10pm–6am, and station-specific variants."
  },
  {
    title: "Station assignment",
    description: "Assign available shift templates per station so teams select the correct schedule during daily operations."
  },
  {
    title: "Active/inactive shifts",
    description: "Control which shifts are currently available while preserving historical shift labels on saved reports."
  }
];

export default function Page() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Shift Setup</h1>
        <p className="text-sm text-slate-500">Configure station shift templates and schedules.</p>
      </div>

      <Card>
        <CardContent>
          <p className="text-sm text-slate-600">
            Use this page to define the working shifts that cashiers select when creating or importing a shift report.
            This module is for shift definitions only and is not used for reviewing submitted shift paperwork.
          </p>
        </CardContent>
      </Card>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {setupSections.map((section) => (
          <Card key={section.title}>
            <CardHeader>
              <CardTitle>{section.title}</CardTitle>
              <CardDescription>{section.description}</CardDescription>
            </CardHeader>
            <CardContent className="pt-0 text-xs text-slate-500">Configuration tools coming soon.</CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
