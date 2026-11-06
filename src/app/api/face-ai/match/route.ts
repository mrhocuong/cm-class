import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import {
  WorkspaceAuthError,
  handleApiError,
  requireWorkspace,
} from "@/lib/workspace";
import {
  DEFAULT_SIMILARITY_THRESHOLD,
  type EnrolledFaceCandidate,
  matchFaceDescriptor,
  validateFaceDescriptor,
} from "@/lib/face-ai";

export async function POST(req: NextRequest) {
  try {
    const { workspaceId } = await requireWorkspace(req);

    let body: Record<string, unknown>;
    try {
      body = await req.json();
    } catch {
      return NextResponse.json(
        { error: "Dữ liệu JSON không hợp lệ" },
        { status: 400 }
      );
    }

    const sessionId =
      typeof body.sessionId === "string" ? body.sessionId.trim() : "";
    if (!sessionId) {
      return NextResponse.json(
        { error: "Thiếu mã buổi học (sessionId)" },
        { status: 400 }
      );
    }

    const session = await prisma.session.findFirst({
      where: { id: sessionId, workspaceId },
      include: { class: true },
    });
    if (!session) {
      throw new WorkspaceAuthError(
        404,
        "Không tìm thấy buổi học trong workspace của bạn"
      );
    }

    if (session.status === "CANCELLED") {
      return NextResponse.json(
        { error: "Không thể điểm danh FaceAI cho buổi học đã huỷ" },
        { status: 400 }
      );
    }

    const rawMode = body.scanMode ?? body.mode;
    const scanMode: "CHECK_IN" | "CHECK_OUT" =
      rawMode === "CHECK_OUT" ? "CHECK_OUT" : "CHECK_IN";

    const detections = Array.isArray(body.detections) ? body.detections : [];
    const firstDetection =
      detections.length > 0 &&
      typeof detections[0] === "object" &&
      detections[0] !== null
        ? (detections[0] as Record<string, unknown>).descriptor
        : undefined;
    const rawDescriptor = body.descriptor ?? firstDetection;

    const hasStrictNumbers =
      Array.isArray(rawDescriptor) &&
      rawDescriptor.length === 128 &&
      rawDescriptor.every((x) => typeof x === "number" && Number.isFinite(x));
    const validation = hasStrictNumbers
      ? validateFaceDescriptor(rawDescriptor)
      : {
          valid: false,
          error:
            "Vector nhận diện khuôn mặt không hợp lệ (cần đúng 128 số thực khác 0)",
        };
    if (!validation.valid || !validation.normalized) {
      return NextResponse.json(
        {
          error:
            validation.error ||
            "Vector nhận diện khuôn mặt không hợp lệ (cần đúng 128 số thực khác 0)",
        },
        { status: 400 }
      );
    }

    const enrollments = await prisma.enrollment.findMany({
      where: {
        workspaceId,
        classId: session.classId,
        status: "ACTIVE",
      },
      include: {
        student: {
          include: {
            faceDescriptors: true,
          },
        },
      },
    });

    const candidates: EnrolledFaceCandidate[] = [];
    const studentMap = new Map<
      string,
      {
        id: string;
        studentCode: string;
        fullName: string;
        avatarUrl: string | null;
      }
    >();

    for (const enr of enrollments) {
      studentMap.set(enr.student.id, {
        id: enr.student.id,
        studentCode: enr.student.studentCode,
        fullName: enr.student.fullName,
        avatarUrl: enr.student.avatarUrl,
      });

      for (const fd of enr.student.faceDescriptors) {
        if (Array.isArray(fd.descriptor)) {
          candidates.push({
            descriptorId: fd.id,
            studentId: enr.student.id,
            studentCode: enr.student.studentCode,
            studentName: enr.student.fullName,
            descriptor: fd.descriptor as number[],
          });
        }
      }
    }

    if (candidates.length === 0) {
      return NextResponse.json({
        matched: false,
        reason: "NO_ENROLLED_FACES",
        message: "Chưa có học sinh nào trong lớp đăng ký dữ liệu khuôn mặt",
        bestSimilarity: 0,
        bestDistance: null,
        confidenceScore: 0,
      });
    }

    const rawThreshold =
      typeof body.threshold === "number"
        ? body.threshold
        : typeof body.similarityThreshold === "number"
        ? body.similarityThreshold
        : DEFAULT_SIMILARITY_THRESHOLD;
    const simThreshold = Number.isFinite(rawThreshold)
      ? Math.max(0.1, Math.min(0.999, Number(rawThreshold)))
      : DEFAULT_SIMILARITY_THRESHOLD;
    const distThreshold = Math.sqrt(Math.max(0, 2 * (1 - simThreshold)));

    const matchResult = matchFaceDescriptor(validation.normalized, candidates, {
      similarityThreshold: simThreshold,
      distanceThreshold: distThreshold,
    });

    if (!matchResult.matched || !matchResult.bestCandidate) {
      return NextResponse.json({
        matched: false,
        reason: matchResult.reason ?? "BELOW_THRESHOLD",
        message: "Không tìm thấy học sinh khớp vượt ngưỡng nhận diện",
        bestSimilarity: matchResult.similarity,
        bestDistance: matchResult.distance,
        similarity: matchResult.similarity,
        distance: matchResult.distance,
        confidenceScore: matchResult.confidenceScore,
      });
    }

    const studentId = matchResult.bestCandidate.studentId;
    const studentInfo = studentMap.get(studentId) ?? {
      id: studentId,
      studentCode: matchResult.bestCandidate.studentCode ?? "",
      fullName: matchResult.bestCandidate.studentName ?? "",
      avatarUrl: null,
    };

    const existing = await prisma.attendance.findUnique({
      where: {
        sessionId_studentId: {
          sessionId: session.id,
          studentId,
        },
      },
    });

    const now = new Date();

    if (scanMode === "CHECK_IN") {
      if (existing && existing.checkInAt) {
        const attendance = await prisma.attendance.update({
          where: { id: existing.id },
          data: {
            method: "FACE_AI",
            confidenceScore: Math.max(
              existing.confidenceScore ?? 0,
              matchResult.confidenceScore
            ),
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

        return NextResponse.json({
          matched: true,
          scanMode: "CHECK_IN",
          alreadyCheckedIn: true,
          alreadyRecorded: true,
          cooldownProtected: true,
          student: studentInfo,
          confidenceScore: matchResult.confidenceScore,
          similarity: matchResult.similarity,
          distance: matchResult.distance,
          bestSimilarity: matchResult.similarity,
          bestDistance: matchResult.distance,
          attendance,
        });
      }

      const attendance = await prisma.attendance.upsert({
        where: {
          sessionId_studentId: {
            sessionId: session.id,
            studentId,
          },
        },
        update: {
          status: existing?.status === "LATE" ? "LATE" : "PRESENT",
          checkInAt: now,
          method: "FACE_AI",
          confidenceScore: matchResult.confidenceScore,
        },
        create: {
          workspaceId,
          sessionId: session.id,
          studentId,
          status: "PRESENT",
          checkInAt: now,
          method: "FACE_AI",
          confidenceScore: matchResult.confidenceScore,
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

      return NextResponse.json({
        matched: true,
        scanMode: "CHECK_IN",
        alreadyCheckedIn: false,
        alreadyRecorded: false,
        cooldownProtected: false,
        student: studentInfo,
        confidenceScore: matchResult.confidenceScore,
        similarity: matchResult.similarity,
        distance: matchResult.distance,
        bestSimilarity: matchResult.similarity,
        bestDistance: matchResult.distance,
        attendance,
      });
    }

    const preservedCheckInAt = existing?.checkInAt ?? now;
    const effectiveCheckOutAt =
      now.getTime() >= preservedCheckInAt.getTime()
        ? now
        : new Date(preservedCheckInAt.getTime() + 1000);

    const attendance = await prisma.attendance.upsert({
      where: {
        sessionId_studentId: {
          sessionId: session.id,
          studentId,
        },
      },
      update: {
        status: existing?.status === "LATE" ? "LATE" : "PRESENT",
        ...(existing?.checkInAt ? {} : { checkInAt: preservedCheckInAt }),
        checkOutAt: effectiveCheckOutAt,
        method: "FACE_AI",
        confidenceScore: matchResult.confidenceScore,
      },
      create: {
        workspaceId,
        sessionId: session.id,
        studentId,
        status: "PRESENT",
        checkInAt: preservedCheckInAt,
        checkOutAt: effectiveCheckOutAt,
        method: "FACE_AI",
        confidenceScore: matchResult.confidenceScore,
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

    return NextResponse.json({
      matched: true,
      scanMode: "CHECK_OUT",
      student: studentInfo,
      confidenceScore: matchResult.confidenceScore,
      similarity: matchResult.similarity,
      distance: matchResult.distance,
      bestSimilarity: matchResult.similarity,
      bestDistance: matchResult.distance,
      attendance,
    });
  } catch (error) {
    return handleApiError(error);
  }
}
