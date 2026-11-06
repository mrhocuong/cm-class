export type MinigameArchetypeCode =
  | "SPEED_QUIZ"
  | "FLASH_MATCH"
  | "WORD_CROSS"
  | "TEAM_BUZZER"
  | "LUCKY_WHEEL";

export interface MinigameArchetypeMeta {
  type: MinigameArchetypeCode;
  name: string;
  shortLabel: string;
  description: string;
  defaultTimeLimit: number;
  defaultPointsPerQuestion: number;
  defaultRules: Record<string, unknown>;
}

export const MINIGAME_ARCHETYPES: readonly MinigameArchetypeMeta[] = [
  {
    type: "SPEED_QUIZ",
    name: "Trắc nghiệm tốc độ (Speed Quiz)",
    shortLabel: "Trắc nghiệm tốc độ",
    description:
      "Học sinh trả lời nhanh câu hỏi trắc nghiệm theo đồng hồ đếm ngược, cộng điểm chuỗi trả lời đúng.",
    defaultTimeLimit: 30,
    defaultPointsPerQuestion: 100,
    defaultRules: { streakBonus: true, streakStep: 20 },
  },
  {
    type: "FLASH_MATCH",
    name: "Ghép cặp nhanh (Flash Match)",
    shortLabel: "Ghép cặp thẻ",
    description:
      "Lật thẻ và ghép cặp câu hỏi - đáp án tương ứng trên bảng tương tác.",
    defaultTimeLimit: 45,
    defaultPointsPerQuestion: 100,
    defaultRules: { pairCount: 6 },
  },
  {
    type: "WORD_CROSS",
    name: "Giải ô chữ / Từ khoá (Word Cross)",
    shortLabel: "Giải ô chữ",
    description:
      "Đoán các hàng ngang từ gợi ý kiến thức để mở từ khoá bí mật của bài học.",
    defaultTimeLimit: 40,
    defaultPointsPerQuestion: 120,
    defaultRules: { revealHintCost: 20 },
  },
  {
    type: "TEAM_BUZZER",
    name: "Ai nhanh hơn - Chuông đội (Team Buzzer)",
    shortLabel: "Chuông đội",
    description:
      "Các đội bấm chuông giành quyền trả lời nhanh câu hỏi trên màn hình chiếu.",
    defaultTimeLimit: 25,
    defaultPointsPerQuestion: 150,
    defaultRules: { penaltyPoints: 25, teamCount: 3 },
  },
  {
    type: "LUCKY_WHEEL",
    name: "Vòng quay may mắn (Lucky Wheel)",
    shortLabel: "Vòng quay may mắn",
    description:
      "Trả lời đúng câu hỏi để quay vòng quay điểm thưởng ngẫu nhiên hoặc nhân đôi điểm.",
    defaultTimeLimit: 30,
    defaultPointsPerQuestion: 100,
    defaultRules: {
      wheelSegments: [50, 100, 150, 200, 300, 500],
    },
  },
] as const;

export interface RawGameParticipantResult {
  studentId: string;
  teamName?: string | null;
  score: number;
  correctCount?: number;
  totalQuestions?: number;
  bonusPoints?: number;
}

export interface RankedGameParticipantResult {
  studentId: string;
  teamName: string | null;
  score: number;
  bonusPoints: number;
  totalEffectiveScore: number;
  correctCount: number;
  totalQuestions: number;
  accuracy: number;
  rank: number;
}

export function calculateGameAccuracy(
  correctCount: number,
  totalQuestions: number
): number {
  if (!totalQuestions || totalQuestions <= 0) return 100;
  const clampedCorrect = Math.max(0, Math.min(totalQuestions, correctCount));
  return Math.round((clampedCorrect / totalQuestions) * 1000) / 10;
}

/**
 * Sorts participants by (score + bonusPoints) DESC, then accuracy DESC,
 * and assigns standard competition ranks ("1224").
 */
export function computeGameRankings(
  inputs: RawGameParticipantResult[]
): RankedGameParticipantResult[] {
  const prepared = inputs.map((item) => {
    const score = Number(item.score) || 0;
    const bonusPoints = Number(item.bonusPoints) || 0;
    const correctCount = Math.max(0, Math.round(Number(item.correctCount) || 0));
    const totalQuestions = Math.max(
      0,
      Math.round(Number(item.totalQuestions) || 0)
    );
    const accuracy = calculateGameAccuracy(correctCount, totalQuestions);
    return {
      studentId: item.studentId,
      teamName: item.teamName ?? null,
      score,
      bonusPoints,
      totalEffectiveScore: score + bonusPoints,
      correctCount,
      totalQuestions,
      accuracy,
      rank: 1,
    };
  });

  prepared.sort((a, b) => {
    if (b.totalEffectiveScore !== a.totalEffectiveScore) {
      return b.totalEffectiveScore - a.totalEffectiveScore;
    }
    if (b.accuracy !== a.accuracy) {
      return b.accuracy - a.accuracy;
    }
    return a.studentId.localeCompare(b.studentId);
  });

  for (let i = 0; i < prepared.length; i++) {
    if (i === 0) {
      prepared[i].rank = 1;
    } else {
      const prev = prepared[i - 1];
      const curr = prepared[i];
      if (
        curr.totalEffectiveScore === prev.totalEffectiveScore &&
        curr.accuracy === prev.accuracy
      ) {
        curr.rank = prev.rank;
      } else {
        curr.rank = i + 1;
      }
    }
  }

  return prepared;
}

export interface TeamDefinitionInput {
  name: string;
  studentIds: string[];
}

export interface TeamScoreInput {
  teamName: string;
  score: number;
  correctCount?: number;
  totalQuestions?: number;
  bonusPoints?: number;
}

/**
 * Propagates team scores to every member student in each team and computes competition ranks.
 */
export function propagateTeamResultsToStudents(
  teams: TeamDefinitionInput[],
  teamScores: TeamScoreInput[]
): RankedGameParticipantResult[] {
  const scoreMap = new Map<string, TeamScoreInput>();
  for (const ts of teamScores) {
    scoreMap.set(ts.teamName.trim().toLowerCase(), ts);
  }

  const studentInputs: RawGameParticipantResult[] = [];
  const seenStudents = new Set<string>();

  for (const team of teams) {
    const matchedScore = scoreMap.get(team.name.trim().toLowerCase());
    for (const studentId of team.studentIds) {
      if (seenStudents.has(studentId)) continue;
      seenStudents.add(studentId);
      studentInputs.push({
        studentId,
        teamName: team.name,
        score: matchedScore?.score ?? 0,
        correctCount: matchedScore?.correctCount ?? 0,
        totalQuestions: matchedScore?.totalQuestions ?? 0,
        bonusPoints: matchedScore?.bonusPoints ?? 0,
      });
    }
  }

  return computeGameRankings(studentInputs);
}
