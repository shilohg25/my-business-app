import { Sidebar } from "@/components/app/sidebar";
import { Topbar } from "@/components/app/topbar";
import { SupabaseStatus } from "@/components/app/supabase-status";

export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen bg-slate-50">
      <Sidebar />
      <div className="min-w-0 flex-1">
        <Topbar />
        <SupabaseStatus />
        <main className="p-6">{children}</main>
      </div>
    </div>
  );
}
