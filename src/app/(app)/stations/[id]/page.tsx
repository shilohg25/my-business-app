import { Card, CardContent } from "@/components/ui/card";

export function generateStaticParams() {
  return [];
}

export const dynamicParams = false;

export default function Page() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Station Detail</h1>
        <p className="text-sm text-slate-500">Configure pumps, products, shift templates, and station inventory.</p>
      </div>
      <Card>
        <CardContent>
          <p className="text-sm text-slate-500">Static export placeholder. Link list pages to generated detail routes after the app moves to Vercel or after static params are generated at build time.</p>
        </CardContent>
      </Card>
    </div>
  );
}
