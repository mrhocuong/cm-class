import { NextRequest, NextResponse } from "next/server";
import { Prisma, type GamePlayMode, type GameSessionStatus } from "@prisma/client";
import { prisma } from "@/lib/db";
import {
  requireWorkspace,
  assertWorkspaceResource,
  WorkspaceAuthError,
  handleApiError,
} from "@/lib/workspace";

const VALID_MODES: readonly GamePlayMode[] = ["INDIVIDUAL", "TEAM"] as const;
const VALID_STATUSES: readonly GameSessionStatus[] = [
  "LOBBY",
  "IN_PROGRESS",
  "COMPLETED",
  "CANCELLED",
] as const;

export async function GET(req: NextRequest) {
  try {
    const { workspaceId } = await requireWorkspace(req);
    const { searchParams } = new URL(req.url);

    const classId = searchParams.get("classId")?.trim() || "";
    const sessionId = searchParams.get("sessionId")?.trim() || "";
    const minigameId = searchParams.get("minigameId")?.trim() || "";
    const statusParam = searchParams.get("status")?.trim().toUpperCase() || "";
    const modeParam = searchParams.get("mode")?.trim().toUpperCase() || "";

    const gameSessions = await prisma.gameSession.findMany({
      where: {
        workspaceId,
        ...(classId ? { classId } : {}),
        ...(sessionId ? { sessionId } : {}),
        ...(minigameId ? { minigameId } : {}),
        ...(statusParam &&
        VALID_STATUSES.includes(statusParam as GameSessionStatus)
          ? { status: statusParam as GameSessionStatus }
          : {}),
        ...(modeParam && VALID_MODES.includes(modeParam as GamePlayMode)
          ? { mode: modeParam as GamePlayMode }
          : {}),
      },
      include: {
        class: {
          select: { id: true, code: true, name: true, subject: true },
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
        minigame: {
          select: {
            id: true,
            title: true,
            type: true,
            timeLimit: true,
            pointsPerQuestion: true,
            rulesJson: true,
          },
        },
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
      orderBy: [{ startedAt: "desc" }, { createdAt: "desc" }],
    });

    return NextResponse.json({ gameSessions });
  } catch (error) {
    return handleApiError(error);
  }
}

export async function POST(req: NextRequest) {
  try {
    const { workspaceId } = await requireWorkspace(req);
    const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;

    const classId = String(body.classId ?? "").trim();
    const minigameId = String(body.minigameId ?? "").trim();
    const sessionId =
      body.sessionId !== undefined &&
      body.sessionId !== null &&
      String(body.sessionId).trim() !== ""
        ? String(body.sessionId).trim()
        : null;

    if (!classId || !minigameId) {
      throw new WorkspaceAuthError(
        400,
        "Vui lòng chọn lớp học và minigame để bắt đầu phiên chơi"
      );
    }

    const cls = assertWorkspaceResource(
      await prisma.class.findFirst({
        where: { id: classId, workspaceId },
      }),
      workspaceId,
      "Không tìm thấy lớp học trong workspace của bạn"
    );

    const minigame = assertWorkspaceResource(
      await prisma.minigame.findFirst({
        where: { id: minigameId, workspaceId },
      }),
      workspaceId,
      "Không tìm thấy minigame trong workspace của bạn"
    );

    if (sessionId) {
      assertWorkspaceResource(
        await prisma.session.findFirst({
          where: { id: sessionId, workspaceId },
        }),
        workspaceId,
        "Không tìm thấy buổi học trong workspace của bạn"
      );
    }

    const rawMode =
      body.mode !== undefined &&
      body.mode !== null &&
      String(body.mode).trim() !== ""
        ? String(body.mode).trim().toUpperCase()
        : "INDIVIDUAL";

    if (!VALID_MODES.includes(rawMode as GamePlayMode)) {
      throw new WorkspaceAuthError(
        400,
        "Chế độ chơi không hợp lệ (chỉ hỗ trợ INDIVIDUAL hoặc TEAM)"
      );
    }
    const mode = rawMode as GamePlayMode;

    // Validate teamsConfigJson if provided
    const rawTeamsConfig = body.teamsConfigJson ?? body.teams;
    let teamsConfigJson: Array<{ name: string; studentIds: string[] }> | null =
      null;

    if (Array.isArray(rawTeamsConfig)) {
      teamsConfigJson = rawTeamsConfig.map((t, idx) => {
        const obj = (t && typeof t === "object" ? t : {}) as Record<
          string,
          unknown
        >;
        const name =
          String(obj.name ?? obj.teamName ?? `Đội ${idx + 1}`).trim() ||
          `Đội ${idx + 1}`;
        const studentIds = Array.isArray(obj.studentIds)
          ? Array.from(
              new Set(
                obj.studentIds
                  .map((s) => String(s ?? "").trim())
                  .filter(Boolean)
              )
            )
          : [];
        return { name, studentIds };
      });

      const allTeamStudentIds = Array.from(
        new Set(teamsConfigJson.flatMap((t) => t.studentIds))
      );
      if (allTeamStudentIds.length > 0) {
        const foundStudents = await prisma.student.findMany({
          where: { id: { in: allTeamStudentIds }, workspaceId },
          select: { id: true },
        });
        if (foundStudents.length !== allTeamStudentIds.length) {
          throw new WorkspaceAuthError(
            404,
            "Có học sinh trong đội không thuộc workspace của bạn"
          );
        }
      }
    }

    // Resolve questions for snapshot
    const requestedQuestionIds: string[] = Array.isArray(body.questionIds)
      ? body.questionIds.map((id) => String(id).trim()).filter(Boolean)
      : Array.isArray(body.questionIdsJson)
      ? body.questionIdsJson.map((id) => String(id).trim()).filter(Boolean)
      : Array.isArray(minigame.questionIdsJson)
      ? minigame.questionIdsJson.map((id) => String(id).trim()).filter(Boolean)
      : [];

    let resolvedQuestions =
      requestedQuestionIds.length > 0
        ? await prisma.exerciseQuestion.findMany({
            where: {
              id: { in: requestedQuestionIds },
              workspaceId,
            },
          })
        : [];

    // Preserve requested order if possible
    if (requestedQuestionIds.length > 0 && resolvedQuestions.length > 0) {
      const qMap = new Map(resolvedQuestions.map((q) => [q.id, q]));
      resolvedQuestions = requestedQuestionIds
        .map((id) => qMap.get(id))
        .filter((q): q is NonNullable<typeof q> => Boolean(q));
    }

    if (resolvedQuestions.length === 0) {
      resolvedQuestions = await prisma.exerciseQuestion.findMany({
        where: { workspaceId },
        orderBy: { createdAt: "desc" },
        take: 10,
      });
    }

    const questionsSnapshotJson = resolvedQuestions.map((q) => ({
      id: q.id,
      type: q.type,
      subject: q.subject,
      topic: q.topic,
      difficulty: q.difficulty,
      prompt: q.prompt,
      optionsJson: q.optionsJson ?? null,
      correctAnswer: q.correctAnswer,
      explanation: q.explanation ?? null,
      points: q.points,
    }));

    const defaultStateJson: Record<string, unknown> = {
      currentQuestionIndex: 0,
      answerRevealed: false,
      timerSecondsLeft: minigame.timeLimit || 30,
      liveScores: {},
      teamScores: {},
      wheelLastPrize: null,
      matchedPairs: [],
      revealedClues: [],
      buzzerWinner: null,
    };

    const stateJson =
      body.stateJson &&
      typeof body.stateJson === "object" &&
      !Array.isArray(body.stateJson)
        ? { ...defaultStateJson, ...(body.stateJson as Record<string, unknown>) }
        : defaultStateJson;

    const title =
      typeof body.title === "string" && body.title.trim().length > 0
        ? body.title.trim()
        : minigame.title;

    const gameSession = await prisma.gameSession.create({
      data: {
        workspaceId,
        classId: cls.id,
        sessionId,
        minigameId: minigame.id,
        title,
        mode,
        status: "IN_PROGRESS",
        questionsSnapshotJson: questionsSnapshotJson as Prisma.InputJsonValue,
        teamsConfigJson:
          teamsConfigJson !== null
            ? (teamsConfigJson as Prisma.InputJsonValue)
            : Prisma.JsonNull,
        stateJson: stateJson as Prisma.InputJsonValue,
      },
      include: {
        class: {
          select: { id: true, code: true, name: true, subject: true },
        },
        session: true,
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
    });

    return NextResponse.json({ gameSession }, { status: 201 });
  } catch (error) {
    return handleApiError(error);
  }
}
