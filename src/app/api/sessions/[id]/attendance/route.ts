import { NextRequest, NextResponse } from "next/server";
import type { AttendanceMethod, AttendanceStatus } from "@prisma/client";
import { prisma } from "@/lib/db";
import { requireWorkspace, handleApiError } from "@/lib/workspace";

const VALID_ATTENDANCE_STATUSES: AttendanceStatus[] = [
  "PRESENT",
  "LATE",
  "ABSENT_EXCUSED",
  "ABSENT_UNEXCUSED",
];

const VALID_ATTENDANCE_METHODS: AttendanceMethod[] = ["MANUAL", "FACE_AI"];

function parseOptionalDate(
  val: unknown,
  fieldName: string
): { date: Date | null | undefined; error?: string } {
  if (val === undefined) return { date: undefined };
  if (val === null || val === "") return { date: null };
  const d = new Date(String(val));
  if (Number.isNaN(d.getTime())) {
    return { date: undefined, error: `Thời gian ${fieldName} không hợp lệ` };
  }
  return { date: d };
}

export async function POST(
  req: NextRequest,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  context: { params: any }
) {
  try {
    const { workspaceId } = await requireWorkspace(req);
    const { id: sessionId } = await Promise.resolve<{ id: string }>(context.params);

    const session = await prisma.session.findFirst({
      where: { id: sessionId, workspaceId },
    });
    if (!session) {
      return NextResponse.json(
        { error: "Không tìm thấy buổi học trong workspace của bạn" },
        { status: 404 }
      );
    }

    if (session.status === "CANCELLED") {
      return NextResponse.json(
        { error: "Không thể điểm danh cho buổi học đã huỷ" },
        { status: 400 }
      );
    }

    const body = await req.json().catch(() => null);
    if (!body || typeof body !== "object") {
      return NextResponse.json(
        { error: "Dữ liệu điểm danh không hợp lệ" },
        { status: 400 }
      );
    }

    // -------------------------------------------------------------------------
    // CASE A: Bulk Quick Actions (MARK_ALL_PRESENT / CHECK_OUT_ALL)
    // -------------------------------------------------------------------------
    if (body.action === "MARK_ALL_PRESENT" || body.action === "CHECK_OUT_ALL") {
      const now = body.timestamp ? new Date(String(body.timestamp)) : new Date();
      if (Number.isNaN(now.getTime())) {
        return NextResponse.json(
          { error: "Thời gian (timestamp) không hợp lệ" },
          { status: 400 }
        );
      }

      const activeEnrollments = await prisma.enrollment.findMany({
        where: {
          workspaceId,
          classId: session.classId,
          status: "ACTIVE",
        },
        select: { studentId: true },
      });

      const existingAttendances = await prisma.attendance.findMany({
        where: {
          workspaceId,
          sessionId: session.id,
        },
      });
      const existingByStudent = new Map(
        existingAttendances.map((a) => [a.studentId, a])
      );

      if (body.action === "MARK_ALL_PRESENT") {
        const attendances = await prisma.$transaction(
          activeEnrollments.map((enr) => {
            const existing = existingByStudent.get(enr.studentId);
            const checkInAt = existing?.checkInAt ?? now;
            return prisma.attendance.upsert({
              where: {
                sessionId_studentId: {
                  sessionId: session.id,
                  studentId: enr.studentId,
                },
              },
              create: {
                workspaceId,
                sessionId: session.id,
                studentId: enr.studentId,
                status: "PRESENT",
                checkInAt,
                method: "MANUAL",
              },
              update: {
                status: "PRESENT",
                checkInAt,
                method: existing?.method ?? "MANUAL",
              },
            });
          })
        );

        return NextResponse.json({
          updatedCount: attendances.length,
          attendances,
        });
      }

      // action === "CHECK_OUT_ALL"
      const checkedInExisting = existingAttendances.filter(
        (a) =>
          a.status === "PRESENT" ||
          a.status === "LATE" ||
          a.checkInAt !== null
      );

      const targetStudentIds =
        checkedInExisting.length > 0
          ? checkedInExisting.map((a) => a.studentId)
          : activeEnrollments.map((e) => e.studentId);

      const attendances = await prisma.$transaction(
        targetStudentIds.map((studentId) => {
          const existing = existingByStudent.get(studentId);
          const checkInAt = existing?.checkInAt ?? now;
          const safeCheckOutAt =
            now.getTime() >= checkInAt.getTime()
              ? now
              : new Date(checkInAt.getTime() + 1000);

          return prisma.attendance.upsert({
            where: {
              sessionId_studentId: {
                sessionId: session.id,
                studentId,
              },
            },
            create: {
              workspaceId,
              sessionId: session.id,
              studentId,
              status: existing?.status ?? "PRESENT",
              checkInAt,
              checkOutAt: safeCheckOutAt,
              method: existing?.method ?? "MANUAL",
            },
            update: {
              checkInAt,
              checkOutAt: safeCheckOutAt,
            },
          });
        })
      );

      return NextResponse.json({
        updatedCount: attendances.length,
        attendances,
      });
    }

    // -------------------------------------------------------------------------
    // CASE B: Batch Records Array (`records` or `attendances`)
    // -------------------------------------------------------------------------
    const batchItems: unknown[] | null = Array.isArray(body.records)
      ? body.records
      : Array.isArray(body.attendances)
      ? body.attendances
      : null;

    if (batchItems) {
      if (batchItems.length === 0) {
        return NextResponse.json({ updatedCount: 0, attendances: [] });
      }

      const existingAttendances = await prisma.attendance.findMany({
        where: { workspaceId, sessionId: session.id },
      });
      const existingByStudent = new Map(
        existingAttendances.map((a) => [a.studentId, a])
      );

      const studentIds = Array.from(
        new Set(
          batchItems.map((item) =>
            String(
              (item as Record<string, unknown> | null)?.studentId || ""
            ).trim()
          )
        )
      ).filter(Boolean);

      const validStudents = await prisma.student.findMany({
        where: { workspaceId, id: { in: studentIds } },
        select: { id: true },
      });
      const validStudentIdSet = new Set(validStudents.map((s) => s.id));

      const preparedOps: Array<{
        studentId: string;
        status: AttendanceStatus;
        checkInAt: Date | null;
        checkOutAt: Date | null;
        method: AttendanceMethod;
        confidenceScore: number | null;
        notes: string | null;
      }> = [];

      for (const rawItem of batchItems as Array<Record<string, unknown>>) {
        const studentId = String(rawItem?.studentId || "").trim();
        if (!studentId || !validStudentIdSet.has(studentId)) {
          return NextResponse.json(
            { error: "Không tìm thấy học sinh trong workspace của bạn" },
            { status: 404 }
          );
        }

        const existing = existingByStudent.get(studentId);
        const status: AttendanceStatus =
          rawItem.status !== undefined
            ? (String(rawItem.status).trim() as AttendanceStatus)
            : existing?.status ?? "PRESENT";

        if (!VALID_ATTENDANCE_STATUSES.includes(status)) {
          return NextResponse.json(
            { error: "Trạng thái điểm danh không hợp lệ" },
            { status: 400 }
          );
        }

        const method: AttendanceMethod =
          rawItem.method !== undefined
            ? (String(rawItem.method).trim() as AttendanceMethod)
            : existing?.method ?? "MANUAL";

        if (!VALID_ATTENDANCE_METHODS.includes(method)) {
          return NextResponse.json(
            { error: "Phương thức điểm danh không hợp lệ" },
            { status: 400 }
          );
        }

        const parsedIn = parseOptionalDate(rawItem.checkInAt, "checkInAt");
        if (parsedIn.error) {
          return NextResponse.json({ error: parsedIn.error }, { status: 400 });
        }
        const parsedOut = parseOptionalDate(rawItem.checkOutAt, "checkOutAt");
        if (parsedOut.error) {
          return NextResponse.json({ error: parsedOut.error }, { status: 400 });
        }

        const effectiveCheckInAt =
          parsedIn.date !== undefined
            ? parsedIn.date
            : existing?.checkInAt ??
              (status === "PRESENT" || status === "LATE" ? new Date() : null);
        const effectiveCheckOutAt =
          parsedOut.date !== undefined
            ? parsedOut.date
            : existing?.checkOutAt ?? null;

        if (
          effectiveCheckInAt &&
          effectiveCheckOutAt &&
          effectiveCheckOutAt.getTime() < effectiveCheckInAt.getTime()
        ) {
          return NextResponse.json(
            { error: "Giờ ra về không được sớm hơn giờ điểm danh đến" },
            { status: 400 }
          );
        }

        const notes =
          rawItem.notes !== undefined
            ? rawItem.notes
              ? String(rawItem.notes).trim()
              : null
            : existing?.notes ?? null;

        const confidenceScore =
          rawItem.confidenceScore !== undefined &&
          rawItem.confidenceScore !== null
            ? Number(rawItem.confidenceScore)
            : existing?.confidenceScore ?? null;

        preparedOps.push({
          studentId,
          status,
          checkInAt: effectiveCheckInAt,
          checkOutAt: effectiveCheckOutAt,
          method,
          confidenceScore,
          notes,
        });
      }

      const attendances = await prisma.$transaction(
        preparedOps.map((op) =>
          prisma.attendance.upsert({
            where: {
              sessionId_studentId: {
                sessionId: session.id,
                studentId: op.studentId,
              },
            },
            create: {
              workspaceId,
              sessionId: session.id,
              studentId: op.studentId,
              status: op.status,
              checkInAt: op.checkInAt,
              checkOutAt: op.checkOutAt,
              method: op.method,
              confidenceScore: op.confidenceScore,
              notes: op.notes,
            },
            update: {
              status: op.status,
              checkInAt: op.checkInAt,
              checkOutAt: op.checkOutAt,
              method: op.method,
              confidenceScore: op.confidenceScore,
              notes: op.notes,
            },
          })
        )
      );

      return NextResponse.json({
        updatedCount: attendances.length,
        attendances,
      });
    }

    // -------------------------------------------------------------------------
    // CASE C: Single Student Attendance Upsert
    // -------------------------------------------------------------------------
    const studentId = String(body.studentId || "").trim();
    if (!studentId) {
      return NextResponse.json(
        { error: "Vui lòng chọn học sinh (studentId)" },
        { status: 400 }
      );
    }

    const student = await prisma.student.findFirst({
      where: { id: studentId, workspaceId },
      select: { id: true },
    });
    if (!student) {
      return NextResponse.json(
        { error: "Không tìm thấy học sinh trong workspace của bạn" },
        { status: 404 }
      );
    }

    const existing = await prisma.attendance.findUnique({
      where: {
        sessionId_studentId: {
          sessionId: session.id,
          studentId: student.id,
        },
      },
    });

    const status: AttendanceStatus =
      body.status !== undefined
        ? (String(body.status).trim() as AttendanceStatus)
        : existing?.status ?? "PRESENT";

    if (!VALID_ATTENDANCE_STATUSES.includes(status)) {
      return NextResponse.json(
        { error: "Trạng thái điểm danh không hợp lệ" },
        { status: 400 }
      );
    }

    const method: AttendanceMethod =
      body.method !== undefined
        ? (String(body.method).trim() as AttendanceMethod)
        : existing?.method ?? "MANUAL";

    if (!VALID_ATTENDANCE_METHODS.includes(method)) {
      return NextResponse.json(
        { error: "Phương thức điểm danh không hợp lệ" },
        { status: 400 }
      );
    }

    const parsedIn = parseOptionalDate(body.checkInAt, "checkInAt");
    if (parsedIn.error) {
      return NextResponse.json({ error: parsedIn.error }, { status: 400 });
    }
    const parsedOut = parseOptionalDate(body.checkOutAt, "checkOutAt");
    if (parsedOut.error) {
      return NextResponse.json({ error: parsedOut.error }, { status: 400 });
    }

    const effectiveCheckInAt =
      parsedIn.date !== undefined
        ? parsedIn.date
        : existing?.checkInAt ??
          (status === "PRESENT" || status === "LATE" ? new Date() : null);

    const effectiveCheckOutAt =
      parsedOut.date !== undefined
        ? parsedOut.date
        : existing?.checkOutAt ?? null;

    if (
      effectiveCheckInAt &&
      effectiveCheckOutAt &&
      effectiveCheckOutAt.getTime() < effectiveCheckInAt.getTime()
    ) {
      return NextResponse.json(
        { error: "Giờ ra về không được sớm hơn giờ điểm danh đến" },
        { status: 400 }
      );
    }

    const notes =
      body.notes !== undefined
        ? body.notes
          ? String(body.notes).trim()
          : null
        : existing?.notes ?? null;

    const confidenceScore =
      body.confidenceScore !== undefined && body.confidenceScore !== null
        ? Number(body.confidenceScore)
        : existing?.confidenceScore ?? null;

    const attendance = await prisma.attendance.upsert({
      where: {
        sessionId_studentId: {
          sessionId: session.id,
          studentId: student.id,
        },
      },
      create: {
        workspaceId,
        sessionId: session.id,
        studentId: student.id,
        status,
        checkInAt: effectiveCheckInAt,
        checkOutAt: effectiveCheckOutAt,
        method,
        confidenceScore,
        notes,
      },
      update: {
        status,
        checkInAt: effectiveCheckInAt,
        checkOutAt: effectiveCheckOutAt,
        method,
        confidenceScore,
        notes,
      },
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
    });

    return NextResponse.json({ attendance });
  } catch (error) {
    return handleApiError(error);
  }
}
