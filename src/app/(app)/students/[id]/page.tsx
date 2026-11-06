"use client";

import React, { useCallback, useEffect, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import {
  ArrowLeft,
  CheckCircle2,
  GraduationCap,
  Phone,
  Plus,
  Save,
  Star,
  Trash2,
  UserCheck,
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
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { formatDateVn, formatVND } from "@/lib/utils";

interface GuardianItem {
  id: string;
  fullName: string;
  relationship: string;
  phone: string;
  email: string | null;
  zalo: string | null;
  address: string | null;
  isPrimary: boolean;
}

interface EnrollmentItem {
  id: string;
  classId: string;
  status: "ACTIVE" | "PAUSED" | "DROPPED" | "COMPLETED";
  discountType: "FIXED" | "PERCENTAGE";
  customFeeDiscount: number;
  discountNote: string | null;
  enrolledAt: string;
  leftAt: string | null;
  class: {
    id: string;
    code: string;
    name: string;
    subject: string;
    defaultFeeAmount: number;
  };
}

interface InvoiceItem {
  id: string;
  invoiceNumber: string;
  billingPeriod: string;
  baseAmount: number;
  discountAmount: number;
  netAmount: number;
  paidAmount: number;
  status: string;
  dueDate: string;
  class: {
    id: string;
    code: string;
    name: string;
  };
}

interface StudentDetail {
  id: string;
  studentCode: string;
  fullName: string;
  dateOfBirth: string | null;
  gender: string | null;
  school: string | null;
  phone: string | null;
  notes: string | null;
  status: "ACTIVE" | "INACTIVE" | "GRADUATED";
  guardians: GuardianItem[];
  enrollments: EnrollmentItem[];
  invoices: InvoiceItem[];
}

export default function StudentDetailPage() {
  const params = useParams<{ id: string }>();
  const studentId = params?.id;

  const [student, setStudent] = useState<StudentDetail | null>(null);
  const [classes, setClasses] = useState<
    Array<{ id: string; code: string; name: string }>
  >([]);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // Edit profile state
  const [fullName, setFullName] = useState("");
  const [school, setSchool] = useState("");
  const [phone, setPhone] = useState("");
  const [status, setStatus] = useState<"ACTIVE" | "INACTIVE" | "GRADUATED">(
    "ACTIVE"
  );
  const [notes, setNotes] = useState("");

  // Add Guardian state
  const [gName, setGName] = useState("");
  const [gRel, setGRel] = useState("Phụ huynh");
  const [gPhone, setGPhone] = useState("");
  const [gZalo, setGZalo] = useState("");
  const [gPrimary, setGPrimary] = useState(false);

  // Add Enrollment state
  const [enrollClassId, setEnrollClassId] = useState("");
  const [discountType, setDiscountType] = useState<"FIXED" | "PERCENTAGE">(
    "FIXED"
  );
  const [customFeeDiscount, setCustomFeeDiscount] = useState("0");
  const [discountNote, setDiscountNote] = useState("");

  const loadData = useCallback(async () => {
    if (!studentId) return;
    try {
      setLoading(true);
      const [stuRes, clsRes] = await Promise.all([
        fetch(`/api/students/${studentId}`),
        fetch("/api/classes"),
      ]);
      if (stuRes.ok) {
        const json = await stuRes.json();
        const s: StudentDetail = json.student;
        setStudent(s);
        setFullName(s.fullName);
        setSchool(s.school || "");
        setPhone(s.phone || "");
        setStatus(s.status);
        setNotes(s.notes || "");
      }
      if (clsRes.ok) {
        const clsJson = await clsRes.json();
        setClasses(clsJson.classes || []);
      }
    } finally {
      setLoading(false);
    }
  }, [studentId]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  async function handleSaveProfile(e: React.FormEvent) {
    e.preventDefault();
    if (!studentId) return;
    setErrorMsg(null);
    setMessage(null);

    const res = await fetch(`/api/students/${studentId}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        fullName,
        school,
        phone,
        status,
        notes,
      }),
    });

    const data = await res.json();
    if (!res.ok) {
      setErrorMsg(data.error || "Không thể lưu hồ sơ");
      return;
    }

    setMessage("Đã cập nhật thông tin học sinh!");
    await loadData();
  }

  async function handleAddGuardian(e: React.FormEvent) {
    e.preventDefault();
    if (!studentId) return;
    setErrorMsg(null);
    setMessage(null);

    const res = await fetch(`/api/students/${studentId}/guardians`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        fullName: gName,
        relationship: gRel,
        phone: gPhone,
        zalo: gZalo || gPhone,
        isPrimary: gPrimary,
      }),
    });

    const data = await res.json();
    if (!res.ok) {
      setErrorMsg(data.error || "Không thể thêm phụ huynh");
      return;
    }

    setMessage("Đã thêm thông tin phụ huynh!");
    setGName("");
    setGPhone("");
    setGZalo("");
    setGPrimary(false);
    await loadData();
  }

  async function handleSetPrimaryGuardian(guardianId: string) {
    if (!studentId) return;
    const res = await fetch(
      `/api/students/${studentId}/guardians/${guardianId}`,
      {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ isPrimary: true }),
      }
    );
    if (res.ok) {
      setMessage("Đã cập nhật phụ huynh liên hệ chính!");
      await loadData();
    }
  }

  async function handleDeleteGuardian(guardianId: string) {
    if (!studentId) return;
    const res = await fetch(
      `/api/students/${studentId}/guardians/${guardianId}`,
      { method: "DELETE" }
    );
    if (res.ok) {
      await loadData();
    }
  }

  async function handleAddEnrollment(e: React.FormEvent) {
    e.preventDefault();
    if (!studentId || !enrollClassId) return;
    setErrorMsg(null);
    setMessage(null);

    const res = await fetch("/api/enrollments", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        classId: enrollClassId,
        studentId,
        discountType,
        customFeeDiscount: Number(customFeeDiscount || 0),
        discountNote: discountNote.trim() || undefined,
      }),
    });

    const data = await res.json();
    if (!res.ok) {
      setErrorMsg(data.error || "Không thể ghi danh lớp học");
      return;
    }

    setMessage("Đã ghi danh học sinh vào lớp!");
    setEnrollClassId("");
    setCustomFeeDiscount("0");
    setDiscountNote("");
    await loadData();
  }

  async function handleUpdateEnrollmentStatus(
    enrollmentId: string,
    nextStatus: string
  ) {
    const res = await fetch(`/api/enrollments/${enrollmentId}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ status: nextStatus }),
    });
    if (res.ok) {
      await loadData();
    }
  }

  if (loading) {
    return (
      <div className="space-y-4">
        <div className="h-10 w-64 animate-pulse rounded-lg bg-slate-200" />
        <div className="h-64 animate-pulse rounded-xl bg-slate-200" />
      </div>
    );
  }

  if (!student) {
    return (
      <Card>
        <CardContent className="p-6 text-sm text-red-600">
          Không tìm thấy học sinh trong workspace của bạn.
        </CardContent>
      </Card>
    );
  }

  return (
    <div
      data-testid="student-detail-page"
      className="mx-auto max-w-7xl space-y-6"
    >
      {/* Header */}
      <div className="space-y-1">
        <Link
          href="/students"
          prefetch={false}
          className="inline-flex items-center gap-1 text-xs font-semibold text-blue-600 hover:underline"
        >
          <ArrowLeft className="h-3.5 w-3.5" />
          <span>Quay lại danh sách học sinh</span>
        </Link>
        <div className="flex items-center gap-2.5">
          <Badge variant="outline" className="font-mono">
            {student.studentCode}
          </Badge>
          <h1 className="text-2xl font-bold text-slate-900">
            {student.fullName}
          </h1>
          <Badge variant="success">{student.status}</Badge>
        </div>
      </div>

      {message && (
        <div className="flex items-center gap-2 rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-800">
          <CheckCircle2 className="h-4 w-4 text-emerald-600" />
          <span>{message}</span>
        </div>
      )}

      {errorMsg && (
        <div className="rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700">
          {errorMsg}
        </div>
      )}

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        {/* Card 1: Student Profile */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <UserCheck className="h-5 w-5 text-blue-600" />
              <span>Thông tin Hồ sơ Học sinh</span>
            </CardTitle>
            <CardDescription>
              Cập nhật thông tin cá nhân và trạng thái theo học
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSaveProfile} className="space-y-4">
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <div className="space-y-1">
                  <Label>Họ và tên</Label>
                  <Input
                    value={fullName}
                    onChange={(e) => setFullName(e.target.value)}
                    required
                  />
                </div>
                <div className="space-y-1">
                  <Label>Trường học</Label>
                  <Input
                    value={school}
                    onChange={(e) => setSchool(e.target.value)}
                  />
                </div>
                <div className="space-y-1">
                  <Label>Số điện thoại</Label>
                  <Input
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                  />
                </div>
                <div className="space-y-1">
                  <Label>Trạng thái</Label>
                  <Select
                    value={status}
                    onChange={(e) =>
                      setStatus(
                        e.target.value as "ACTIVE" | "INACTIVE" | "GRADUATED"
                      )
                    }
                  >
                    <option value="ACTIVE">Đang học (ACTIVE)</option>
                    <option value="INACTIVE">Tạm nghỉ (INACTIVE)</option>
                    <option value="GRADUATED">Đã tốt nghiệp (GRADUATED)</option>
                  </Select>
                </div>
              </div>
              <div className="space-y-1">
                <Label>Ghi chú học tập</Label>
                <Input
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  placeholder="Ghi chú lực học, lưu ý phụ huynh..."
                />
              </div>
              <Button type="submit" size="sm">
                <Save className="h-4 w-4" />
                <span>Lưu thông tin học sinh</span>
              </Button>
            </form>
          </CardContent>
        </Card>

        {/* Card 2: Guardians Management */}
        <Card data-testid="student-guardians-card">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Phone className="h-5 w-5 text-emerald-600" />
              <span>
                Danh sách Phụ huynh & Người giám hộ ({student.guardians.length})
              </span>
            </CardTitle>
            <CardDescription>
              Hỗ trợ lưu nhiều phụ huynh và tự động đồng bộ 1 phụ huynh liên hệ
              chính duy nhất
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <form
              onSubmit={handleAddGuardian}
              className="grid grid-cols-1 gap-2 rounded-xl border border-slate-200 bg-slate-50 p-3 sm:grid-cols-4 sm:items-end"
            >
              <div className="space-y-1">
                <Label>Họ tên PH</Label>
                <Input
                  data-testid="add-guardian-name"
                  placeholder="Họ tên"
                  value={gName}
                  onChange={(e) => setGName(e.target.value)}
                  required
                />
              </div>
              <div className="space-y-1">
                <Label>Quan hệ</Label>
                <Input
                  placeholder="Bố / Mẹ"
                  value={gRel}
                  onChange={(e) => setGRel(e.target.value)}
                />
              </div>
              <div className="space-y-1">
                <Label>Số điện thoại</Label>
                <Input
                  data-testid="add-guardian-phone"
                  placeholder="09..."
                  value={gPhone}
                  onChange={(e) => setGPhone(e.target.value)}
                  required
                />
              </div>
              <Button type="submit" size="sm" data-testid="add-guardian-btn">
                <Plus className="h-4 w-4" />
                <span>Thêm PH</span>
              </Button>
            </form>

            <div className="space-y-2.5">
              {student.guardians.map((g) => (
                <div
                  key={g.id}
                  data-testid={`guardian-item-${g.id}`}
                  className="flex flex-col justify-between gap-2 rounded-xl border border-slate-200 p-3 sm:flex-row sm:items-center"
                >
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="font-semibold text-slate-900">
                        {g.fullName}
                      </span>
                      <Badge variant="outline">{g.relationship}</Badge>
                      {g.isPrimary && (
                        <Badge variant="success">Liên hệ chính</Badge>
                      )}
                    </div>
                    <p className="mt-1 text-xs text-slate-600">
                      SĐT: <strong>{g.phone}</strong>
                      {g.zalo ? ` • Zalo: ${g.zalo}` : ""}
                    </p>
                  </div>

                  <div className="flex items-center gap-1.5">
                    {!g.isPrimary && (
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => handleSetPrimaryGuardian(g.id)}
                      >
                        <Star className="h-3.5 w-3.5 text-amber-500" />
                        <span>Đặt làm liên hệ chính</span>
                      </Button>
                    )}
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => handleDeleteGuardian(g.id)}
                    >
                      <Trash2 className="h-4 w-4 text-red-500" />
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Card 3: Class Enrollments & Discounts */}
      <Card data-testid="student-enrollments-card">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <GraduationCap className="h-5 w-5 text-blue-600" />
            <span>Lớp học Ghi danh & Ưu đãi Học phí</span>
          </CardTitle>
          <CardDescription>
            Quản lý các lớp học sinh đang tham gia và mức miễn giảm học phí riêng
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <form
            onSubmit={handleAddEnrollment}
            className="grid grid-cols-1 gap-3 rounded-xl border border-slate-200 bg-slate-50 p-4 sm:grid-cols-5 sm:items-end"
          >
            <div className="space-y-1 sm:col-span-2">
              <Label>Chọn lớp học</Label>
              <Select
                value={enrollClassId}
                onChange={(e) => setEnrollClassId(e.target.value)}
                required
              >
                <option value="">-- Chọn lớp ghi danh --</option>
                {classes.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.code} — {c.name}
                  </option>
                ))}
              </Select>
            </div>

            <div className="space-y-1">
              <Label>Hình thức giảm</Label>
              <Select
                value={discountType}
                onChange={(e) =>
                  setDiscountType(e.target.value as "FIXED" | "PERCENTAGE")
                }
              >
                <option value="FIXED">Số tiền cố định (VNĐ)</option>
                <option value="PERCENTAGE">Phần trăm (%)</option>
              </Select>
            </div>

            <div className="space-y-1">
              <Label>Mức giảm</Label>
              <Input
                type="number"
                min={0}
                value={customFeeDiscount}
                onChange={(e) => setCustomFeeDiscount(e.target.value)}
              />
            </div>

            <Button type="submit">
              <Plus className="h-4 w-4" />
              <span>Ghi danh vào lớp</span>
            </Button>
          </form>

          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Lớp học</TableHead>
                <TableHead>Học phí chuẩn</TableHead>
                <TableHead>Ưu đãi áp dụng</TableHead>
                <TableHead>Ngày vào lớp</TableHead>
                <TableHead>Trạng thái</TableHead>
                <TableHead className="text-right">Thao tác</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {student.enrollments.length === 0 ? (
                <TableRow>
                  <TableCell
                    colSpan={6}
                    className="py-6 text-center text-slate-500"
                  >
                    Học sinh chưa ghi danh lớp nào.
                  </TableCell>
                </TableRow>
              ) : (
                student.enrollments.map((enr) => (
                  <TableRow key={enr.id}>
                    <TableCell>
                      <Link
                        href={`/classes/${enr.class.id}`}
                        prefetch={false}
                        className="font-semibold text-blue-600 hover:underline"
                      >
                        {enr.class.code} — {enr.class.name}
                      </Link>
                    </TableCell>
                    <TableCell>
                      {formatVND(enr.class.defaultFeeAmount)}
                    </TableCell>
                    <TableCell>
                      {enr.customFeeDiscount > 0 ? (
                        <Badge variant="warning">
                          Giảm{" "}
                          {enr.discountType === "PERCENTAGE"
                            ? `${enr.customFeeDiscount}%`
                            : formatVND(enr.customFeeDiscount)}
                        </Badge>
                      ) : (
                        <span className="text-xs text-slate-400">
                          Không giảm
                        </span>
                      )}
                    </TableCell>
                    <TableCell>{formatDateVn(enr.enrolledAt)}</TableCell>
                    <TableCell>
                      <Badge
                        variant={
                          enr.status === "ACTIVE" ? "success" : "secondary"
                        }
                      >
                        {enr.status}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right">
                      {enr.status === "ACTIVE" ? (
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() =>
                            handleUpdateEnrollmentStatus(enr.id, "DROPPED")
                          }
                        >
                          Dừng học
                        </Button>
                      ) : (
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() =>
                            handleUpdateEnrollmentStatus(enr.id, "ACTIVE")
                          }
                        >
                          Kích hoạt lại
                        </Button>
                      )}
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* Card 4: Invoices & Tuition History */}
      <Card>
        <CardHeader>
          <CardTitle>Lịch sử Học phí & Phiếu thu</CardTitle>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Mã phiếu</TableHead>
                <TableHead>Kỳ thu</TableHead>
                <TableHead>Lớp học</TableHead>
                <TableHead>Phải thu</TableHead>
                <TableHead>Đã đóng</TableHead>
                <TableHead>Còn nợ</TableHead>
                <TableHead>Trạng thái</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {student.invoices.length === 0 ? (
                <TableRow>
                  <TableCell
                    colSpan={7}
                    className="py-6 text-center text-slate-500"
                  >
                    Chưa có phiếu thu học phí nào.
                  </TableCell>
                </TableRow>
              ) : (
                student.invoices.map((inv) => (
                  <TableRow key={inv.id}>
                    <TableCell className="font-mono">
                      {inv.invoiceNumber}
                    </TableCell>
                    <TableCell>{inv.billingPeriod}</TableCell>
                    <TableCell>{inv.class.code}</TableCell>
                    <TableCell>{formatVND(inv.netAmount)}</TableCell>
                    <TableCell className="text-emerald-700">
                      {formatVND(inv.paidAmount)}
                    </TableCell>
                    <TableCell className="font-semibold text-red-600">
                      {formatVND(Math.max(0, inv.netAmount - inv.paidAmount))}
                    </TableCell>
                    <TableCell>
                      <Badge
                        variant={
                          inv.status === "PAID"
                            ? "success"
                            : inv.status === "PARTIAL"
                            ? "warning"
                            : "destructive"
                        }
                      >
                        {inv.status}
                      </Badge>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
