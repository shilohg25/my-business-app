import { StatCard } from "@/components/dashboard/stat-card";

export type DashboardMetric = {
  label: string;
  value: string;
  hint?: string;
};

export function MetricGrid({ title, metrics }: { title: string; metrics: DashboardMetric[] }) {
  return (
    <section className="space-y-3">
      <h2 className="text-base font-semibold text-slate-900">{title}</h2>
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {metrics.map((metric) => (
          <StatCard key={metric.label} label={metric.label} value={metric.value} hint={metric.hint} />
        ))}
      </div>
    </section>
  );
}
