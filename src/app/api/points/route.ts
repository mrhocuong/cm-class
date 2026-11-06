import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import {
  requireWorkspace,
  assertWorkspaceResource,
  WorkspaceAuthError,
  handleApiError,
} from "@/lib/workspace";

const VALID_CATEGORIES = ["BONUS", "PENALTY", "ACHIEVEMENT"] as const;

export async function GET(req: NextRequest) {
  try {
    const { workspaceId } = await requireWorkspace(req);
    const { searchParams } = new URL(req.url);

    const studentId = searchParams.get("studentId")?.trim() || "";
    const classId = searchParams.get("classId")?.trim() || "";
    const sessionId = searchParams.get("sessionId")?.trim() || "";
    const category = searchParams.get("category")?.trim().toUpperCase() || "";

    const transactions = await prisma.pointTransaction.findMany({
      where: {
        workspaceId,
        ...(studentId ? { studentId } : {}),
        ...(classId ? { classId } : {}),
        ...(sessionId ? { sessionId } : {}),
        ...(category ? { category } : {}),
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
        class: {
          select: { id: true, code: true, name: true },
        },
      },
      orderBy: [{ awardedAt: "desc" }, { createdAt: "desc" }],
      take: 200,
    });

    return NextResponse.json({ transactions });
  } catch (error) {
    return handleApiError(error);
  }
}

export async function POST(req: NextRequest) {
  try {
    const { workspaceId } = await requireWorkspace(req);
    const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;

    const rawIds: unknown[] = Array.isArray(body.studentIds)
      ? body.studentIds
      : body.studentId !== undefined && body.studentId !== null
      ? [body.studentId]
      : [];

    const studentIds = Array.from(
      new Set(
        rawIds
          .map((id) => String(id ?? "").trim())
          .filter((id) => id.length > 0)
      )
    );

    if (studentIds.length === 0) {
      throw new WorkspaceAuthError(400, "Vui lòng chọn ít nhất một học sinh");
    }

    const points = Number(body.points);
    if (!Number.isFinite(points) || points === 0) {
      throw new WorkspaceAuthError(400, "Điểm thưởng/phạt phải khác 0");
    }

    const reason = String(body.reason ?? "").trim();
    if (!reason) {
      throw new WorkspaceAuthError(
        400,
        "Vui lòng nhập lý do cộng hoặc trừ điểm"
      );
    }

    const rawCategory = String(body.category ?? "").trim().toUpperCase();
    const category = VALID_CATEGORIES.includes(
      rawCategory as (typeof VALID_CATEGORIES)[number]
    )
      ? rawCategory
      : points < 0
      ? "PENALTY"
      : "BONUS";

    const foundStudents = await prisma.student.findMany({
      where: {
        id: { in: studentIds },
        workspaceId,
      },
      select: { id: true },
    });

    if (foundStudents.length !== studentIds.length) {
      throw new WorkspaceAuthError(
        404,
        "Không tìm thấy học sinh trong workspace của bạn"
      );
    }

    const classId =
      body.classId !== undefined &&
      body.classId !== null &&
      String(body.classId).trim() !== ""
        ? String(body.classId).trim()
        : null;

    if (classId) {
      assertWorkspaceResource(
        await prisma.class.findFirst({
          where: { id: classId, workspaceId },
        }),
        workspaceId,
        "Không tìm thấy lớp học trong workspace của bạn"
      );
    }

    const sessionId =
      body.sessionId !== undefined &&
      body.sessionId !== null &&
      String(body.sessionId).trim() !== ""
        ? String(body.sessionId).trim()
        : null;

    if (sessionId) {
      assertWorkspaceResource(
        await prisma.session.findFirst({
          where: { id: sessionId, workspaceId },
        }),
        workspaceId,
        "Không tìm thấy buổi học trong workspace của bạn"
      );
    }

    const awardedAt =
      body.awardedAt && String(body.awardedAt).trim()
        ? new Date(String(body.awardedAt))
        : new Date();

    const transactions = await prisma.$transaction(
      studentIds.map((studentId) =>
        prisma.pointTransaction.create({
          data: {
            workspaceId,
            studentId,
            classId,
            sessionId,
            points,
            reason,
            category,
            awardedAt,
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
            class: {
              select: { id: true, code: true, name: true },
            },
          },
        })
      )
    );

    return NextResponse.json(
      {
        transactions,
        transaction: transactions[0] ?? null,
        createdCount: transactions.length,
      },
      { status: 201 }
    );
  } catch (error) {
    return handleApiError(error);
  }
}
