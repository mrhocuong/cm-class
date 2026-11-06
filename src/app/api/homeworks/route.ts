import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireWorkspace, handleApiError } from "@/lib/workspace";

export async function GET(req: NextRequest) {
  try {
    const { workspaceId } = await requireWorkspace(req);
    const { searchParams } = new URL(req.url);

    const classId = searchParams.get("classId")?.trim() || undefined;
    const sessionId = searchParams.get("sessionId")?.trim() || undefined;

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

    const rawHomeworks = await prisma.homework.findMany({
      where: {
        workspaceId,
        ...(classId ? { classId } : {}),
        ...(sessionId ? { sessionId } : {}),
      },
      include: {
        class: {
          select: {
            id: true,
            code: true,
            name: true,
            subject: true,
            color: true,
            _count: {
              select: {
                enrollments: {
                  where: { status: "ACTIVE" },
                },
              },
            },
          },
        },
        session: {
          select: {
            id: true,
            sessionDate: true,
            startTime: true,
            endTime: true,
            topic: true,
          },
        },
        submissions: {
          select: {
            id: true,
            studentId: true,
            status: true,
            score: true,
          },
        },
      },
      orderBy: [{ dueDate: "desc" }, { createdAt: "desc" }],
    });

    const homeworks = rawHomeworks.map((hw) => {
      const totalEnrolled = hw.class._count.enrollments;
      const submittedCount = hw.submissions.filter(
        (s) =>
          s.status === "SUBMITTED" ||
          s.status === "LATE" ||
          s.status === "GRADED"
      ).length;
      const gradedCount = hw.submissions.filter(
        (s) => s.status === "GRADED"
      ).length;
      const lateCount = hw.submissions.filter(
        (s) => s.status === "LATE"
      ).length;

      return {
        ...hw,
        summary: {
          totalEnrolled,
          submittedCount,
          gradedCount,
          lateCount,
        },
      };
    });

    return NextResponse.json({ homeworks });
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
        { error: "Dữ liệu bài tập về nhà không hợp lệ" },
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
      select: { id: true },
    });
    if (!cls) {
      return NextResponse.json(
        { error: "Không tìm thấy lớp học trong workspace của bạn" },
        { status: 404 }
      );
    }

    let sessionId: string | null = null;
    if (
      body.sessionId !== undefined &&
      body.sessionId !== null &&
      body.sessionId !== ""
    ) {
      const candidateSessionId = String(body.sessionId).trim();
      const sess = await prisma.session.findFirst({
        where: { id: candidateSessionId, workspaceId },
        select: { id: true },
      });
      if (!sess) {
        return NextResponse.json(
          { error: "Không tìm thấy buổi học trong workspace của bạn" },
          { status: 404 }
        );
      }
      sessionId = sess.id;
    }

    const title = String(body.title || "").trim();
    if (!title) {
      return NextResponse.json(
        { error: "Tiêu đề bài tập không được để trống" },
        { status: 400 }
      );
    }

    if (!body.dueDate) {
      return NextResponse.json(
        { error: "Vui lòng chọn hạn nộp bài (dueDate)" },
        { status: 400 }
      );
    }
    const dueDate = new Date(String(body.dueDate));
    if (Number.isNaN(dueDate.getTime())) {
      return NextResponse.json(
        { error: "Hạn nộp bài (dueDate) không hợp lệ" },
        { status: 400 }
      );
    }

    const maxScore =
      body.maxScore !== undefined && body.maxScore !== null
        ? Number(body.maxScore)
        : 10;
    if (!Number.isFinite(maxScore) || maxScore <= 0) {
      return NextResponse.json(
        { error: "Điểm tối đa (maxScore) phải lớn hơn 0" },
        { status: 400 }
      );
    }

    const description =
      body.description !== undefined && body.description !== null
        ? String(body.description).trim() || null
        : null;

    const attachmentsJson =
      body.attachmentsJson !== undefined ? body.attachmentsJson : [];
    const questionIdsJson: string[] = Array.isArray(body.questionIdsJson)
      ? Array.from(
          new Set<string>(
            body.questionIdsJson
              .map((id: unknown) => String(id ?? "").trim())
              .filter(Boolean)
          )
        )
      : [];

    if (questionIdsJson.length > 0) {
      const validQuestions = await prisma.exerciseQuestion.findMany({
        where: { workspaceId, id: { in: questionIdsJson } },
        select: { id: true },
      });
      if (validQuestions.length !== questionIdsJson.length) {
        return NextResponse.json(
          {
            error:
              "Một hoặc nhiều câu hỏi liên kết không tồn tại trong workspace của bạn",
          },
          { status: 404 }
        );
      }
    }

    const homework = await prisma.homework.create({
      data: {
        workspaceId,
        classId: cls.id,
        sessionId,
        title,
        description,
        dueDate,
        maxScore,
        attachmentsJson,
        questionIdsJson,
      },
      include: {
        class: {
          select: {
            id: true,
            code: true,
            name: true,
            subject: true,
          },
        },
        session: {
          select: {
            id: true,
            sessionDate: true,
            startTime: true,
            endTime: true,
            topic: true,
          },
        },
      },
    });

    return NextResponse.json({ homework }, { status: 201 });
  } catch (error) {
    return handleApiError(error);
  }
}
