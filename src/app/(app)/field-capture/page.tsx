import React from "react";
import { appPath } from "@/lib/supabase/client";

const shiftOptions = ["5am–1pm", "1pm–9pm", "9pm–5am", "Custom"];

const stagedSections = [
  {
    title: "1. Select station",
    description: "Choose the active station before entering readings and cash details.",
    status: "Ready for UI"
  },
  {
    title: "2. Select shift",
    description: "Choose one shift option for the current report.",
    status: "Ready for UI"
  },
  {
    title: "3. Opening / closing meter readings",
    description: "Cashier enters opening and closing readings. Photo-assisted reading and OCR confirmation will be added later.",
    status: "Coming soon"
  },
  {
    title: "4. Cash count",
    description: "Capture end-of-shift cash count with clear denomination totals.",
    status: "Coming soon"
  },
  {
    title: "5. Receipts and expenses",
    description: "Capture receipt references and expense entries with cashier confirmation.",
    status: "Coming soon"
  },
  {
    title: "6. Fuel delivery received during shift",
    description: "Record product and liters received during this shift.",
    status: "Coming soon"
  },
  {
    title: "7. Review summary",
    description: "Show discrepancy summary before submit so cashier can confirm values.",
    status: "Coming soon"
  },
  {
    title: "8. Submit shift",
    description: "Final submit remains disabled until secure publish workflow is available.",
    status: "Planned"
  }
];

const captureCards = [
  {
    title: "Meter reading photos",
    lines: [
      "Upload meter photo",
      "OCR-assisted reading: coming soon",
      "Cashier must confirm extracted values before saving."
    ]
  },
  {
    title: "Receipt photos",
    lines: [
      "Upload receipt photo",
      "Receipt number extraction: coming soon",
      "Cashier must confirm invoice number, amount, product, liters."
    ]
  },
  {
    title: "Fuel delivery receipt",
    lines: [
      "Upload delivery receipt",
      "Cashier enters product and liters received manually for now."
    ]
  }
];

export default function FieldCapturePage() {
  return (
    <div className="space-y-6">
      <div className="rounded-2xl border border-blue-200 bg-blue-50 p-4 text-sm text-blue-900">
        <strong>Mobile browser foundation:</strong> this page prepares cashier flow for field use. Continue using{" "}
        <a className="underline" href={appPath("/shift-reports/")}>Daily Shift Reports</a> for active submissions.
      </div>

      <header className="space-y-2">
        <h1 className="text-2xl font-semibold tracking-tight">Field Shift Capture</h1>
        <p className="text-sm text-slate-600">Mobile-first staged workflow for cashier shift capture on phone browsers.</p>
      </header>

      <section className="rounded-2xl border bg-white p-4">
        <h2 className="text-base font-semibold text-slate-900">Shift options (UI preview)</h2>
        <div className="mt-3 grid gap-2 sm:grid-cols-2">
          {shiftOptions.map((option) => (
            <label key={option} className="flex min-h-11 items-center gap-2 rounded-xl border px-3 text-sm">
              <input type="radio" name="shift-option-preview" disabled />
              <span>{option}</span>
            </label>
          ))}
        </div>
      </section>

      <section className="grid gap-3">
        {stagedSections.map((section) => (
          <article key={section.title} className="rounded-2xl border bg-white p-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h2 className="text-base font-semibold text-slate-900">{section.title}</h2>
              <span className="rounded-full border bg-slate-50 px-2 py-1 text-xs text-slate-600">{section.status}</span>
            </div>
            <p className="mt-1.5 text-sm text-slate-600">{section.description}</p>
          </article>
        ))}
      </section>

      <section className="space-y-3">
        <h2 className="text-base font-semibold text-slate-900">Future photo-assisted capture cards</h2>
        <div className="grid gap-3 md:grid-cols-3">
          {captureCards.map((card) => (
            <article key={card.title} className="rounded-2xl border bg-white p-4">
              <h3 className="text-sm font-semibold text-slate-900">{card.title}</h3>
              <ul className="mt-2 space-y-1 text-sm text-slate-600">
                {card.lines.map((line) => (
                  <li key={line}>• {line}</li>
                ))}
              </ul>
              <button className="mt-3 min-h-11 w-full rounded-xl border px-3 text-sm text-slate-500" disabled type="button">
                Upload (coming soon)
              </button>
            </article>
          ))}
        </div>
      </section>

      <section className="rounded-2xl border bg-white p-4 text-sm text-slate-600">
        <p>Photo-assisted reading and OCR confirmation will be added later.</p>
        <p className="mt-2">No fake OCR output is shown or saved in this phase.</p>
      </section>
    </div>
  );
}
