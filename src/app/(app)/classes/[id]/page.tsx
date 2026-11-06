"use client";

import React, { useCallback, useEffect, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import {
  ArrowLeft,
  Calendar,
  Clock,
  CreditCard,
  Plus,
  Trash2,
  Users,
  AlertTriangle,
  Sparkles,
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
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { DAY_OF_WEEK_LABELS, formatDateVn, formatVND } from "@/lib/utils";

interface GuardianItem {
  id: string;
  fullName: string;
  relationship: string;
  phone: string;
  isPrimary: boolean;
}

interface EnrollmentItem {
  id: string;
  studentId: string;
  status: "ACTIVE" | "PAUSED" | "DROPPED" | "COMPLETED";
  discountType: "FIXED" | "PERCENTAGE";
  customFeeDiscount: number;
  discountNote: string | null;
  enrolledAt: string;
  student: {
    id: string;
    studentCode: string;
    fullName: string;
    phone: string | null;
    guardians: GuardianItem[];
  };
}

interface ScheduleSlotItem {
  id: string;
  dayOfWeek: number;
  startTime: string;
  endTime: string;
  room: string | null;
}

interface SessionItem {
  id: string;
  sessionDate: string;
  startTime: string;
  endTime: string;
  room: string | null;
  topic: string | null;
  status: string;
}

interface FeePlanItem {
  id: string;
  name: string;
  billingCycle: "MONTHLY" | "PER_COURSE" | "PER_SESSION";
  amount: number;
  isDefault: boolean;
}

interface ClassDetail {
  id: string;
  code: string;
  name: string;
  subject: string;
  gradeLevel: string | null;
  room: string | null;
  defaultFeeAmount: number;
  billingCycle: "MONTHLY" | "PER_COURSE" | "PER_SESSION";
  status: string;
  scheduleSlots: ScheduleSlotItem[];
  enrollments: EnrollmentItem[];
  sessions: SessionItem[];
  feePlans: FeePlanItem[];
}

interface WorkspaceStudentOption {
  id: string;
  studentCode: string;
  fullName: string;
}

export default function ClassDetailPage() {
  const params = useParams<{ id: string }>();
  const classId = params?.id;

  const [cls, setCls] = useState<ClassDetail | null>(null);
  const [allStudents, setAllStudents] = useState<WorkspaceStudentOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // Add Enrollment form
  const [selectedStudentId, setSelectedStudentId] = useState("");
  const [discountType, setDiscountType] = useState<"FIXED" | "PERCENTAGE">(
    "FIXED"
  );
  const [customFeeDiscount, setCustomFeeDiscount] = useState("0");
  const [discountNote, setDiscountNote] = useState("");

  // Add ScheduleSlot form
  const [slotDay, setSlotDay] = useState("1");
  const [slotStart, setSlotStart] = useState("18:00");
  const [slotEnd, setSlotEnd] = useState("19:30");
  const [slotRoom, setSlotRoom] = useState("");

  // Generate Sessions form
  const [genFromDate, setGenFromDate] = useState("2026-11-01");
  const [genToDate, setGenToDate] = useState("2026-11-30");

  // Add FeePlan form
  const [planName, setPlanName] = useState("");
  const [planCycle, setPlanCycle] = useState<
    "MONTHLY" | "PER_COURSE" | "PER_SESSION"
  >("MONTHLY");
  const [planAmount, setPlanAmount] = useState("1500000");

  const loadData = useCallback(async () => {
    if (!classId) return;
    try {
      setLoading(true);
      const [clsRes, stuRes] = await Promise.all([
        fetch(`/api/classes/${classId}`),
        fetch("/api/students"),
      ]);
      if (clsRes.ok) {
        const clsJson = await clsRes.json();
        setCls(clsJson.class);
      }
      if (stuRes.ok) {
        const stuJson = await stuRes.json();
        setAllStudents(stuJson.students || []);
      }
    } finally {
      setLoading(false);
    }
  }, [classId]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  async function handleEnrollStudent(e: React.FormEvent) {
    e.preventDefault();
    if (!classId || !selectedStudentId) return;
    setErrorMsg(null);
    setMessage(null);

    const res = await fetch("/api/enrollments", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        classId,
        studentId: selectedStudentId,
        discountType,
        customFeeDiscount: Number(customFeeDiscount || 0),
        discountNote: discountNote.trim() || undefined,
      }),
    });

    const data = await res.json();
    if (!res.ok) {
      setErrorMsg(data.error || "Không thể ghi danh học sinh");
      return;
    }

    setMessage("Đã ghi danh học sinh vào lớp thành công!");
    setSelectedStudentId("");
    setCustomFeeDiscount("0");
    setDiscountNote("");
    await loadData();
  }

  async function handleAddSlot(e: React.FormEvent) {
    e.preventDefault();
    if (!classId) return;
    setErrorMsg(null);
    setMessage(null);

    const res = await fetch(`/api/classes/${classId}/schedule-slots`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        dayOfWeek: Number(slotDay),
        startTime: slotStart,
        endTime: slotEnd,
        room: slotRoom.trim() || undefined,
      }),
    });

    const data = await res.json();
    if (!res.ok) {
      setErrorMsg(data.error || "Không thể thêm ca học");
      return;
    }

    if (Array.isArray(data.conflicts) && data.conflicts.length > 0) {
      setErrorMsg(`Cảnh báo trùng lịch: ${data.conflicts[0].reason}`);
    } else {
      setMessage("Đã thêm ca học định kỳ mới!");
    }
    await loadData();
  }

  async function handleDeleteSlot(slotId: string) {
    if (!classId) return;
    const res = await fetch(
      `/api/classes/${classId}/schedule-slots/${slotId}`,
      { method: "DELETE" }
    );
    if (res.ok) {
      await loadData();
    }
  }

  async function handleGenerateSessions(e: React.FormEvent) {
    e.preventDefault();
    if (!classId) return;
    setErrorMsg(null);
    setMessage(null);

    const res = await fetch(`/api/classes/${classId}/generate-sessions`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        fromDate: genFromDate,
        toDate: genToDate,
      }),
    });

    const data = await res.json();
    if (!res.ok) {
      setErrorMsg(data.error || "Không thể sinh buổi học");
      return;
    }

    setMessage(
      `Đã tạo ${data.createdCount} buổi học mới (bỏ qua ${data.skippedCount} buổi đã tồn tại).`
    );
    await loadData();
  }

  async function handleCreateFeePlan(e: React.FormEvent) {
    e.preventDefault();
    if (!classId || !planName.trim()) return;
    setErrorMsg(null);
    setMessage(null);

    const res = await fetch("/api/fee-plans", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        classId,
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

    setMessage("Đã lưu biểu phí mới cho lớp học!");
    setPlanName("");
    await loadData();
  }

  if (loading) {
    return (
      <div className="space-y-4">
        <div className="h-10 w-64 animate-pulse rounded-lg bg-slate-200" />
        <div className="h-64 animate-pulse rounded-xl bg-slate-200" />
      </div>
    );
  }

  if (!cls) {
    return (
      <Card>
        <CardContent className="p-6 text-sm text-red-600">
          Không tìm thấy lớp học trong workspace của bạn.
        </CardContent>
      </Card>
    );
  }

  return (
    <div
      data-testid="class-detail-page"
      className="mx-auto max-w-7xl space-y-6"
    >
      {/* Back link & Class Header */}
      <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-center">
        <div className="space-y-1">
          <Link
            href="/classes"
            prefetch={false}
            className="inline-flex items-center gap-1 text-xs font-semibold text-blue-600 hover:underline"
          >
            <ArrowLeft className="h-3.5 w-3.5" />
            <span>Quay lại danh sách lớp học</span>
          </Link>
          <div className="flex items-center gap-2.5">
            <Badge variant="outline" className="font-mono">
              {cls.code}
            </Badge>
            <h1 className="text-2xl font-bold text-slate-900">{cls.name}</h1>
            <Badge variant="success">{cls.status}</Badge>
          </div>
          <p className="text-sm text-slate-600">
            Môn: <strong>{cls.subject}</strong> • Phòng:{" "}
            <strong>{cls.room || "Chưa xếp"}</strong> • Học phí mặc định:{" "}
            <strong className="text-emerald-700">
              {formatVND(cls.defaultFeeAmount)}
            </strong>
          </p>
        </div>
      </div>

      {message && (
        <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-800">
          {message}
        </div>
      )}

      {errorMsg && (
        <div className="flex items-center gap-2 rounded-xl border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900">
          <AlertTriangle className="h-4 w-4 shrink-0 text-amber-600" />
          <span>{errorMsg}</span>
        </div>
      )}

      {/* 3 Tabs */}
      <Tabs defaultValue="enrollments">
        <TabsList>
          <TabsTrigger value="enrollments">
            <Users className="mr-1.5 h-4 w-4" />
            Học sinh ghi danh ({cls.enrollments.length})
          </TabsTrigger>
          <TabsTrigger value="schedule">
            <Calendar className="mr-1.5 h-4 w-4" />
            Lịch học & Buổi học ({cls.sessions.length})
          </TabsTrigger>
          <TabsTrigger value="fees">
            <CreditCard className="mr-1.5 h-4 w-4" />
            Biểu phí & Học phí lớp ({cls.feePlans.length})
          </TabsTrigger>
        </TabsList>

        {/* Tab 1: Enrollments */}
        <TabsContent value="enrollments" className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Ghi danh học sinh vào lớp</CardTitle>
              <CardDescription>
                Chọn học sinh trong workspace và áp dụng mức ưu đãi học phí riêng
                (nếu có)
              </CardDescription>
            </CardHeader>
            <CardContent>
              <form
                onSubmit={handleEnrollStudent}
                className="grid grid-cols-1 gap-3 sm:grid-cols-5 sm:items-end"
              >
                <div className="space-y-1 sm:col-span-2">
                  <Label>Chọn học sinh</Label>
                  <Select
                    data-testid="enroll-student-select"
                    value={selectedStudentId}
                    onChange={(e) => setSelectedStudentId(e.target.value)}
                    required
                  >
                    <option value="">-- Chọn học sinh --</option>
                    {allStudents.map((st) => (
                      <option key={st.id} value={st.id}>
                        {st.studentCode} — {st.fullName}
                      </option>
                    ))}
                  </Select>
                </div>

                <div className="space-y-1">
                  <Label>Loại ưu đãi</Label>
                  <Select
                    value={discountType}
                    onChange={(e) =>
                      setDiscountType(
                        e.target.value as "FIXED" | "PERCENTAGE"
                      )
                    }
                  >
                    <option value="FIXED">Giảm số tiền (VNĐ)</option>
                    <option value="PERCENTAGE">Giảm phần trăm (%)</option>
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

                <Button type="submit" data-testid="submit-enroll-student">
                  <Plus className="h-4 w-4" />
                  <span>Ghi danh</span>
                </Button>
              </form>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Danh sách học sinh trong lớp</CardTitle>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Mã HS</TableHead>
                    <TableHead>Họ và tên</TableHead>
                    <TableHead>Phụ huynh chính</TableHead>
                    <TableHead>Ưu đãi học phí</TableHead>
                    <TableHead>Trạng thái</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {cls.enrollments.length === 0 ? (
                    <TableRow>
                      <TableCell
                        colSpan={5}
                        className="py-6 text-center text-slate-500"
                      >
                        Chưa có học sinh nào ghi danh trong lớp này.
                      </TableCell>
                    </TableRow>
                  ) : (
                    cls.enrollments.map((enr) => {
                      const primaryG = enr.student.guardians?.[0];
                      return (
                        <TableRow key={enr.id}>
                          <TableCell className="font-mono font-medium">
                            {enr.student.studentCode}
                          </TableCell>
                          <TableCell>
                            <Link
                              href={`/students/${enr.student.id}`}
                              prefetch={false}
                              className="font-semibold text-blue-600 hover:underline"
                            >
                              {enr.student.fullName}
                            </Link>
                          </TableCell>
                          <TableCell className="text-xs text-slate-600">
                            {primaryG
                              ? `${primaryG.fullName} (${primaryG.phone})`
                              : "—"}
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
                          <TableCell>
                            <Badge
                              variant={
                                enr.status === "ACTIVE"
                                  ? "success"
                                  : "secondary"
                              }
                            >
                              {enr.status}
                            </Badge>
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

        {/* Tab 2: Schedule & Sessions */}
        <TabsContent value="schedule" className="space-y-6">
          <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
            <Card>
              <CardHeader>
                <CardTitle>Ca học định kỳ hàng tuần</CardTitle>
                <CardDescription>
                  Thêm hoặc xoá lịch học hàng tuần của lớp
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <form
                  onSubmit={handleAddSlot}
                  className="grid grid-cols-1 gap-2 sm:grid-cols-4 sm:items-end"
                >
                  <div className="space-y-1">
                    <Label>Thứ</Label>
                    <Select
                      value={slotDay}
                      onChange={(e) => setSlotDay(e.target.value)}
                    >
                      {[1, 2, 3, 4, 5, 6, 0].map((d) => (
                        <option key={d} value={d}>
                          {DAY_OF_WEEK_LABELS[d]}
                        </option>
                      ))}
                    </Select>
                  </div>
                  <div className="space-y-1">
                    <Label>Bắt đầu</Label>
                    <Input
                      type="time"
                      value={slotStart}
                      onChange={(e) => setSlotStart(e.target.value)}
                    />
                  </div>
                  <div className="space-y-1">
                    <Label>Kết thúc</Label>
                    <Input
                      type="time"
                      value={slotEnd}
                      onChange={(e) => setSlotEnd(e.target.value)}
                    />
                  </div>
                  <Button type="submit" data-testid="add-slot-btn">
                    <Plus className="h-4 w-4" />
                    <span>Thêm ca</span>
                  </Button>
                </form>

                <div className="space-y-2">
                  {cls.scheduleSlots.map((slot) => (
                    <div
                      key={slot.id}
                      className="flex items-center justify-between rounded-lg border border-slate-200 p-3"
                    >
                      <div className="flex items-center gap-2">
                        <Clock className="h-4 w-4 text-blue-600" />
                        <span className="font-semibold">
                          {DAY_OF_WEEK_LABELS[slot.dayOfWeek]}
                        </span>
                        <Badge variant="default">
                          {slot.startTime} - {slot.endTime}
                        </Badge>
                        {slot.room && (
                          <Badge variant="secondary">{slot.room}</Badge>
                        )}
                      </div>
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => handleDeleteSlot(slot.id)}
                      >
                        <Trash2 className="h-4 w-4 text-red-500" />
                      </Button>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Tự động sinh buổi học từ TKB</CardTitle>
                <CardDescription>
                  Sinh tự động các buổi học theo ca định kỳ (bỏ qua buổi trùng
                  lặp)
                </CardDescription>
              </CardHeader>
              <CardContent>
                <form onSubmit={handleGenerateSessions} className="space-y-4">
                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-1">
                      <Label>Từ ngày</Label>
                      <Input
                        type="date"
                        data-testid="gen-sessions-from"
                        value={genFromDate}
                        onChange={(e) => setGenFromDate(e.target.value)}
                      />
                    </div>
                    <div className="space-y-1">
                      <Label>Đến ngày</Label>
                      <Input
                        type="date"
                        data-testid="gen-sessions-to"
                        value={genToDate}
                        onChange={(e) => setGenToDate(e.target.value)}
                      />
                    </div>
                  </div>
                  <Button
                    type="submit"
                    data-testid="class-generate-sessions-btn"
                  >
                    <Sparkles className="h-4 w-4" />
                    <span>Tự động sinh buổi học</span>
                  </Button>
                </form>
              </CardContent>
            </Card>
          </div>

          <Card>
            <CardHeader>
              <CardTitle>Danh sách buổi học của lớp</CardTitle>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Ngày học</TableHead>
                    <TableHead>Khung giờ</TableHead>
                    <TableHead>Phòng</TableHead>
                    <TableHead>Chủ đề</TableHead>
                    <TableHead>Trạng thái</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {cls.sessions.length === 0 ? (
                    <TableRow>
                      <TableCell
                        colSpan={5}
                        className="py-6 text-center text-slate-500"
                      >
                        Chưa có buổi học nào được tạo.
                      </TableCell>
                    </TableRow>
                  ) : (
                    cls.sessions.map((sess) => (
                      <TableRow key={sess.id}>
                        <TableCell className="font-medium">
                          {formatDateVn(sess.sessionDate)}
                        </TableCell>
                        <TableCell>
                          {sess.startTime} - {sess.endTime}
                        </TableCell>
                        <TableCell>{sess.room || cls.room || "—"}</TableCell>
                        <TableCell>
                          <Link
                            href={`/sessions/${sess.id}`}
                            prefetch={false}
                            className="text-blue-600 hover:underline"
                          >
                            {sess.topic || "Buổi học định kỳ"}
                          </Link>
                        </TableCell>
                        <TableCell>
                          <Badge variant="outline">{sess.status}</Badge>
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Tab 3: FeePlans */}
        <TabsContent value="fees" className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Cấu hình Biểu phí của lớp</CardTitle>
              <CardDescription>
                Thiết lập mức thu theo tháng, theo buổi hoặc trọn khoá
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <form
                onSubmit={handleCreateFeePlan}
                className="grid grid-cols-1 gap-3 sm:grid-cols-4 sm:items-end"
              >
                <div className="space-y-1">
                  <Label>Tên biểu phí</Label>
                  <Input
                    placeholder="VD: Học phí tháng chuẩn"
                    value={planName}
                    onChange={(e) => setPlanName(e.target.value)}
                    required
                  />
                </div>
                <div className="space-y-1">
                  <Label>Chu kỳ thu</Label>
                  <Select
                    value={planCycle}
                    onChange={(e) =>
                      setPlanCycle(
                        e.target.value as
                          | "MONTHLY"
                          | "PER_COURSE"
                          | "PER_SESSION"
                      )
                    }
                  >
                    <option value="MONTHLY">Theo tháng</option>
                    <option value="PER_SESSION">Theo buổi</option>
                    <option value="PER_COURSE">Theo khoá</option>
                  </Select>
                </div>
                <div className="space-y-1">
                  <Label>Số tiền (VNĐ)</Label>
                  <Input
                    type="number"
                    min={0}
                    value={planAmount}
                    onChange={(e) => setPlanAmount(e.target.value)}
                    required
                  />
                </div>
                <Button type="submit">
                  <Plus className="h-4 w-4" />
                  <span>Lưu biểu phí</span>
                </Button>
              </form>

              <div className="space-y-2 pt-2">
                {cls.feePlans.map((fp) => (
                  <div
                    key={fp.id}
                    className="flex items-center justify-between rounded-lg border border-slate-200 p-3"
                  >
                    <div>
                      <p className="font-semibold text-slate-900">{fp.name}</p>
                      <p className="text-xs text-slate-500">
                        Chu kỳ: {fp.billingCycle}
                      </p>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="font-bold text-emerald-700">
                        {formatVND(fp.amount)}
                      </span>
                      {fp.isDefault && (
                        <Badge variant="success">Mặc định</Badge>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
