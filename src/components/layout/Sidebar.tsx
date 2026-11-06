"use client";

import React, { useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import {
  LayoutDashboard,
  BookOpen,
  Calendar,
  Users,
  CreditCard,
  Camera,
  FileCheck,
  HelpCircle,
  Gamepad2,
  Trophy,
  Settings,
  LogOut,
  GraduationCap,
} from "lucide-react";
import { cn } from "@/lib/utils";

export interface SidebarProps {
  user: {
    id: string;
    email: string;
    fullName: string;
    phone?: string | null;
    avatarUrl?: string | null;
  };
  workspace: {
    id: string;
    name: string;
    currency: string;
  };
}

const NAV_ITEMS = [
  {
    href: "/dashboard",
    label: "Tổng quan",
    icon: LayoutDashboard,
    testId: "nav-dashboard",
  },
  {
    href: "/classes",
    label: "Lớp học",
    icon: BookOpen,
    testId: "nav-classes",
  },
  {
    href: "/schedule",
    label: "Thời khoá biểu",
    icon: Calendar,
    testId: "nav-schedule",
  },
  {
    href: "/students",
    label: "Học sinh & Phụ huynh",
    icon: Users,
    testId: "nav-students",
  },
  {
    href: "/fees",
    label: "Học phí & VietQR",
    icon: CreditCard,
    testId: "nav-fees",
  },
  {
    href: "/sessions",
    label: "Buổi học & Điểm danh",
    icon: Camera,
    testId: "nav-sessions",
  },
  {
    href: "/homeworks",
    label: "Bài tập về nhà",
    icon: FileCheck,
    testId: "nav-homeworks",
  },
  {
    href: "/questions",
    label: "Kho bài tập",
    icon: HelpCircle,
    testId: "nav-questions",
  },
  {
    href: "/minigames",
    label: "Kho Minigame",
    icon: Gamepad2,
    testId: "nav-minigames",
  },
  {
    href: "/leaderboard",
    label: "Bảng xếp hạng",
    icon: Trophy,
    testId: "nav-leaderboard",
  },
  {
    href: "/settings",
    label: "Cài đặt Workspace",
    icon: Settings,
    testId: "nav-settings",
  },
] as const;

export function Sidebar({ user, workspace }: SidebarProps) {
  const pathname = usePathname();
  const router = useRouter();
  const [loggingOut, setLoggingOut] = useState(false);

  async function handleLogout() {
    try {
      setLoggingOut(true);
      await fetch("/api/auth/logout", { method: "POST" });
      router.push("/login");
      router.refresh();
    } catch {
      window.location.href = "/login";
    } finally {
      setLoggingOut(false);
    }
  }

  return (
    <aside className="flex h-screen w-68 shrink-0 flex-col border-r border-slate-200 bg-white">
      {/* Workspace Brand Header */}
      <div className="border-b border-slate-100 p-4">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-blue-600 text-white shadow-xs">
            <GraduationCap className="h-5 w-5" />
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-xs font-semibold uppercase tracking-wider text-blue-600">
              CM-CLASS WORKSPACE
            </p>
            <h2
              data-testid="active-workspace-name"
              className="truncate text-sm font-bold text-slate-900"
              title={workspace.name}
            >
              {workspace.name}
            </h2>
          </div>
        </div>
      </div>

      {/* Navigation Links */}
      <nav className="flex-1 space-y-1 overflow-y-auto px-3 py-4">
        {NAV_ITEMS.map((item) => {
          const Icon = item.icon;
          const isActive =
            pathname === item.href || pathname.startsWith(`${item.href}/`);
          return (
            <Link
              key={item.href}
              href={item.href}
              prefetch={false}
              data-testid={item.testId}
              className={cn(
                "flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors",
                isActive
                  ? "bg-blue-50 text-blue-700 font-semibold"
                  : "text-slate-600 hover:bg-slate-100 hover:text-slate-900"
              )}
            >
              <Icon
                className={cn(
                  "h-4 w-4 shrink-0",
                  isActive ? "text-blue-600" : "text-slate-400"
                )}
              />
              <span className="truncate">{item.label}</span>
            </Link>
          );
        })}
      </nav>

      {/* Teacher Profile & Logout Footer */}
      <div className="border-t border-slate-200 bg-slate-50/60 p-4">
        <div
          data-testid="active-user-email"
          className="mb-3 rounded-lg border border-slate-200/80 bg-white px-3 py-2"
        >
          <p className="truncate text-sm font-semibold text-slate-900">
            {user.fullName}
          </p>
          <p className="truncate text-xs text-slate-500">{user.email}</p>
        </div>

        <button
          type="button"
          data-testid="logout-button"
          disabled={loggingOut}
          onClick={handleLogout}
          className="flex w-full items-center justify-center gap-2 rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs font-medium text-slate-700 transition-colors hover:bg-red-50 hover:text-red-600 hover:border-red-200 disabled:opacity-50"
        >
          <LogOut className="h-3.5 w-3.5" />
          <span>{loggingOut ? "Đang đăng xuất..." : "Đăng xuất"}</span>
        </button>
      </div>
    </aside>
  );
}
