import React from "react";
import { redirect } from "next/navigation";
import { getServerWorkspaceContext } from "@/lib/workspace";
import { Sidebar } from "@/components/layout/Sidebar";

export default async function AppShellLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const ctx = await getServerWorkspaceContext();
  if (!ctx) {
    redirect("/login");
  }

  return (
    <div className="flex min-h-dvh w-full flex-col bg-slate-50 lg:h-screen lg:flex-row lg:overflow-hidden">
      <Sidebar user={ctx.user} workspace={ctx.workspace} />
      <main className="flex-1 min-w-0 overflow-y-auto px-3.5 py-4 pb-24 sm:px-6 sm:py-6 lg:p-8 lg:pb-8">
        {children}
      </main>
    </div>
  );
}
