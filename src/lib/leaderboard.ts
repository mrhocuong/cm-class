export interface LeaderboardWeightsInput {
  attendanceWeight: number;
  homeworkWeight: number;
  gameWeight: number;
  bonusWeight: number;
}

export interface LeaderboardRulesOptions {
  lateWeight?: number;     // default 0.75
  excusedWeight?: number;  // default 0.5
  bonusCap?: number;       // default 100
}

export interface StudentAttendanceInput {
  status: "PRESENT" | "LATE" | "ABSENT_EXCUSED" | "ABSENT_UNEXCUSED";
}

export interface StudentHomeworkInput {
  status: "MISSING" | "SUBMITTED" | "LATE" | "GRADED";
  score: number | null;
  maxScore: number;
  isOverdue?: boolean;
}

export interface StudentGameInput {
  score: number;
  bonusPoints?: number;
}

export interface StudentPointTransactionInput {
  points: number;
}

export interface LeaderboardStudentRecordInput {
  studentId: string;
  studentCode: string;
  fullName: string;
  avatarUrl?: string | null;
  classNames?: string[];
  attendances: StudentAttendanceInput[];
  homeworks: StudentHomeworkInput[];
  gameResults: StudentGameInput[];
  pointTransactions: StudentPointTransactionInput[];
}

export interface LeaderboardRankedEntry {
  rank: number;
  studentId: string;
  studentCode: string;
  fullName: string;
  avatarUrl: string | null;
  classNames: string[];
  attendanceCount: number;
  attendanceScore: number;      // S_att in [0, 100]
  homeworkCount: number;
  homeworkAvgRaw: number;       // Average raw 10-point scale
  homeworkScore: number;        // S_hw in [0, 100]
  gameTotalRaw: number;         // G_raw
  gameScore: number;            // S_game in [0, 100]
  bonusPointsRaw: number;       // B_raw (can be negative)
  bonusScore: number;           // S_bonus in [0, 100]
  totalScore: number;           // S_total in [0, 100]
}

export interface LeaderboardComputationResult {
  rankings: LeaderboardRankedEntry[];
  normalizedWeights: {
    attendance: number;
    homework: number;
    game: number;
    bonus: number;
  };
  cohortMaxGameRaw: number;
  effectiveBonusCap: number;
}

function round2(val: number): number {
  if (!Number.isFinite(val)) return 0;
  return Math.round(val * 100) / 100;
}

function clamp(val: number, min: number, max: number): number {
  if (!Number.isFinite(val)) return min;
  return Math.max(min, Math.min(max, val));
}

export function normalizeLeaderboardWeights(
  weights: LeaderboardWeightsInput
): {
  attendance: number;
  homework: number;
  game: number;
  bonus: number;
} {
  const wAtt = Math.max(0, Number(weights.attendanceWeight) || 0);
  const wHw = Math.max(0, Number(weights.homeworkWeight) || 0);
  const wGame = Math.max(0, Number(weights.gameWeight) || 0);
  const wBonus = Math.max(0, Number(weights.bonusWeight) || 0);

  const sum = wAtt + wHw + wGame + wBonus;
  if (sum <= 0) {
    throw new Error("Tổng trọng số xếp hạng phải lớn hơn 0");
  }

  return {
    attendance: wAtt / sum,
    homework: wHw / sum,
    game: wGame / sum,
    bonus: wBonus / sum,
  };
}

export function computeLeaderboard(
  students: LeaderboardStudentRecordInput[],
  weights: LeaderboardWeightsInput = {
    attendanceWeight: 25,
    homeworkWeight: 35,
    gameWeight: 25,
    bonusWeight: 15,
  },
  rules?: LeaderboardRulesOptions
): LeaderboardComputationResult {
  const normWeights = normalizeLeaderboardWeights(weights);
  const lateWeight = rules?.lateWeight ?? 0.75;
  const excusedWeight = rules?.excusedWeight ?? 0.5;
  const baseBonusCap = Math.max(1, rules?.bonusCap ?? 100);

  // First pass: compute raw totals per student to find cohort max game score & bonus cap
  const intermediate = students.map((student) => {
    // 1. Attendance
    const nSess = student.attendances.length;
    let attPoints = 0;
    for (const att of student.attendances) {
      if (att.status === "PRESENT") attPoints += 1.0;
      else if (att.status === "LATE") attPoints += lateWeight;
      else if (att.status === "ABSENT_EXCUSED") attPoints += excusedWeight;
    }
    const sAtt = nSess > 0 ? clamp((attPoints / nSess) * 100, 0, 100) : 0;

    // 2. Homework
    const evaluatedHws = student.homeworks.filter(
      (hw) =>
        (hw.score !== null && hw.score !== undefined && hw.maxScore > 0) ||
        (hw.status === "MISSING" && hw.isOverdue !== false)
    );
    const nHw = evaluatedHws.length;
    let hwPercentSum = 0;
    let hwRaw10Sum = 0;
    for (const hw of evaluatedHws) {
      if (hw.score !== null && hw.score !== undefined && hw.maxScore > 0) {
        const pct = clamp((hw.score / hw.maxScore) * 100, 0, 100);
        hwPercentSum += pct;
        hwRaw10Sum += (pct / 100) * 10;
      }
    }
    const sHw = nHw > 0 ? clamp(hwPercentSum / nHw, 0, 100) : 0;
    const hwAvgRaw = nHw > 0 ? round2(hwRaw10Sum / nHw) : 0;

    // 3. Game raw score
    let gameRaw = 0;
    for (const gr of student.gameResults) {
      gameRaw += (Number(gr.score) || 0) + (Number(gr.bonusPoints) || 0);
    }
    gameRaw = Math.max(0, gameRaw);

    // 4. Bonus raw points
    let bonusRaw = 0;
    for (const pt of student.pointTransactions) {
      bonusRaw += Number(pt.points) || 0;
    }

    return {
      student,
      nSess,
      sAtt: round2(sAtt),
      nHw,
      hwAvgRaw,
      sHw: round2(sHw),
      gameRaw: round2(gameRaw),
      bonusRaw: round2(bonusRaw),
    };
  });

  const cohortMaxGameRaw = intermediate.reduce(
    (max, item) => Math.max(max, item.gameRaw),
    0
  );
  const maxBonusRaw = intermediate.reduce(
    (max, item) => Math.max(max, item.bonusRaw),
    0
  );
  const effectiveBonusCap = Math.max(baseBonusCap, maxBonusRaw);

  const entries: LeaderboardRankedEntry[] = intermediate.map((item) => {
    const sGame =
      cohortMaxGameRaw > 0
        ? round2(clamp((item.gameRaw / cohortMaxGameRaw) * 100, 0, 100))
        : 0;

    const sBonus =
      effectiveBonusCap > 0
        ? round2(
            clamp(
              (Math.max(0, item.bonusRaw) / effectiveBonusCap) * 100,
              0,
              100
            )
          )
        : 0;

    const composite =
      normWeights.attendance * item.sAtt +
      normWeights.homework * item.sHw +
      normWeights.game * sGame +
      normWeights.bonus * sBonus;

    const totalScore = round2(clamp(composite, 0, 100));

    return {
      rank: 1,
      studentId: item.student.studentId,
      studentCode: item.student.studentCode,
      fullName: item.student.fullName,
      avatarUrl: item.student.avatarUrl ?? null,
      classNames: item.student.classNames ?? [],
      attendanceCount: item.nSess,
      attendanceScore: item.sAtt,
      homeworkCount: item.nHw,
      homeworkAvgRaw: item.hwAvgRaw,
      homeworkScore: item.sHw,
      gameTotalRaw: item.gameRaw,
      gameScore: sGame,
      bonusPointsRaw: item.bonusRaw,
      bonusScore: sBonus,
      totalScore,
    };
  });

  // Sort by totalScore DESC, then fullName ASC
  entries.sort((a, b) => {
    if (b.totalScore !== a.totalScore) {
      return b.totalScore - a.totalScore;
    }
    return a.fullName.localeCompare(b.fullName, "vi");
  });

  // Assign competition rank (1224)
  for (let i = 0; i < entries.length; i++) {
    if (i === 0) {
      entries[i].rank = 1;
    } else if (entries[i].totalScore === entries[i - 1].totalScore) {
      entries[i].rank = entries[i - 1].rank;
    } else {
      entries[i].rank = i + 1;
    }
  }

  return {
    rankings: entries,
    normalizedWeights: {
      attendance: round2(normWeights.attendance * 100),
      homework: round2(normWeights.homework * 100),
      game: round2(normWeights.game * 100),
      bonus: round2(normWeights.bonus * 100),
    },
    cohortMaxGameRaw,
    effectiveBonusCap,
  };
}
