import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

const setupSections = [
  {
    title: "Shift templates",
    description: "Define names and time ranges such as 6am–2pm, 2pm–10pm, or 1pm–9pm."
  },
  {
    title: "Station assignment",
    description: "Assign shift templates to stations."
  },
  {
    title: "Active/inactive control",
    description: "Keep old shift templates for history while hiding them from new reports."
  }
];

export default function Page() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Shift Setup</h1>
        <p className="text-sm text-slate-500">Configure station shift templates and cashier schedule options.</p>
      </div>

      <Card>
        <CardContent>
          <p className="text-sm text-slate-600">
            Use this page to define shift templates and schedule options for your station operations. This page is for
            setup only and is not where completed Daily Shift Reports are reviewed.
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
            <CardContent className="pt-0 text-xs text-slate-500">Coming soon.</CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
