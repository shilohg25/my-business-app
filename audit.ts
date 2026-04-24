"use client";

import { useMemo, useState } from "react";
import { calculateShiftReport } from "@/lib/domain/calculations";
import type { ShiftReportInput } from "@/lib/domain/types";
import { Button } from "@/components/ui/button";
import { BalanceSummary } from "./balance-summary";

const starterReport: ShiftReportInput = {
  reportDate: new Date().toISOString().slice(0, 10),
  dutyName: "",
  shiftTimeLabel: "",
  source: "web_manual",
  prices: [
    { productCode: "DIESEL", price: 0 },
    { productCode: "SPECIAL", price: 0 },
    { productCode: "UNLEADED", price: 0 }
  ],
  meterReadings: [],
  creditReceipts: [],
  expenses: [],
  cashCounts: [
    { denomination: 1000, quantity: 0 },
    { denomination: 500, quantity: 0 },
    { denomination: 200, quantity: 0 },
    { denomination: 100, quantity: 0 },
    { denomination: 50, quantity: 0 },
    { denomination: 20, quantity: 0 }
  ],
  coinsAmount: 0,
  lubricantSales: []
};

export function ShiftReportForm() {
  const [report] = useState<ShiftReportInput>(starterReport);
  const result = useMemo(() => calculateShiftReport(report), [report]);

  return (
    <div className="space-y-6">
      <BalanceSummary result={result} />
      <div className="rounded-2xl border bg-white p-5">
        <div className="font-medium">Form builder seam</div>
        <p className="mt-1 text-sm text-slate-500">
          Wire React Hook Form field arrays here for readings, credit receipts, expenses, cash count, and lubricant sales.
          The calculation engine is already isolated and reusable.
        </p>
        <Button className="mt-4">Save draft</Button>
      </div>
    </div>
  );
}
