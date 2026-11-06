import { describe, expect, it } from "vitest";
import {
  computeGameRankings,
  propagateTeamResultsToStudents,
} from "@/lib/game-engine";
import { computeLeaderboard } from "@/lib/leaderboard";

describe("src/lib/game-engine.ts & src/lib/leaderboard.ts", () => {
  it("computes 1224 competition rankings and propagates team scores to team members", () => {
    const ranked = computeGameRankings([
      { studentId: "s1", score: 300, correctCount: 3, totalQuestions: 4 },
      { studentId: "s2", score: 450, correctCount: 4, totalQuestions: 4 },
      { studentId: "s3", score: 450, correctCount: 4, totalQuestions: 4 },
      { studentId: "s4", score: 200, correctCount: 2, totalQuestions: 4 },
    ]);

    expect(ranked.map((r) => ({ id: r.studentId, rank: r.rank }))).toEqual([
      { id: "s2", rank: 1 },
      { id: "s3", rank: 1 },
      { id: "s1", rank: 3 },
      { id: "s4", rank: 4 },
    ]);

    const teamPropagated = propagateTeamResultsToStudents(
      [
        { name: "Đội Rồng Xanh", studentIds: ["s1", "s2"] },
        { name: "Đội Phượng Hoàng", studentIds: ["s3"] },
      ],
      [
        { teamName: "Đội Rồng Xanh", score: 500, correctCount: 5, totalQuestions: 5 },
        { teamName: "Đội Phượng Hoàng", score: 300, correctCount: 3, totalQuestions: 5 },
      ]
    );

    expect(teamPropagated.find((r) => r.studentId === "s1")?.rank).toBe(1);
    expect(teamPropagated.find((r) => r.studentId === "s2")?.rank).toBe(1);
    expect(teamPropagated.find((r) => r.studentId === "s3")?.rank).toBe(3);
  });

  it("handles zero denominators, unnormalized weights, and negative bonus penalties safely", () => {
    const emptyResult = computeLeaderboard([
      {
        studentId: "s1",
        studentCode: "HS001",
        fullName: "An Nguyễn",
        attendances: [],
        homeworks: [],
        gameResults: [],
        pointTransactions: [{ points: -15 }],
      },
    ]);

    expect(emptyResult.rankings[0].totalScore).toBe(0);
    expect(emptyResult.rankings[0].bonusPointsRaw).toBe(-15);
    expect(emptyResult.rankings[0].bonusScore).toBe(0);
    expect(Number.isNaN(emptyResult.rankings[0].totalScore)).toBe(false);

    // Unnormalized weights (20 + 30 + 30 + 0 = 80)
    const weightedResult = computeLeaderboard(
      [
        {
          studentId: "s1",
          studentCode: "HS001",
          fullName: "Học sinh A",
          attendances: [{ status: "PRESENT" }, { status: "PRESENT" }],
          homeworks: [{ status: "GRADED", score: 9, maxScore: 10 }],
          gameResults: [{ score: 400 }],
          pointTransactions: [{ points: 50 }],
        },
        {
          studentId: "s2",
          studentCode: "HS002",
          fullName: "Học sinh B",
          attendances: [{ status: "PRESENT" }, { status: "ABSENT_UNEXCUSED" }],
          homeworks: [{ status: "GRADED", score: 6, maxScore: 10 }],
          gameResults: [{ score: 200 }],
          pointTransactions: [],
        },
      ],
      {
        attendanceWeight: 20,
        homeworkWeight: 30,
        gameWeight: 30,
        bonusWeight: 0,
      }
    );

    // Student A: S_att = 100, S_hw = 90, S_game = 100
    // Normalized weights: att = 0.25, hw = 0.375, game = 0.375
    // Expected = 0.25*100 + 0.375*90 + 0.375*100 = 25 + 33.75 + 37.5 = 96.25
    expect(weightedResult.rankings[0].studentId).toBe("s1");
    expect(weightedResult.rankings[0].totalScore).toBe(96.25);
  });
});
