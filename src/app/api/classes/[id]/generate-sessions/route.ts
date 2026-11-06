import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import {
  assertWorkspaceResource,
  handleApiError,
  requireWorkspace,
} from "@/lib/workspace";
import {
  buildSessionUniqueKey,
  generateSessionDates,
  normalizeUtcDate,
} from "@/lib/timetable";

type RouteContext = { params: Promise<{ id: string }> };

export async function POST(req: NextRequest, context: RouteContext) {
  try {
    const { workspaceId } = await requireWorkspace(req);
    const { id: classId } = await context.params;

    const cls = assertWorkspaceResource(
      await prisma.class.findFirst({
        where: { id: classId, workspaceId },
        include: {
          scheduleSlots: {
            orderBy: [{ dayOfWeek: "asc" }, { startTime: "asc" }],
          },
        },
      }),
      workspaceId,
      "Không tìm thấy lớp học trong workspace của bạn"
    );

    const body = await req.json().catch(() => ({}));
    const rawFrom = body.fromDate ?? cls.startDate;
    const rawTo = body.toDate ?? cls.endDate;

    if (!rawFrom || !rawTo) {
      return NextResponse.json(
        { error: "Vui lòng chọn từ ngày (fromDate) và đến ngày (toDate)" },
        { status: 400 }
      );
    }

    let fromDate: Date;
    let toDate: Date;
    try {
      fromDate = normalizeUtcDate(rawFrom);
      toDate = normalizeUtcDate(rawTo);
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

    const existingSessions = await prisma.session.findMany({
      where: {
        workspaceId,
        classId: cls.id,
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
      slots: cls.scheduleSlots.map((s) => ({
        id: s.id,
        classId: cls.id,
        dayOfWeek: s.dayOfWeek,
        startTime: s.startTime,
        endTime: s.endTime,
        room: s.room ?? cls.room,
        classStartDate: null,
        classEndDate: null,
      })),
      fromDate,
      toDate,
      existingSessionKeys,
    });

    if (toCreate.length > 0) {
      await prisma.session.createMany({
        data: toCreate.map((c) => ({
          workspaceId,
          classId: cls.id,
          scheduleSlotId: c.scheduleSlotId ?? null,
          sessionDate: c.sessionDate,
          startTime: c.startTime,
          endTime: c.endTime,
          room: c.room ?? cls.room ?? null,
          status: "SCHEDULED",
        })),
        skipDuplicates: true,
      });
    }

    const sessions = await prisma.session.findMany({
      where: {
        workspaceId,
        classId: cls.id,
        sessionDate: {
          gte: fromDate,
          lte: toDate,
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
