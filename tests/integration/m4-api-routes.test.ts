import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { NextRequest } from "next/server";
import { prisma } from "@/lib/db";
import { SESSION_COOKIE_NAME } from "@/lib/auth";
import { registerTeacherWithWorkspace } from "@/lib/workspace";

import {
  GET as getQuestions,
  POST as postQuestions,
} from "@/app/api/questions/route";
import {
  GET as getQuestionById,
  PATCH as patchQuestionById,
  DELETE as deleteQuestionById,
} from "@/app/api/questions/[id]/route";
import {
  GET as getMinigames,
  POST as postMinigames,
} from "@/app/api/minigames/route";
import {
  GET as getMinigameById,
  PATCH as patchMinigameById,
  DELETE as deleteMinigameById,
} from "@/app/api/minigames/[id]/route";
import {
  GET as getGameSessions,
  POST as postGameSessions,
} from "@/app/api/game-sessions/route";
import {
  GET as getGameSessionById,
  PATCH as patchGameSessionById,
  DELETE as deleteGameSessionById,
} from "@/app/api/game-sessions/[id]/route";
import { GET as getLeaderboards } from "@/app/api/leaderboards/route";
import {
  GET as getLeaderboardConfigs,
  POST as postLeaderboardConfigs,
} from "@/app/api/leaderboards/configs/route";
import {
  GET as getLeaderboardConfigById,
  PATCH as patchLeaderboardConfigById,
  DELETE as deleteLeaderboardConfigById,
} from "@/app/api/leaderboards/configs/[id]/route";
import { GET as getPoints, POST as postPoints } from "@/app/api/points/route";

function makeAuthedRequest(
  url: string,
  token: string,
  options?: { method?: string; body?: unknown }
): NextRequest {
  const headers: Record<string, string> = {
    cookie: `${SESSION_COOKIE_NAME}=${token}`,
  };
  if (options?.body !== undefined) {
    headers["content-type"] = "application/json";
  }
  return new NextRequest(url, {
    method: options?.method ?? "GET",
    headers,
    body:
      options?.body !== undefined ? JSON.stringify(options.body) : undefined,
  });
}

describe("M4 Integration Tests: Modules 6–9 API Routes & Multi-Tenant Isolation (F30–F37)", () => {
  let teacher1: { userId: string; workspaceId: string; token: string };
  let teacher2: { userId: string; workspaceId: string; token: string };
  let class1Id: string;
  let student1AId: string;
  let student1BId: string;
  let student1CId: string;
  let student2Id: string;

  beforeAll(async () => {
    const suffix = `${Date.now()}-${Math.floor(Math.random() * 10000)}`;
    const reg1 = await registerTeacherWithWorkspace({
      fullName: "Giáo Viên M4 Test A",
      email: `m4.teacher.a.${suffix}@cmclass.vn`,
      password: "Password123!",
      workspaceName: "Workspace M4 Test A",
    });
    teacher1 = {
      userId: reg1.user.id,
      workspaceId: reg1.workspace.id,
      token: reg1.token,
    };

    const reg2 = await registerTeacherWithWorkspace({
      fullName: "Giáo Viên M4 Test B",
      email: `m4.teacher.b.${suffix}@cmclass.vn`,
      password: "Password123!",
      workspaceName: "Workspace M4 Test B",
    });
    teacher2 = {
      userId: reg2.user.id,
      workspaceId: reg2.workspace.id,
      token: reg2.token,
    };

    // Provision a test class & 3 enrolled students in Workspace 1
    const cls1 = await prisma.class.create({
      data: {
        workspaceId: teacher1.workspaceId,
        code: "M4-9A",
        name: "Lớp Toán 9A M4",
        subject: "Toán",
        defaultFeeAmount: 1500000,
      },
    });
    class1Id = cls1.id;

    const [stA, stB, stC] = await prisma.$transaction([
      prisma.student.create({
        data: {
          workspaceId: teacher1.workspaceId,
          studentCode: "HS101",
          fullName: "Nguyễn Minh An",
        },
      }),
      prisma.student.create({
        data: {
          workspaceId: teacher1.workspaceId,
          studentCode: "HS102",
          fullName: "Trần Bảo Bình",
        },
      }),
      prisma.student.create({
        data: {
          workspaceId: teacher1.workspaceId,
          studentCode: "HS103",
          fullName: "Lê Quốc Cường",
        },
      }),
    ]);
    student1AId = stA.id;
    student1BId = stB.id;
    student1CId = stC.id;

    await prisma.$transaction([
      prisma.enrollment.create({
        data: {
          workspaceId: teacher1.workspaceId,
          classId: class1Id,
          studentId: student1AId,
          status: "ACTIVE",
        },
      }),
      prisma.enrollment.create({
        data: {
          workspaceId: teacher1.workspaceId,
          classId: class1Id,
          studentId: student1BId,
          status: "ACTIVE",
        },
      }),
      prisma.enrollment.create({
        data: {
          workspaceId: teacher1.workspaceId,
          classId: class1Id,
          studentId: student1CId,
          status: "ACTIVE",
        },
      }),
    ]);

    // Provision a student in Workspace 2 for cross-tenant tests
    const st2 = await prisma.student.create({
      data: {
        workspaceId: teacher2.workspaceId,
        studentCode: "HS201",
        fullName: "Phạm Hải Đăng (WS2)",
      },
    });
    student2Id = st2.id;
  });

  afterAll(async () => {
    if (teacher1?.userId) {
      await prisma.user
        .delete({ where: { id: teacher1.userId } })
        .catch(() => {});
    }
    if (teacher2?.userId) {
      await prisma.user
        .delete({ where: { id: teacher2.userId } })
        .catch(() => {});
    }
  });

  it("F30 & F31: creates, filters, duplicates, updates, and transactionally bulk-imports ExerciseQuestions (with T2-27 rollback)", async () => {
    // 1. Create single MCQ question
    const createRes = await postQuestions(
      makeAuthedRequest("http://localhost:3000/api/questions", teacher1.token, {
        method: "POST",
        body: {
          type: "MULTIPLE_CHOICE",
          subject: "Toán",
          topic: "Căn bậc hai",
          difficulty: "EASY",
          prompt: "Căn bậc hai số học của 81 là?",
          optionsJson: [
            { id: "A", text: "9" },
            { id: "B", text: "-9" },
            { id: "C", text: "81" },
          ],
          correctAnswer: "A",
          points: 10,
          tagsJson: ["toan9", "can-bac-hai"],
        },
      })
    );
    expect(createRes.status).toBe(201);
    const createdBody = await createRes.json();
    const q1Id = createdBody.question.id as string;
    expect(q1Id).toBeTruthy();

    // 2. Duplicate question
    const dupRes = await postQuestions(
      makeAuthedRequest("http://localhost:3000/api/questions", teacher1.token, {
        method: "POST",
        body: { duplicateFromId: q1Id },
      })
    );
    expect(dupRes.status).toBe(201);
    const dupBody = await dupRes.json();
    expect(dupBody.question.prompt).toContain("(Bản sao)");

    // 3. Transactional Bulk Import rollback when 1 item is invalid (T2-27)
    const badBulkRes = await postQuestions(
      makeAuthedRequest("http://localhost:3000/api/questions", teacher1.token, {
        method: "POST",
        body: {
          bulk: true,
          questions: [
            {
              type: "SHORT_ANSWER",
              subject: "Vật Lý",
              topic: "Điện học",
              difficulty: "MEDIUM",
              prompt: "Đơn vị của cường độ dòng điện là gì?",
              correctAnswer: "Ampe",
              points: 10,
            },
            {
              type: "MULTIPLE_CHOICE",
              subject: "Vật Lý",
              topic: "Điện học",
              difficulty: "HARD",
              prompt: "Câu hỏi lỗi chỉ có 1 lựa chọn",
              optionsJson: [{ id: "A", text: "Volt" }],
              correctAnswer: "A",
              points: 10,
            },
          ],
        },
      })
    );
    expect(badBulkRes.status).toBe(400);

    // Verify "Đơn vị của cường độ dòng điện là gì?" was NOT inserted
    const checkAfterRollback = await getQuestions(
      makeAuthedRequest(
        "http://localhost:3000/api/questions?subject=Vật%20Lý",
        teacher1.token
      )
    );
    const checkData = await checkAfterRollback.json();
    expect(checkData.questions).toHaveLength(0);

    // 4. Valid Bulk Import
    const validBulkRes = await postQuestions(
      makeAuthedRequest("http://localhost:3000/api/questions", teacher1.token, {
        method: "POST",
        body: {
          bulk: true,
          questions: [
            {
              type: "FILL_IN_BLANK",
              subject: "Tiếng Anh",
              topic: "Grammar",
              difficulty: "MEDIUM",
              prompt: "She ___ to school every day.",
              correctAnswer: "goes",
              points: 15,
              tagsJson: ["present-simple"],
            },
            {
              type: "ESSAY",
              subject: "Ngữ Văn",
              topic: "Nghị luận xã hội",
              difficulty: "HARD",
              prompt: "Viết đoạn văn nêu suy nghĩ về lòng biết ơn.",
              correctAnswer: "Đảm bảo bố cục và dẫn chứng thuyết phục",
              points: 20,
              tagsJson: ["nghi-luan"],
            },
          ],
        },
      })
    );
    expect(validBulkRes.status).toBe(201);
    const validBulkData = await validBulkRes.json();
    expect(validBulkData.createdCount).toBe(2);

    // 5. Filter by tag & keyword
    const filterRes = await getQuestions(
      makeAuthedRequest(
        "http://localhost:3000/api/questions?tag=present-simple&q=school",
        teacher1.token
      )
    );
    const filterData = await filterRes.json();
    expect(filterData.questions).toHaveLength(1);
    expect(filterData.questions[0].subject).toBe("Tiếng Anh");
    expect(filterData.facets.subjects).toContain("Toán");

    // 6. PATCH question
    const patchRes = await patchQuestionById(
      makeAuthedRequest(
        `http://localhost:3000/api/questions/${q1Id}`,
        teacher1.token,
        {
          method: "PATCH",
          body: { points: 25, topic: "Căn thức bậc hai nâng cao" },
        }
      ),
      { params: Promise.resolve({ id: q1Id }) }
    );
    expect(patchRes.status).toBe(200);
    const patchData = await patchRes.json();
    expect(patchData.question.points).toBe(25);
  });

  it("F32, F33, F34 & T2-28: creates Minigames, launches Live GameSession with question snapshot, preserves snapshot after question deletion, and records ranked Team/Individual results", async () => {
    // Create a dedicated question to test snapshot preservation upon deletion (T2-28)
    const qSnapRes = await postQuestions(
      makeAuthedRequest("http://localhost:3000/api/questions", teacher1.token, {
        method: "POST",
        body: {
          type: "SHORT_ANSWER",
          subject: "Toán",
          topic: "Hệ phương trình",
          difficulty: "MEDIUM",
          prompt: "Nghiệm x của hệ x + y = 5 và x - y = 1 là?",
          correctAnswer: "3",
          points: 20,
        },
      })
    );
    const qSnap = (await qSnapRes.json()).question;

    // 1. Create Minigame linking qSnap
    const mgRes = await postMinigames(
      makeAuthedRequest("http://localhost:3000/api/minigames", teacher1.token, {
        method: "POST",
        body: {
          title: "Đấu Trường Toán Học 9A",
          type: "TEAM_BUZZER",
          timeLimit: 25,
          pointsPerQuestion: 150,
          questionIdsJson: [qSnap.id],
        },
      })
    );
    expect(mgRes.status).toBe(201);
    const minigame = (await mgRes.json()).minigame;

    // 2. Launch Live GameSession in TEAM mode
    const gsRes = await postGameSessions(
      makeAuthedRequest(
        "http://localhost:3000/api/game-sessions",
        teacher1.token,
        {
          method: "POST",
          body: {
            classId: class1Id,
            minigameId: minigame.id,
            title: "Phiên Thi Đấu Đội 9A",
            mode: "TEAM",
            teamsConfigJson: [
              { name: "Đội Rồng Xanh", studentIds: [student1AId, student1BId] },
              { name: "Đội Phượng Hoàng", studentIds: [student1CId] },
            ],
          },
        }
      )
    );
    expect(gsRes.status).toBe(201);
    const gs = (await gsRes.json()).gameSession;
    expect(Array.isArray(gs.questionsSnapshotJson)).toBe(true);
    expect(gs.questionsSnapshotJson).toHaveLength(1);
    expect(gs.questionsSnapshotJson[0].prompt).toContain("x + y = 5");

    // 3. Delete original question from Question Bank (T2-28)
    const delQRes = await deleteQuestionById(
      makeAuthedRequest(
        `http://localhost:3000/api/questions/${qSnap.id}`,
        teacher1.token,
        { method: "DELETE" }
      ),
      { params: Promise.resolve({ id: qSnap.id }) }
    );
    expect(delQRes.status).toBe(200);

    // Verify GameSession snapshot remains intact after question deletion
    const gsAfterDelRes = await getGameSessionById(
      makeAuthedRequest(
        `http://localhost:3000/api/game-sessions/${gs.id}`,
        teacher1.token
      ),
      { params: Promise.resolve({ id: gs.id }) }
    );
    expect(gsAfterDelRes.status).toBe(200);
    const gsAfterDel = (await gsAfterDelRes.json()).gameSession;
    expect(gsAfterDel.questionsSnapshotJson).toHaveLength(1);
    expect(gsAfterDel.questionsSnapshotJson[0].prompt).toContain("x + y = 5");

    // 4. Finalize GameSession with teamResults -> propagates to members with 1224 competition ranks (F34, C4.1)
    const finishRes = await patchGameSessionById(
      makeAuthedRequest(
        `http://localhost:3000/api/game-sessions/${gs.id}`,
        teacher1.token,
        {
          method: "PATCH",
          body: {
            status: "COMPLETED",
            teamResults: [
              {
                teamName: "Đội Rồng Xanh",
                studentIds: [student1AId, student1BId],
                score: 450,
                correctCount: 3,
                totalQuestions: 3,
                bonusPoints: 50,
              },
              {
                teamName: "Đội Phượng Hoàng",
                studentIds: [student1CId],
                score: 300,
                correctCount: 2,
                totalQuestions: 3,
                bonusPoints: 0,
              },
            ],
          },
        }
      ),
      { params: Promise.resolve({ id: gs.id }) }
    );
    expect(finishRes.status).toBe(200);
    const finishData = await finishRes.json();
    expect(finishData.gameSession.status).toBe("COMPLETED");
    expect(finishData.results).toHaveLength(3);

    // Student 1A and 1B tied at rank 1 (score 450 + 50 = 500), Student 1C at rank 3
    const ranks = finishData.results.map((r: { rank: number }) => r.rank);
    expect(ranks).toEqual([1, 1, 3]);
  });

  it("F35, F36, F37, C1.3, C3.3, T2-31: manages LeaderboardConfigs, awards PointTransactions, and computes dynamic multi-criteria Leaderboard", async () => {
    // 1. Reject invalid LeaderboardConfig weights (sum <= 0 or negative weight per T2-31)
    const badCfgRes = await postLeaderboardConfigs(
      makeAuthedRequest(
        "http://localhost:3000/api/leaderboards/configs",
        teacher1.token,
        {
          method: "POST",
          body: {
            name: "Config Lỗi Trọng Số 0",
            attendanceWeight: 0,
            homeworkWeight: 0,
            gameWeight: 0,
            bonusWeight: 0,
          },
        }
      )
    );
    expect(badCfgRes.status).toBe(400);

    // 2. Create valid LeaderboardConfig preset
    const cfgRes = await postLeaderboardConfigs(
      makeAuthedRequest(
        "http://localhost:3000/api/leaderboards/configs",
        teacher1.token,
        {
          method: "POST",
          body: {
            name: "Xếp hạng Thi Đua 9A",
            classId: class1Id,
            attendanceWeight: 20,
            homeworkWeight: 40,
            gameWeight: 25,
            bonusWeight: 15,
            isDefault: true,
          },
        }
      )
    );
    expect(cfgRes.status).toBe(201);
    const cfg = (await cfgRes.json()).config;

    // 3. Award positive bonus points to student1A and negative penalty to student1C
    const awardBonusRes = await postPoints(
      makeAuthedRequest("http://localhost:3000/api/points", teacher1.token, {
        method: "POST",
        body: {
          studentId: student1AId,
          classId: class1Id,
          points: 40,
          reason: "Giải bài tập nâng cao xuất sắc",
          category: "BONUS",
        },
      })
    );
    expect(awardBonusRes.status).toBe(201);

    const awardPenaltyRes = await postPoints(
      makeAuthedRequest("http://localhost:3000/api/points", teacher1.token, {
        method: "POST",
        body: {
          studentId: student1CId,
          classId: class1Id,
          points: -25,
          reason: "Nộp bài muộn",
          category: "PENALTY",
        },
      })
    );
    expect(awardPenaltyRes.status).toBe(201);

    // 4. Create 1 COMPLETED session and 1 CANCELLED session to verify C1.3 (CANCELLED excluded from attendance)
    const [sessActive, sessCancelled] = await prisma.$transaction([
      prisma.session.create({
        data: {
          workspaceId: teacher1.workspaceId,
          classId: class1Id,
          sessionDate: new Date("2026-11-01T00:00:00.000Z"),
          startTime: "18:00",
          endTime: "19:30",
          status: "COMPLETED",
        },
      }),
      prisma.session.create({
        data: {
          workspaceId: teacher1.workspaceId,
          classId: class1Id,
          sessionDate: new Date("2026-11-03T00:00:00.000Z"),
          startTime: "18:00",
          endTime: "19:30",
          status: "CANCELLED",
        },
      }),
    ]);

    await prisma.$transaction([
      prisma.attendance.create({
        data: {
          workspaceId: teacher1.workspaceId,
          sessionId: sessActive.id,
          studentId: student1AId,
          status: "PRESENT",
        },
      }),
      // Even if an attendance row exists on a CANCELLED session, it must be excluded!
      prisma.attendance.create({
        data: {
          workspaceId: teacher1.workspaceId,
          sessionId: sessCancelled.id,
          studentId: student1AId,
          status: "ABSENT_UNEXCUSED",
        },
      }),
    ]);

    // 5. Compute Leaderboard via GET /api/leaderboards
    const lbRes = await getLeaderboards(
      makeAuthedRequest(
        `http://localhost:3000/api/leaderboards?classId=${class1Id}&configId=${cfg.id}`,
        teacher1.token
      )
    );
    expect(lbRes.status).toBe(200);
    const lbData = await lbRes.json();
    expect(lbData.rankings).toHaveLength(3);

    const rowA = lbData.rankings.find(
      (r: { studentId: string }) => r.studentId === student1AId
    );
    const rowC = lbData.rankings.find(
      (r: { studentId: string }) => r.studentId === student1CId
    );

    expect(rowA).toBeDefined();
    // Attendance on CANCELLED session was excluded, so student1A has 100% attendance from sessActive
    expect(rowA.attendanceCount).toBe(1);
    expect(rowA.attendanceScore).toBe(100);
    expect(rowA.student.fullName).toBe("Nguyễn Minh An");
    expect(rowA.rank).toBe(1);

    // Student 1C has negative bonusPointsRaw (-25) clamped to bonusScore = 0
    expect(rowC.bonusPointsRaw).toBe(-25);
    expect(rowC.bonusScore).toBe(0);
  });

  it("S3.4: enforces strict multi-tenant workspace isolation across all M4 endpoints (404 on cross-workspace access)", async () => {
    // Teacher 1 creates a question, minigame, game session, and leaderboard config
    const q1Res = await postQuestions(
      makeAuthedRequest("http://localhost:3000/api/questions", teacher1.token, {
        method: "POST",
        body: {
          type: "SHORT_ANSWER",
          subject: "Toán",
          topic: "Định lý Vi-ét",
          difficulty: "MEDIUM",
          prompt: "Tổng hai nghiệm của phương trình x² - 5x + 6 = 0 là?",
          correctAnswer: "5",
          points: 10,
        },
      })
    );
    const q1 = (await q1Res.json()).question;

    const mg1Res = await postMinigames(
      makeAuthedRequest("http://localhost:3000/api/minigames", teacher1.token, {
        method: "POST",
        body: {
          title: "Minigame Nội Bộ WS1",
          type: "SPEED_QUIZ",
          questionIdsJson: [q1.id],
        },
      })
    );
    const mg1 = (await mg1Res.json()).minigame;

    const gs1Res = await postGameSessions(
      makeAuthedRequest(
        "http://localhost:3000/api/game-sessions",
        teacher1.token,
        {
          method: "POST",
          body: {
            classId: class1Id,
            minigameId: mg1.id,
          },
        }
      )
    );
    const gs1 = (await gs1Res.json()).gameSession;

    const cfg1Res = await postLeaderboardConfigs(
      makeAuthedRequest(
        "http://localhost:3000/api/leaderboards/configs",
        teacher1.token,
        {
          method: "POST",
          body: {
            name: "Config Riêng WS1",
            attendanceWeight: 25,
            homeworkWeight: 25,
            gameWeight: 25,
            bonusWeight: 25,
          },
        }
      )
    );
    const cfg1 = (await cfg1Res.json()).config;

    // Teacher 2 attempts to access/mutate Teacher 1's resources -> all must return 404
    const crossGetQ = await getQuestionById(
      makeAuthedRequest(
        `http://localhost:3000/api/questions/${q1.id}`,
        teacher2.token
      ),
      { params: Promise.resolve({ id: q1.id }) }
    );
    expect(crossGetQ.status).toBe(404);

    const crossDeleteQ = await deleteQuestionById(
      makeAuthedRequest(
        `http://localhost:3000/api/questions/${q1.id}`,
        teacher2.token,
        { method: "DELETE" }
      ),
      { params: Promise.resolve({ id: q1.id }) }
    );
    expect(crossDeleteQ.status).toBe(404);

    const crossGetMg = await getMinigameById(
      makeAuthedRequest(
        `http://localhost:3000/api/minigames/${mg1.id}`,
        teacher2.token
      ),
      { params: Promise.resolve({ id: mg1.id }) }
    );
    expect(crossGetMg.status).toBe(404);

    const crossPatchMg = await patchMinigameById(
      makeAuthedRequest(
        `http://localhost:3000/api/minigames/${mg1.id}`,
        teacher2.token,
        { method: "PATCH", body: { title: "Hack" } }
      ),
      { params: Promise.resolve({ id: mg1.id }) }
    );
    expect(crossPatchMg.status).toBe(404);

    const crossDeleteMg = await deleteMinigameById(
      makeAuthedRequest(
        `http://localhost:3000/api/minigames/${mg1.id}`,
        teacher2.token,
        { method: "DELETE" }
      ),
      { params: Promise.resolve({ id: mg1.id }) }
    );
    expect(crossDeleteMg.status).toBe(404);

    // Teacher 2 attempting to link Teacher 1's question into Teacher 2's minigame -> 404
    const crossLinkMg = await postMinigames(
      makeAuthedRequest("http://localhost:3000/api/minigames", teacher2.token, {
        method: "POST",
        body: {
          title: "Minigame Chứa Câu Hỏi WS1",
          type: "SPEED_QUIZ",
          questionIdsJson: [q1.id],
        },
      })
    );
    expect(crossLinkMg.status).toBe(404);

    const crossGetGs = await getGameSessionById(
      makeAuthedRequest(
        `http://localhost:3000/api/game-sessions/${gs1.id}`,
        teacher2.token
      ),
      { params: Promise.resolve({ id: gs1.id }) }
    );
    expect(crossGetGs.status).toBe(404);

    const crossDeleteGs = await deleteGameSessionById(
      makeAuthedRequest(
        `http://localhost:3000/api/game-sessions/${gs1.id}`,
        teacher2.token,
        { method: "DELETE" }
      ),
      { params: Promise.resolve({ id: gs1.id }) }
    );
    expect(crossDeleteGs.status).toBe(404);

    const crossGetCfg = await getLeaderboardConfigById(
      makeAuthedRequest(
        `http://localhost:3000/api/leaderboards/configs/${cfg1.id}`,
        teacher2.token
      ),
      { params: Promise.resolve({ id: cfg1.id }) }
    );
    expect(crossGetCfg.status).toBe(404);

    const crossPatchCfg = await patchLeaderboardConfigById(
      makeAuthedRequest(
        `http://localhost:3000/api/leaderboards/configs/${cfg1.id}`,
        teacher2.token,
        { method: "PATCH", body: { name: "Hack Config" } }
      ),
      { params: Promise.resolve({ id: cfg1.id }) }
    );
    expect(crossPatchCfg.status).toBe(404);

    const crossDeleteCfg = await deleteLeaderboardConfigById(
      makeAuthedRequest(
        `http://localhost:3000/api/leaderboards/configs/${cfg1.id}`,
        teacher2.token,
        { method: "DELETE" }
      ),
      { params: Promise.resolve({ id: cfg1.id }) }
    );
    expect(crossDeleteCfg.status).toBe(404);

    // Teacher 1 attempting to award points to Teacher 2's student -> 404
    const crossAwardPts = await postPoints(
      makeAuthedRequest("http://localhost:3000/api/points", teacher1.token, {
        method: "POST",
        body: {
          studentId: student2Id,
          points: 50,
          reason: "Cross tenant point award attempt",
        },
      })
    );
    expect(crossAwardPts.status).toBe(404);

    // Teacher 2 list endpoints do not leak Teacher 1 records
    const listGs2 = await (
      await getGameSessions(
        makeAuthedRequest(
          "http://localhost:3000/api/game-sessions",
          teacher2.token
        )
      )
    ).json();
    expect(listGs2.gameSessions).toHaveLength(0);

    const listCfg2 = await (
      await getLeaderboardConfigs(
        makeAuthedRequest(
          "http://localhost:3000/api/leaderboards/configs",
          teacher2.token
        )
      )
    ).json();
    expect(
      listCfg2.configs.some((c: { id: string }) => c.id === cfg1.id)
    ).toBe(false);

    const listPts2 = await (
      await getPoints(
        makeAuthedRequest("http://localhost:3000/api/points", teacher2.token)
      )
    ).json();
    expect(listPts2.transactions).toHaveLength(0);
  });
});
