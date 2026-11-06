import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireWorkspace, handleApiError } from "@/lib/workspace";

export async function GET(
  req: NextRequest,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  context: { params: any }
) {
  try {
    const { workspaceId } = await requireWorkspace(req);
    const { id } = await Promise.resolve<{ id: string }>(context.params);

    const homework = await prisma.homework.findFirst({
      where: { id, workspaceId },
      include: {
        class: {
          select: {
            id: true,
            code: true,
            name: true,
            subject: true,
            color: true,
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

    if (!homework) {
      return NextResponse.json(
        { error: "Không tìm thấy bài tập về nhà trong workspace của bạn" },
        { status: 404 }
      );
    }

    const [enrollments, existingSubmissions] = await Promise.all([
      prisma.enrollment.findMany({
        where: {
          workspaceId,
          classId: homework.classId,
          status: "ACTIVE",
        },
        include: {
          student: {
            select: {
              id: true,
              studentCode: true,
              fullName: true,
              avatarUrl: true,
              phone: true,
            },
          },
        },
        orderBy: {
          student: { fullName: "asc" },
        },
      }),
      prisma.homeworkSubmission.findMany({
        where: {
          workspaceId,
          homeworkId: homework.id,
        },
        include: {
          student: {
            select: {
              id: true,
              studentCode: true,
              fullName: true,
              avatarUrl: true,
              phone: true,
            },
          },
        },
      }),
    ]);

    const subByStudentId = new Map(
      existingSubmissions.map((sub) => [sub.studentId, sub])
    );

    const seenStudentIds = new Set<string>();
    const submissions: Array<Record<string, unknown>> = [];

    for (const enr of enrollments) {
      const stu = enr.student;
      seenStudentIds.add(stu.id);
      const sub = subByStudentId.get(stu.id);
      if (sub) {
        submissions.push(sub);
      } else {
        submissions.push({
          id: null,
          workspaceId,
          homeworkId: homework.id,
          studentId: stu.id,
          student: stu,
          status: "MISSING",
          score: null,
          feedback: null,
          submissionNote: null,
          attachmentUrl: null,
          submittedAt: null,
          gradedAt: null,
        });
      }
    }

    for (const sub of existingSubmissions) {
      if (seenStudentIds.has(sub.studentId)) continue;
      submissions.push(sub);
    }

    const questionIds = Array.isArray(homework.questionIdsJson)
      ? (homework.questionIdsJson as unknown[])
          .map((qId) => String(qId || "").trim())
          .filter(Boolean)
      : [];

    const questions =
      questionIds.length > 0
        ? await prisma.exerciseQuestion.findMany({
            where: {
              workspaceId,
              id: { in: questionIds },
            },
          })
        : [];

    return NextResponse.json({
      homework,
      submissions,
      questions,
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

    const existing = await prisma.homework.findFirst({
      where: { id, workspaceId },
    });
    if (!existing) {
      return NextResponse.json(
        { error: "Không tìm thấy bài tập về nhà trong workspace của bạn" },
        { status: 404 }
      );
    }

    const body = await req.json().catch(() => null);
    if (!body || typeof body !== "object") {
      return NextResponse.json(
        { error: "Dữ liệu cập nhật bài tập không hợp lệ" },
        { status: 400 }
      );
    }

    let title = existing.title;
    if (body.title !== undefined) {
      title = String(body.title || "").trim();
      if (!title) {
        return NextResponse.json(
          { error: "Tiêu đề bài tập không được để trống" },
          { status: 400 }
        );
      }
    }

    let dueDate = existing.dueDate;
    if (body.dueDate !== undefined) {
      dueDate = new Date(String(body.dueDate));
      if (Number.isNaN(dueDate.getTime())) {
        return NextResponse.json(
          { error: "Hạn nộp bài (dueDate) không hợp lệ" },
          { status: 400 }
        );
      }
    }

    let maxScore = existing.maxScore;
    if (body.maxScore !== undefined) {
      maxScore = Number(body.maxScore);
      if (!Number.isFinite(maxScore) || maxScore <= 0) {
        return NextResponse.json(
          { error: "Điểm tối đa (maxScore) phải lớn hơn 0" },
          { status: 400 }
        );
      }
    }

    let sessionId = existing.sessionId;
    if (body.sessionId !== undefined) {
      if (body.sessionId === null || body.sessionId === "") {
        sessionId = null;
      } else {
        const sess = await prisma.session.findFirst({
          where: { id: String(body.sessionId).trim(), workspaceId },
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
    }

    let nextQuestionIdsJson: string[] | undefined;
    if (body.questionIdsJson !== undefined) {
      nextQuestionIdsJson = Array.isArray(body.questionIdsJson)
        ? Array.from(
            new Set<string>(
              body.questionIdsJson
                .map((qId: unknown) => String(qId ?? "").trim())
                .filter(Boolean)
            )
          )
        : [];
      if (nextQuestionIdsJson.length > 0) {
        const validQuestions = await prisma.exerciseQuestion.findMany({
          where: { workspaceId, id: { in: nextQuestionIdsJson } },
          select: { id: true },
        });
        if (validQuestions.length !== nextQuestionIdsJson.length) {
          return NextResponse.json(
            {
              error:
                "Một hoặc nhiều câu hỏi liên kết không tồn tại trong workspace của bạn",
            },
            { status: 404 }
          );
        }
      }
    }

    const homework = await prisma.homework.update({
      where: { id: existing.id },
      data: {
        title,
        dueDate,
        maxScore,
        sessionId,
        ...(body.description !== undefined
          ? {
              description: body.description
                ? String(body.description).trim()
                : null,
            }
          : {}),
        ...(body.attachmentsJson !== undefined
          ? { attachmentsJson: body.attachmentsJson }
          : {}),
        ...(nextQuestionIdsJson !== undefined
          ? { questionIdsJson: nextQuestionIdsJson }
          : {}),
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

    return NextResponse.json({ homework });
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

    const existing = await prisma.homework.findFirst({
      where: { id, workspaceId },
      select: { id: true },
    });
    if (!existing) {
      return NextResponse.json(
        { error: "Không tìm thấy bài tập về nhà trong workspace của bạn" },
        { status: 404 }
      );
    }

    await prisma.homework.delete({
      where: { id: existing.id },
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    return handleApiError(error);
  }
}
