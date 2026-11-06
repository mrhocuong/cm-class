import { NextRequest, NextResponse } from "next/server";
import { Prisma, type GameSessionStatus } from "@prisma/client";
import { prisma } from "@/lib/db";
import {
  requireWorkspace,
  assertWorkspaceResource,
  WorkspaceAuthError,
  handleApiError,
} from "@/lib/workspace";
import {
  computeGameRankings,
  propagateTeamResultsToStudents,
  type RawGameParticipantResult,
  type TeamDefinitionInput,
  type TeamScoreInput,
} from "@/lib/game-engine";

const VALID_STATUSES: readonly GameSessionStatus[] = [
  "LOBBY",
  "IN_PROGRESS",
  "COMPLETED",
  "CANCELLED",
] as const;

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { workspaceId } = await requireWorkspace(req);
    const { id } = await params;

    const gameSession = assertWorkspaceResource(
      await prisma.gameSession.findFirst({
        where: { id, workspaceId },
        include: {
          class: {
            include: {
              enrollments: {
                where: { status: "ACTIVE" },
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
                orderBy: { enrolledAt: "asc" },
              },
            },
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
            orderBy: [{ rank: "asc" }, { score: "desc" }],
          },
        },
      }),
      workspaceId,
      "Không tìm thấy phiên chơi game trong workspace của bạn"
    );

    return NextResponse.json({
      gameSession,
      results: gameSession.results,
    });
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
      await prisma.gameSession.findFirst({
        where: { id, workspaceId },
        include: { minigame: true },
      }),
      workspaceId,
      "Không tìm thấy phiên chơi game trong workspace của bạn"
    );

    const hasExplicitResults = Array.isArray(body.results);
    const hasTeamResults = Array.isArray(body.teamResults);
    const requestedStatus =
      typeof body.status === "string" && body.status.trim() !== ""
        ? body.status.trim().toUpperCase()
        : undefined;

    if (
      requestedStatus &&
      !VALID_STATUSES.includes(requestedStatus as GameSessionStatus)
    ) {
      throw new WorkspaceAuthError(400, "Trạng thái phiên chơi không hợp lệ");
    }

    const existingState =
      existing.stateJson &&
      typeof existing.stateJson === "object" &&
      !Array.isArray(existing.stateJson)
        ? (existing.stateJson as Record<string, unknown>)
        : {};

    const nextStateJson =
      body.stateJson &&
      typeof body.stateJson === "object" &&
      !Array.isArray(body.stateJson)
        ? { ...existingState, ...(body.stateJson as Record<string, unknown>) }
        : existing.stateJson;

    const nextTeamsConfig =
      body.teamsConfigJson !== undefined
        ? body.teamsConfigJson
        : existing.teamsConfigJson;

    const nextTitle =
      typeof body.title === "string" && body.title.trim().length > 0
        ? body.title.trim()
        : existing.title;

    // Resolve participant inputs if results or teamResults are provided
    const rawParticipantInputs: RawGameParticipantResult[] = [];
    const seenStudentIds = new Set<string>();

    const totalSnapshotQuestions = Array.isArray(existing.questionsSnapshotJson)
      ? existing.questionsSnapshotJson.length
      : 0;

    if (hasExplicitResults) {
      for (const item of body.results as Array<Record<string, unknown>>) {
        if (!item || typeof item !== "object") continue;
        const studentId = String(item.studentId ?? "").trim();
        if (!studentId || seenStudentIds.has(studentId)) continue;
        seenStudentIds.add(studentId);
        rawParticipantInputs.push({
          studentId,
          teamName:
            item.teamName !== undefined && item.teamName !== null
              ? String(item.teamName).trim()
              : null,
          score: Number(item.score) || 0,
          correctCount:
            item.correctCount !== undefined
              ? Number(item.correctCount)
              : undefined,
          totalQuestions:
            item.totalQuestions !== undefined
              ? Number(item.totalQuestions)
              : totalSnapshotQuestions,
          bonusPoints:
            item.bonusPoints !== undefined ? Number(item.bonusPoints) : 0,
        });
      }
    }

    if (hasTeamResults) {
      const teamResultsArr = body.teamResults as Array<Record<string, unknown>>;
      const teamDefinitions: TeamDefinitionInput[] = [];
      const teamScores: TeamScoreInput[] = [];

      // Collect team definitions from teamResults items if they include studentIds
      for (const tr of teamResultsArr) {
        if (!tr || typeof tr !== "object") continue;
        const teamName = String(tr.teamName ?? tr.name ?? "").trim();
        if (!teamName) continue;
        teamScores.push({
          teamName,
          score: Number(tr.score) || 0,
          correctCount:
            tr.correctCount !== undefined ? Number(tr.correctCount) : 0,
          totalQuestions:
            tr.totalQuestions !== undefined
              ? Number(tr.totalQuestions)
              : totalSnapshotQuestions,
          bonusPoints:
            tr.bonusPoints !== undefined ? Number(tr.bonusPoints) : 0,
        });

        if (Array.isArray(tr.studentIds) && tr.studentIds.length > 0) {
          teamDefinitions.push({
            name: teamName,
            studentIds: tr.studentIds
              .map((sid) => String(sid ?? "").trim())
              .filter(Boolean),
          });
        }
      }

      // Also check teamsConfigJson if teamDefinitions was not embedded in teamResults
      if (teamDefinitions.length === 0 && Array.isArray(nextTeamsConfig)) {
        for (const tc of nextTeamsConfig as Array<Record<string, unknown>>) {
          if (!tc || typeof tc !== "object") continue;
          const name = String(tc.name ?? tc.teamName ?? "").trim();
          const studentIds = Array.isArray(tc.studentIds)
            ? tc.studentIds.map((sid) => String(sid ?? "").trim()).filter(Boolean)
            : [];
          if (name && studentIds.length > 0) {
            teamDefinitions.push({ name, studentIds });
          }
        }
      }

      if (teamDefinitions.length > 0 && teamScores.length > 0) {
        const propagated = propagateTeamResultsToStudents(
          teamDefinitions,
          teamScores
        );
        for (const p of propagated) {
          if (seenStudentIds.has(p.studentId)) continue;
          seenStudentIds.add(p.studentId);
          rawParticipantInputs.push({
            studentId: p.studentId,
            teamName: p.teamName,
            score: p.score,
            correctCount: p.correctCount,
            totalQuestions: p.totalQuestions,
            bonusPoints: p.bonusPoints,
          });
        }
      }
    }

    const rankedResults =
      rawParticipantInputs.length > 0
        ? computeGameRankings(rawParticipantInputs)
        : [];

    if (rankedResults.length > 0) {
      const uniqueStudentIds = Array.from(
        new Set(rankedResults.map((r) => r.studentId))
      );
      const validStudents = await prisma.student.findMany({
        where: {
          id: { in: uniqueStudentIds },
          workspaceId,
        },
        select: { id: true },
      });

      if (validStudents.length !== uniqueStudentIds.length) {
        throw new WorkspaceAuthError(
          404,
          "Học sinh trong kết quả không thuộc workspace của bạn"
        );
      }
    }

    const finalStatus: GameSessionStatus =
      (requestedStatus as GameSessionStatus | undefined) ??
      (hasExplicitResults || hasTeamResults ? "COMPLETED" : existing.status);

    const updatedGameSession = await prisma.$transaction(async (tx) => {
      if (rankedResults.length > 0) {
        await tx.gameResult.deleteMany({
          where: {
            gameSessionId: existing.id,
            workspaceId,
            studentId: { notIn: rankedResults.map((r) => r.studentId) },
          },
        });
      }

      for (const r of rankedResults) {
        await tx.gameResult.upsert({
          where: {
            gameSessionId_studentId: {
              gameSessionId: existing.id,
              studentId: r.studentId,
            },
          },
          create: {
            workspaceId,
            gameSessionId: existing.id,
            studentId: r.studentId,
            teamName: r.teamName,
            score: r.score,
            correctCount: r.correctCount,
            totalQuestions: r.totalQuestions,
            accuracy: r.accuracy,
            rank: r.rank,
            bonusPoints: r.bonusPoints,
          },
          update: {
            teamName: r.teamName,
            score: r.score,
            correctCount: r.correctCount,
            totalQuestions: r.totalQuestions,
            accuracy: r.accuracy,
            rank: r.rank,
            bonusPoints: r.bonusPoints,
          },
        });
      }

      return tx.gameSession.update({
        where: { id: existing.id },
        data: {
          title: nextTitle,
          status: finalStatus,
          endedAt:
            finalStatus === "COMPLETED" || finalStatus === "CANCELLED"
              ? existing.endedAt ?? new Date()
              : existing.endedAt,
          stateJson:
            nextStateJson !== null
              ? (nextStateJson as Prisma.InputJsonValue)
              : Prisma.JsonNull,
          teamsConfigJson:
            nextTeamsConfig !== null
              ? (nextTeamsConfig as Prisma.InputJsonValue)
              : Prisma.JsonNull,
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
            orderBy: [{ rank: "asc" }, { score: "desc" }],
          },
        },
      });
    });

    return NextResponse.json({
      gameSession: updatedGameSession,
      results: updatedGameSession.results,
    });
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
      await prisma.gameSession.findFirst({
        where: { id, workspaceId },
      }),
      workspaceId,
      "Không tìm thấy phiên chơi game trong workspace của bạn"
    );

    await prisma.gameSession.delete({
      where: { id: existing.id },
    });

    return NextResponse.json({ success: true, deletedId: existing.id });
  } catch (error) {
    return handleApiError(error);
  }
}
