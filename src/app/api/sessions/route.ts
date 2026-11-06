import { NextRequest, NextResponse } from "next/server";
import type { SessionStatus } from "@prisma/client";
import { prisma } from "@/lib/db";
import { requireWorkspace, handleApiError } from "@/lib/workspace";
import { validateTimeRange, normalizeUtcDate } from "@/lib/timetable";

const VALID_SESSION_STATUSES: SessionStatus[] = [
  "SCHEDULED",
  "IN_PROGRESS",
  "COMPLETED",
  "CANCELLED",
];

export async function GET(req: NextRequest) {
  try {
    const { workspaceId } = await requireWorkspace(req);
    const { searchParams } = new URL(req.url);

    const classId = searchParams.get("classId")?.trim() || undefined;
    const fromParam =
      searchParams.get("from")?.trim() ||
      searchParams.get("fromDate")?.trim() ||
      undefined;
    const toParam =
      searchParams.get("to")?.trim() ||
      searchParams.get("toDate")?.trim() ||
      undefined;
    const statusParam = searchParams.get("status")?.trim() || undefined;

    if (classId) {
      const cls = await prisma.class.findFirst({
        where: { id: classId, workspaceId },
        select: { id: true },
      });
      if (!cls) {
        return NextResponse.json(
          { error: "Không tìm thấy lớp học trong workspace của bạn" },
          { status: 404 }
        );
      }
    }

    const dateFilter: { gte?: Date; lte?: Date } = {};
    if (fromParam) {
      try {
        dateFilter.gte = normalizeUtcDate(fromParam);
      } catch {
        return NextResponse.json(
          { error: "Ngày bắt đầu (from) không hợp lệ" },
          { status: 400 }
        );
      }
    }
    if (toParam) {
      try {
        dateFilter.lte = normalizeUtcDate(toParam);
      } catch {
        return NextResponse.json(
          { error: "Ngày kết thúc (to) không hợp lệ" },
          { status: 400 }
        );
      }
    }

    const status =
      statusParam &&
      VALID_SESSION_STATUSES.includes(statusParam as SessionStatus)
        ? (statusParam as SessionStatus)
        : undefined;

    const rawSessions = await prisma.session.findMany({
      where: {
        workspaceId,
        ...(classId ? { classId } : {}),
        ...(status ? { status } : {}),
        ...(dateFilter.gte || dateFilter.lte ? { sessionDate: dateFilter } : {}),
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
        attendances: {
          select: {
            status: true,
          },
        },
        _count: {
          select: {
            attendances: true,
            homeworks: true,
            gameSessions: true,
          },
        },
      },
      orderBy: [{ sessionDate: "asc" }, { startTime: "asc" }],
    });

    const sessions = rawSessions.map((s) => {
      const presentCount = s.attendances.filter(
        (a) => a.status === "PRESENT"
      ).length;
      const lateCount = s.attendances.filter((a) => a.status === "LATE").length;
      const absentCount = s.attendances.filter(
        (a) =>
          a.status === "ABSENT_EXCUSED" || a.status === "ABSENT_UNEXCUSED"
      ).length;
      return {
        ...s,
        presentCount,
        lateCount,
        absentCount,
        totalAttendances: s.attendances.length,
      };
    });

    return NextResponse.json({ sessions });
  } catch (error) {
    return handleApiError(error);
  }
}

export async function POST(req: NextRequest) {
  try {
    const { workspaceId } = await requireWorkspace(req);
    const body = await req.json().catch(() => null);

    if (!body || typeof body !== "object") {
      return NextResponse.json(
        { error: "Dữ liệu tạo buổi học không hợp lệ" },
        { status: 400 }
      );
    }

    const classId = String(body.classId || "").trim();
    if (!classId) {
      return NextResponse.json(
        { error: "Vui lòng chọn lớp học (classId)" },
        { status: 400 }
      );
    }

    const cls = await prisma.class.findFirst({
      where: { id: classId, workspaceId },
    });
    if (!cls) {
      return NextResponse.json(
        { error: "Không tìm thấy lớp học trong workspace của bạn" },
        { status: 404 }
      );
    }

    const startTime = String(body.startTime || "").trim();
    const endTime = String(body.endTime || "").trim();
    const timeCheck = validateTimeRange(startTime, endTime);
    if (!timeCheck.valid) {
      return NextResponse.json(
        { error: timeCheck.error || "Khung giờ buổi học không hợp lệ" },
        { status: 400 }
      );
    }

    if (!body.sessionDate) {
      return NextResponse.json(
        { error: "Vui lòng chọn ngày học (sessionDate)" },
        { status: 400 }
      );
    }

    let sessionDate: Date;
    try {
      sessionDate = normalizeUtcDate(body.sessionDate);
    } catch {
      return NextResponse.json(
        { error: "Ngày học (sessionDate) không hợp lệ" },
        { status: 400 }
      );
    }

    let status: SessionStatus = "SCHEDULED";
    if (body.status !== undefined) {
      const requestedStatus = String(body.status).trim() as SessionStatus;
      if (!VALID_SESSION_STATUSES.includes(requestedStatus)) {
        return NextResponse.json(
          { error: "Trạng thái buổi học không hợp lệ" },
          { status: 400 }
        );
      }
      status = requestedStatus;
    }

    const room =
      body.room !== undefined
        ? body.room
          ? String(body.room).trim()
          : null
        : cls.room ?? null;
    const topic =
      body.topic !== undefined && body.topic !== null
        ? String(body.topic).trim() || null
        : null;
    const notes =
      body.notes !== undefined && body.notes !== null
        ? String(body.notes).trim() || null
        : null;

    const session = await prisma.session.create({
      data: {
        workspaceId,
        classId: cls.id,
        sessionDate,
        startTime,
        endTime,
        room,
        topic,
        notes,
        status,
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
    });

    return NextResponse.json({ session }, { status: 201 });
  } catch (error) {
    return handleApiError(error);
  }
}
