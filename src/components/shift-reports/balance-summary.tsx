import type { ShiftCalculationResult } from "@/lib/domain/types";
import { formatCurrency, formatNumber } from "@/lib/utils";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export function BalanceSummary({ result }: { result: ShiftCalculationResult }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Balance Summary</CardTitle>
      </CardHeader>
      <CardContent className="grid gap-3 text-sm md:grid-cols-2">
        <Metric label="Fuel cash sales" value={formatCurrency(result.totalFuelCashSales)} />
        <Metric label="Lubricant sales" value={formatCurrency(result.totalLubricantSales)} />
        <Metric label="Cash count" value={formatCurrency(result.totalCashCount)} />
        <Metric label="Expected cash before expenses" value={formatCurrency(result.expectedCashBeforeExpenses)} />
        <Metric label="Workbook discrepancy" value={formatCurrency(result.workbookStyleDiscrepancy)} />
        <Metric label="Operational net remittance" value={formatCurrency(result.operationalNetRemittance)} />
        <Metric label="Net fuel liters" value={formatNumber(result.totalNetCashLiters, 3)} />
        <Metric label="Credit liters" value={formatNumber(result.totalCreditLiters, 3)} />
      </CardContent>
    </Card>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border bg-slate-50 p-3">
      <div className="text-xs text-slate-500">{label}</div>
      <div className="mt-1 font-semibold">{value}</div>
    </div>
  );
}
