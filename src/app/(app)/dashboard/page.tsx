"use client";

import React, { useEffect, useState } from "react";
import Link from "next/link";
import {
  BookOpen,
  Users,
  Calendar,
  CreditCard,
  Clock,
  ArrowRight,
  AlertTriangle,
  CheckCircle2,
  Plus,
  Camera,
  Gamepad2,
} from "lucide-react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { formatVND, formatDateVn } from "@/lib/utils";

interface DashboardResponse {
  workspace: {
    id: string;
    name: string;
    currency: string;
    bankConfigured: boolean;
  };
  billingPeriod: string;
  kpis: {
    totalClasses: number;
    activeClasses: number;
    totalStudents: number;
    activeStudents: number;
    todaySessionsCount: number;
    monthlyNetTuition: number;
    monthlyCollected: number;
    monthlyOutstanding: number;
    collectionRate: number;
  };
  todaySessions: Array<{
    id: string;
    sessionDate: string;
    startTime: string;
    endTime: string;
    room: string | null;
    topic: string | null;
    status: string;
    class: {
      id: string;
      code: string;
      name: string;
      subject: string;
      room: string | null;
      color: string | null;
    };
  }>;
  recentPayments: Array<{
    id: string;
    receiptNumber: string;
    amount: number;
    method: "CASH" | "BANK_TRANSFER";
    paidAt: string;
    invoice: {
      id: string;
      invoiceNumber: string;
      billingPeriod: string;
      student: { id: string; studentCode: string; fullName: string };
      class: { id: string; code: string; name: string };
    };
  }>;
  overdueInvoices: Array<{
    id: string;
    invoiceNumber: string;
    title: string;
    billingPeriod: string;
    netAmount: number;
    paidAmount: number;
    status: string;
    dueDate: string;
    student: {
      id: string;
      studentCode: string;
      fullName: string;
      phone: string | null;
      guardians: Array<{ fullName: string; phone: string }>;
    };
    class: { id: string; code: string; name: string };
  }>;
}

export default function DashboardPage() {
  const [data, setData] = useState<DashboardResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function fetchDashboard() {
      try {
        setLoading(true);
        const res = await fetch("/api/dashboard");
        if (!res.ok) {
          throw new Error("Không thể tải dữ liệu bảng điều khiển");
        }
        const json = (await res.json()) as DashboardResponse;
        setData(json);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Lỗi tải bảng điều khiển");
      } finally {
        setLoading(false);
      }
    }
    fetchDashboard();
  }, []);

  if (loading) {
    return (
      <div className="space-y-6">
        <div className="h-8 w-64 animate-pulse rounded-lg bg-slate-200" />
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {[1, 2, 3, 4].map((n) => (
            <div
              key={n}
              className="h-32 animate-pulse rounded-xl bg-slate-200"
            />
          ))}
        </div>
      </div>
    );
  }

  if (error || !data) {
    return (
      <Card>
        <CardContent className="p-6 text-sm text-red-600">
          {error || "Không có dữ liệu hiển thị"}
        </CardContent>
      </Card>
    );
  }

  const { kpis, todaySessions, recentPayments, overdueInvoices } = data;

  return (
    <div className="mx-auto max-w-7xl space-y-6">
      {/* Header & Quick Actions */}
      <div className="flex flex-col justify-between gap-4 lg:flex-row lg:items-center">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">
            Tổng quan Workspace — {data.workspace.name}
          </h1>
          <p className="text-sm text-slate-600">
            Kỳ học phí đang theo dõi: <strong>{data.billingPeriod}</strong> •{" "}
            {data.workspace.bankConfigured
              ? "Đã tích hợp VietQR tự động"
              : "Chưa cấu hình tài khoản ngân hàng VietQR"}
          </p>
        </div>

        <div
          data-testid="dashboard-quick-actions"
          className="flex flex-wrap items-center gap-2"
        >
          <Link href="/classes" prefetch={false}>
            <Button variant="outline" size="sm">
              <Plus className="h-3.5 w-3.5" />
              <span>Tạo lớp học mới</span>
            </Button>
          </Link>
          <Link href="/students" prefetch={false}>
            <Button variant="outline" size="sm">
              <Plus className="h-3.5 w-3.5" />
              <span>Thêm học sinh</span>
            </Button>
          </Link>
          <Link href="/fees" prefetch={false}>
            <Button variant="outline" size="sm">
              <CreditCard className="h-3.5 w-3.5" />
              <span>Lập kỳ thu học phí</span>
            </Button>
          </Link>
          <Link href="/sessions" prefetch={false}>
            <Button variant="default" size="sm">
              <Camera className="h-3.5 w-3.5" />
              <span>Điểm danh FaceAI</span>
            </Button>
          </Link>
          <Link href="/minigames" prefetch={false}>
            <Button variant="secondary" size="sm">
              <Gamepad2 className="h-3.5 w-3.5" />
              <span>Tổ chức Minigame</span>
            </Button>
          </Link>
        </div>
      </div>

      {/* 4 KPI Cards */}
      <div
        data-testid="dashboard-kpis"
        className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4"
      >
        <Card data-testid="kpi-active-classes">
          <CardContent className="p-5">
            <div className="flex items-center justify-between">
              <span className="text-sm font-medium text-slate-500">
                Lớp đang hoạt động
              </span>
              <div className="rounded-lg bg-blue-50 p-2 text-blue-600">
                <BookOpen className="h-5 w-5" />
              </div>
            </div>
            <div className="mt-3 flex items-baseline gap-2">
              <span className="text-3xl font-bold text-slate-900">
                {kpis.activeClasses}
              </span>
              <span className="text-xs text-slate-500">
                / {kpis.totalClasses} tổng số lớp
              </span>
            </div>
          </CardContent>
        </Card>

        <Card data-testid="kpi-active-students">
          <CardContent className="p-5">
            <div className="flex items-center justify-between">
              <span className="text-sm font-medium text-slate-500">
                Học sinh đang theo học
              </span>
              <div className="rounded-lg bg-emerald-50 p-2 text-emerald-600">
                <Users className="h-5 w-5" />
              </div>
            </div>
            <div className="mt-3 flex items-baseline gap-2">
              <span className="text-3xl font-bold text-slate-900">
                {kpis.activeStudents}
              </span>
              <span className="text-xs text-slate-500">
                / {kpis.totalStudents} hồ sơ
              </span>
            </div>
          </CardContent>
        </Card>

        <Card data-testid="kpi-today-sessions">
          <CardContent className="p-5">
            <div className="flex items-center justify-between">
              <span className="text-sm font-medium text-slate-500">
                Ca dạy hôm nay / Sắp tới
              </span>
              <div className="rounded-lg bg-purple-50 p-2 text-purple-600">
                <Calendar className="h-5 w-5" />
              </div>
            </div>
            <div className="mt-3 flex items-baseline gap-2">
              <span className="text-3xl font-bold text-slate-900">
                {kpis.todaySessionsCount}
              </span>
              <span className="text-xs text-slate-500">buổi học</span>
            </div>
          </CardContent>
        </Card>

        <Card data-testid="kpi-monthly-tuition">
          <CardContent className="p-5">
            <div className="flex items-center justify-between">
              <span className="text-sm font-medium text-slate-500">
                Thực thu / Công nợ kỳ này
              </span>
              <div className="rounded-lg bg-amber-50 p-2 text-amber-600">
                <CreditCard className="h-5 w-5" />
              </div>
            </div>
            <div className="mt-2">
              <p className="text-xl font-bold text-emerald-700">
                {formatVND(kpis.monthlyCollected)}
              </p>
              <p className="mt-1 text-xs text-slate-500">
                Còn nợ:{" "}
                <strong className="text-red-600">
                  {formatVND(kpis.monthlyOutstanding)}
                </strong>{" "}
                ({kpis.collectionRate}% đã thu)
              </p>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Main Content Grid: Today's Sessions & Recent Payments */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        {/* Today's Sessions List */}
        <Card data-testid="today-sessions-list">
          <CardHeader className="flex flex-row items-center justify-between">
            <div>
              <CardTitle>Lịch dạy hôm nay & Sắp tới</CardTitle>
              <CardDescription>
                Các buổi học cần điểm danh và quản lý bài tập về nhà
              </CardDescription>
            </div>
            <Link
              href="/sessions"
              prefetch={false}
              className="inline-flex items-center gap-1 text-xs font-semibold text-blue-600 hover:underline"
            >
              <span>Tất cả buổi học</span>
              <ArrowRight className="h-3.5 w-3.5" />
            </Link>
          </CardHeader>
          <CardContent>
            {todaySessions.length === 0 ? (
              <p className="py-6 text-center text-sm text-slate-500">
                Không có buổi học nào được lên lịch.
              </p>
            ) : (
              <div className="space-y-3">
                {todaySessions.map((sess) => (
                  <div
                    key={sess.id}
                    className="flex flex-col justify-between gap-3 rounded-xl border border-slate-200 p-4 transition hover:bg-slate-50 sm:flex-row sm:items-center"
                  >
                    <div className="space-y-1">
                      <div className="flex items-center gap-2">
                        <Badge variant="default">
                          {sess.startTime} - {sess.endTime}
                        </Badge>
                        <span className="text-xs font-medium text-slate-500">
                          {formatDateVn(sess.sessionDate)}
                        </span>
                        {sess.room && (
                          <Badge variant="secondary">{sess.room}</Badge>
                        )}
                      </div>
                      <p className="font-semibold text-slate-900">
                        {sess.class.code} — {sess.class.name}
                      </p>
                      <p className="text-xs text-slate-600">
                        {sess.topic || "Buổi học định kỳ theo thời khoá biểu"}
                      </p>
                    </div>

                    <Link href={`/sessions/${sess.id}`} prefetch={false}>
                      <Button variant="outline" size="sm">
                        <Clock className="h-3.5 w-3.5" />
                        <span>Điểm danh & Lớp học</span>
                      </Button>
                    </Link>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Recent Payments List */}
        <Card data-testid="recent-payments-list">
          <CardHeader className="flex flex-row items-center justify-between">
            <div>
              <CardTitle>Giao dịch nộp học phí gần đây</CardTitle>
              <CardDescription>
                Phiếu thu tiền mặt và chuyển khoản VietQR mới nhất
              </CardDescription>
            </div>
            <Link
              href="/fees"
              prefetch={false}
              className="inline-flex items-center gap-1 text-xs font-semibold text-blue-600 hover:underline"
            >
              <span>Quản lý học phí</span>
              <ArrowRight className="h-3.5 w-3.5" />
            </Link>
          </CardHeader>
          <CardContent>
            {recentPayments.length === 0 ? (
              <p className="py-6 text-center text-sm text-slate-500">
                Chưa có giao dịch nộp học phí nào.
              </p>
            ) : (
              <div className="space-y-3">
                {recentPayments.map((pmt) => (
                  <div
                    key={pmt.id}
                    className="flex items-center justify-between rounded-xl border border-slate-200 p-3.5"
                  >
                    <div className="space-y-0.5">
                      <div className="flex items-center gap-2">
                        <CheckCircle2 className="h-4 w-4 text-emerald-600" />
                        <span className="font-semibold text-slate-900">
                          {pmt.invoice.student.fullName}
                        </span>
                        <Badge variant="outline">
                          {pmt.invoice.student.studentCode}
                        </Badge>
                      </div>
                      <p className="text-xs text-slate-500">
                        {pmt.receiptNumber} • Lớp {pmt.invoice.class.code} •{" "}
                        {formatDateVn(pmt.paidAt)}
                      </p>
                    </div>

                    <div className="text-right">
                      <p className="font-bold text-emerald-700">
                        +{formatVND(pmt.amount)}
                      </p>
                      <Badge
                        variant={
                          pmt.method === "BANK_TRANSFER"
                            ? "default"
                            : "secondary"
                        }
                      >
                        {pmt.method === "BANK_TRANSFER"
                          ? "Chuyển khoản"
                          : "Tiền mặt"}
                      </Badge>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Overdue / Unpaid Invoices */}
      <Card data-testid="overdue-invoices-list">
        <CardHeader className="flex flex-row items-center justify-between">
          <div className="flex items-center gap-2">
            <AlertTriangle className="h-5 w-5 text-amber-500" />
            <div>
              <CardTitle>Danh sách học sinh còn nợ học phí cần thu</CardTitle>
              <CardDescription>
                Các phiếu thu chưa hoàn tất thanh toán hoặc đã quá hạn
              </CardDescription>
            </div>
          </div>
          <Link href="/fees" prefetch={false}>
            <Button variant="outline" size="sm">
              <span>Xem báo cáo công nợ</span>
            </Button>
          </Link>
        </CardHeader>
        <CardContent>
          {overdueInvoices.length === 0 ? (
            <p className="py-6 text-center text-sm text-slate-500">
              Tuyệt vời! Tất cả các khoản học phí đều đã được thu đủ.
            </p>
          ) : (
            <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
              {overdueInvoices.map((inv) => {
                const remaining = Math.max(0, inv.netAmount - inv.paidAmount);
                const guardian = inv.student.guardians?.[0];
                return (
                  <div
                    key={inv.id}
                    className="flex items-center justify-between rounded-xl border border-amber-200/80 bg-amber-50/30 p-4"
                  >
                    <div className="space-y-1">
                      <div className="flex items-center gap-2">
                        <span className="font-semibold text-slate-900">
                          {inv.student.fullName} ({inv.student.studentCode})
                        </span>
                        <Badge
                          variant={
                            inv.status === "PARTIAL" ? "warning" : "destructive"
                          }
                        >
                          {inv.status === "PARTIAL"
                            ? "Nộp một phần"
                            : "Chưa nộp"}
                        </Badge>
                      </div>
                      <p className="text-xs text-slate-600">
                        {inv.invoiceNumber} • Lớp {inv.class.code} • Hạn:{" "}
                        {formatDateVn(inv.dueDate)}
                      </p>
                      {guardian && (
                        <p className="text-xs text-slate-500">
                          PH: {guardian.fullName} ({guardian.phone})
                        </p>
                      )}
                    </div>

                    <div className="text-right">
                      <p className="text-xs text-slate-500">Cần thu thêm</p>
                      <p className="text-base font-bold text-red-600">
                        {formatVND(remaining)}
                      </p>
                      <Link href="/fees" prefetch={false}>
                        <span className="text-xs font-semibold text-blue-600 hover:underline">
                          Thu phí / Tạo QR →
                        </span>
                      </Link>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
