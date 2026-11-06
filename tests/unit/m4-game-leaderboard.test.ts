import { describe, expect, it } from "vitest";
import {
  MINIGAME_ARCHETYPES,
  calculateGameAccuracy,
  computeGameRankings,
  propagateTeamResultsToStudents,
} from "@/lib/game-engine";
import {
  computeLeaderboard,
  normalizeLeaderboardWeights,
} from "@/lib/leaderboard";
import {
  validateMinigameInput,
  validateQuestionInput,
} from "@/lib/m4-validators";

describe("M4 Unit Tests: Question & Minigame Validators, Game Engine & Leaderboard Engine", () => {
  it("validates MULTIPLE_CHOICE questions and rejects < 2 options or non-matching correctAnswer (T2-27)", () => {
    const valid = validateQuestionInput({
      type: "MULTIPLE_CHOICE",
      subject: "Toán",
      topic: "Căn bậc hai",
      difficulty: "EASY",
      prompt: "Căn bậc hai số học của 25 là bao nhiêu?",
      optionsJson: ["5", "-5", "25"],
      correctAnswer: "A",
      points: 10,
      tags: "toan9, can-bac-hai",
    });

    expect(valid.type).toBe("MULTIPLE_CHOICE");
    expect(valid.optionsJson).toHaveLength(3);
    expect(valid.tagsJson).toEqual(["toan9", "can-bac-hai"]);

    // Reject < 2 options
    expect(() =>
      validateQuestionInput({
        type: "MULTIPLE_CHOICE",
        prompt: "Câu hỏi chỉ có 1 đáp án",
        optionsJson: [{ id: "A", text: "Một" }],
        correctAnswer: "A",
      })
    ).toThrow(/ít nhất 2 lựa chọn/);

    // Reject correctAnswer not matching any option id or text
    expect(() =>
      validateQuestionInput({
        type: "MULTIPLE_CHOICE",
        prompt: "Câu hỏi đáp án lệch",
        optionsJson: [
          { id: "A", text: "10" },
          { id: "B", text: "20" },
        ],
        correctAnswer: "C",
      })
    ).toThrow(/Đáp án đúng phải trùng khớp/);

    // Reject points <= 0
    expect(() =>
      validateQuestionInput({
        type: "SHORT_ANSWER",
        prompt: "Câu hỏi điểm âm",
        correctAnswer: "42",
        points: 0,
      })
    ).toThrow(/lớn hơn 0/);
  });

  it("validates all 5 minigame archetypes and rejects invalid timeLimit / pointsPerQuestion (F32)", () => {
    expect(MINIGAME_ARCHETYPES).toHaveLength(5);
    const codes = MINIGAME_ARCHETYPES.map((a) => a.type);
    expect(codes).toEqual([
      "SPEED_QUIZ",
      "FLASH_MATCH",
      "WORD_CROSS",
      "TEAM_BUZZER",
      "LUCKY_WHEEL",
    ]);

    for (const code of codes) {
      const validated = validateMinigameInput({
        title: `Game ${code}`,
        type: code,
      });
      expect(validated.type).toBe(code);
      expect(validated.timeLimit).toBeGreaterThan(0);
      expect(validated.pointsPerQuestion).toBeGreaterThan(0);
    }

    expect(() =>
      validateMinigameInput({
        title: "Invalid Time",
        type: "SPEED_QUIZ",
        timeLimit: 0,
      })
    ).toThrow(/timeLimit/);
  });

  it("computes 1224 competition rankings for tied game scores and propagates team scores to members (T2-29, C4.1)", () => {
    const ranked = computeGameRankings([
      { studentId: "st-3", score: 250, bonusPoints: 0, correctCount: 2, totalQuestions: 4 },
      { studentId: "st-1", score: 300, bonusPoints: 50, correctCount: 3, totalQuestions: 4 },
      { studentId: "st-2", score: 350, bonusPoints: 0, correctCount: 3, totalQuestions: 4 },
    ]);

    // st-1 (350, 75%) and st-2 (350, 75%) tie at rank 1; st-3 gets rank 3 ("1224" competition rank)
    expect(ranked[0].rank).toBe(1);
    expect(ranked[1].rank).toBe(1);
    expect(ranked[2].rank).toBe(3);
    expect(ranked[2].studentId).toBe("st-3");

    // Team score propagation
    const teamRanked = propagateTeamResultsToStudents(
      [
        { name: "Đội Rồng Xanh", studentIds: ["s1", "s2"] },
        { name: "Đội Phượng Hoàng", studentIds: ["s3", "s4"] },
      ],
      [
        { teamName: "Đội Rồng Xanh", score: 500, correctCount: 5, totalQuestions: 5, bonusPoints: 50 },
        { teamName: "Đội Phượng Hoàng", score: 300, correctCount: 3, totalQuestions: 5, bonusPoints: 0 },
      ]
    );

    expect(teamRanked).toHaveLength(4);
    expect(teamRanked[0].rank).toBe(1);
    expect(teamRanked[1].rank).toBe(1);
    expect(teamRanked[2].rank).toBe(3);
    expect(teamRanked[3].rank).toBe(3);
    expect(calculateGameAccuracy(3, 4)).toBe(75);
  });

  it("computes multi-criteria leaderboard safely across zero-activity, negative bonus points, and multi-scale homeworks (T2-30, T2-31, C3.3)", () => {
    expect(() =>
      normalizeLeaderboardWeights({
        attendanceWeight: 0,
        homeworkWeight: 0,
        gameWeight: 0,
        bonusWeight: 0,
      })
    ).toThrow(/lớn hơn 0/);

    const result = computeLeaderboard(
      [
        {
          studentId: "s-active",
          studentCode: "HS001",
          fullName: "Nguyễn Văn An",
          attendances: [{ status: "PRESENT" }, { status: "LATE" }], // (1 + 0.75)/2 = 87.5
          homeworks: [
            { status: "GRADED", score: 8, maxScore: 10 }, // 80%
            { status: "GRADED", score: 90, maxScore: 100 }, // 90%
            { status: "MISSING", score: null, maxScore: 20, isOverdue: true }, // 0%
          ], // avg = (80 + 90 + 0)/3 = 56.67
          gameResults: [{ score: 400, bonusPoints: 100 }], // 500 -> 100%
          pointTransactions: [{ points: 50 }], // 50/100 = 50%
        },
        {
          studentId: "s-zero-and-penalty",
          studentCode: "HS002",
          fullName: "Trần Thị Bình",
          attendances: [],
          homeworks: [],
          gameResults: [],
          pointTransactions: [{ points: -40 }], // clamped to 0
        },
      ],
      {
        attendanceWeight: 25,
        homeworkWeight: 35,
        gameWeight: 25,
        bonusWeight: 15,
      }
    );

    expect(result.rankings).toHaveLength(2);
    const top = result.rankings[0];
    const second = result.rankings[1];

    expect(top.studentId).toBe("s-active");
    expect(top.attendanceScore).toBe(87.5);
    expect(top.homeworkScore).toBeCloseTo(56.67, 2);
    expect(top.gameScore).toBe(100);
    expect(top.bonusScore).toBe(50);

    expect(second.studentId).toBe("s-zero-and-penalty");
    expect(second.bonusPointsRaw).toBe(-40);
    expect(second.bonusScore).toBe(0);
    expect(second.totalScore).toBe(0);
    expect(Number.isNaN(second.totalScore)).toBe(false);
  });
});
