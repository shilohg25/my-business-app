"use client";

import { useMemo, useState } from "react";
import { calculateShiftReport } from "@/lib/domain/calculations";
import type { ShiftReportInput } from "@/lib/domain/types";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { BalanceSummary } from "./balance-summary";
import { commitShiftReport } from "@/lib/data/client";

const defaultReport: ShiftReportInput = {
  reportDate: new Date().toISOString().slice(0, 10),
  dutyName: "",
  shiftTimeLabel: "1-9pm",
  source: "web_manual",
  prices: [
    { productCode: "DIESEL", price: 0 },
    { productCode: "SPECIAL", price: 0 },
    { productCode: "UNLEADED", price: 0 }
  ],
  meterReadings: [
    { pumpLabel: "A", productCode: "DIESEL", beforeReading: 0, afterReading: 0, calibrationLiters: 0 },
    { pumpLabel: "B", productCode: "DIESEL", beforeReading: 0, afterReading: 0, calibrationLiters: 0 },
    { pumpLabel: "A2", productCode: "SPECIAL", beforeReading: 0, afterReading: 0, calibrationLiters: 0 },
    { pumpLabel: "B2", productCode: "UNLEADED", beforeReading: 0, afterReading: 0, calibrationLiters: 0 }
  ],
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

function numberValue(value: string) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

export function ShiftReportForm() {
  const [report, setReport] = useState<ShiftReportInput>(defaultReport);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const result = useMemo(() => calculateShiftReport(report), [report]);

  function update<K extends keyof ShiftReportInput>(key: K, value: ShiftReportInput[K]) {
    setReport((current) => ({ ...current, [key]: value }));
  }

  async function saveDraft() {
    setSaving(true);
    setMessage(null);
    try {
      const reportId = await commitShiftReport(report);
      setMessage(`Saved report ${reportId}.`);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Save failed.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="grid gap-6 xl:grid-cols-[1fr_360px]">
      <div className="space-y-6">
        <section className="rounded-2xl border bg-white p-5">
          <div className="mb-4 grid gap-4 md:grid-cols-3">
            <div className="space-y-2"><Label>Date</Label><Input type="date" value={report.reportDate} onChange={(event) => update("reportDate", event.target.value)} /></div>
            <div className="space-y-2"><Label>Duty / cashier</Label><Input value={report.dutyName} onChange={(event) => update("dutyName", event.target.value)} placeholder="Cashier name" /></div>
            <div className="space-y-2"><Label>Shift</Label><Input value={report.shiftTimeLabel} onChange={(event) => update("shiftTimeLabel", event.target.value)} placeholder="1-9pm" /></div>
          </div>
          <div className="grid gap-4 md:grid-cols-3">
            {report.prices.map((price, index) => (
              <div className="space-y-2" key={price.productCode}>
                <Label>{price.productCode} price</Label>
                <Input type="number" step="0.01" value={price.price} onChange={(event) => {
                  const prices = [...report.prices];
                  prices[index] = { ...prices[index], price: numberValue(event.target.value) };
                  update("prices", prices);
                }} />
              </div>
            ))}
          </div>
        </section>

        <section className="rounded-2xl border bg-white p-5">
          <div className="mb-4 flex items-center justify-between"><h2 className="font-semibold">Meter readings</h2><Button variant="outline" onClick={() => update("meterReadings", [...report.meterReadings, { pumpLabel: "", productCode: "DIESEL", beforeReading: 0, afterReading: 0, calibrationLiters: 0 }])}>Add reading</Button></div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="text-left text-slate-500"><tr><th>Pump</th><th>Product</th><th>Before</th><th>After</th><th>Calibration</th><th>Liters</th></tr></thead>
              <tbody>
                {report.meterReadings.map((line, index) => (
                  <tr className="border-t" key={`${line.pumpLabel}-${index}`}>
                    <td className="py-2"><Input value={line.pumpLabel} onChange={(event) => { const lines = [...report.meterReadings]; lines[index] = { ...line, pumpLabel: event.target.value }; update("meterReadings", lines); }} /></td>
                    <td><Input value={line.productCode} onChange={(event) => { const lines = [...report.meterReadings]; lines[index] = { ...line, productCode: event.target.value }; update("meterReadings", lines); }} /></td>
                    <td><Input type="number" step="0.001" value={line.beforeReading} onChange={(event) => { const lines = [...report.meterReadings]; lines[index] = { ...line, beforeReading: numberValue(event.target.value) }; update("meterReadings", lines); }} /></td>
                    <td><Input type="number" step="0.001" value={line.afterReading} onChange={(event) => { const lines = [...report.meterReadings]; lines[index] = { ...line, afterReading: numberValue(event.target.value) }; update("meterReadings", lines); }} /></td>
                    <td><Input type="number" step="0.001" value={line.calibrationLiters ?? 0} onChange={(event) => { const lines = [...report.meterReadings]; lines[index] = { ...line, calibrationLiters: numberValue(event.target.value) }; update("meterReadings", lines); }} /></td>
                    <td className="font-medium">{(line.afterReading - line.beforeReading).toFixed(3)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        <section className="rounded-2xl border bg-white p-5">
          <div className="mb-4 flex items-center justify-between"><h2 className="font-semibold">Credit receipts</h2><Button variant="outline" onClick={() => update("creditReceipts", [...report.creditReceipts, { productCode: "DIESEL", companyName: "", receiptNumber: "", liters: 0, amount: 0 }])}>Add credit</Button></div>
          <div className="space-y-3">
            {report.creditReceipts.map((line, index) => (
              <div className="grid gap-3 md:grid-cols-5" key={index}>
                <Input placeholder="Product" value={line.productCode} onChange={(event) => { const lines = [...report.creditReceipts]; lines[index] = { ...line, productCode: event.target.value }; update("creditReceipts", lines); }} />
                <Input placeholder="Company" value={line.companyName} onChange={(event) => { const lines = [...report.creditReceipts]; lines[index] = { ...line, companyName: event.target.value }; update("creditReceipts", lines); }} />
                <Input placeholder="Receipt #" value={line.receiptNumber ?? ""} onChange={(event) => { const lines = [...report.creditReceipts]; lines[index] = { ...line, receiptNumber: event.target.value }; update("creditReceipts", lines); }} />
                <Input type="number" step="0.001" placeholder="Liters" value={line.liters} onChange={(event) => { const lines = [...report.creditReceipts]; lines[index] = { ...line, liters: numberValue(event.target.value) }; update("creditReceipts", lines); }} />
                <Input type="number" step="0.01" placeholder="Amount" value={line.amount ?? 0} onChange={(event) => { const lines = [...report.creditReceipts]; lines[index] = { ...line, amount: numberValue(event.target.value) }; update("creditReceipts", lines); }} />
              </div>
            ))}
          </div>
        </section>

        <section className="grid gap-6 lg:grid-cols-2">
          <div className="rounded-2xl border bg-white p-5">
            <div className="mb-4 flex items-center justify-between"><h2 className="font-semibold">Expenses</h2><Button variant="outline" onClick={() => update("expenses", [...report.expenses, { description: "", amount: 0 }])}>Add expense</Button></div>
            <div className="space-y-3">
              {report.expenses.map((line, index) => (
                <div className="grid grid-cols-[1fr_120px] gap-3" key={index}>
                  <Input placeholder="Description" value={line.description} onChange={(event) => { const lines = [...report.expenses]; lines[index] = { ...line, description: event.target.value }; update("expenses", lines); }} />
                  <Input type="number" step="0.01" value={line.amount} onChange={(event) => { const lines = [...report.expenses]; lines[index] = { ...line, amount: numberValue(event.target.value) }; update("expenses", lines); }} />
                </div>
              ))}
            </div>
          </div>
          <div className="rounded-2xl border bg-white p-5">
            <div className="mb-4 flex items-center justify-between"><h2 className="font-semibold">Lubricant sales</h2><Button variant="outline" onClick={() => update("lubricantSales", [...report.lubricantSales, { productName: "", quantity: 0, unitPrice: 0 }])}>Add lube</Button></div>
            <div className="space-y-3">
              {report.lubricantSales.map((line, index) => (
                <div className="grid grid-cols-[1fr_90px_110px] gap-3" key={index}>
                  <Input placeholder="Product" value={line.productName} onChange={(event) => { const lines = [...report.lubricantSales]; lines[index] = { ...line, productName: event.target.value }; update("lubricantSales", lines); }} />
                  <Input type="number" step="0.001" value={line.quantity} onChange={(event) => { const lines = [...report.lubricantSales]; lines[index] = { ...line, quantity: numberValue(event.target.value) }; update("lubricantSales", lines); }} />
                  <Input type="number" step="0.01" value={line.unitPrice} onChange={(event) => { const lines = [...report.lubricantSales]; lines[index] = { ...line, unitPrice: numberValue(event.target.value) }; update("lubricantSales", lines); }} />
                </div>
              ))}
            </div>
          </div>
        </section>

        <section className="rounded-2xl border bg-white p-5">
          <h2 className="mb-4 font-semibold">Cash count</h2>
          <div className="grid gap-3 md:grid-cols-3">
            {report.cashCounts.map((line, index) => (
              <div className="grid grid-cols-[90px_1fr] items-center gap-2" key={line.denomination}>
                <Label>{line.denomination}</Label>
                <Input type="number" step="1" value={line.quantity} onChange={(event) => { const lines = [...report.cashCounts]; lines[index] = { ...line, quantity: numberValue(event.target.value) }; update("cashCounts", lines); }} />
              </div>
            ))}
            <div className="grid grid-cols-[90px_1fr] items-center gap-2"><Label>Coins</Label><Input type="number" step="0.01" value={report.coinsAmount ?? 0} onChange={(event) => update("coinsAmount", numberValue(event.target.value))} /></div>
          </div>
        </section>
      </div>

      <aside className="space-y-4 xl:sticky xl:top-4 xl:self-start">
        <BalanceSummary result={result} />
        <div className="rounded-2xl border bg-white p-5">
          <Label>Edit / save note</Label>
          <Textarea className="mt-2" value={report.editReason ?? ""} onChange={(event) => update("editReason", event.target.value)} placeholder="Required for Admin edits." />
          <Button className="mt-4 w-full" disabled={saving} onClick={saveDraft}>{saving ? "Saving..." : "Save draft"}</Button>
          {message ? <p className="mt-3 text-sm text-slate-600">{message}</p> : null}
        </div>
      </aside>
    </div>
  );
}
