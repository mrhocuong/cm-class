import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import {
  requireWorkspace,
  assertWorkspaceResource,
  WorkspaceAuthError,
  handleApiError,
} from "@/lib/workspace";
import {
  computeLeaderboard,
  type LeaderboardStudentRecordInput,
  type LeaderboardWeightsInput,
  type StudentAttendanceInput,
  type StudentHomeworkInput,
  type StudentGameInput,
  type StudentPointTransactionInput,
} from "@/lib/leaderboard";

function parseDateBound(
  raw: string | null,
  mode: "start" | "end"
): Date | null {
  if (!raw || !raw.trim()) return null;
  const trimmed = raw.trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) {
    return new Date(
      mode === "start"
        ? `${trimmed}T00:00:00.000Z`
        : `${trimmed}T23:59:59.999Z`
    );
  }
  const d = new Date(trimmed);
  return Number.isNaN(d.getTime()) ? null : d;
}

export async function GET(req: NextRequest) {
  try {
    const { workspaceId } = await requireWorkspace(req);
    const { searchParams } = new URL(req.url);

    let effectiveClassId = searchParams.get("classId")?.trim() || null;
    const configId = searchParams.get("configId")?.trim() || null;
    let fromParam = searchParams.get("from")?.trim() || null;
    let toParam = searchParams.get("to")?.trim() || null;

    const weights: LeaderboardWeightsInput = {
      attendanceWeight: 25,
      homeworkWeight: 35,
      gameWeight: 25,
      bonusWeight: 15,
    };

    if (configId) {
      const cfg = assertWorkspaceResource(
        await prisma.leaderboardConfig.findFirst({
          where: { id: configId, workspaceId },
        }),
        workspaceId,
        "Không tìm thấy cấu hình bảng xếp hạng trong workspace của bạn"
      );
      weights.attendanceWeight = cfg.attendanceWeight;
      weights.homeworkWeight = cfg.homeworkWeight;
      weights.gameWeight = cfg.gameWeight;
      weights.bonusWeight = cfg.bonusWeight;
      if (!effectiveClassId && cfg.classId) {
        effectiveClassId = cfg.classId;
      }
      if (!fromParam && cfg.periodStart) {
        fromParam = cfg.periodStart.toISOString();
      }
      if (!toParam && cfg.periodEnd) {
        toParam = cfg.periodEnd.toISOString();
      }
    }

    // Apply explicit weight query parameter overrides
    const weightKeys: Array<keyof LeaderboardWeightsInput> = [
      "attendanceWeight",
      "homeworkWeight",
      "gameWeight",
      "bonusWeight",
    ];

    for (const key of weightKeys) {
      const rawVal = searchParams.get(key);
      if (rawVal !== null && rawVal.trim() !== "") {
        const parsed = Number(rawVal);
        if (!Number.isFinite(parsed) || parsed < 0) {
          throw new WorkspaceAuthError(
            400,
            "Trọng số xếp hạng không được là số âm"
          );
        }
        weights[key] = parsed;
      }
    }

    if (
      weights.attendanceWeight +
        weights.homeworkWeight +
        weights.gameWeight +
        weights.bonusWeight <=
      0
    ) {
      throw new WorkspaceAuthError(
        400,
        "Tổng trọng số xếp hạng phải lớn hơn 0"
      );
    }

    if (effectiveClassId) {
      assertWorkspaceResource(
        await prisma.class.findFirst({
          where: { id: effectiveClassId, workspaceId },
        }),
        workspaceId,
        "Không tìm thấy lớp học trong workspace của bạn"
      );
    }

    const fromDate = parseDateBound(fromParam, "start");
    const toDate = parseDateBound(toParam, "end");

    if (fromDate && toDate && fromDate > toDate) {
      throw new WorkspaceAuthError(
        400,
        "Khoảng thời gian lọc từ ngày - đến ngày không hợp lệ"
      );
    }

    // Resolve student cohort
    interface CohortStudent {
      id: string;
      studentCode: string;
      fullName: string;
      avatarUrl: string | null;
      classNames: string[];
    }

    const cohortStudents: CohortStudent[] = [];
    const seenStudentIds = new Set<string>();

    if (effectiveClassId) {
      const enrollments = await prisma.enrollment.findMany({
        where: {
          workspaceId,
          classId: effectiveClassId,
          status: { not: "DROPPED" },
        },
        include: {
          student: {
            include: {
              enrollments: {
                where: { status: "ACTIVE" },
                include: {
                  class: { select: { name: true } },
                },
              },
            },
          },
        },
        orderBy: { enrolledAt: "asc" },
      });

      for (const enr of enrollments) {
        if (seenStudentIds.has(enr.student.id)) continue;
        seenStudentIds.add(enr.student.id);
        cohortStudents.push({
          id: enr.student.id,
          studentCode: enr.student.studentCode,
          fullName: enr.student.fullName,
          avatarUrl: enr.student.avatarUrl,
          classNames: enr.student.enrollments.map((e) => e.class.name),
        });
      }
    } else {
      const students = await prisma.student.findMany({
        where: {
          workspaceId,
          status: "ACTIVE",
        },
        include: {
          enrollments: {
            where: { status: "ACTIVE" },
            include: {
              class: { select: { name: true } },
            },
          },
        },
        orderBy: { studentCode: "asc" },
      });

      for (const st of students) {
        cohortStudents.push({
          id: st.id,
          studentCode: st.studentCode,
          fullName: st.fullName,
          avatarUrl: st.avatarUrl,
          classNames: st.enrollments.map((e) => e.class.name),
        });
      }
    }

    if (cohortStudents.length === 0) {
      const emptyResult = computeLeaderboard([], weights, {
        lateWeight: 0.75,
        excusedWeight: 0.5,
        bonusCap: 100,
      });
      return NextResponse.json({
        rankings: [],
        podium: [],
        weights,
        normalizedWeights: emptyResult.normalizedWeights,
        cohortMaxGameRaw: 0,
        effectiveBonusCap: 100,
      });
    }

    const studentIds = cohortStudents.map((s) => s.id);

    // 1. Fetch Attendances (excluding CANCELLED sessions per C1.3)
    const attendances = await prisma.attendance.findMany({
      where: {
        workspaceId,
        studentId: { in: studentIds },
        session: {
          status: { not: "CANCELLED" },
          ...(effectiveClassId ? { classId: effectiveClassId } : {}),
          ...(fromDate || toDate
            ? {
                sessionDate: {
                  ...(fromDate ? { gte: fromDate } : {}),
                  ...(toDate ? { lte: toDate } : {}),
                },
              }
            : {}),
        },
      },
      select: {
        studentId: true,
        status: true,
      },
    });

    // 2. Fetch Homework Submissions (supporting multi-scale maxScore & MISSING per C3.3)
    const homeworkSubmissions = await prisma.homeworkSubmission.findMany({
      where: {
        workspaceId,
        studentId: { in: studentIds },
        homework: {
          ...(effectiveClassId ? { classId: effectiveClassId } : {}),
          ...(fromDate || toDate
            ? {
                dueDate: {
                  ...(fromDate ? { gte: fromDate } : {}),
                  ...(toDate ? { lte: toDate } : {}),
                },
              }
            : {}),
        },
      },
      include: {
        homework: {
          select: {
            id: true,
            maxScore: true,
            dueDate: true,
          },
        },
      },
    });

    // 3. Fetch Game Results from COMPLETED sessions (combining INDIVIDUAL & TEAM per C4.2, C4.3)
    const gameResults = await prisma.gameResult.findMany({
      where: {
        workspaceId,
        studentId: { in: studentIds },
        gameSession: {
          status: "COMPLETED",
          ...(effectiveClassId ? { classId: effectiveClassId } : {}),
          ...(fromDate || toDate
            ? {
                startedAt: {
                  ...(fromDate ? { gte: fromDate } : {}),
                  ...(toDate ? { lte: toDate } : {}),
                },
              }
            : {}),
        },
      },
      select: {
        studentId: true,
        score: true,
        bonusPoints: true,
      },
    });

    // 4. Fetch Point Transactions
    const pointTransactions = await prisma.pointTransaction.findMany({
      where: {
        workspaceId,
        studentId: { in: studentIds },
        ...(effectiveClassId
          ? { OR: [{ classId: effectiveClassId }, { classId: null }] }
          : {}),
        ...(fromDate || toDate
          ? {
              awardedAt: {
                ...(fromDate ? { gte: fromDate } : {}),
                ...(toDate ? { lte: toDate } : {}),
              },
            }
          : {}),
      },
      select: {
        studentId: true,
        points: true,
      },
    });

    // Group component records by studentId
    const attByStudent = new Map<string, StudentAttendanceInput[]>();
    const hwByStudent = new Map<string, StudentHomeworkInput[]>();
    const gameByStudent = new Map<string, StudentGameInput[]>();
    const pointsByStudent = new Map<string, StudentPointTransactionInput[]>();

    for (const sid of studentIds) {
      attByStudent.set(sid, []);
      hwByStudent.set(sid, []);
      gameByStudent.set(sid, []);
      pointsByStudent.set(sid, []);
    }

    for (const att of attendances) {
      attByStudent.get(att.studentId)?.push({
        status: att.status,
      });
    }

    for (const sub of homeworkSubmissions) {
      hwByStudent.get(sub.studentId)?.push({
        status: sub.status,
        score: sub.score,
        maxScore: sub.homework.maxScore,
        isOverdue: true,
      });
    }

    for (const gr of gameResults) {
      gameByStudent.get(gr.studentId)?.push({
        score: gr.score,
        bonusPoints: gr.bonusPoints,
      });
    }

    for (const pt of pointTransactions) {
      pointsByStudent.get(pt.studentId)?.push({
        points: pt.points,
      });
    }

    const studentRecordInputs: LeaderboardStudentRecordInput[] =
      cohortStudents.map((st) => ({
        studentId: st.id,
        studentCode: st.studentCode,
        fullName: st.fullName,
        avatarUrl: st.avatarUrl,
        classNames: st.classNames,
        attendances: attByStudent.get(st.id) ?? [],
        homeworks: hwByStudent.get(st.id) ?? [],
        gameResults: gameByStudent.get(st.id) ?? [],
        pointTransactions: pointsByStudent.get(st.id) ?? [],
      }));

    const computation = computeLeaderboard(studentRecordInputs, weights, {
      lateWeight: 0.75,
      excusedWeight: 0.5,
      bonusCap: 100,
    });

    const rankings = computation.rankings.map((entry) => ({
      ...entry,
      student: {
        id: entry.studentId,
        studentCode: entry.studentCode,
        fullName: entry.fullName,
        avatarUrl: entry.avatarUrl,
      },
    }));

    return NextResponse.json({
      rankings,
      podium: rankings.slice(0, 3),
      weights,
      normalizedWeights: computation.normalizedWeights,
      cohortMaxGameRaw: computation.cohortMaxGameRaw,
      effectiveBonusCap: computation.effectiveBonusCap,
    });
  } catch (error) {
    return handleApiError(error);
  }
}
