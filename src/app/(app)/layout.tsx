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
    <div className="flex h-screen w-full overflow-hidden bg-slate-50">
      <Sidebar user={ctx.user} workspace={ctx.workspace} />
      <main className="flex-1 overflow-y-auto p-6 lg:p-8">{children}</main>
    </div>
  );
}
