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

export async function GET(
  req: NextRequest,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  context: { params: any }
) {
  try {
    const { workspaceId } = await requireWorkspace(req);
    const { id } = await Promise.resolve<{ id: string }>(context.params);

    const session = await prisma.session.findFirst({
      where: { id, workspaceId },
      include: {
        class: true,
        homeworks: {
          orderBy: { createdAt: "desc" },
          include: {
            _count: { select: { submissions: true } },
          },
        },
        gameSessions: {
          orderBy: { createdAt: "desc" },
          include: {
            minigame: true,
            results: {
              include: {
                student: {
                  select: {
                    id: true,
                    studentCode: true,
                    fullName: true,
                    avatarUrl: true,
                  },
                },
              },
              orderBy: { rank: "asc" },
            },
          },
        },
      },
    });

    if (!session) {
      return NextResponse.json(
        { error: "Không tìm thấy buổi học trong workspace của bạn" },
        { status: 404 }
      );
    }

    const [enrollments, attendances] = await Promise.all([
      prisma.enrollment.findMany({
        where: {
          workspaceId,
          classId: session.classId,
          status: "ACTIVE",
        },
        include: {
          student: {
            include: {
              faceDescriptors: {
                select: {
                  id: true,
                  label: true,
                  source: true,
                  sampleImageUrl: true,
                  createdAt: true,
                },
              },
            },
          },
        },
        orderBy: {
          student: { fullName: "asc" },
        },
      }),
      prisma.attendance.findMany({
        where: {
          workspaceId,
          sessionId: session.id,
        },
        include: {
          student: {
            include: {
              faceDescriptors: {
                select: {
                  id: true,
                  label: true,
                  source: true,
                  sampleImageUrl: true,
                  createdAt: true,
                },
              },
            },
          },
        },
      }),
    ]);

    const attendanceByStudentId = new Map(
      attendances.map((att) => [att.studentId, att])
    );

    const seenStudentIds = new Set<string>();
    const roster: Array<Record<string, unknown>> = [];

    for (const enrollment of enrollments) {
      const stu = enrollment.student;
      seenStudentIds.add(stu.id);
      const att = attendanceByStudentId.get(stu.id) ?? null;
      roster.push({
        studentId: stu.id,
        student: {
          ...stu,
          faceDescriptorCount: stu.faceDescriptors?.length ?? 0,
        },
        enrollmentId: enrollment.id,
        attendance: att,
        status: att?.status ?? null,
        checkInAt: att?.checkInAt ?? null,
        checkOutAt: att?.checkOutAt ?? null,
        method: att?.method ?? null,
        confidenceScore: att?.confidenceScore ?? null,
        notes: att?.notes ?? null,
      });
    }

    for (const att of attendances) {
      if (seenStudentIds.has(att.studentId)) continue;
      const stu = att.student;
      roster.push({
        studentId: stu.id,
        student: {
          ...stu,
          faceDescriptorCount: stu.faceDescriptors?.length ?? 0,
        },
        enrollmentId: null,
        attendance: att,
        status: att.status,
        checkInAt: att.checkInAt,
        checkOutAt: att.checkOutAt,
        method: att.method,
        confidenceScore: att.confidenceScore,
        notes: att.notes,
      });
    }

    return NextResponse.json({
      session,
      roster,
      homeworks: session.homeworks,
      gameSessions: session.gameSessions,
    });
  } catch (error) {
    return handleApiError(error);
  }
}

export async function PATCH(
  req: NextRequest,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  context: { params: any }
) {
  try {
    const { workspaceId } = await requireWorkspace(req);
    const { id } = await Promise.resolve<{ id: string }>(context.params);

    const existing = await prisma.session.findFirst({
      where: { id, workspaceId },
    });
    if (!existing) {
      return NextResponse.json(
        { error: "Không tìm thấy buổi học trong workspace của bạn" },
        { status: 404 }
      );
    }

    const body = await req.json().catch(() => null);
    if (!body || typeof body !== "object") {
      return NextResponse.json(
        { error: "Dữ liệu cập nhật buổi học không hợp lệ" },
        { status: 400 }
      );
    }

    const newStartTime =
      body.startTime !== undefined
        ? String(body.startTime).trim()
        : existing.startTime;
    const newEndTime =
      body.endTime !== undefined
        ? String(body.endTime).trim()
        : existing.endTime;

    if (body.startTime !== undefined || body.endTime !== undefined) {
      const timeCheck = validateTimeRange(newStartTime, newEndTime);
      if (!timeCheck.valid) {
        return NextResponse.json(
          { error: timeCheck.error || "Khung giờ buổi học không hợp lệ" },
          { status: 400 }
        );
      }
    }

    let newSessionDate = existing.sessionDate;
    if (body.sessionDate !== undefined) {
      try {
        newSessionDate = normalizeUtcDate(body.sessionDate);
      } catch {
        return NextResponse.json(
          { error: "Ngày học (sessionDate) không hợp lệ" },
          { status: 400 }
        );
      }
    }

    let newStatus = existing.status;
    if (body.status !== undefined) {
      const candidateStatus = String(body.status).trim() as SessionStatus;
      if (!VALID_SESSION_STATUSES.includes(candidateStatus)) {
        return NextResponse.json(
          { error: "Trạng thái buổi học không hợp lệ" },
          { status: 400 }
        );
      }
      newStatus = candidateStatus;
    }

    const session = await prisma.session.update({
      where: { id: existing.id },
      data: {
        sessionDate: newSessionDate,
        startTime: newStartTime,
        endTime: newEndTime,
        status: newStatus,
        ...(body.room !== undefined
          ? { room: body.room ? String(body.room).trim() : null }
          : {}),
        ...(body.topic !== undefined
          ? { topic: body.topic ? String(body.topic).trim() : null }
          : {}),
        ...(body.notes !== undefined
          ? { notes: body.notes ? String(body.notes).trim() : null }
          : {}),
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

    return NextResponse.json({ session });
  } catch (error) {
    return handleApiError(error);
  }
}

export async function DELETE(
  req: NextRequest,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  context: { params: any }
) {
  try {
    const { workspaceId } = await requireWorkspace(req);
    const { id } = await Promise.resolve<{ id: string }>(context.params);

    const existing = await prisma.session.findFirst({
      where: { id, workspaceId },
      select: { id: true },
    });
    if (!existing) {
      return NextResponse.json(
        { error: "Không tìm thấy buổi học trong workspace của bạn" },
        { status: 404 }
      );
    }

    await prisma.session.delete({
      where: { id: existing.id },
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    return handleApiError(error);
  }
}
