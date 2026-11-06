import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { handleApiError, requireWorkspace } from "@/lib/workspace";
import {
  detectScheduleConflicts,
  formatUtcDateIso,
  normalizeUtcDate,
  type ScheduleSlotCandidate,
} from "@/lib/timetable";

export async function GET(req: NextRequest) {
  try {
    const { workspaceId } = await requireWorkspace(req);
    const { searchParams } = new URL(req.url);
    const weekStartParam = searchParams.get("weekStart");
    const classId = searchParams.get("classId")?.trim() || undefined;

    let monday: Date;
    if (weekStartParam) {
      try {
        monday = normalizeUtcDate(weekStartParam);
      } catch {
        return NextResponse.json(
          { error: "Tham số weekStart không hợp lệ" },
          { status: 400 }
        );
      }
    } else {
      const today = normalizeUtcDate(new Date());
      const day = today.getUTCDay(); // 0=Sun..6=Sat
      const diffToMonday = day === 0 ? -6 : 1 - day;
      monday = new Date(today.getTime() + diffToMonday * 86400000);
    }

    const weekEnd = new Date(monday.getTime() + 6 * 86400000);
    const weekEndInclusive = new Date(weekEnd.getTime() + 86399999);

    const slots = await prisma.scheduleSlot.findMany({
      where: {
        workspaceId,
        ...(classId
          ? { classId }
          : { class: { status: { not: "ARCHIVED" } } }),
      },
      include: {
        class: {
          select: {
            id: true,
            code: true,
            name: true,
            subject: true,
            room: true,
            color: true,
            status: true,
          },
        },
      },
      orderBy: [{ dayOfWeek: "asc" }, { startTime: "asc" }],
    });

    const candidates: ScheduleSlotCandidate[] = slots.map((s) => ({
      id: s.id,
      classId: s.classId,
      className: s.class.name,
      dayOfWeek: s.dayOfWeek,
      startTime: s.startTime,
      endTime: s.endTime,
      room: s.room ?? s.class.room,
    }));

    const conflicts = detectScheduleConflicts(candidates);

    const sessions = await prisma.session.findMany({
      where: {
        workspaceId,
        ...(classId ? { classId } : {}),
        sessionDate: {
          gte: monday,
          lte: weekEndInclusive,
        },
      },
      include: {
        class: {
          select: {
            id: true,
            code: true,
            name: true,
            subject: true,
            room: true,
            color: true,
          },
        },
      },
      orderBy: [{ sessionDate: "asc" }, { startTime: "asc" }],
    });

    return NextResponse.json(
      {
        weekStart: formatUtcDateIso(monday),
        weekEnd: formatUtcDateIso(weekEnd),
        slots,
        sessions,
        conflicts,
      },
      { status: 200 }
    );
  } catch (error) {
    return handleApiError(error);
  }
}
