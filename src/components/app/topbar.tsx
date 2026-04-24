"use client";

import Link from "next/link";
import { Button } from "@/components/ui/button";
import { isSupabaseConfigured } from "@/lib/supabase/client";

export function Topbar() {
  return (
    <header className="no-print flex h-16 items-center justify-between border-b bg-white px-6">
      <div>
        <div className="text-sm font-medium text-slate-900">Operations Console</div>
        <div className="text-xs text-slate-500">Shift reports, remittance, inventory, and audit</div>
      </div>
      <div className="flex items-center gap-2">
        <Button variant="outline" onClick={() => window.print()}>Print</Button>
        <Link className="inline-flex h-10 items-center justify-center rounded-xl bg-slate-900 px-4 text-sm font-medium text-white hover:bg-slate-800" href="/shift-reports/new">New Shift Report</Link>
        <Link className="inline-flex h-10 items-center justify-center rounded-xl border px-4 text-sm font-medium" href="/login">{isSupabaseConfigured() ? "Login" : "Setup"}</Link>
      </div>
    </header>
  );
}
