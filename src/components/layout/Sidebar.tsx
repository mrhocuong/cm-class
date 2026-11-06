"use client";

import React, { useEffect, useState } from "react";
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
  Menu,
  X,
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
    shortLabel: "Tổng quan",
    icon: LayoutDashboard,
    testId: "nav-dashboard",
  },
  {
    href: "/classes",
    label: "Lớp học",
    shortLabel: "Lớp học",
    icon: BookOpen,
    testId: "nav-classes",
  },
  {
    href: "/schedule",
    label: "Thời khoá biểu",
    shortLabel: "Lịch dạy",
    icon: Calendar,
    testId: "nav-schedule",
  },
  {
    href: "/students",
    label: "Học sinh & Phụ huynh",
    shortLabel: "Học sinh",
    icon: Users,
    testId: "nav-students",
  },
  {
    href: "/fees",
    label: "Học phí & VietQR",
    shortLabel: "Học phí",
    icon: CreditCard,
    testId: "nav-fees",
  },
  {
    href: "/sessions",
    label: "Buổi học & Điểm danh",
    shortLabel: "Điểm danh",
    icon: Camera,
    testId: "nav-sessions",
  },
  {
    href: "/homeworks",
    label: "Bài tập về nhà",
    shortLabel: "BTVN",
    icon: FileCheck,
    testId: "nav-homeworks",
  },
  {
    href: "/questions",
    label: "Kho bài tập",
    shortLabel: "Kho đề",
    icon: HelpCircle,
    testId: "nav-questions",
  },
  {
    href: "/minigames",
    label: "Kho Minigame",
    shortLabel: "Minigame",
    icon: Gamepad2,
    testId: "nav-minigames",
  },
  {
    href: "/leaderboard",
    label: "Bảng xếp hạng",
    shortLabel: "Xếp hạng",
    icon: Trophy,
    testId: "nav-leaderboard",
  },
  {
    href: "/settings",
    label: "Cài đặt Workspace",
    shortLabel: "Cài đặt",
    icon: Settings,
    testId: "nav-settings",
  },
] as const;

const MOBILE_QUICK_TABS = [
  NAV_ITEMS[0], // Tổng quan
  NAV_ITEMS[1], // Lớp học
  NAV_ITEMS[5], // Điểm danh
  NAV_ITEMS[4], // Học phí
] as const;

export function Sidebar({ user, workspace }: SidebarProps) {
  const pathname = usePathname();
  const router = useRouter();
  const [loggingOut, setLoggingOut] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);

  // Close mobile drawer automatically when route changes
  useEffect(() => {
    setMobileOpen(false);
  }, [pathname]);

  // Close mobile drawer on Escape key
  useEffect(() => {
    if (!mobileOpen) return;
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") {
        setMobileOpen(false);
      }
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [mobileOpen]);

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

  const activeNavItem =
    NAV_ITEMS.find(
      (item) => pathname === item.href || pathname.startsWith(`${item.href}/`)
    ) || NAV_ITEMS[0];

  return (
    <>
      {/* Mobile & Tablet Sticky Top Bar (< 1024px) */}
      <header className="sticky top-0 z-30 flex h-14 w-full items-center justify-between border-b border-slate-200 bg-white/95 px-3.5 backdrop-blur-md sm:px-6 lg:hidden">
        <div className="flex min-w-0 items-center gap-2.5">
          <button
            type="button"
            data-testid="mobile-menu-toggle"
            aria-label="Mở menu điều hướng"
            onClick={() => setMobileOpen(true)}
            className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-slate-200 bg-white text-slate-700 shadow-2xs transition hover:bg-slate-100 active:scale-95"
          >
            <Menu className="h-5 w-5" />
          </button>

          <Link
            href="/dashboard"
            prefetch={false}
            className="flex min-w-0 items-center gap-2"
          >
            <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-blue-600 text-white">
              <GraduationCap className="h-4 w-4" />
            </div>
            <div className="min-w-0">
              <p className="truncate text-xs font-bold text-slate-900">
                {workspace.name}
              </p>
              <p className="truncate text-[11px] font-medium text-blue-600">
                {activeNavItem.label}
              </p>
            </div>
          </Link>
        </div>

        <div className="flex shrink-0 items-center gap-2">
          <span className="hidden rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1 text-xs font-medium text-slate-700 sm:inline-block">
            {user.fullName}
          </span>
          <Link
            href="/settings"
            prefetch={false}
            aria-label="Cài đặt Workspace"
            className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-slate-200 bg-white text-slate-600 hover:bg-slate-100"
          >
            <Settings className="h-4 w-4" />
          </Link>
        </div>
      </header>

      {/* Mobile & Tablet Off-Canvas Backdrop Overlay */}
      {mobileOpen && (
        <div
          aria-hidden="true"
          onClick={() => setMobileOpen(false)}
          className="fixed inset-0 z-40 bg-slate-900/50 backdrop-blur-xs transition-opacity lg:hidden"
        />
      )}

      {/* Sidebar Drawer (Off-canvas on <1024px, Fixed left column on >=1024px) */}
      <aside
        className={cn(
          "fixed inset-y-0 left-0 z-50 flex h-dvh w-72 shrink-0 flex-col border-r border-slate-200 bg-white shadow-2xl transition-transform duration-200 ease-in-out lg:static lg:z-auto lg:h-screen lg:w-64 lg:translate-x-0 lg:shadow-none xl:w-72",
          mobileOpen ? "translate-x-0" : "-translate-x-full lg:translate-x-0"
        )}
      >
        {/* Workspace Brand Header */}
        <div className="flex items-center justify-between border-b border-slate-100 p-4">
          <div className="flex min-w-0 items-center gap-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-blue-600 text-white shadow-xs">
              <GraduationCap className="h-5 w-5" />
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-[11px] font-semibold uppercase tracking-wider text-blue-600">
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

          <button
            type="button"
            aria-label="Đóng menu"
            onClick={() => setMobileOpen(false)}
            className="inline-flex h-8 w-8 items-center justify-center rounded-lg text-slate-400 hover:bg-slate-100 hover:text-slate-700 lg:hidden"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Navigation Links */}
        <nav className="flex-1 space-y-1 overflow-y-auto px-3 py-3.5">
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
                onClick={() => setMobileOpen(false)}
                className={cn(
                  "flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors",
                  isActive
                    ? "bg-blue-50 font-semibold text-blue-700"
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
            className="flex w-full items-center justify-center gap-2 rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs font-medium text-slate-700 transition-colors hover:border-red-200 hover:bg-red-50 hover:text-red-600 disabled:opacity-50"
          >
            <LogOut className="h-3.5 w-3.5" />
            <span>{loggingOut ? "Đang đăng xuất..." : "Đăng xuất"}</span>
          </button>
        </div>
      </aside>

      {/* Mobile & Tablet Bottom Quick Navigation Bar (< 1024px) */}
      <nav
        aria-label="Thanh điều hướng nhanh"
        className="fixed inset-x-0 bottom-0 z-30 flex h-16 items-center justify-around border-t border-slate-200 bg-white/95 px-2 pb-[env(safe-area-inset-bottom)] backdrop-blur-md lg:hidden"
      >
        {MOBILE_QUICK_TABS.map((item) => {
          const Icon = item.icon;
          const isActive =
            pathname === item.href || pathname.startsWith(`${item.href}/`);
          return (
            <Link
              key={item.href}
              href={item.href}
              prefetch={false}
              className={cn(
                "flex min-w-0 flex-1 flex-col items-center justify-center gap-1 py-1.5 text-[11px] font-medium transition-colors",
                isActive
                  ? "font-semibold text-blue-600"
                  : "text-slate-500 hover:text-slate-900"
              )}
            >
              <Icon
                className={cn(
                  "h-5 w-5 shrink-0",
                  isActive ? "text-blue-600" : "text-slate-400"
                )}
              />
              <span className="truncate">{item.shortLabel}</span>
            </Link>
          );
        })}

        <button
          type="button"
          onClick={() => setMobileOpen(true)}
          className={cn(
            "flex min-w-0 flex-1 flex-col items-center justify-center gap-1 py-1.5 text-[11px] font-medium transition-colors",
            mobileOpen
              ? "font-semibold text-blue-600"
              : "text-slate-500 hover:text-slate-900"
          )}
        >
          <Menu className="h-5 w-5 shrink-0 text-slate-400" />
          <span className="truncate">Menu</span>
        </button>
      </nav>
    </>
  );
}
