"use client";

import React, { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import {
  AlertTriangle,
  Calendar,
  ChevronLeft,
  ChevronRight,
  Clock,
  MapPin,
  Sparkles,
} from "lucide-react";
import {
  Card,
  CardContent,
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
import { DAY_OF_WEEK_LABELS, formatDateVn } from "@/lib/utils";

interface ScheduleSlotItem {
  id: string;
  classId: string;
  dayOfWeek: number;
  startTime: string;
  endTime: string;
  room: string | null;
  class: {
    id: string;
    code: string;
    name: string;
    subject: string;
    room: string | null;
    color: string | null;
  };
}

interface SessionItem {
  id: string;
  classId: string;
  sessionDate: string;
  startTime: string;
  endTime: string;
  room: string | null;
  status: string;
  class: {
    id: string;
    code: string;
    name: string;
  };
}

interface ScheduleConflictItem {
  dayOfWeek: number;
  overlapStart: string;
  overlapEnd: string;
  type: "TEACHER_OVERLAP" | "ROOM_COLLISION" | "TEACHER_AND_ROOM";
  reason: string;
  slotA: { id: string; className?: string };
  slotB: { id: string; className?: string };
}

const WEEK_DAYS_ORDER = [1, 2, 3, 4, 5, 6, 0];

export default function SchedulePage() {
  const [weekStart, setWeekStart] = useState<string>("");
  const [weekEnd, setWeekEnd] = useState<string>("");
  const [classFilter, setClassFilter] = useState<string>("");
  const [slots, setSlots] = useState<ScheduleSlotItem[]>([]);
  const [sessions, setSessions] = useState<SessionItem[]>([]);
  const [conflicts, setConflicts] = useState<ScheduleConflictItem[]>([]);
  const [classes, setClasses] = useState<
    Array<{ id: string; code: string; name: string }>
  >([]);
  const [loading, setLoading] = useState(true);

  // Generate Sessions Modal
  const [openGenModal, setOpenGenModal] = useState(false);
  const [fromDate, setFromDate] = useState("2026-11-01");
  const [toDate, setToDate] = useState("2026-11-30");
  const [genMessage, setGenMessage] = useState<string | null>(null);
  const [generating, setGenerating] = useState(false);

  const loadSchedule = useCallback(async () => {
    try {
      setLoading(true);
      const params = new URLSearchParams();
      if (weekStart) params.set("weekStart", weekStart);
      if (classFilter) params.set("classId", classFilter);

      const [schedRes, clsRes] = await Promise.all([
        fetch(`/api/schedule?${params.toString()}`),
        fetch("/api/classes"),
      ]);

      if (schedRes.ok) {
        const data = await schedRes.json();
        setWeekStart(data.weekStart);
        setWeekEnd(data.weekEnd);
        setSlots(data.slots || []);
        setSessions(data.sessions || []);
        setConflicts(data.conflicts || []);
      }
      if (clsRes.ok) {
        const clsData = await clsRes.json();
        setClasses(clsData.classes || []);
      }
    } finally {
      setLoading(false);
    }
  }, [weekStart, classFilter]);

  useEffect(() => {
    loadSchedule();
  }, [loadSchedule]);

  function shiftWeek(daysDelta: number) {
    if (!weekStart) return;
    const base = new Date(`${weekStart}T00:00:00.000Z`);
    const next = new Date(base.getTime() + daysDelta * 86400000);
    setWeekStart(next.toISOString().slice(0, 10));
  }

  async function handleGenerateSessions(e: React.FormEvent) {
    e.preventDefault();
    setGenerating(true);
    setGenMessage(null);

    try {
      const res = await fetch("/api/schedule/generate-sessions", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          fromDate,
          toDate,
          classIds: classFilter ? [classFilter] : undefined,
        }),
      });
      const data = await res.json();
      if (res.ok) {
        setGenMessage(
          `Đã sinh tự động ${data.createdCount} buổi học mới (bỏ qua ${data.skippedCount} buổi đã tồn tại).`
        );
        setOpenGenModal(false);
        await loadSchedule();
      } else {
        setGenMessage(data.error || "Lỗi sinh buổi học");
      }
    } finally {
      setGenerating(false);
    }
  }

  const conflictSlotIds = new Set<string>();
  for (const c of conflicts) {
    if (c.slotA?.id) conflictSlotIds.add(c.slotA.id);
    if (c.slotB?.id) conflictSlotIds.add(c.slotB.id);
  }

  return (
    <div data-testid="schedule-page" className="mx-auto max-w-7xl space-y-6">
      {/* Header */}
      <div className="flex flex-col justify-between gap-4 lg:flex-row lg:items-center">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">
            Thời khoá biểu & Lịch dạy hàng tuần
          </h1>
          <p className="text-sm text-slate-600">
            Tuần hiển thị: <strong>{formatDateVn(weekStart)}</strong> —{" "}
            <strong>{formatDateVn(weekEnd)}</strong> • Tự động cảnh báo trùng
            giờ dạy và trùng phòng học
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <div className="flex items-center gap-1 rounded-lg border border-slate-200 bg-white p-1">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => shiftWeek(-7)}
            >
              <ChevronLeft className="h-4 w-4" />
              <span>Tuần trước</span>
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setWeekStart("")}
            >
              Tuần hiện tại
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => shiftWeek(7)}
            >
              <span>Tuần sau</span>
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>

          <Select
            className="w-48"
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

          <Button
            data-testid="open-generate-sessions-modal"
            onClick={() => setOpenGenModal(true)}
          >
            <Sparkles className="h-4 w-4" />
            <span>Sinh buổi học từ TKB</span>
          </Button>
        </div>
      </div>

      {genMessage && (
        <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-800">
          {genMessage}
        </div>
      )}

      {/* Conflict Warning Banner */}
      {conflicts.length > 0 && (
        <div
          data-testid="schedule-conflicts-banner"
          className="rounded-xl border border-red-300 bg-red-50 p-4 text-red-900"
        >
          <div className="flex items-center gap-2 font-semibold">
            <AlertTriangle className="h-5 w-5 text-red-600" />
            <span>
              Phát hiện {conflicts.length} xung đột trong thời khoá biểu!
            </span>
          </div>
          <ul className="mt-2 list-inside list-disc space-y-1 text-sm">
            {conflicts.map((conf, idx) => (
              <li key={idx}>
                <strong>{DAY_OF_WEEK_LABELS[conf.dayOfWeek]}</strong> (
                {conf.overlapStart} - {conf.overlapEnd}): {conf.reason}
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* 7-Column Weekly Grid */}
      <div
        data-testid="schedule-grid"
        className="grid grid-cols-1 gap-3 md:grid-cols-7"
      >
        {WEEK_DAYS_ORDER.map((dayNum, colIdx) => {
          const daySlots = slots.filter((s) => s.dayOfWeek === dayNum);
          let colDateStr = "";
          if (weekStart) {
            const d = new Date(`${weekStart}T00:00:00.000Z`);
            const target = new Date(d.getTime() + colIdx * 86400000);
            colDateStr = target.toISOString().slice(0, 10);
          }
          const daySessions = sessions.filter(
            (sess) => sess.sessionDate.slice(0, 10) === colDateStr
          );

          return (
            <Card
              key={dayNum}
              data-testid={`schedule-day-${dayNum}`}
              className="flex flex-col"
            >
              <CardHeader className="border-b border-slate-100 bg-slate-50/70 p-3">
                <CardTitle className="flex items-center justify-between text-sm">
                  <span>{DAY_OF_WEEK_LABELS[dayNum]}</span>
                  {colDateStr && (
                    <span className="text-xs font-normal text-slate-500">
                      {colDateStr.slice(8, 10)}/{colDateStr.slice(5, 7)}
                    </span>
                  )}
                </CardTitle>
              </CardHeader>

              <CardContent className="flex-1 space-y-2.5 p-2.5">
                {loading ? (
                  <div className="h-20 animate-pulse rounded-lg bg-slate-100" />
                ) : daySlots.length === 0 && daySessions.length === 0 ? (
                  <p className="py-6 text-center text-xs text-slate-400">
                    Trống
                  </p>
                ) : (
                  <>
                    {daySlots.map((slot) => {
                      const hasConflict = conflictSlotIds.has(slot.id);
                      return (
                        <div
                          key={slot.id}
                          className={`rounded-lg border p-2.5 text-xs transition ${
                            hasConflict
                              ? "border-red-300 bg-red-50/80"
                              : "border-blue-200 bg-blue-50/50"
                          }`}
                        >
                          <div className="flex items-center justify-between font-semibold text-slate-900">
                            <span className="inline-flex items-center gap-1">
                              <Clock className="h-3 w-3 text-blue-600" />
                              {slot.startTime} - {slot.endTime}
                            </span>
                            {hasConflict && (
                              <Badge variant="destructive">Trùng lịch</Badge>
                            )}
                          </div>
                          <Link
                            href={`/classes/${slot.class.id}`}
                            prefetch={false}
                            className="mt-1 block font-bold text-blue-700 hover:underline"
                          >
                            {slot.class.name}
                          </Link>
                          <div className="mt-1 flex items-center justify-between text-slate-600">
                            <span>{slot.class.code}</span>
                            {(slot.room || slot.class.room) && (
                              <span className="inline-flex items-center gap-0.5">
                                <MapPin className="h-3 w-3" />
                                {slot.room || slot.class.room}
                              </span>
                            )}
                          </div>
                        </div>
                      );
                    })}

                    {daySessions.length > 0 && (
                      <div className="border-t border-slate-100 pt-2">
                        <p className="mb-1 text-[11px] font-semibold text-slate-500">
                          Buổi học trong tuần ({daySessions.length}):
                        </p>
                        {daySessions.map((sess) => (
                          <Link
                            key={sess.id}
                            href={`/sessions/${sess.id}`}
                            prefetch={false}
                            className="mb-1 block rounded border border-emerald-200 bg-emerald-50/60 px-2 py-1 text-[11px] text-emerald-900 hover:bg-emerald-100"
                          >
                            <Calendar className="mr-1 inline h-3 w-3" />
                            {sess.startTime}: {sess.class.code}
                          </Link>
                        ))}
                      </div>
                    )}
                  </>
                )}
              </CardContent>
            </Card>
          );
        })}
      </div>

      {/* Generate Sessions Modal */}
      <Dialog open={openGenModal} onOpenChange={setOpenGenModal}>
        <DialogContent data-testid="generate-sessions-dialog">
          <DialogHeader>
            <DialogTitle>Sinh buổi học tự động từ Thời khoá biểu</DialogTitle>
            <DialogDescription>
              Hệ thống sẽ đối chiếu các ca học hàng tuần để tạo buổi học trong
              khoảng thời gian được chọn (không tạo trùng buổi đã có).
            </DialogDescription>
          </DialogHeader>

          <form onSubmit={handleGenerateSessions} className="space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="sched-from">Từ ngày</Label>
                <Input
                  id="sched-from"
                  type="date"
                  value={fromDate}
                  onChange={(e) => setFromDate(e.target.value)}
                  required
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="sched-to">Đến ngày</Label>
                <Input
                  id="sched-to"
                  type="date"
                  value={toDate}
                  onChange={(e) => setToDate(e.target.value)}
                  required
                />
              </div>
            </div>

            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                onClick={() => setOpenGenModal(false)}
              >
                Huỷ
              </Button>
              <Button
                type="submit"
                data-testid="confirm-generate-sessions-btn"
                disabled={generating}
              >
                {generating ? "Đang xử lý..." : "Sinh buổi học"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
