"use client";

import React, { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import {
  AlertTriangle,
  CheckCircle2,
  Copy,
  CreditCard,
  Plus,
  QrCode,
  Search,
  Sparkles,
  Trash2,
  XCircle,
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
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@/components/ui/tabs";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { formatDateVn, formatVND } from "@/lib/utils";

interface InvoiceItem {
  id: string;
  invoiceNumber: string;
  title: string;
  billingPeriod: string;
  sessionCount: number | null;
  baseAmount: number;
  discountAmount: number;
  discountReason: string | null;
  netAmount: number;
  paidAmount: number;
  status: "UNPAID" | "PARTIAL" | "PAID" | "CANCELLED";
  dueDate: string;
  student: {
    id: string;
    studentCode: string;
    fullName: string;
    phone: string | null;
    guardians?: Array<{ fullName: string; phone: string }>;
  };
  class: {
    id: string;
    code: string;
    name: string;
    subject: string;
  };
}

interface FeePlanItem {
  id: string;
  classId: string;
  name: string;
  billingCycle: "MONTHLY" | "PER_COURSE" | "PER_SESSION";
  amount: number;
  description: string | null;
  isDefault: boolean;
  class: {
    id: string;
    code: string;
    name: string;
  };
}

interface ReportSummary {
  totalBase: number;
  totalDiscount: number;
  totalNet: number;
  totalPaid: number;
  totalOutstanding: number;
  collectionRate: number;
}

interface ClassReportBucket {
  classId: string;
  classCode: string;
  className: string;
  invoiceCount: number;
  totalNet: number;
  totalPaid: number;
  totalOutstanding: number;
  collectionRate: number;
}

interface VietQrResponse {
  bankConfigured: boolean;
  amount: number;
  transferContent: string;
  qrPayload: string;
  qrSvg: string;
  qrDataUrl: string;
  vietQrImageUrl: string | null;
  bankInfo: {
    bankBin: string;
    bankCode: string;
    bankName: string;
    bankAccountNumber: string;
    bankAccountName: string;
  } | null;
  invoice: {
    id: string;
    invoiceNumber: string;
    remainingAmount: number;
    status: string;
    student: { studentCode: string; fullName: string };
    class: { code: string; name: string };
  };
}

const INVOICE_STATUS_LABELS: Record<string, string> = {
  UNPAID: "Chưa đóng",
  PARTIAL: "Đóng 1 phần",
  PAID: "Đã hoàn thành",
  CANCELLED: "Đã huỷ",
};

export default function FeesPage() {
  const [invoices, setInvoices] = useState<InvoiceItem[]>([]);
  const [feePlans, setFeePlans] = useState<FeePlanItem[]>([]);
  const [classes, setClasses] = useState<
    Array<{ id: string; code: string; name: string }>
  >([]);
  const [summary, setSummary] = useState<ReportSummary>({
    totalBase: 0,
    totalDiscount: 0,
    totalNet: 0,
    totalPaid: 0,
    totalOutstanding: 0,
    collectionRate: 0,
  });
  const [byClass, setByClass] = useState<ClassReportBucket[]>([]);
  const [overdueInvoices, setOverdueInvoices] = useState<InvoiceItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [bannerMsg, setBannerMsg] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // Filters
  const [search, setSearch] = useState("");
  const [classFilter, setClassFilter] = useState("");
  const [periodFilter, setPeriodFilter] = useState("");
  const [statusFilter, setStatusFilter] = useState("ALL");

  // Bulk Invoice Generator Dialog
  const [openGenDialog, setOpenGenDialog] = useState(false);
  const [genClassId, setGenClassId] = useState("");
  const [genFeePlanId, setGenFeePlanId] = useState("");
  const [genPeriod, setGenPeriod] = useState("2026-11");
  const [genDueDate, setGenDueDate] = useState("2026-11-15");
  const [genSessionCount, setGenSessionCount] = useState("8");
  const [submittingGen, setSubmittingGen] = useState(false);

  // Create FeePlan Dialog
  const [openPlanDialog, setOpenPlanDialog] = useState(false);
  const [planClassId, setPlanClassId] = useState("");
  const [planName, setPlanName] = useState("");
  const [planCycle, setPlanCycle] = useState<
    "MONTHLY" | "PER_COURSE" | "PER_SESSION"
  >("MONTHLY");
  const [planAmount, setPlanAmount] = useState("1500000");

  // Manual Payment Dialog
  const [openPayDialog, setOpenPayDialog] = useState(false);
  const [selectedInvoice, setSelectedInvoice] = useState<InvoiceItem | null>(
    null
  );
  const [payAmount, setPayAmount] = useState("");
  const [payMethod, setPayMethod] = useState<"BANK_TRANSFER" | "CASH">(
    "BANK_TRANSFER"
  );
  const [payReference, setPayReference] = useState("");
  const [payNote, setPayNote] = useState("");
  const [submittingPay, setSubmittingPay] = useState(false);

  // VietQR Modal
  const [openQrModal, setOpenQrModal] = useState(false);
  const [vietqrData, setVietqrData] = useState<VietQrResponse | null>(null);
  const [loadingQr, setLoadingQr] = useState(false);

  const loadAll = useCallback(async () => {
    try {
      setLoading(true);
      const invParams = new URLSearchParams();
      if (search.trim()) invParams.set("search", search.trim());
      if (classFilter) invParams.set("classId", classFilter);
      if (periodFilter) invParams.set("billingPeriod", periodFilter);
      if (statusFilter && statusFilter !== "ALL") {
        invParams.set("status", statusFilter);
      }

      const [invRes, fpRes, repRes, clsRes] = await Promise.all([
        fetch(`/api/invoices?${invParams.toString()}`),
        fetch("/api/fee-plans"),
        fetch("/api/fees/report"),
        fetch("/api/classes"),
      ]);

      if (invRes.ok) {
        const invData = await invRes.json();
        setInvoices(invData.invoices || []);
        if (invData.summary) setSummary(invData.summary);
      }
      if (fpRes.ok) {
        const fpData = await fpRes.json();
        setFeePlans(fpData.feePlans || []);
      }
      if (repRes.ok) {
        const repData = await repRes.json();
        setByClass(repData.byClass || []);
        setOverdueInvoices(repData.overdueInvoices || []);
      }
      if (clsRes.ok) {
        const clsData = await clsRes.json();
        const clsList = clsData.classes || [];
        setClasses(clsList);
        if (clsList.length > 0 && !genClassId) {
          setGenClassId(clsList[0].id);
          setPlanClassId(clsList[0].id);
        }
      }
    } finally {
      setLoading(false);
    }
  }, [search, classFilter, periodFilter, statusFilter, genClassId]);

  useEffect(() => {
    loadAll();
  }, [loadAll]);

  async function handleGenerateInvoices(e: React.FormEvent) {
    e.preventDefault();
    setErrorMsg(null);
    setBannerMsg(null);
    setSubmittingGen(true);

    try {
      const res = await fetch("/api/invoices/generate", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          classId: genClassId,
          feePlanId: genFeePlanId || undefined,
          billingPeriod: genPeriod,
          dueDate: genDueDate,
          sessionCount: Number(genSessionCount || 1),
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setErrorMsg(data.error || "Không thể lập kỳ thu học phí");
        return;
      }

      setBannerMsg(
        `Đã lập ${data.createdCount} phiếu thu học phí mới (bỏ qua ${data.skippedCount} phiếu đã tồn tại).`
      );
      setOpenGenDialog(false);
      await loadAll();
    } finally {
      setSubmittingGen(false);
    }
  }

  async function handleCreateFeePlan(e: React.FormEvent) {
    e.preventDefault();
    setErrorMsg(null);
    setBannerMsg(null);

    const res = await fetch("/api/fee-plans", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        classId: planClassId,
        name: planName,
        billingCycle: planCycle,
        amount: Number(planAmount || 0),
        isDefault: true,
      }),
    });

    const data = await res.json();
    if (!res.ok) {
      setErrorMsg(data.error || "Không thể tạo biểu phí");
      return;
    }

    setBannerMsg("Đã tạo biểu phí lớp học mới!");
    setOpenPlanDialog(false);
    setPlanName("");
    await loadAll();
  }

  async function handleDeleteFeePlan(id: string) {
    const res = await fetch(`/api/fee-plans/${id}`, { method: "DELETE" });
    if (res.ok) {
      await loadAll();
    }
  }

  function openPaymentDialogFor(inv: InvoiceItem) {
    setSelectedInvoice(inv);
    const remaining = Math.max(0, inv.netAmount - inv.paidAmount);
    setPayAmount(String(remaining));
    setPayMethod("BANK_TRANSFER");
    setPayReference("");
    setPayNote("");
    setOpenPayDialog(true);
  }

  async function handleRecordPayment(e: React.FormEvent) {
    e.preventDefault();
    if (!selectedInvoice) return;
    setErrorMsg(null);
    setBannerMsg(null);
    setSubmittingPay(true);

    try {
      const res = await fetch(`/api/invoices/${selectedInvoice.id}/payments`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          amount: Number(payAmount),
          method: payMethod,
          referenceCode: payReference.trim() || undefined,
          receiptNote: payNote.trim() || undefined,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setErrorMsg(data.error || "Không thể ghi nhận thanh toán");
        return;
      }

      setBannerMsg(
        `Đã ghi nhận thanh toán ${formatVND(Number(payAmount))} cho phiếu ${
          selectedInvoice.invoiceNumber
        }!`
      );
      setOpenPayDialog(false);
      await loadAll();
    } finally {
      setSubmittingPay(false);
    }
  }

  async function openVietQrModalFor(inv: InvoiceItem) {
    setSelectedInvoice(inv);
    setOpenQrModal(true);
    setLoadingQr(true);
    setVietqrData(null);

    try {
      const res = await fetch(`/api/invoices/${inv.id}/vietqr`);
      if (res.ok) {
        const data: VietQrResponse = await res.json();
        setVietqrData(data);
      }
    } finally {
      setLoadingQr(false);
    }
  }

  async function handleConfirmVietQrPayment() {
    if (!vietqrData || vietqrData.amount <= 0) return;
    const res = await fetch(
      `/api/invoices/${vietqrData.invoice.id}/payments`,
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          amount: vietqrData.amount,
          method: "BANK_TRANSFER",
          receiptNote: "Xác nhận thanh toán qua mã VietQR",
        }),
      }
    );
    if (res.ok) {
      setBannerMsg(
        `Đã xác nhận thanh toán đủ ${formatVND(vietqrData.amount)} qua VietQR!`
      );
      setOpenQrModal(false);
      await loadAll();
    }
  }

  async function handleCancelInvoice(inv: InvoiceItem) {
    setErrorMsg(null);
    const res = await fetch(`/api/invoices/${inv.id}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ status: "CANCELLED" }),
    });
    const data = await res.json();
    if (!res.ok) {
      setErrorMsg(data.error || "Không thể huỷ phiếu thu");
      return;
    }
    setBannerMsg(`Đã huỷ phiếu thu ${inv.invoiceNumber}.`);
    await loadAll();
  }

  return (
    <div data-testid="fees-page" className="mx-auto max-w-7xl space-y-6">
      {/* Header */}
      <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-center">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold text-slate-900">
            Quản lý Học phí, Biểu phí & VietQR
          </h1>
          <p className="text-xs sm:text-sm text-slate-600">
            Lập phiếu thu học phí hàng loạt, tạo mã VietQR động cho từng khoản
            thu và theo dõi báo cáo công nợ
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <Button
            variant="outline"
            className="flex-1 sm:flex-initial"
            data-testid="open-create-fee-plan-btn"
            onClick={() => setOpenPlanDialog(true)}
          >
            <Plus className="h-4 w-4" />
            <span>+ Tạo biểu phí</span>
          </Button>
          <Button
            className="flex-1 sm:flex-initial"
            data-testid="open-generate-invoices-btn"
            onClick={() => setOpenGenDialog(true)}
          >
            <Sparkles className="h-4 w-4" />
            <span>Lập kỳ thu hàng loạt</span>
          </Button>
        </div>
      </div>

      {bannerMsg && (
        <div className="flex items-center gap-2 rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-800">
          <CheckCircle2 className="h-4 w-4 text-emerald-600" />
          <span>{bannerMsg}</span>
        </div>
      )}

      {errorMsg && (
        <div className="flex items-center gap-2 rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700">
          <AlertTriangle className="h-4 w-4 text-red-600" />
          <span>{errorMsg}</span>
        </div>
      )}

      {/* 4 KPI Summary Cards */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardContent className="p-5">
            <p className="text-xs font-medium text-slate-500">
              Tổng học phí phải thu
            </p>
            <p className="mt-2 text-2xl font-bold text-slate-900">
              {formatVND(summary.totalNet)}
            </p>
            <p className="mt-1 text-xs text-slate-500">
              Đã giảm trừ: {formatVND(summary.totalDiscount)}
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-5">
            <p className="text-xs font-medium text-slate-500">Đã thu học phí</p>
            <p className="mt-2 text-2xl font-bold text-emerald-700">
              {formatVND(summary.totalPaid)}
            </p>
            <p className="mt-1 text-xs text-slate-500">
              Tiền mặt & Chuyển khoản VietQR
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-5">
            <p className="text-xs font-medium text-slate-500">
              Công nợ còn lại
            </p>
            <p className="mt-2 text-2xl font-bold text-red-600">
              {formatVND(summary.totalOutstanding)}
            </p>
            <p className="mt-1 text-xs text-slate-500">
              Cần đôn đốc thu học phí
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-5">
            <p className="text-xs font-medium text-slate-500">
              Tỷ lệ hoàn thành
            </p>
            <p className="mt-2 text-2xl font-bold text-blue-700">
              {summary.collectionRate}%
            </p>
            <p className="mt-1 text-xs text-slate-500">
              Trên tổng số phiếu hợp lệ
            </p>
          </CardContent>
        </Card>
      </div>

      {/* 3 Tabs */}
      <Tabs defaultValue="invoices">
        <TabsList>
          <TabsTrigger value="invoices">
            Danh sách học phí / Phiếu thu ({invoices.length})
          </TabsTrigger>
          <TabsTrigger value="fee-plans">
            Cấu hình Biểu phí ({feePlans.length})
          </TabsTrigger>
          <TabsTrigger value="report">Báo cáo công nợ</TabsTrigger>
        </TabsList>

        {/* Tab 1: Invoices */}
        <TabsContent value="invoices" className="space-y-4">
          <Card>
            <CardContent className="grid grid-cols-1 gap-3 p-4 sm:grid-cols-2 lg:grid-cols-4">
              <div className="relative">
                <Search className="absolute left-3 top-3 h-4 w-4 text-slate-400" />
                <Input
                  data-testid="invoice-search-input"
                  placeholder="Tìm theo tên học sinh, mã HS, mã phiếu thu..."
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  className="pl-9"
                />
              </div>

              <Select
                data-testid="invoice-class-filter"
                value={classFilter}
                onChange={(e) => setClassFilter(e.target.value)}
              >
                <option value="">Tất cả lớp học</option>
                {classes.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.code} — {c.name}
                  </option>
                ))}
              </Select>

              <Input
                type="month"
                data-testid="invoice-period-filter"
                value={periodFilter}
                onChange={(e) => setPeriodFilter(e.target.value)}
              />

              <Select
                data-testid="invoice-status-filter"
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value)}
              >
                <option value="ALL">Tất cả trạng thái</option>
                <option value="UNPAID">Chưa đóng (UNPAID)</option>
                <option value="PARTIAL">Đóng một phần (PARTIAL)</option>
                <option value="PAID">Đã hoàn thành (PAID)</option>
                <option value="CANCELLED">Đã huỷ (CANCELLED)</option>
              </Select>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-0">
              <Table data-testid="invoices-table">
                <TableHeader>
                  <TableRow>
                    <TableHead>Mã phiếu & Kỳ thu</TableHead>
                    <TableHead>Học sinh</TableHead>
                    <TableHead>Lớp học</TableHead>
                    <TableHead>Gốc / Giảm trừ</TableHead>
                    <TableHead>Phải thu / Đã đóng / Còn nợ</TableHead>
                    <TableHead>Trạng thái</TableHead>
                    <TableHead className="text-right">Thao tác</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {loading ? (
                    <TableRow>
                      <TableCell
                        colSpan={7}
                        className="py-8 text-center text-slate-400"
                      >
                        Đang tải danh sách phiếu thu...
                      </TableCell>
                    </TableRow>
                  ) : invoices.length === 0 ? (
                    <TableRow>
                      <TableCell
                        colSpan={7}
                        className="py-8 text-center text-slate-500"
                      >
                        Chưa có phiếu thu học phí nào.
                      </TableCell>
                    </TableRow>
                  ) : (
                    invoices.map((inv) => {
                      const remaining = Math.max(
                        0,
                        inv.netAmount - inv.paidAmount
                      );
                      return (
                        <TableRow
                          key={inv.id}
                          data-testid={`invoice-row-${inv.invoiceNumber}`}
                        >
                          <TableCell>
                            <p className="font-mono font-semibold text-slate-900">
                              {inv.invoiceNumber}
                            </p>
                            <p className="text-xs text-slate-500">
                              Kỳ: {inv.billingPeriod} • Hạn:{" "}
                              {formatDateVn(inv.dueDate)}
                            </p>
                          </TableCell>

                          <TableCell>
                            <p className="font-semibold text-slate-900">
                              {inv.student.fullName}
                            </p>
                            <p className="text-xs text-slate-500">
                              {inv.student.studentCode}
                            </p>
                          </TableCell>

                          <TableCell>
                            <span className="font-medium text-slate-800">
                              {inv.class.name}
                            </span>
                            <p className="text-xs text-slate-500">
                              {inv.class.code}
                            </p>
                          </TableCell>

                          <TableCell className="text-xs">
                            <p>{formatVND(inv.baseAmount)}</p>
                            {inv.discountAmount > 0 && (
                              <p className="text-amber-700">
                                -{formatVND(inv.discountAmount)}
                              </p>
                            )}
                          </TableCell>

                          <TableCell className="text-xs">
                            <p>
                              Phải thu:{" "}
                              <strong>{formatVND(inv.netAmount)}</strong>
                            </p>
                            <p className="text-emerald-700">
                              Đã đóng: {formatVND(inv.paidAmount)}
                            </p>
                            <p className="font-bold text-red-600">
                              Còn nợ: {formatVND(remaining)}
                            </p>
                          </TableCell>

                          <TableCell>
                            <Badge
                              variant={
                                inv.status === "PAID"
                                  ? "success"
                                  : inv.status === "PARTIAL"
                                  ? "warning"
                                  : inv.status === "CANCELLED"
                                  ? "secondary"
                                  : "destructive"
                              }
                            >
                              {INVOICE_STATUS_LABELS[inv.status] || inv.status}
                            </Badge>
                          </TableCell>

                          <TableCell className="text-right">
                            <div className="flex flex-wrap justify-end gap-1.5">
                              <Button
                                variant="outline"
                                size="sm"
                                data-testid={`vietqr-btn-${inv.id}`}
                                onClick={() => openVietQrModalFor(inv)}
                              >
                                <QrCode className="h-3.5 w-3.5 text-blue-600" />
                                <span>Mã VietQR</span>
                              </Button>

                              <Button
                                variant="default"
                                size="sm"
                                data-testid={`pay-btn-${inv.id}`}
                                disabled={
                                  inv.status === "PAID" ||
                                  inv.status === "CANCELLED"
                                }
                                onClick={() => openPaymentDialogFor(inv)}
                              >
                                <CreditCard className="h-3.5 w-3.5" />
                                <span>Thu tiền</span>
                              </Button>

                              {inv.paidAmount === 0 &&
                                inv.status !== "CANCELLED" && (
                                  <Button
                                    variant="ghost"
                                    size="sm"
                                    data-testid={`cancel-invoice-btn-${inv.id}`}
                                    onClick={() => handleCancelInvoice(inv)}
                                  >
                                    <XCircle className="h-3.5 w-3.5 text-red-500" />
                                    <span>Huỷ</span>
                                  </Button>
                                )}
                            </div>
                          </TableCell>
                        </TableRow>
                      );
                    })
                  )}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Tab 2: FeePlans */}
        <TabsContent value="fee-plans" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Danh sách Biểu phí các lớp học</CardTitle>
              <CardDescription>
                Áp dụng khi lập kỳ thu học phí hàng loạt theo tháng, theo buổi
                hoặc trọn khoá
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Tên biểu phí</TableHead>
                    <TableHead>Lớp học</TableHead>
                    <TableHead>Chu kỳ thu</TableHead>
                    <TableHead>Đơn giá</TableHead>
                    <TableHead>Mặc định</TableHead>
                    <TableHead className="text-right">Xoá</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {feePlans.length === 0 ? (
                    <TableRow>
                      <TableCell
                        colSpan={6}
                        className="py-6 text-center text-slate-500"
                      >
                        Chưa có biểu phí nào.
                      </TableCell>
                    </TableRow>
                  ) : (
                    feePlans.map((fp) => (
                      <TableRow key={fp.id}>
                        <TableCell className="font-semibold">
                          {fp.name}
                        </TableCell>
                        <TableCell>
                          {fp.class.code} — {fp.class.name}
                        </TableCell>
                        <TableCell>{fp.billingCycle}</TableCell>
                        <TableCell className="font-bold text-emerald-700">
                          {formatVND(fp.amount)}
                        </TableCell>
                        <TableCell>
                          {fp.isDefault && (
                            <Badge variant="success">Mặc định</Badge>
                          )}
                        </TableCell>
                        <TableCell className="text-right">
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => handleDeleteFeePlan(fp.id)}
                          >
                            <Trash2 className="h-4 w-4 text-red-500" />
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Tab 3: Debt Report */}
        <TabsContent value="report" className="space-y-6">
          <Card data-testid="fees-report-by-class">
            <CardHeader>
              <CardTitle>Báo cáo thu học phí & công nợ theo Lớp học</CardTitle>
              <CardDescription>
                Không tính các phiếu thu đã huỷ (CANCELLED)
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Lớp học</TableHead>
                    <TableHead>Số phiếu</TableHead>
                    <TableHead>Tổng phải thu</TableHead>
                    <TableHead>Đã thu</TableHead>
                    <TableHead>Còn nợ</TableHead>
                    <TableHead>Tỷ lệ thu</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {byClass.map((row) => (
                    <TableRow key={row.classId}>
                      <TableCell className="font-semibold">
                        {row.classCode} — {row.className}
                      </TableCell>
                      <TableCell>{row.invoiceCount}</TableCell>
                      <TableCell>{formatVND(row.totalNet)}</TableCell>
                      <TableCell className="text-emerald-700">
                        {formatVND(row.totalPaid)}
                      </TableCell>
                      <TableCell className="font-bold text-red-600">
                        {formatVND(row.totalOutstanding)}
                      </TableCell>
                      <TableCell>
                        <Badge variant="default">{row.collectionRate}%</Badge>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>
                Danh sách học sinh còn nợ / quá hạn ({overdueInvoices.length})
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-2.5">
                {overdueInvoices.map((inv) => {
                  const rem = Math.max(0, inv.netAmount - inv.paidAmount);
                  return (
                    <div
                      key={inv.id}
                      className="flex flex-col justify-between gap-2 rounded-xl border border-amber-200 bg-amber-50/40 p-3.5 sm:flex-row sm:items-center"
                    >
                      <div>
                        <p className="font-semibold text-slate-900">
                          {inv.student.fullName} ({inv.student.studentCode}) —{" "}
                          {inv.class.name}
                        </p>
                        <p className="text-xs text-slate-600">
                          Phiếu: {inv.invoiceNumber} • Kỳ: {inv.billingPeriod} •
                          Hạn: {formatDateVn(inv.dueDate)}
                        </p>
                      </div>
                      <div className="flex items-center gap-3">
                        <span className="font-bold text-red-600">
                          Nợ {formatVND(rem)}
                        </span>
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => openVietQrModalFor(inv)}
                        >
                          <QrCode className="h-3.5 w-3.5" />
                          <span>Mã VietQR</span>
                        </Button>
                        <Button
                          size="sm"
                          onClick={() => openPaymentDialogFor(inv)}
                        >
                          Thu tiền
                        </Button>
                      </div>
                    </div>
                  );
                })}
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* Dialog 1: Bulk Invoice Generator */}
      <Dialog open={openGenDialog} onOpenChange={setOpenGenDialog}>
        <DialogContent data-testid="generate-invoices-dialog">
          <DialogHeader>
            <DialogTitle>Lập kỳ thu học phí hàng loạt</DialogTitle>
            <DialogDescription>
              Tự động áp dụng mức ưu đãi học phí riêng của từng học sinh và bỏ
              qua các phiếu đã phát hành trong cùng kỳ
            </DialogDescription>
          </DialogHeader>

          <form onSubmit={handleGenerateInvoices} className="space-y-4">
            <div className="space-y-1.5">
              <Label>Chọn lớp học</Label>
              <Select
                data-testid="gen-invoice-class-select"
                value={genClassId}
                onChange={(e) => setGenClassId(e.target.value)}
                required
              >
                <option value="">-- Chọn lớp --</option>
                {classes.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.code} — {c.name}
                  </option>
                ))}
              </Select>
            </div>

            <div className="space-y-1.5">
              <Label>Biểu phí áp dụng (tuỳ chọn)</Label>
              <Select
                value={genFeePlanId}
                onChange={(e) => setGenFeePlanId(e.target.value)}
              >
                <option value="">Mặc định theo lớp học</option>
                {feePlans
                  .filter((fp) => !genClassId || fp.classId === genClassId)
                  .map((fp) => (
                    <option key={fp.id} value={fp.id}>
                      {fp.name} ({formatVND(fp.amount)} - {fp.billingCycle})
                    </option>
                  ))}
              </Select>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Kỳ thu (YYYY-MM)</Label>
                <Input
                  type="month"
                  value={genPeriod}
                  onChange={(e) => setGenPeriod(e.target.value)}
                  required
                />
              </div>

              <div className="space-y-1.5">
                <Label>Hạn đóng học phí</Label>
                <Input
                  type="date"
                  value={genDueDate}
                  onChange={(e) => setGenDueDate(e.target.value)}
                  required
                />
              </div>
            </div>

            <div className="space-y-1.5">
              <Label>Số buổi học trong kỳ (nếu thu theo buổi)</Label>
              <Input
                type="number"
                min={1}
                value={genSessionCount}
                onChange={(e) => setGenSessionCount(e.target.value)}
              />
            </div>

            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                onClick={() => setOpenGenDialog(false)}
              >
                Huỷ
              </Button>
              <Button
                type="submit"
                data-testid="confirm-generate-invoices-btn"
                disabled={submittingGen}
              >
                {submittingGen ? "Đang tạo..." : "Phát hành phiếu thu"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Dialog 2: Create FeePlan */}
      <Dialog open={openPlanDialog} onOpenChange={setOpenPlanDialog}>
        <DialogContent data-testid="create-fee-plan-dialog">
          <DialogHeader>
            <DialogTitle>Tạo Biểu phí Lớp học</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleCreateFeePlan} className="space-y-4">
            <div className="space-y-1.5">
              <Label>Lớp học</Label>
              <Select
                value={planClassId}
                onChange={(e) => setPlanClassId(e.target.value)}
                required
              >
                <option value="">-- Chọn lớp --</option>
                {classes.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.code} — {c.name}
                  </option>
                ))}
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Tên biểu phí</Label>
              <Input
                value={planName}
                onChange={(e) => setPlanName(e.target.value)}
                placeholder="VD: Học phí tiêu chuẩn tháng"
                required
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Chu kỳ thu</Label>
                <Select
                  value={planCycle}
                  onChange={(e) =>
                    setPlanCycle(
                      e.target.value as "MONTHLY" | "PER_COURSE" | "PER_SESSION"
                    )
                  }
                >
                  <option value="MONTHLY">Theo tháng</option>
                  <option value="PER_SESSION">Theo buổi</option>
                  <option value="PER_COURSE">Theo khoá</option>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>Số tiền (VNĐ)</Label>
                <Input
                  type="number"
                  min={0}
                  value={planAmount}
                  onChange={(e) => setPlanAmount(e.target.value)}
                  required
                />
              </div>
            </div>
            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                onClick={() => setOpenPlanDialog(false)}
              >
                Huỷ
              </Button>
              <Button type="submit">Lưu biểu phí</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Dialog 3: Manual Payment */}
      <Dialog open={openPayDialog} onOpenChange={setOpenPayDialog}>
        <DialogContent data-testid="manual-payment-dialog">
          <DialogHeader>
            <DialogTitle>Ghi nhận thanh toán học phí</DialogTitle>
            <DialogDescription>
              {selectedInvoice
                ? `Phiếu ${selectedInvoice.invoiceNumber} — Học sinh: ${selectedInvoice.student.fullName}`
                : ""}
            </DialogDescription>
          </DialogHeader>

          <form onSubmit={handleRecordPayment} className="space-y-4">
            <div className="space-y-1.5">
              <Label>Số tiền thanh toán (VNĐ)</Label>
              <Input
                type="number"
                min={1}
                data-testid="payment-amount-input"
                value={payAmount}
                onChange={(e) => setPayAmount(e.target.value)}
                required
              />
            </div>

            <div className="space-y-1.5">
              <Label>Phương thức thanh toán</Label>
              <Select
                data-testid="payment-method-select"
                value={payMethod}
                onChange={(e) =>
                  setPayMethod(e.target.value as "BANK_TRANSFER" | "CASH")
                }
              >
                <option value="BANK_TRANSFER">
                  Chuyển khoản ngân hàng / VietQR
                </option>
                <option value="CASH">Tiền mặt tại lớp</option>
              </Select>
            </div>

            <div className="space-y-1.5">
              <Label>Mã giao dịch / Tham chiếu (tuỳ chọn)</Label>
              <Input
                value={payReference}
                onChange={(e) => setPayReference(e.target.value)}
                placeholder="VD: FT2631099281"
              />
            </div>

            <div className="space-y-1.5">
              <Label>Ghi chú biên lai</Label>
              <Input
                value={payNote}
                onChange={(e) => setPayNote(e.target.value)}
                placeholder="VD: Phụ huynh đóng kỳ tháng 11"
              />
            </div>

            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                onClick={() => setOpenPayDialog(false)}
              >
                Huỷ
              </Button>
              <Button
                type="submit"
                data-testid="submit-payment-btn"
                disabled={submittingPay}
              >
                {submittingPay ? "Đang lưu..." : "Xác nhận thu tiền"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Dialog 4: VietQR Modal */}
      <Dialog open={openQrModal} onOpenChange={setOpenQrModal}>
        <DialogContent data-testid="vietqr-modal" className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Mã QR Thanh toán Học phí (VietQR)</DialogTitle>
            <DialogDescription>
              Quét mã bằng ứng dụng ngân hàng để tự động điền đúng số tiền còn nợ
              và nội dung chuyển khoản chuẩn NAPAS 247
            </DialogDescription>
          </DialogHeader>

          {loadingQr ? (
            <div className="py-10 text-center text-sm text-slate-500">
              Đang khởi tạo mã VietQR động...
            </div>
          ) : !vietqrData ? (
            <div className="py-6 text-center text-sm text-red-600">
              Không thể tải thông tin VietQR.
            </div>
          ) : (
            <div className="space-y-4">
              {!vietqrData.bankConfigured ? (
                <div className="rounded-xl border border-amber-300 bg-amber-50 p-4 text-sm text-amber-900">
                  <p className="font-semibold">
                    Chưa cấu hình tài khoản ngân hàng nhận học phí
                  </p>
                  <p className="mt-1">
                    Vui lòng vào mục{" "}
                    <Link
                      href="/settings"
                      prefetch={false}
                      className="font-bold underline"
                    >
                      Cài đặt Workspace
                    </Link>{" "}
                    để thiết lập ngân hàng nhận VietQR.
                  </p>
                </div>
              ) : (
                <div className="flex flex-col items-center rounded-xl border border-slate-200 bg-slate-50 p-4">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={vietqrData.qrDataUrl}
                    alt="VietQR"
                    data-testid="invoice-vietqr-img"
                    className="h-56 w-56 rounded-lg border border-slate-200 bg-white p-2 shadow-xs"
                  />
                  {vietqrData.bankInfo && (
                    <div className="mt-3 text-center text-xs text-slate-600">
                      <p className="font-bold text-slate-900">
                        {vietqrData.bankInfo.bankName} (
                        {vietqrData.bankInfo.bankCode})
                      </p>
                      <p>
                        STK:{" "}
                        <strong className="font-mono">
                          {vietqrData.bankInfo.bankAccountNumber}
                        </strong>{" "}
                        — {vietqrData.bankInfo.bankAccountName}
                      </p>
                    </div>
                  )}
                </div>
              )}

              <div className="space-y-2 rounded-xl border border-blue-200 bg-blue-50/50 p-3.5 text-sm">
                <div className="flex items-center justify-between">
                  <span className="text-slate-600">Học sinh:</span>
                  <span className="font-semibold text-slate-900">
                    {vietqrData.invoice.student.fullName} (
                    {vietqrData.invoice.student.studentCode})
                  </span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-slate-600">Số tiền cần chuyển:</span>
                  <span
                    data-testid="vietqr-amount"
                    className="text-base font-bold text-emerald-700"
                  >
                    {formatVND(vietqrData.amount)}
                  </span>
                </div>
                <div className="flex items-center justify-between gap-2">
                  <span className="text-slate-600">Nội dung CK:</span>
                  <div className="flex items-center gap-1.5">
                    <code
                      data-testid="vietqr-transfer-memo"
                      className="rounded bg-white px-2 py-0.5 font-mono text-xs font-bold text-blue-800"
                    >
                      {vietqrData.transferContent}
                    </code>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      onClick={() =>
                        navigator.clipboard?.writeText(
                          vietqrData.transferContent
                        )
                      }
                      title="Sao chép nội dung chuyển khoản"
                    >
                      <Copy className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                </div>
              </div>

              <DialogFooter>
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setOpenQrModal(false)}
                >
                  Đóng
                </Button>
                {vietqrData.amount > 0 &&
                  vietqrData.invoice.status !== "CANCELLED" && (
                    <Button
                      type="button"
                      variant="success"
                      data-testid="vietqr-confirm-payment-btn"
                      onClick={handleConfirmVietQrPayment}
                    >
                      <CheckCircle2 className="h-4 w-4" />
                      <span>Xác nhận đã nhận đủ chuyển khoản</span>
                    </Button>
                  )}
              </DialogFooter>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
