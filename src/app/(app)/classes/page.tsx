"use client";

import React, { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import {
  BookOpen,
  Calendar,
  Clock,
  MapPin,
  Plus,
  Search,
  Trash2,
  Users,
  ArrowRight,
  AlertTriangle,
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
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { DAY_OF_WEEK_LABELS, formatVND } from "@/lib/utils";

interface ScheduleSlotItem {
  id: string;
  dayOfWeek: number;
  startTime: string;
  endTime: string;
  room: string | null;
}

interface ClassItem {
  id: string;
  code: string;
  name: string;
  subject: string;
  gradeLevel: string | null;
  room: string | null;
  defaultFeeAmount: number;
  billingCycle: "MONTHLY" | "PER_COURSE" | "PER_SESSION";
  startDate: string | null;
  endDate: string | null;
  color: string | null;
  status: "ACTIVE" | "UPCOMING" | "COMPLETED" | "ARCHIVED";
  scheduleSlots: ScheduleSlotItem[];
  _count?: {
    enrollments: number;
    scheduleSlots: number;
    sessions: number;
  };
}

interface DraftSlot {
  dayOfWeek: number;
  startTime: string;
  endTime: string;
  room: string;
}

const STATUS_LABELS: Record<string, string> = {
  ACTIVE: "Đang mở",
  UPCOMING: "Sắp mở",
  COMPLETED: "Đã kết thúc",
  ARCHIVED: "Lưu trữ",
};

const BILLING_LABELS: Record<string, string> = {
  MONTHLY: "Theo tháng",
  PER_COURSE: "Theo khoá",
  PER_SESSION: "Theo buổi",
};

export default function ClassesPage() {
  const [classes, setClasses] = useState<ClassItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("ALL");
  const [openCreate, setOpenCreate] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [conflictAlert, setConflictAlert] = useState<string | null>(null);

  // Create form state
  const [name, setName] = useState("");
  const [code, setCode] = useState("");
  const [subject, setSubject] = useState("Toán");
  const [gradeLevel, setGradeLevel] = useState("Khối 9");
  const [room, setRoom] = useState("Phòng 101");
  const [defaultFeeAmount, setDefaultFeeAmount] = useState("1500000");
  const [billingCycle, setBillingCycle] = useState<
    "MONTHLY" | "PER_COURSE" | "PER_SESSION"
  >("MONTHLY");
  const [startDate, setStartDate] = useState("2026-09-01");
  const [endDate, setEndDate] = useState("2027-05-31");
  const [draftSlots, setDraftSlots] = useState<DraftSlot[]>([
    { dayOfWeek: 1, startTime: "18:00", endTime: "19:30", room: "" },
  ]);

  const loadClasses = useCallback(async () => {
    try {
      setLoading(true);
      const params = new URLSearchParams();
      if (statusFilter && statusFilter !== "ALL") {
        params.set("status", statusFilter);
      }
      if (search.trim()) {
        params.set("search", search.trim());
      }
      const res = await fetch(`/api/classes?${params.toString()}`);
      if (!res.ok) return;
      const data = await res.json();
      setClasses(data.classes || []);
    } finally {
      setLoading(false);
    }
  }, [statusFilter, search]);

  useEffect(() => {
    loadClasses();
  }, [loadClasses]);

  function addDraftSlot() {
    setDraftSlots((prev) => [
      ...prev,
      { dayOfWeek: 3, startTime: "18:00", endTime: "19:30", room: "" },
    ]);
  }

  function removeDraftSlot(idx: number) {
    setDraftSlots((prev) => prev.filter((_, i) => i !== idx));
  }

  function updateDraftSlot(idx: number, patch: Partial<DraftSlot>) {
    setDraftSlots((prev) =>
      prev.map((item, i) => (i === idx ? { ...item, ...patch } : item))
    );
  }

  async function handleCreateClass(e: React.FormEvent) {
    e.preventDefault();
    setFormError(null);
    setConflictAlert(null);
    setSubmitting(true);

    try {
      const res = await fetch("/api/classes", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          name,
          code: code.trim() || undefined,
          subject,
          gradeLevel,
          room,
          defaultFeeAmount: Number(defaultFeeAmount || 0),
          billingCycle,
          startDate: startDate || undefined,
          endDate: endDate || undefined,
          scheduleSlots: draftSlots.map((s) => ({
            dayOfWeek: Number(s.dayOfWeek),
            startTime: s.startTime,
            endTime: s.endTime,
            room: s.room.trim() || room.trim() || undefined,
          })),
        }),
      });

      const body = await res.json();
      if (!res.ok) {
        setFormError(body.error || "Không thể tạo lớp học");
        return;
      }

      if (Array.isArray(body.conflicts) && body.conflicts.length > 0) {
        setConflictAlert(body.conflicts[0].reason);
      }

      setOpenCreate(false);
      setName("");
      setCode("");
      await loadClasses();
    } catch {
      setFormError("Lỗi kết nối máy chủ");
    } finally {
      setSubmitting(false);
    }
  }

  async function handleDeleteClass(id: string, clsName: string) {
    const res = await fetch(`/api/classes/${id}`, { method: "DELETE" });
    if (res.ok) {
      setClasses((prev) => prev.filter((c) => c.id !== id));
    } else {
      alert(`Không thể xoá lớp ${clsName}`);
    }
  }

  return (
    <div data-testid="classes-page" className="mx-auto max-w-7xl space-y-6">
      {/* Header */}
      <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-center">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">
            Quản lý Lớp học & Lịch giảng dạy
          </h1>
          <p className="text-sm text-slate-600">
            Tạo lớp học, thiết lập ca học định kỳ hàng tuần, biểu phí mặc định và
            danh sách học sinh
          </p>
        </div>

        <div className="flex items-center gap-2">
          <Link href="/schedule" prefetch={false}>
            <Button variant="outline">
              <Calendar className="h-4 w-4" />
              <span>Xem Thời khoá biểu tuần</span>
            </Button>
          </Link>
          <Button
            data-testid="create-class-button"
            onClick={() => {
              setFormError(null);
              setOpenCreate(true);
            }}
          >
            <Plus className="h-4 w-4" />
            <span>+ Tạo lớp học</span>
          </Button>
        </div>
      </div>

      {conflictAlert && (
        <div
          data-testid="class-conflict-warning"
          className="flex items-center gap-3 rounded-xl border border-amber-300 bg-amber-50 p-4 text-sm text-amber-900"
        >
          <AlertTriangle className="h-5 w-5 shrink-0 text-amber-600" />
          <div>
            <p className="font-semibold">Cảnh báo trùng lịch dạy:</p>
            <p>{conflictAlert}</p>
          </div>
        </div>
      )}

      {/* Filter Bar */}
      <Card>
        <CardContent className="flex flex-col gap-4 p-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-3 h-4 w-4 text-slate-400" />
            <Input
              data-testid="search-classes-input"
              placeholder="Tìm theo tên lớp, mã lớp, môn học, phòng..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-9"
            />
          </div>

          <div className="flex flex-wrap items-center gap-1.5">
            {[
              { key: "ALL", label: "Tất cả" },
              { key: "ACTIVE", label: "Đang mở" },
              { key: "UPCOMING", label: "Sắp mở" },
              { key: "COMPLETED", label: "Đã kết thúc" },
            ].map((tab) => (
              <Button
                key={tab.key}
                type="button"
                size="sm"
                variant={statusFilter === tab.key ? "default" : "outline"}
                onClick={() => setStatusFilter(tab.key)}
              >
                {tab.label}
              </Button>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Class Cards Grid */}
      {loading ? (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
          {[1, 2, 3].map((i) => (
            <div
              key={i}
              className="h-56 animate-pulse rounded-xl bg-slate-200"
            />
          ))}
        </div>
      ) : classes.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center">
            <BookOpen className="mx-auto h-10 w-10 text-slate-400" />
            <p className="mt-3 font-medium text-slate-700">
              Chưa có lớp học nào phù hợp
            </p>
            <p className="mt-1 text-sm text-slate-500">
              Hãy nhấn &ldquo;+ Tạo lớp học&rdquo; để khởi tạo lớp học đầu tiên
              của bạn.
            </p>
          </CardContent>
        </Card>
      ) : (
        <div
          data-testid="classes-list"
          className="grid grid-cols-1 gap-5 md:grid-cols-2 lg:grid-cols-3"
        >
          {classes.map((cls) => (
            <Card
              key={cls.id}
              data-testid={`class-card-${cls.code}`}
              className="flex flex-col justify-between transition hover:shadow-md"
            >
              <CardHeader className="pb-3">
                <div className="flex items-center justify-between gap-2">
                  <Badge variant="outline" className="font-mono">
                    {cls.code}
                  </Badge>
                  <Badge
                    variant={
                      cls.status === "ACTIVE"
                        ? "success"
                        : cls.status === "UPCOMING"
                        ? "warning"
                        : "secondary"
                    }
                  >
                    {STATUS_LABELS[cls.status] || cls.status}
                  </Badge>
                </div>
                <CardTitle className="mt-2 text-lg">
                  <Link
                    href={`/classes/${cls.id}`}
                    prefetch={false}
                    className="hover:text-blue-600 hover:underline"
                  >
                    {cls.name}
                  </Link>
                </CardTitle>
                <CardDescription>
                  Môn: <strong>{cls.subject}</strong>
                  {cls.gradeLevel ? ` • ${cls.gradeLevel}` : ""}
                </CardDescription>
              </CardHeader>

              <CardContent className="space-y-4">
                <div className="space-y-2 text-sm text-slate-600">
                  <div className="flex items-center justify-between">
                    <span className="inline-flex items-center gap-1.5">
                      <MapPin className="h-4 w-4 text-slate-400" />
                      <span>{cls.room || "Chưa xếp phòng"}</span>
                    </span>
                    <span className="inline-flex items-center gap-1.5 font-medium text-slate-800">
                      <Users className="h-4 w-4 text-blue-600" />
                      <span>{cls._count?.enrollments ?? 0} học sinh</span>
                    </span>
                  </div>

                  <div className="flex items-center justify-between border-t border-slate-100 pt-2">
                    <span className="text-xs text-slate-500">
                      Học phí ({BILLING_LABELS[cls.billingCycle]}):
                    </span>
                    <span className="font-semibold text-emerald-700">
                      {formatVND(cls.defaultFeeAmount)}
                    </span>
                  </div>
                </div>

                {/* Weekly Schedule Badges */}
                <div className="space-y-1.5">
                  <p className="text-xs font-medium text-slate-500">
                    Lịch học hàng tuần:
                  </p>
                  {cls.scheduleSlots && cls.scheduleSlots.length > 0 ? (
                    <div className="flex flex-wrap gap-1.5">
                      {cls.scheduleSlots.map((slot) => (
                        <Badge key={slot.id} variant="default">
                          <Clock className="mr-1 h-3 w-3" />
                          {DAY_OF_WEEK_LABELS[slot.dayOfWeek]}: {slot.startTime}
                          -{slot.endTime}
                        </Badge>
                      ))}
                    </div>
                  ) : (
                    <p className="text-xs italic text-slate-400">
                      Chưa thiết lập ca học định kỳ
                    </p>
                  )}
                </div>

                <div className="flex items-center justify-between border-t border-slate-100 pt-3">
                  <Link href={`/classes/${cls.id}`} prefetch={false}>
                    <Button variant="outline" size="sm">
                      <span>Chi tiết lớp</span>
                      <ArrowRight className="h-3.5 w-3.5" />
                    </Button>
                  </Link>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => handleDeleteClass(cls.id, cls.name)}
                    aria-label={`Xoá lớp ${cls.name}`}
                  >
                    <Trash2 className="h-4 w-4 text-red-500" />
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Create Class Dialog */}
      <Dialog open={openCreate} onOpenChange={setOpenCreate}>
        <DialogContent
          data-testid="create-class-dialog"
          className="max-w-2xl"
        >
          <DialogHeader>
            <DialogTitle>Tạo lớp học mới</DialogTitle>
            <DialogDescription>
              Nhập thông tin lớp học, mức học phí mặc định và ca học định kỳ hàng
              tuần
            </DialogDescription>
          </DialogHeader>

          <form onSubmit={handleCreateClass} className="space-y-4">
            {formError && (
              <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">
                {formError}
              </div>
            )}

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="cls-name">Tên lớp học *</Label>
                <Input
                  id="cls-name"
                  data-testid="input-class-name"
                  placeholder="VD: Toán 9 Luyện thi Chuyên"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  required
                />
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="cls-code">Mã lớp (tuỳ chọn)</Label>
                <Input
                  id="cls-code"
                  data-testid="input-class-code"
                  placeholder="VD: TOAN9-A (để trống sẽ tự sinh)"
                  value={code}
                  onChange={(e) => setCode(e.target.value)}
                />
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="cls-subject">Môn học *</Label>
                <Input
                  id="cls-subject"
                  data-testid="input-class-subject"
                  placeholder="VD: Toán học"
                  value={subject}
                  onChange={(e) => setSubject(e.target.value)}
                  required
                />
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="cls-grade">Khối / Trình độ</Label>
                <Input
                  id="cls-grade"
                  value={gradeLevel}
                  onChange={(e) => setGradeLevel(e.target.value)}
                />
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="cls-room">Phòng học mặc định</Label>
                <Input
                  id="cls-room"
                  data-testid="input-class-room"
                  value={room}
                  onChange={(e) => setRoom(e.target.value)}
                />
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="cls-fee">Học phí mặc định (VNĐ)</Label>
                <Input
                  id="cls-fee"
                  type="number"
                  min={0}
                  step={50000}
                  value={defaultFeeAmount}
                  onChange={(e) => setDefaultFeeAmount(e.target.value)}
                />
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="cls-cycle">Chu kỳ thu học phí</Label>
                <Select
                  id="cls-cycle"
                  value={billingCycle}
                  onChange={(e) =>
                    setBillingCycle(
                      e.target.value as "MONTHLY" | "PER_COURSE" | "PER_SESSION"
                    )
                  }
                >
                  <option value="MONTHLY">Theo tháng (MONTHLY)</option>
                  <option value="PER_SESSION">Theo buổi (PER_SESSION)</option>
                  <option value="PER_COURSE">Theo khoá (PER_COURSE)</option>
                </Select>
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div className="space-y-1.5">
                  <Label htmlFor="cls-start">Từ ngày</Label>
                  <Input
                    id="cls-start"
                    type="date"
                    value={startDate}
                    onChange={(e) => setStartDate(e.target.value)}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="cls-end">Đến ngày</Label>
                  <Input
                    id="cls-end"
                    type="date"
                    value={endDate}
                    onChange={(e) => setEndDate(e.target.value)}
                  />
                </div>
              </div>
            </div>

            {/* Inline ScheduleSlot Builder */}
            <div className="space-y-3 rounded-xl border border-slate-200 bg-slate-50 p-4">
              <div className="flex items-center justify-between">
                <Label>Ca học định kỳ trong tuần</Label>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={addDraftSlot}
                >
                  <Plus className="h-3.5 w-3.5" />
                  <span>Thêm ca học</span>
                </Button>
              </div>

              {draftSlots.map((slot, idx) => (
                <div
                  key={idx}
                  className="grid grid-cols-1 gap-2 sm:grid-cols-4 sm:items-center"
                >
                  <Select
                    value={String(slot.dayOfWeek)}
                    onChange={(e) =>
                      updateDraftSlot(idx, {
                        dayOfWeek: Number(e.target.value),
                      })
                    }
                  >
                    {[1, 2, 3, 4, 5, 6, 0].map((d) => (
                      <option key={d} value={d}>
                        {DAY_OF_WEEK_LABELS[d]}
                      </option>
                    ))}
                  </Select>

                  <Input
                    type="time"
                    value={slot.startTime}
                    onChange={(e) =>
                      updateDraftSlot(idx, { startTime: e.target.value })
                    }
                  />

                  <Input
                    type="time"
                    value={slot.endTime}
                    onChange={(e) =>
                      updateDraftSlot(idx, { endTime: e.target.value })
                    }
                  />

                  <div className="flex items-center gap-1">
                    <Input
                      placeholder="Phòng (tuỳ chọn)"
                      value={slot.room}
                      onChange={(e) =>
                        updateDraftSlot(idx, { room: e.target.value })
                      }
                    />
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      onClick={() => removeDraftSlot(idx)}
                    >
                      <Trash2 className="h-4 w-4 text-red-500" />
                    </Button>
                  </div>
                </div>
              ))}
            </div>

            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                onClick={() => setOpenCreate(false)}
              >
                Huỷ
              </Button>
              <Button
                type="submit"
                data-testid="submit-create-class"
                disabled={submitting}
              >
                {submitting ? "Đang lưu..." : "Lưu lớp học"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
