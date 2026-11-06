import { NextRequest, NextResponse } from "next/server";
import type { HomeworkSubmissionStatus } from "@prisma/client";
import { prisma } from "@/lib/db";
import { requireWorkspace, handleApiError } from "@/lib/workspace";

const VALID_SUBMISSION_STATUSES: HomeworkSubmissionStatus[] = [
  "MISSING",
  "SUBMITTED",
  "LATE",
  "GRADED",
];

export async function POST(
  req: NextRequest,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  context: { params: any }
) {
  try {
    const { workspaceId } = await requireWorkspace(req);
    const { id: homeworkId } = await Promise.resolve<{ id: string }>(context.params);

    const homework = await prisma.homework.findFirst({
      where: { id: homeworkId, workspaceId },
    });
    if (!homework) {
      return NextResponse.json(
        { error: "Không tìm thấy bài tập về nhà trong workspace của bạn" },
        { status: 404 }
      );
    }

    const body = await req.json().catch(() => null);
    if (!body || typeof body !== "object") {
      return NextResponse.json(
        { error: "Dữ liệu nộp/chấm bài không hợp lệ" },
        { status: 400 }
      );
    }

    const rawList: Array<Record<string, unknown>> = Array.isArray(
      body.submissions
    )
      ? body.submissions
      : body.studentId
      ? [body]
      : [];

    if (rawList.length === 0) {
      return NextResponse.json(
        { error: "Danh sách bài nộp trống hoặc thiếu studentId" },
        { status: 400 }
      );
    }

    const studentIds = Array.from(
      new Set(rawList.map((item) => String(item?.studentId || "").trim()))
    ).filter(Boolean);

    const validStudents = await prisma.student.findMany({
      where: { workspaceId, id: { in: studentIds } },
      select: { id: true },
    });
    const validStudentIdSet = new Set(validStudents.map((s) => s.id));

    const existingSubs = await prisma.homeworkSubmission.findMany({
      where: { workspaceId, homeworkId: homework.id },
    });
    const existingByStudent = new Map(
      existingSubs.map((s) => [s.studentId, s])
    );

    const preparedOps: Array<{
      studentId: string;
      status: HomeworkSubmissionStatus;
      score: number | null;
      feedback: string | null;
      submissionNote: string | null;
      attachmentUrl: string | null;
      submittedAt: Date | null;
      gradedAt: Date | null;
    }> = [];

    for (const item of rawList) {
      const studentId = String(item?.studentId || "").trim();
      if (!studentId || !validStudentIdSet.has(studentId)) {
        return NextResponse.json(
          { error: "Không tìm thấy học sinh trong workspace của bạn" },
          { status: 404 }
        );
      }

      const existing = existingByStudent.get(studentId);

      // Parse score if provided
      let score: number | null = existing?.score ?? null;
      const hasScoreInput =
        item.score !== undefined && item.score !== null && item.score !== "";
      if (item.score === null || item.score === "") {
        score = null;
      } else if (hasScoreInput) {
        const numScore = Number(item.score);
        if (
          !Number.isFinite(numScore) ||
          numScore < 0 ||
          numScore > homework.maxScore
        ) {
          return NextResponse.json(
            {
              error: `Điểm số phải nằm trong khoảng từ 0 đến điểm tối đa (${homework.maxScore})`,
            },
            { status: 400 }
          );
        }
        score = numScore;
      }

      // Parse submittedAt if provided
      let submittedAt: Date | null = existing?.submittedAt ?? null;
      if (item.submittedAt !== undefined) {
        if (item.submittedAt === null || item.submittedAt === "") {
          submittedAt = null;
        } else {
          const parsedSub = new Date(String(item.submittedAt));
          if (Number.isNaN(parsedSub.getTime())) {
            return NextResponse.json(
              { error: "Thời gian nộp bài (submittedAt) không hợp lệ" },
              { status: 400 }
            );
          }
          submittedAt = parsedSub;
        }
      }

      // Resolve status
      let requestedStatus: HomeworkSubmissionStatus | undefined;
      if (
        item.status !== undefined &&
        item.status !== null &&
        item.status !== ""
      ) {
        const candidate = String(item.status).trim() as HomeworkSubmissionStatus;
        if (!VALID_SUBMISSION_STATUSES.includes(candidate)) {
          return NextResponse.json(
            { error: "Trạng thái nộp bài không hợp lệ" },
            { status: 400 }
          );
        }
        requestedStatus = candidate;
      }

      let finalStatus: HomeworkSubmissionStatus =
        requestedStatus ??
        (hasScoreInput ? "GRADED" : existing?.status ?? "SUBMITTED");

      // Auto-detect LATE when submittedAt > homework.dueDate and status is SUBMITTED
      if (
        submittedAt &&
        submittedAt.getTime() > homework.dueDate.getTime() &&
        finalStatus === "SUBMITTED"
      ) {
        finalStatus = "LATE";
      }

      if (
        (finalStatus === "SUBMITTED" || finalStatus === "LATE") &&
        !submittedAt
      ) {
        submittedAt = new Date();
        if (
          submittedAt.getTime() > homework.dueDate.getTime() &&
          finalStatus === "SUBMITTED"
        ) {
          finalStatus = "LATE";
        }
      }

      const gradedAt =
        finalStatus === "GRADED"
          ? new Date()
          : existing?.gradedAt ?? null;

      const feedback =
        item.feedback !== undefined
          ? item.feedback
            ? String(item.feedback).trim()
            : null
          : existing?.feedback ?? null;

      const submissionNote =
        item.submissionNote !== undefined
          ? item.submissionNote
            ? String(item.submissionNote).trim()
            : null
          : existing?.submissionNote ?? null;

      const attachmentUrl =
        item.attachmentUrl !== undefined
          ? item.attachmentUrl
            ? String(item.attachmentUrl).trim()
            : null
          : existing?.attachmentUrl ?? null;

      preparedOps.push({
        studentId,
        status: finalStatus,
        score,
        feedback,
        submissionNote,
        attachmentUrl,
        submittedAt,
        gradedAt,
      });
    }

    const submissions = await prisma.$transaction(
      preparedOps.map((op) =>
        prisma.homeworkSubmission.upsert({
          where: {
            homeworkId_studentId: {
              homeworkId: homework.id,
              studentId: op.studentId,
            },
          },
          create: {
            workspaceId,
            homeworkId: homework.id,
            studentId: op.studentId,
            status: op.status,
            score: op.score,
            feedback: op.feedback,
            submissionNote: op.submissionNote,
            attachmentUrl: op.attachmentUrl,
            submittedAt: op.submittedAt,
            gradedAt: op.gradedAt,
          },
          update: {
            status: op.status,
            score: op.score,
            feedback: op.feedback,
            submissionNote: op.submissionNote,
            attachmentUrl: op.attachmentUrl,
            submittedAt: op.submittedAt,
            gradedAt: op.gradedAt,
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
        })
      )
    );

    return NextResponse.json({
      submissions,
      submission: submissions[0] ?? null,
    });
  } catch (error) {
    return handleApiError(error);
  }
}
