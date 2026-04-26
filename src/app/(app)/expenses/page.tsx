import { ExpensesClient } from "@/components/expenses/expenses-client";

export default function ExpensesPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Expenses</h1>
        <p className="text-sm text-slate-500">Station operating expenses from submitted shift reports.</p>
      </div>
      <ExpensesClient />
    </div>
  );
}
