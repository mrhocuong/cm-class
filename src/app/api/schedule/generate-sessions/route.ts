import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import {
  handleApiError,
  requireWorkspace,
  WorkspaceAuthError,
} from "@/lib/workspace";
import {
  buildSessionUniqueKey,
  generateSessionDates,
  type GenerateSessionSlotInput,
  normalizeUtcDate,
} from "@/lib/timetable";

export async function POST(req: NextRequest) {
  try {
    const { workspaceId } = await requireWorkspace(req);
    const body = await req.json().catch(() => ({}));

    if (!body.fromDate || !body.toDate) {
      return NextResponse.json(
        { error: "Vui lòng chọn từ ngày (fromDate) và đến ngày (toDate)" },
        { status: 400 }
      );
    }

    let fromDate: Date;
    let toDate: Date;
    try {
      fromDate = normalizeUtcDate(body.fromDate);
      toDate = normalizeUtcDate(body.toDate);
    } catch (err) {
      return NextResponse.json(
        {
          error:
            err instanceof Error ? err.message : "Khoảng ngày không hợp lệ",
        },
        { status: 400 }
      );
    }

    if (fromDate.getTime() > toDate.getTime()) {
      return NextResponse.json(
        { error: "Ngày bắt đầu không được lớn hơn ngày kết thúc" },
        { status: 400 }
      );
    }

    const diffDays =
      Math.round((toDate.getTime() - fromDate.getTime()) / 86400000) + 1;
    if (diffDays > 366) {
      return NextResponse.json(
        { error: "Khoảng thời gian sinh buổi học tối đa là 366 ngày" },
        { status: 400 }
      );
    }

    const rawClassIds: string[] | undefined =
      Array.isArray(body.classIds) && body.classIds.length > 0
        ? body.classIds.map(String)
        : body.classId
        ? [String(body.classId)]
        : undefined;
    const classIds = rawClassIds
      ? Array.from(new Set(rawClassIds.map((c) => c.trim()).filter(Boolean)))
      : undefined;

    const classes = await prisma.class.findMany({
      where: {
        workspaceId,
        ...(classIds ? { id: { in: classIds } } : { status: "ACTIVE" }),
      },
      include: {
        scheduleSlots: {
          orderBy: [{ dayOfWeek: "asc" }, { startTime: "asc" }],
        },
      },
    });

    if (classIds && classes.length !== classIds.length) {
      throw new WorkspaceAuthError(
        404,
        "Không tìm thấy lớp học trong workspace của bạn"
      );
    }

    const targetClassIds = classes.map((c) => c.id);
    if (targetClassIds.length === 0) {
      return NextResponse.json(
        { createdCount: 0, skippedCount: 0, sessions: [] },
        { status: 200 }
      );
    }

    const slotsInput: GenerateSessionSlotInput[] = [];
    for (const cls of classes) {
      for (const slot of cls.scheduleSlots) {
        slotsInput.push({
          id: slot.id,
          classId: cls.id,
          dayOfWeek: slot.dayOfWeek,
          startTime: slot.startTime,
          endTime: slot.endTime,
          room: slot.room ?? cls.room,
          classStartDate: null,
          classEndDate: null,
        });
      }
    }

    const existingSessions = await prisma.session.findMany({
      where: {
        workspaceId,
        classId: { in: targetClassIds },
        sessionDate: {
          gte: fromDate,
          lte: toDate,
        },
      },
    });

    const existingSessionKeys = existingSessions.map((s) =>
      buildSessionUniqueKey(s.classId, s.sessionDate, s.startTime)
    );

    const { toCreate, skippedCount } = generateSessionDates({
      slots: slotsInput,
      fromDate,
      toDate,
      existingSessionKeys,
    });

    if (toCreate.length > 0) {
      await prisma.session.createMany({
        data: toCreate.map((c) => ({
          workspaceId,
          classId: c.classId,
          scheduleSlotId: c.scheduleSlotId ?? null,
          sessionDate: c.sessionDate,
          startTime: c.startTime,
          endTime: c.endTime,
          room: c.room ?? null,
          status: "SCHEDULED",
        })),
        skipDuplicates: true,
      });
    }

    const sessions = await prisma.session.findMany({
      where: {
        workspaceId,
        classId: { in: targetClassIds },
        sessionDate: {
          gte: fromDate,
          lte: toDate,
        },
      },
      include: {
        class: {
          select: { id: true, code: true, name: true, subject: true },
        },
      },
      orderBy: [{ sessionDate: "asc" }, { startTime: "asc" }],
    });

    return NextResponse.json(
      {
        createdCount: toCreate.length,
        skippedCount,
        sessions,
      },
      { status: 200 }
    );
  } catch (error) {
    return handleApiError(error);
  }
}
