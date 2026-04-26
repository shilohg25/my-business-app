import React from "react";
import { appPath } from "@/lib/supabase/client";

const sections = [
  {
    title: "1. Closing meter photo capture",
    text: "Cashiers will take closing meter photos. OCR will extract readings, then cashiers will confirm or correct values before publishing."
  },
  {
    title: "2. Shift handoff",
    text: "Confirmed closing readings become the next shift's opening readings. Both shifts should have a clear handoff trail."
  },
  {
    title: "3. Cash count",
    text: "Cashiers will enter denomination counts and loose coins before submitting the shift."
  },
  {
    title: "4. Credit/invoice receipts",
    text: "Cashiers will photograph receipts. OCR can extract invoice or receipt number, while the cashier confirms product, liters, company, and amount."
  },
  {
    title: "5. Expenses",
    text: "Cashiers will submit daily expenses with optional receipt photos."
  },
  {
    title: "6. Fuel delivery during shift",
    text: "Cashiers can record fuel deliveries by product, liters received, delivery receipt photo, and optional before/after tank or supplier meter readings."
  },
  {
    title: "7. Final review before submit",
    text: "The app will calculate fuel sales, cash count, expenses, lubricant sales, credit liters, and discrepancy before the cashier submits."
  },
  {
    title: "8. Owner/Admin review",
    text: "Submitted shifts appear in Daily Shift Reports for manager review and approval."
  }
];

export default function FieldCapturePage() {
  return (
    <div className="space-y-6">
      <div className="rounded-2xl border border-blue-200 bg-blue-50 p-4 text-sm text-blue-900">
        <strong>Coming soon:</strong> Field Shift Capture is planned for mobile-ready cashier shift submission.
      </div>

      <header>
        <h1 className="text-2xl font-semibold tracking-tight">Field Shift Capture</h1>
        <p className="text-sm text-slate-500">Mobile-ready cashier workflow for photo-assisted shift closing and handoff.</p>
        <p className="mt-2 text-sm text-slate-600">
          This page describes the rollout direction. Continue using <a className="underline" href={appPath("/shift-reports/")}>Daily Shift Reports</a> for active operations until mobile submission is released.
        </p>
      </header>

      <section className="grid gap-3">
        {sections.map((section) => (
          <article className="rounded-2xl border bg-white p-4" key={section.title}>
            <h2 className="text-base font-semibold text-slate-900">{section.title}</h2>
            <p className="mt-1.5 text-sm text-slate-600">{section.text}</p>
          </article>
        ))}
      </section>
    </div>
  );
}
