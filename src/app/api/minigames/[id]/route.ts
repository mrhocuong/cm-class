import { NextRequest, NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import {
  requireWorkspace,
  assertWorkspaceResource,
  WorkspaceAuthError,
  handleApiError,
} from "@/lib/workspace";
import { validateMinigameInput } from "@/lib/m4-validators";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { workspaceId } = await requireWorkspace(req);
    const { id } = await params;

    const minigame = assertWorkspaceResource(
      await prisma.minigame.findFirst({
        where: { id, workspaceId },
        include: {
          gameSessions: {
            orderBy: { startedAt: "desc" },
            take: 10,
          },
        },
      }),
      workspaceId,
      "Không tìm thấy minigame trong workspace của bạn"
    );

    const qIds = Array.isArray(minigame.questionIdsJson)
      ? minigame.questionIdsJson.map((item) => String(item))
      : [];

    const questions =
      qIds.length > 0
        ? await prisma.exerciseQuestion.findMany({
            where: { id: { in: qIds }, workspaceId },
          })
        : [];

    return NextResponse.json({ minigame, questions });
  } catch (error) {
    return handleApiError(error);
  }
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { workspaceId } = await requireWorkspace(req);
    const { id } = await params;
    const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;

    const existing = assertWorkspaceResource(
      await prisma.minigame.findFirst({
        where: { id, workspaceId },
      }),
      workspaceId,
      "Không tìm thấy minigame trong workspace của bạn"
    );

    const merged: Record<string, unknown> = {
      title: body.title !== undefined ? body.title : existing.title,
      type: body.type !== undefined ? body.type : existing.type,
      description:
        body.description !== undefined
          ? body.description
          : existing.description,
      timeLimit:
        body.timeLimit !== undefined ? body.timeLimit : existing.timeLimit,
      pointsPerQuestion:
        body.pointsPerQuestion !== undefined
          ? body.pointsPerQuestion
          : existing.pointsPerQuestion,
      rulesJson:
        body.rulesJson !== undefined ? body.rulesJson : existing.rulesJson,
      questionIdsJson:
        body.questionIdsJson !== undefined
          ? body.questionIdsJson
          : body.questionIds !== undefined
          ? body.questionIds
          : existing.questionIdsJson,
      tagsJson:
        body.tagsJson !== undefined
          ? body.tagsJson
          : body.tags !== undefined
          ? body.tags
          : existing.tagsJson,
    };

    const validated = validateMinigameInput(merged);

    if (validated.questionIds.length > 0) {
      const foundQuestions = await prisma.exerciseQuestion.findMany({
        where: {
          id: { in: validated.questionIds },
          workspaceId,
        },
        select: { id: true },
      });
      if (foundQuestions.length !== validated.questionIds.length) {
        throw new WorkspaceAuthError(
          404,
          "Một hoặc nhiều câu hỏi liên kết không tồn tại trong workspace của bạn"
        );
      }
    }

    const updated = await prisma.minigame.update({
      where: { id: existing.id },
      data: {
        title: validated.title,
        type: validated.type,
        description: validated.description,
        timeLimit: validated.timeLimit,
        pointsPerQuestion: validated.pointsPerQuestion,
        rulesJson: validated.rulesJson as Prisma.InputJsonValue,
        questionIdsJson: validated.questionIds as Prisma.InputJsonValue,
        tagsJson: validated.tagsJson as Prisma.InputJsonValue,
      },
    });

    return NextResponse.json({ minigame: updated });
  } catch (error) {
    return handleApiError(error);
  }
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { workspaceId } = await requireWorkspace(req);
    const { id } = await params;

    const existing = assertWorkspaceResource(
      await prisma.minigame.findFirst({
        where: { id, workspaceId },
      }),
      workspaceId,
      "Không tìm thấy minigame trong workspace của bạn"
    );

    await prisma.minigame.delete({
      where: { id: existing.id },
    });

    return NextResponse.json({ success: true, deletedId: existing.id });
  } catch (error) {
    return handleApiError(error);
  }
}
