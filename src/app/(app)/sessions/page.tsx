"use client";

import React, { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import {
  CalendarDays,
  CheckCircle2,
  Clock,
  Filter,
  Plus,
  Trash2,
  Users,
  XCircle,
} from "lucide-react";
import { formatDateVn } from "@/lib/utils";
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
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

interface ClassOption {
  id: string;
  code: string;
  name: string;
  subject: string;
  room?: string | null;
}

interface SessionItem {
  id: string;
  classId: string;
  sessionDate: string;
  startTime: string;
  endTime: string;
  room: string | null;
  topic: string | null;
  notes: string | null;
  status: "SCHEDULED" | "IN_PROGRESS" | "COMPLETED" | "CANCELLED";
  presentCount: number;
  lateCount: number;
  absentCount: number;
  totalAttendances: number;
  class: {
    id: string;
    code: string;
    name: string;
    subject: string;
    room: string | null;
    color: string | null;
  };
  _count?: {
    attendances: number;
    homeworks: number;
    gameSessions: number;
  };
}

const SESSION_STATUS_META: Record<
  SessionItem["status"],
  {
    label: string;
    variant: "default" | "secondary" | "success" | "warning" | "destructive";
  }
> = {
  SCHEDULED: { label: "Đã lên lịch", variant: "default" },
  IN_PROGRESS: { label: "Đang diễn ra", variant: "warning" },
  COMPLETED: { label: "Đã hoàn thành", variant: "success" },
  CANCELLED: { label: "Đã huỷ", variant: "destructive" },
};

export default function SessionsPage() {
  const [classes, setClasses] = useState<ClassOption[]>([]);
  const [sessions, setSessions] = useState<SessionItem[]>([]);
  const [loading, setLoading] = useState(true);

  const [filterClassId, setFilterClassId] = useState("");
  const [filterStatus, setFilterStatus] = useState("");
  const [filterFrom, setFilterFrom] = useState("");
  const [filterTo, setFilterTo] = useState("");

  const [createOpen, setCreateOpen] = useState(false);
  const [formClassId, setFormClassId] = useState("");
  const [formDate, setFormDate] = useState(() =>
    new Date().toISOString().slice(0, 10)
  );
  const [formStartTime, setFormStartTime] = useState("18:00");
  const [formEndTime, setFormEndTime] = useState("19:30");
  const [formRoom, setFormRoom] = useState("");
  const [formTopic, setFormTopic] = useState("");
  const [formNotes, setFormNotes] = useState("");
  const [formError, setFormError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const loadClasses = useCallback(async () => {
    try {
      const res = await fetch("/api/classes");
      if (res.ok) {
        const data = await res.json();
        const list: ClassOption[] = Array.isArray(data.classes)
          ? data.classes
          : [];
        setClasses(list);
        if (list.length > 0 && !formClassId) {
          setFormClassId(list[0].id);
          setFormRoom(list[0].room ?? "");
        }
      }
    } catch {
      // Ignore initial load error
    }
  }, [formClassId]);

  const loadSessions = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (filterClassId) params.set("classId", filterClassId);
      if (filterStatus) params.set("status", filterStatus);
      if (filterFrom) params.set("from", filterFrom);
      if (filterTo) params.set("to", filterTo);

      const res = await fetch(`/api/sessions?${params.toString()}`);
      if (res.ok) {
        const data = await res.json();
        setSessions(Array.isArray(data.sessions) ? data.sessions : []);
      }
    } finally {
      setLoading(false);
    }
  }, [filterClassId, filterStatus, filterFrom, filterTo]);

  useEffect(() => {
    loadClasses();
  }, [loadClasses]);

  useEffect(() => {
    loadSessions();
  }, [loadSessions]);

  const handleCreateSession = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError("");
    setSubmitting(true);
    try {
      const res = await fetch("/api/sessions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          classId: formClassId,
          sessionDate: formDate,
          startTime: formStartTime,
          endTime: formEndTime,
          room: formRoom || undefined,
          topic: formTopic || undefined,
          notes: formNotes || undefined,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setFormError(data.error || "Không thể tạo buổi học");
        return;
      }
      setCreateOpen(false);
      setFormTopic("");
      setFormNotes("");
      await loadSessions();
    } catch {
      setFormError("Lỗi kết nối máy chủ");
    } finally {
      setSubmitting(false);
    }
  };

  const handleDeleteSession = async (id: string) => {
    const res = await fetch(`/api/sessions/${id}`, { method: "DELETE" });
    if (res.ok) {
      await loadSessions();
    }
  };

  const totalCount = sessions.length;
  const activeOrScheduledCount = sessions.filter(
    (s) => s.status === "SCHEDULED" || s.status === "IN_PROGRESS"
  ).length;
  const completedCount = sessions.filter(
    (s) => s.status === "COMPLETED"
  ).length;
  const cancelledCount = sessions.filter(
    (s) => s.status === "CANCELLED"
  ).length;

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900">
            Quản lý Buổi học & Điểm danh
          </h1>
          <p className="text-sm text-slate-600">
            Theo dõi lịch học từng buổi, điểm danh đến/về, nhận diện khuôn mặt
            FaceAI và giao bài tập về nhà.
          </p>
        </div>

        <Button
          data-testid="btn-open-create-session"
          onClick={() => {
            setFormError("");
            if (!formClassId && classes.length > 0) {
              setFormClassId(classes[0].id);
            }
            setCreateOpen(true);
          }}
        >
          <Plus className="h-4 w-4" />
          <span>Tạo buổi học bù / đột xuất</span>
        </Button>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardContent className="flex items-center justify-between p-5">
            <div>
              <p className="text-xs font-medium uppercase text-slate-500">
                Tổng số buổi học
              </p>
              <p className="mt-1 text-2xl font-bold text-slate-900">
                {totalCount}
              </p>
            </div>
            <div className="rounded-xl bg-blue-50 p-3 text-blue-600">
              <CalendarDays className="h-5 w-5" />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="flex items-center justify-between p-5">
            <div>
              <p className="text-xs font-medium uppercase text-slate-500">
                Sắp diễn ra / Đang học
              </p>
              <p className="mt-1 text-2xl font-bold text-amber-600">
                {activeOrScheduledCount}
              </p>
            </div>
            <div className="rounded-xl bg-amber-50 p-3 text-amber-600">
              <Clock className="h-5 w-5" />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="flex items-center justify-between p-5">
            <div>
              <p className="text-xs font-medium uppercase text-slate-500">
                Đã hoàn thành
              </p>
              <p className="mt-1 text-2xl font-bold text-emerald-600">
                {completedCount}
              </p>
            </div>
            <div className="rounded-xl bg-emerald-50 p-3 text-emerald-600">
              <CheckCircle2 className="h-5 w-5" />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="flex items-center justify-between p-5">
            <div>
              <p className="text-xs font-medium uppercase text-slate-500">
                Đã huỷ
              </p>
              <p className="mt-1 text-2xl font-bold text-red-600">
                {cancelledCount}
              </p>
            </div>
            <div className="rounded-xl bg-red-50 p-3 text-red-600">
              <XCircle className="h-5 w-5" />
            </div>
          </CardContent>
        </Card>
      </div>

      <Card data-testid="sessions-filter-bar">
        <CardContent className="p-4">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-5">
            <div>
              <Label className="mb-1.5 block text-xs text-slate-500">
                Lớp học
              </Label>
              <Select
                data-testid="filter-session-class"
                value={filterClassId}
                onChange={(e) => setFilterClassId(e.target.value)}
              >
                <option value="">Tất cả lớp học</option>
                {classes.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.code} — {c.name}
                  </option>
                ))}
              </Select>
            </div>

            <div>
              <Label className="mb-1.5 block text-xs text-slate-500">
                Trạng thái
              </Label>
              <Select
                data-testid="filter-session-status"
                value={filterStatus}
                onChange={(e) => setFilterStatus(e.target.value)}
              >
                <option value="">Tất cả trạng thái</option>
                <option value="SCHEDULED">Đã lên lịch</option>
                <option value="IN_PROGRESS">Đang diễn ra</option>
                <option value="COMPLETED">Đã hoàn thành</option>
                <option value="CANCELLED">Đã huỷ</option>
              </Select>
            </div>

            <div>
              <Label className="mb-1.5 block text-xs text-slate-500">
                Từ ngày
              </Label>
              <Input
                type="date"
                data-testid="filter-session-from"
                value={filterFrom}
                onChange={(e) => setFilterFrom(e.target.value)}
              />
            </div>

            <div>
              <Label className="mb-1.5 block text-xs text-slate-500">
                Đến ngày
              </Label>
              <Input
                type="date"
                data-testid="filter-session-to"
                value={filterTo}
                onChange={(e) => setFilterTo(e.target.value)}
              />
            </div>

            <div className="flex items-end">
              <Button
                variant="outline"
                className="w-full"
                onClick={() => {
                  setFilterClassId("");
                  setFilterStatus("");
                  setFilterFrom("");
                  setFilterTo("");
                }}
              >
                <Filter className="h-4 w-4" />
                <span>Xoá bộ lọc</span>
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Danh sách buổi học</CardTitle>
          <CardDescription>
            Nhấn vào từng buổi học để thực hiện điểm danh thủ công, điểm danh
            bằng FaceAI hoặc giao bài tập về nhà.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="py-10 text-center text-sm text-slate-500">
              Đang tải danh sách buổi học...
            </div>
          ) : sessions.length === 0 ? (
            <div className="py-10 text-center text-sm text-slate-500">
              Chưa có buổi học nào khớp với bộ lọc hiện tại.
            </div>
          ) : (
            <Table data-testid="sessions-table">
              <TableHeader>
                <TableRow>
                  <TableHead>Ngày & Giờ học</TableHead>
                  <TableHead>Lớp học</TableHead>
                  <TableHead>Phòng</TableHead>
                  <TableHead>Chủ đề bài giảng</TableHead>
                  <TableHead>Điểm danh</TableHead>
                  <TableHead>Trạng thái</TableHead>
                  <TableHead className="text-right">Thao tác</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {sessions.map((sess) => {
                  const statusMeta =
                    SESSION_STATUS_META[sess.status] ??
                    SESSION_STATUS_META.SCHEDULED;
                  return (
                    <TableRow key={sess.id}>
                      <TableCell>
                        <div className="font-semibold text-slate-900">
                          {formatDateVn(sess.sessionDate)}
                        </div>
                        <div className="text-xs text-slate-500">
                          {sess.startTime} – {sess.endTime}
                        </div>
                      </TableCell>
                      <TableCell>
                        <div className="font-medium text-slate-900">
                          {sess.class?.name}
                        </div>
                        <div className="text-xs text-slate-500">
                          {sess.class?.code} • {sess.class?.subject}
                        </div>
                      </TableCell>
                      <TableCell>{sess.room || sess.class?.room || "—"}</TableCell>
                      <TableCell>
                        <div className="max-w-xs truncate font-medium text-slate-800">
                          {sess.topic || "Buổi học định kỳ"}
                        </div>
                        {sess.notes && (
                          <div className="max-w-xs truncate text-xs text-slate-500">
                            {sess.notes}
                          </div>
                        )}
                      </TableCell>
                      <TableCell>
                        <div className="flex flex-wrap items-center gap-1.5 text-xs">
                          <Badge variant="success">
                            Có mặt: {sess.presentCount ?? 0}
                          </Badge>
                          <Badge variant="warning">
                            Muộn: {sess.lateCount ?? 0}
                          </Badge>
                          <Badge variant="destructive">
                            Vắng: {sess.absentCount ?? 0}
                          </Badge>
                        </div>
                      </TableCell>
                      <TableCell>
                        <Badge variant={statusMeta.variant}>
                          {statusMeta.label}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="inline-flex items-center gap-2">
                          <Link href={`/sessions/${sess.id}`}>
                            <Button size="sm" variant="default">
                              <Users className="h-3.5 w-3.5" />
                              <span>Điểm danh & Chi tiết</span>
                            </Button>
                          </Link>
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => handleDeleteSession(sess.id)}
                            title="Xoá buổi học"
                          >
                            <Trash2 className="h-3.5 w-3.5 text-red-600" />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Tạo buổi học bù / đột xuất</DialogTitle>
            <DialogDescription>
              Tạo mới một buổi học ngoài thời khoá biểu cố định cho lớp học.
            </DialogDescription>
          </DialogHeader>

          <form onSubmit={handleCreateSession} className="space-y-4">
            {formError && (
              <div
                data-testid="session-form-error"
                className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700"
              >
                {formError}
              </div>
            )}

            <div className="space-y-1.5">
              <Label>Lớp học *</Label>
              <Select
                data-testid="select-session-class"
                value={formClassId}
                onChange={(e) => {
                  const nextId = e.target.value;
                  setFormClassId(nextId);
                  const found = classes.find((c) => c.id === nextId);
                  if (found?.room) setFormRoom(found.room);
                }}
                required
              >
                <option value="">-- Chọn lớp học --</option>
                {classes.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.code} — {c.name}
                  </option>
                ))}
              </Select>
            </div>

            <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
              <div className="space-y-1.5">
                <Label>Ngày học *</Label>
                <Input
                  type="date"
                  data-testid="input-session-date"
                  value={formDate}
                  onChange={(e) => setFormDate(e.target.value)}
                  required
                />
              </div>
              <div className="space-y-1.5">
                <Label>Giờ bắt đầu *</Label>
                <Input
                  type="time"
                  data-testid="input-session-start"
                  value={formStartTime}
                  onChange={(e) => setFormStartTime(e.target.value)}
                  required
                />
              </div>
              <div className="space-y-1.5">
                <Label>Giờ kết thúc *</Label>
                <Input
                  type="time"
                  data-testid="input-session-end"
                  value={formEndTime}
                  onChange={(e) => setFormEndTime(e.target.value)}
                  required
                />
              </div>
            </div>

            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label>Phòng học</Label>
                <Input
                  data-testid="input-session-room"
                  placeholder="VD: Phòng 201"
                  value={formRoom}
                  onChange={(e) => setFormRoom(e.target.value)}
                />
              </div>
              <div className="space-y-1.5">
                <Label>Chủ đề buổi học</Label>
                <Input
                  data-testid="input-session-topic"
                  placeholder="VD: Ôn tập Hình học chương 2"
                  value={formTopic}
                  onChange={(e) => setFormTopic(e.target.value)}
                />
              </div>
            </div>

            <div className="space-y-1.5">
              <Label>Ghi chú giáo viên</Label>
              <Input
                data-testid="input-session-notes"
                placeholder="Ghi chú nội dung chuẩn bị cho buổi học..."
                value={formNotes}
                onChange={(e) => setFormNotes(e.target.value)}
              />
            </div>

            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                onClick={() => setCreateOpen(false)}
              >
                Huỷ
              </Button>
              <Button type="submit" disabled={submitting}>
                {submitting ? "Đang lưu..." : "Tạo buổi học"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
