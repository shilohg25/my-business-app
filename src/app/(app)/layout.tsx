"use client";

import { useState } from "react";
import { Sidebar } from "@/components/app/sidebar";
import { Topbar } from "@/components/app/topbar";
import { SupabaseStatus } from "@/components/app/supabase-status";

export default function AppLayout({ children }: { children: React.ReactNode }) {
  const [mobileNavOpen, setMobileNavOpen] = useState(false);

  return (
    <div className="flex min-h-screen bg-slate-50">
      <Sidebar mobileOpen={mobileNavOpen} onCloseMobile={() => setMobileNavOpen(false)} />
      <div className="min-w-0 flex-1">
        <Topbar onOpenMobileNav={() => setMobileNavOpen(true)} />
        <SupabaseStatus />
        <main className="p-4 sm:p-6">{children}</main>
      </div>
    </div>
  );
}
