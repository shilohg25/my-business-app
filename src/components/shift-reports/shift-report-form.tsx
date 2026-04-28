"use client";

import { useEffect, useMemo, useState } from "react";
import { calculateShiftReport } from "@/lib/domain/calculations";
import type {
  CashCountInput,
  CreditReceiptInput,
  ExpenseInput,
  LubricantSaleInput,
  MeterReadingInput,
  ProductPriceInput,
  ShiftReportInput
} from "@/lib/domain/types";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { BalanceSummary } from "./balance-summary";
import { canUseLiveData, commitShiftReport, listStations, type StationRow } from "@/lib/data/client";
import { getSupabaseConfigurationState } from "@/lib/supabase/client";
import { cn } from "@/lib/utils";
import { shiftReportSaveSchema } from "@/lib/validation/shift-report";

type FormMessage = {
  kind: "success" | "error" | "info";
  text: string;
};

const fieldClass = "h-10 w-full rounded-xl border bg-white px-3 text-sm outline-none focus:ring-2 focus:ring-slate-300";

function createDefaultReport(): ShiftReportInput {
  return {
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
}

function numberValue(value: string) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function replaceAt<T>(items: T[], index: number, value: T) {
  return items.map((item, itemIndex) => (itemIndex === index ? value : item));
}

function removeAt<T>(items: T[], index: number) {
  return items.filter((_item, itemIndex) => itemIndex !== index);
}

function validateReportForSave(report: ShiftReportInput, stations: StationRow[], liveData: boolean) {
  const errors: string[] = [];

  if (!liveData) {
    errors.push("Supabase is not configured, so this report can be calculated but not saved.");
  }

  const parsed = shiftReportSaveSchema.safeParse(report);
  if (!parsed.success) {
    errors.push(...parsed.error.issues.map((issue) => issue.message));
  }

  if (stations.length > 0 && !report.stationId) {
    errors.push("Select a station.");
  }

  if (!report.prices.some((price) => price.price > 0)) {
    errors.push("At least one product price must be greater than zero.");
  }

  return Array.from(new Set(errors));
}

export function ShiftReportForm() {
  const liveData = canUseLiveData();
  const config = getSupabaseConfigurationState();

  const [report, setReport] = useState<ShiftReportInput>(() => createDefaultReport());
  const [stations, setStations] = useState<StationRow[]>([]);
  const [loadingStations, setLoadingStations] = useState(liveData);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<FormMessage | null>(null);

  const result = useMemo(() => calculateShiftReport(report), [report]);

  useEffect(() => {
    if (!liveData) {
      setLoadingStations(false);
      return;
    }

    let active = true;
    setLoadingStations(true);

    listStations()
      .then((nextStations) => {
        if (!active) return;

        setStations(nextStations);

        if (nextStations.length === 1) {
          setReport((current) => ({
            ...current,
            stationId: current.stationId ?? nextStations[0].id
          }));
        }
      })
      .catch((error: Error) => {
        if (!active) return;
        setMessage({ kind: "error", text: error.message });
      })
      .finally(() => {
        if (active) setLoadingStations(false);
      });

    return () => {
      active = false;
    };
  }, [liveData]);

  function update<K extends keyof ShiftReportInput>(key: K, value: ShiftReportInput[K]) {
    setReport((current) => ({ ...current, [key]: value }));
  }

  function updatePrice(index: number, value: ProductPriceInput) {
    update("prices", replaceAt(report.prices, index, value));
  }

  function updateMeterReading(index: number, value: MeterReadingInput) {
    update("meterReadings", replaceAt(report.meterReadings, index, value));
  }

  function updateCreditReceipt(index: number, value: CreditReceiptInput) {
    update("creditReceipts", replaceAt(report.creditReceipts, index, value));
  }

  function updateExpense(index: number, value: ExpenseInput) {
    update("expenses", replaceAt(report.expenses, index, value));
  }

  function updateLubricantSale(index: number, value: LubricantSaleInput) {
    update("lubricantSales", replaceAt(report.lubricantSales, index, value));
  }

  function updateCashCount(index: number, value: CashCountInput) {
    update("cashCounts", replaceAt(report.cashCounts, index, value));
  }

  async function saveDraft(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const validationErrors = validateReportForSave(report, stations, liveData);

    if (validationErrors.length > 0) {
      setMessage({ kind: "error", text: validationErrors.join(" ") });
      return;
    }

    setSaving(true);
    setMessage(null);

    try {
      const reportId = await commitShiftReport(report);
      setMessage({ kind: "success", text: `Saved report ${reportId}.` });
    } catch (error) {
      setMessage({
        kind: "error",
        text: error instanceof Error ? error.message : "Save failed."
      });
    } finally {
      setSaving(false);
    }
  }

  return (
    <form className="grid gap-6 xl:grid-cols-[1fr_360px]" onSubmit={saveDraft}>
      <div className="space-y-6">
        {!liveData ? (
          <section className="rounded-2xl border border-amber-200 bg-amber-50 p-5 text-sm text-amber-900">
            <strong>Draft calculation is available, but saving is disabled.</strong> {config.reason}
          </section>
        ) : null}

        <section className="rounded-2xl border bg-white p-5">
          <div className="mb-4 grid gap-4 md:grid-cols-4">
            <div className="space-y-2">
              <Label>Station</Label>
              <select
                className={fieldClass}
                value={report.stationId ?? ""}
                onChange={(event) => update("stationId", event.target.value || undefined)}
                disabled={loadingStations || stations.length === 0}
              >
                <option value="">
                  {loadingStations ? "Loading stations..." : stations.length === 0 ? "No stations loaded" : "Select station"}
                </option>
                {stations.map((station) => (
                  <option key={station.id} value={station.id}>
                    {station.name}
                  </option>
                ))}
              </select>
            </div>

            <div className="space-y-2">
              <Label>Date</Label>
              <Input type="date" value={report.reportDate} onChange={(event) => update("reportDate", event.target.value)} />
            </div>

            <div className="space-y-2">
              <Label>Duty / cashier</Label>
              <Input value={report.dutyName} onChange={(event) => update("dutyName", event.target.value)} placeholder="Cashier name" />
            </div>

            <div className="space-y-2">
              <Label>Shift</Label>
              <Input value={report.shiftTimeLabel} onChange={(event) => update("shiftTimeLabel", event.target.value)} placeholder="1-9pm" />
            </div>
          </div>

          <div className="mb-4 flex items-center justify-between gap-3">
            <h2 className="font-semibold">Product prices</h2>
            <Button
              variant="outline"
              onClick={() =>
                update("prices", [
                  ...report.prices,
                  {
                    productCode: "",
                    price: 0
                  }
                ])
              }
            >
              Add product
            </Button>
          </div>

          <div className="grid gap-4 md:grid-cols-3">
            {report.prices.map((price, index) => (
              <div className="grid grid-cols-[1fr_120px_auto] gap-2" key={`${price.productCode}-${index}`}>
                <Input
                  value={price.productCode}
                  onChange={(event) => updatePrice(index, { ...price, productCode: event.target.value.toUpperCase() })}
                  placeholder="Product"
                />
                <Input
                  type="number"
                  step="0.01"
                  value={price.price}
                  onChange={(event) => updatePrice(index, { ...price, price: numberValue(event.target.value) })}
                />
                <Button variant="ghost" onClick={() => update("prices", removeAt(report.prices, index))} disabled={report.prices.length <= 1}>
                  Remove
                </Button>
              </div>
            ))}
          </div>
        </section>

        <section className="rounded-2xl border bg-white p-5">
          <div className="mb-4 flex items-center justify-between gap-3">
            <h2 className="font-semibold">Meter readings</h2>
            <Button
              variant="outline"
              onClick={() =>
                update("meterReadings", [
                  ...report.meterReadings,
                  {
                    pumpLabel: "",
                    productCode: "DIESEL",
                    beforeReading: 0,
                    afterReading: 0,
                    calibrationLiters: 0
                  }
                ])
              }
            >
              Add reading
            </Button>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full min-w-[860px] text-sm">
              <thead className="text-left text-slate-500">
                <tr>
                  <th>Pump</th>
                  <th>Product</th>
                  <th>Before</th>
                  <th>After</th>
                  <th>Calibration</th>
                  <th>Net liters</th>
                  <th className="text-right">Action</th>
                </tr>
              </thead>
              <tbody>
                {report.meterReadings.map((line, index) => {
                  const netLiters = line.afterReading - line.beforeReading - (line.calibrationLiters ?? 0);

                  return (
                    <tr className="border-t" key={`${line.pumpLabel}-${index}`}>
                      <td className="py-2">
                        <Input
                          value={line.pumpLabel}
                          onChange={(event) => updateMeterReading(index, { ...line, pumpLabel: event.target.value })}
                        />
                      </td>
                      <td>
                        <Input
                          value={line.productCode}
                          onChange={(event) => updateMeterReading(index, { ...line, productCode: event.target.value.toUpperCase() })}
                        />
                      </td>
                      <td>
                        <Input
                          type="number"
                          step="0.001"
                          value={line.beforeReading}
                          onChange={(event) => updateMeterReading(index, { ...line, beforeReading: numberValue(event.target.value) })}
                        />
                      </td>
                      <td>
                        <Input
                          type="number"
                          step="0.001"
                          value={line.afterReading}
                          onChange={(event) => updateMeterReading(index, { ...line, afterReading: numberValue(event.target.value) })}
                        />
                      </td>
                      <td>
                        <Input
                          type="number"
                          step="0.001"
                          value={line.calibrationLiters ?? 0}
                          onChange={(event) => updateMeterReading(index, { ...line, calibrationLiters: numberValue(event.target.value) })}
                        />
                      </td>
                      <td className="font-medium">{netLiters.toFixed(3)}</td>
                      <td className="text-right">
                        <Button
                          variant="ghost"
                          onClick={() => update("meterReadings", removeAt(report.meterReadings, index))}
                          disabled={report.meterReadings.length <= 1}
                        >
                          Remove
                        </Button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </section>

        <section className="rounded-2xl border bg-white p-5">
          <div className="mb-4 flex items-center justify-between gap-3">
            <h2 className="font-semibold">Credit receipts</h2>
            <Button
              variant="outline"
              onClick={() =>
                update("creditReceipts", [
                  ...report.creditReceipts,
                  {
                    productCode: "DIESEL",
                    companyName: "",
                    receiptNumber: "",
                    liters: 0,
                    amount: 0
                  }
                ])
              }
            >
              Add credit
            </Button>
          </div>

          {report.creditReceipts.length === 0 ? <p className="text-sm text-slate-500">No credit receipts added.</p> : null}

          <div className="space-y-3">
            {report.creditReceipts.map((line, index) => (
              <div className="grid gap-3 md:grid-cols-[1fr_1fr_1fr_120px_120px_auto]" key={index}>
                <Input
                  placeholder="Product"
                  value={line.productCode}
                  onChange={(event) => updateCreditReceipt(index, { ...line, productCode: event.target.value.toUpperCase() })}
                />
                <Input
                  placeholder="Company"
                  value={line.companyName}
                  onChange={(event) => updateCreditReceipt(index, { ...line, companyName: event.target.value })}
                />
                <Input
                  placeholder="Receipt #"
                  value={line.receiptNumber ?? ""}
                  onChange={(event) => updateCreditReceipt(index, { ...line, receiptNumber: event.target.value })}
                />
                <Input
                  type="number"
                  step="0.001"
                  placeholder="Liters"
                  value={line.liters}
                  onChange={(event) => updateCreditReceipt(index, { ...line, liters: numberValue(event.target.value) })}
                />
                <Input
                  type="number"
                  step="0.01"
                  placeholder="Amount"
                  value={line.amount ?? 0}
                  onChange={(event) => updateCreditReceipt(index, { ...line, amount: numberValue(event.target.value) })}
                />
                <Button variant="ghost" onClick={() => update("creditReceipts", removeAt(report.creditReceipts, index))}>
                  Remove
                </Button>
              </div>
            ))}
          </div>
        </section>

        <section className="grid gap-6 lg:grid-cols-2">
          <div className="rounded-2xl border bg-white p-5">
            <div className="mb-4 flex items-center justify-between gap-3">
              <h2 className="font-semibold">Expenses</h2>
              <Button
                variant="outline"
                onClick={() =>
                  update("expenses", [
                    ...report.expenses,
                    {
                      description: "",
                      amount: 0
                    }
                  ])
                }
              >
                Add expense
              </Button>
            </div>

            {report.expenses.length === 0 ? <p className="text-sm text-slate-500">No expenses added.</p> : null}

            <div className="space-y-3">
              {report.expenses.map((line, index) => (
                <div className="grid grid-cols-[1fr_120px_auto] gap-3" key={index}>
                  <Input
                    placeholder="Description"
                    value={line.description}
                    onChange={(event) => updateExpense(index, { ...line, description: event.target.value })}
                  />
                  <Input
                    type="number"
                    step="0.01"
                    value={line.amount}
                    onChange={(event) => updateExpense(index, { ...line, amount: numberValue(event.target.value) })}
                  />
                  <Button variant="ghost" onClick={() => update("expenses", removeAt(report.expenses, index))}>
                    Remove
                  </Button>
                </div>
              ))}
            </div>
          </div>

          <div className="rounded-2xl border bg-white p-5">
            <div className="mb-4 flex items-center justify-between gap-3">
              <h2 className="font-semibold">Lubricant sales</h2>
              <Button
                variant="outline"
                onClick={() =>
                  update("lubricantSales", [
                    ...report.lubricantSales,
                    {
                      productName: "",
                      quantity: 0,
                      unitPrice: 0
                    }
                  ])
                }
              >
                Add lube
              </Button>
            </div>

            {report.lubricantSales.length === 0 ? <p className="text-sm text-slate-500">No lubricant sales added.</p> : null}

            <div className="space-y-3">
              {report.lubricantSales.map((line, index) => (
                <div className="grid grid-cols-[1fr_90px_110px_auto] gap-3" key={index}>
                  <Input
                    placeholder="Product"
                    value={line.productName}
                    onChange={(event) => updateLubricantSale(index, { ...line, productName: event.target.value })}
                  />
                  <Input
                    type="number"
                    step="0.001"
                    value={line.quantity}
                    onChange={(event) => updateLubricantSale(index, { ...line, quantity: numberValue(event.target.value) })}
                  />
                  <Input
                    type="number"
                    step="0.01"
                    value={line.unitPrice}
                    onChange={(event) => updateLubricantSale(index, { ...line, unitPrice: numberValue(event.target.value) })}
                  />
                  <Button variant="ghost" onClick={() => update("lubricantSales", removeAt(report.lubricantSales, index))}>
                    Remove
                  </Button>
                </div>
              ))}
            </div>
          </div>
        </section>

        <section className="rounded-2xl border bg-white p-5">
          <h2 className="mb-4 font-semibold">Cash count</h2>
          <div className="grid gap-3 md:grid-cols-3">
            {report.cashCounts.map((line, index) => (
              <div className="grid grid-cols-[90px_1fr] items-center gap-2" key={`${line.denomination}-${index}`}>
                <Label>{line.denomination}</Label>
                <Input
                  type="number"
                  step="1"
                  value={line.quantity}
                  onChange={(event) => updateCashCount(index, { ...line, quantity: numberValue(event.target.value) })}
                />
              </div>
            ))}

            <div className="grid grid-cols-[90px_1fr] items-center gap-2">
              <Label>Coins</Label>
              <Input
                type="number"
                step="0.01"
                value={report.coinsAmount ?? 0}
                onChange={(event) => update("coinsAmount", numberValue(event.target.value))}
              />
            </div>
          </div>
        </section>
      </div>

      <aside className="space-y-4 xl:sticky xl:top-4 xl:self-start">
        <BalanceSummary result={result} />

        <div className="rounded-2xl border bg-white p-5">
          <Label>Edit / save note</Label>
          <Textarea
            className="mt-2"
            value={report.editReason ?? ""}
            onChange={(event) => update("editReason", event.target.value)}
            placeholder="Required for Admin edits."
          />

          <Button className="mt-4 w-full" type="submit" disabled={saving || !liveData}>
            {saving ? "Saving..." : liveData ? "Save draft" : "Connect Supabase to save"}
          </Button>

          {message ? (
            <p
              className={cn(
                "mt-3 text-sm",
                message.kind === "success" && "text-green-700",
                message.kind === "error" && "text-red-700",
                message.kind === "info" && "text-slate-600"
              )}
            >
              {message.text}
            </p>
          ) : null}
        </div>
      </aside>
    </form>
  );
}
