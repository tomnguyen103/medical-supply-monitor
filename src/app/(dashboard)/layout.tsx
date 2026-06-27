import { Sidebar } from "@/components/dashboard/sidebar";
import { Topbar } from "@/components/dashboard/topbar";
import { integrations } from "@/lib/env";

export default function DashboardLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <div className="flex min-h-[100dvh]">
      <Sidebar />
      <div className="flex min-w-0 flex-1 flex-col">
        <Topbar clerkConfigured={integrations.clerkClient} />
        <main className="mx-auto w-full max-w-6xl flex-1 p-6 lg:p-8">{children}</main>
      </div>
    </div>
  );
}
