import { NextRequest, NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import {
  requireWorkspace,
  assertWorkspaceResource,
  WorkspaceAuthError,
  handleApiError,
} from "@/lib/workspace";
import { MINIGAME_ARCHETYPES } from "@/lib/game-engine";
import {
  validateMinigameInput,
  VALID_MINIGAME_TYPES,
} from "@/lib/m4-validators";

export async function GET(req: NextRequest) {
  try {
    const { workspaceId } = await requireWorkspace(req);
    const { searchParams } = new URL(req.url);

    const typeFilter = searchParams.get("type")?.trim().toUpperCase() || "";
    const keywordFilter = (
      searchParams.get("q") ??
      searchParams.get("search") ??
      ""
    )
      .trim()
      .toLowerCase();

    const minigamesRaw = await prisma.minigame.findMany({
      where: {
        workspaceId,
        ...(typeFilter &&
        VALID_MINIGAME_TYPES.includes(
          typeFilter as (typeof VALID_MINIGAME_TYPES)[number]
        )
          ? { type: typeFilter as (typeof VALID_MINIGAME_TYPES)[number] }
          : {}),
      },
      include: {
        _count: {
          select: { gameSessions: true },
        },
      },
      orderBy: [{ createdAt: "desc" }, { id: "asc" }],
    });

    const filtered = minigamesRaw
      .filter((mg) => {
        if (!keywordFilter) return true;
        const haystack = `${mg.title} ${mg.description ?? ""}`.toLowerCase();
        return haystack.includes(keywordFilter);
      })
      .map((mg) => ({
        ...mg,
        questionCount: Array.isArray(mg.questionIdsJson)
          ? mg.questionIdsJson.length
          : 0,
      }));

    return NextResponse.json({
      minigames: filtered,
      archetypes: MINIGAME_ARCHETYPES,
    });
  } catch (error) {
    return handleApiError(error);
  }
}

export async function POST(req: NextRequest) {
  try {
    const { workspaceId } = await requireWorkspace(req);
    const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;

    // 1. Clone / Duplicate mode
    const cloneId = String(
      body.cloneFromId ?? body.duplicateFromId ?? ""
    ).trim();
    if (cloneId) {
      const source = assertWorkspaceResource(
        await prisma.minigame.findFirst({
          where: { id: cloneId, workspaceId },
        }),
        workspaceId,
        "Không tìm thấy minigame gốc trong workspace của bạn"
      );

      const clonedTitle =
        typeof body.title === "string" && body.title.trim().length > 0
          ? body.title.trim()
          : `${source.title} (Bản sao)`;

      const cloned = await prisma.minigame.create({
        data: {
          workspaceId,
          title: clonedTitle,
          type: source.type,
          description: source.description,
          timeLimit: source.timeLimit,
          pointsPerQuestion: source.pointsPerQuestion,
          rulesJson:
            source.rulesJson !== null
              ? (source.rulesJson as Prisma.InputJsonValue)
              : Prisma.JsonNull,
          questionIdsJson:
            source.questionIdsJson !== null
              ? (source.questionIdsJson as Prisma.InputJsonValue)
              : ([] as Prisma.InputJsonValue),
          tagsJson:
            source.tagsJson !== null
              ? (source.tagsJson as Prisma.InputJsonValue)
              : ([] as Prisma.InputJsonValue),
        },
      });

      return NextResponse.json({ minigame: cloned }, { status: 201 });
    }

    // 2. Create mode
    const validated = validateMinigameInput(body);

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

    const created = await prisma.minigame.create({
      data: {
        workspaceId,
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

    return NextResponse.json({ minigame: created }, { status: 201 });
  } catch (error) {
    return handleApiError(error);
  }
}
