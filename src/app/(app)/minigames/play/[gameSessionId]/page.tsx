"use client";

import React, { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import {
  ArrowLeft,
  Award,
  Bell,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Clock,
  Eye,
  Gamepad2,
  Pause,
  Play,
  RotateCcw,
  Sparkles,
  Trophy,
  Users,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  MINIGAME_ARCHETYPES,
  type MinigameArchetypeCode,
} from "@/lib/game-engine";

interface SnapshotOption {
  id: string;
  text: string;
}

interface SnapshotQuestion {
  id: string;
  type: string;
  subject: string;
  topic: string;
  difficulty: string;
  prompt: string;
  optionsJson: SnapshotOption[] | null;
  correctAnswer: string;
  explanation: string | null;
  points: number;
}

interface StudentInfo {
  id: string;
  studentCode: string;
  fullName: string;
  avatarUrl: string | null;
}

interface GameResultItem {
  id: string;
  studentId: string;
  teamName: string | null;
  score: number;
  correctCount: number;
  totalQuestions: number;
  accuracy: number;
  rank: number;
  bonusPoints: number;
  student?: StudentInfo;
}

interface TeamConfigItem {
  name: string;
  studentIds: string[];
}

interface GameSessionDetail {
  id: string;
  title: string;
  mode: "INDIVIDUAL" | "TEAM";
  status: "LOBBY" | "IN_PROGRESS" | "COMPLETED" | "CANCELLED";
  questionsSnapshotJson: SnapshotQuestion[];
  teamsConfigJson: TeamConfigItem[] | null;
  stateJson: Record<string, unknown> | null;
  startedAt: string;
  endedAt: string | null;
  class?: {
    id: string;
    code: string;
    name: string;
    subject: string;
    enrollments?: Array<{
      id: string;
      student: StudentInfo;
    }>;
  };
  minigame?: {
    id: string;
    title: string;
    type: MinigameArchetypeCode;
    timeLimit: number;
    pointsPerQuestion: number;
    rulesJson: Record<string, unknown> | null;
  };
  results?: GameResultItem[];
}

export default function LiveGameProjectorPage() {
  const params = useParams<{ gameSessionId: string }>();
  const gameSessionId = params?.gameSessionId || "";

  const [gameSession, setGameSession] = useState<GameSessionDetail | null>(
    null
  );
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Interactive Stage State
  const [currentQuestionIdx, setCurrentQuestionIdx] = useState(0);
  const [answerRevealed, setAnswerRevealed] = useState(false);
  const [timerSeconds, setTimerSeconds] = useState(30);
  const [timerRunning, setTimerRunning] = useState(false);
  const [studentScores, setStudentScores] = useState<
    Record<string, { score: number; correctCount: number; bonusPoints: number }>
  >({});
  const [teamScores, setTeamScores] = useState<
    Record<string, { score: number; correctCount: number; bonusPoints: number }>
  >({});
  const [wheelPrize, setWheelPrize] = useState<number | null>(null);
  const [buzzerWinner, setBuzzerWinner] = useState<string | null>(null);
  const [matchedQuestionIds, setMatchedQuestionIds] = useState<string[]>([]);
  const [finishing, setFinishing] = useState(false);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);

  const loadGameSession = useCallback(async () => {
    if (!gameSessionId) return;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/game-sessions/${gameSessionId}`);
      const data = await res.json();
      if (!res.ok || !data.gameSession) {
        throw new Error(data.error || "Không tìm thấy phiên chơi");
      }

      const gs: GameSessionDetail = data.gameSession;
      setGameSession(gs);

      const state = gs.stateJson || {};
      if (typeof state.currentQuestionIndex === "number") {
        setCurrentQuestionIdx(state.currentQuestionIndex);
      }
      if (typeof state.answerRevealed === "boolean") {
        setAnswerRevealed(state.answerRevealed);
      }
      setTimerSeconds(gs.minigame?.timeLimit || 30);
      if (typeof state.wheelLastPrize === "number") {
        setWheelPrize(state.wheelLastPrize);
      }

      // Initialize student scores from existing results or enrollments
      const initStudentScores: Record<
        string,
        { score: number; correctCount: number; bonusPoints: number }
      > = {};

      for (const enr of gs.class?.enrollments || []) {
        initStudentScores[enr.student.id] = {
          score: 0,
          correctCount: 0,
          bonusPoints: 0,
        };
      }
      for (const r of gs.results || []) {
        initStudentScores[r.studentId] = {
          score: r.score,
          correctCount: r.correctCount,
          bonusPoints: r.bonusPoints,
        };
      }
      setStudentScores(initStudentScores);

      // Initialize team scores
      const teams = Array.isArray(gs.teamsConfigJson)
        ? gs.teamsConfigJson
        : [
            { name: "Đội Rồng Xanh", studentIds: [] },
            { name: "Đội Phượng Hoàng", studentIds: [] },
          ];
      const initTeamScores: Record<
        string,
        { score: number; correctCount: number; bonusPoints: number }
      > = {};
      for (const t of teams) {
        initTeamScores[t.name] = {
          score: 0,
          correctCount: 0,
          bonusPoints: 0,
        };
      }
      setTeamScores(initTeamScores);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Lỗi tải phiên chơi");
    } finally {
      setLoading(false);
    }
  }, [gameSessionId]);

  useEffect(() => {
    void loadGameSession();
  }, [loadGameSession]);

  // Countdown timer effect
  useEffect(() => {
    if (!timerRunning) return;
    const interval = setInterval(() => {
      setTimerSeconds((prev) => {
        if (prev <= 1) {
          setTimerRunning(false);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
    return () => clearInterval(interval);
  }, [timerRunning]);

  const syncLiveState = async (patchState: Record<string, unknown>) => {
    if (!gameSessionId) return;
    try {
      await fetch(`/api/game-sessions/${gameSessionId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          stateJson: patchState,
        }),
      });
    } catch {
      // non-blocking state sync
    }
  };

  if (loading) {
    return (
      <div className="p-8 text-center text-slate-500">
        Đang tải màn chiếu trò chơi trực tiếp...
      </div>
    );
  }

  if (error || !gameSession) {
    return (
      <Card>
        <CardContent className="p-8 text-center space-y-3">
          <p className="text-red-600 font-medium">
            {error || "Không tìm thấy phiên chơi"}
          </p>
          <Link href="/minigames">
            <Button variant="outline">Quay lại Kho Minigame</Button>
          </Link>
        </CardContent>
      </Card>
    );
  }

  const questions: SnapshotQuestion[] = Array.isArray(
    gameSession.questionsSnapshotJson
  )
    ? gameSession.questionsSnapshotJson
    : [];
  const safeIdx =
    questions.length > 0
      ? Math.min(Math.max(0, currentQuestionIdx), questions.length - 1)
      : 0;
  const currentQuestion = questions[safeIdx] || null;
  const archetypeType = gameSession.minigame?.type || "SPEED_QUIZ";
  const archetypeMeta = MINIGAME_ARCHETYPES.find(
    (a) => a.type === archetypeType
  );
  const pointsPerQuestion = gameSession.minigame?.pointsPerQuestion || 100;

  // Build unique roster of students from enrollments + results
  const rosterMap = new Map<string, StudentInfo>();
  for (const enr of gameSession.class?.enrollments || []) {
    rosterMap.set(enr.student.id, enr.student);
  }
  for (const r of gameSession.results || []) {
    if (r.student) {
      rosterMap.set(r.student.id, r.student);
    }
  }
  const rosterStudents = Array.from(rosterMap.values());

  const handlePrevQuestion = () => {
    const nextIdx = Math.max(0, safeIdx - 1);
    setCurrentQuestionIdx(nextIdx);
    setAnswerRevealed(false);
    setTimerSeconds(gameSession.minigame?.timeLimit || 30);
    void syncLiveState({
      currentQuestionIndex: nextIdx,
      answerRevealed: false,
    });
  };

  const handleNextQuestion = () => {
    const nextIdx = Math.min(questions.length - 1, safeIdx + 1);
    setCurrentQuestionIdx(nextIdx);
    setAnswerRevealed(false);
    setTimerSeconds(gameSession.minigame?.timeLimit || 30);
    void syncLiveState({
      currentQuestionIndex: nextIdx,
      answerRevealed: false,
    });
  };

  const handleRevealAnswer = () => {
    const nextVal = !answerRevealed;
    setAnswerRevealed(nextVal);
    void syncLiveState({
      currentQuestionIndex: safeIdx,
      answerRevealed: nextVal,
    });
  };

  const handleSpinWheel = () => {
    const segments = [50, 100, 150, 200, 300, 500];
    const prize = segments[Math.floor(Math.random() * segments.length)];
    setWheelPrize(prize);
    void syncLiveState({ wheelLastPrize: prize });
  };

  const adjustStudentScore = (studentId: string, delta: number, isCorrect = false) => {
    setStudentScores((prev) => {
      const curr = prev[studentId] || {
        score: 0,
        correctCount: 0,
        bonusPoints: 0,
      };
      return {
        ...prev,
        [studentId]: {
          ...curr,
          score: Math.max(0, curr.score + delta),
          correctCount: isCorrect ? curr.correctCount + 1 : curr.correctCount,
        },
      };
    });
  };

  const adjustTeamScore = (teamName: string, delta: number, isCorrect = false) => {
    setTeamScores((prev) => {
      const curr = prev[teamName] || {
        score: 0,
        correctCount: 0,
        bonusPoints: 0,
      };
      return {
        ...prev,
        [teamName]: {
          ...curr,
          score: Math.max(0, curr.score + delta),
          correctCount: isCorrect ? curr.correctCount + 1 : curr.correctCount,
        },
      };
    });
  };

  const handleFinishGameSession = async () => {
    setFinishing(true);
    setStatusMessage(null);
    try {
      const compiledResults = rosterStudents.map((st) => {
        const sc = studentScores[st.id] || {
          score: 0,
          correctCount: 0,
          bonusPoints: 0,
        };
        return {
          studentId: st.id,
          score: sc.score,
          correctCount: sc.correctCount,
          totalQuestions: questions.length || 1,
          bonusPoints: sc.bonusPoints,
        };
      });

      const teams = Array.isArray(gameSession.teamsConfigJson)
        ? gameSession.teamsConfigJson
        : [];
      const compiledTeamResults = teams.map((t) => {
        const tsc = teamScores[t.name] || {
          score: 0,
          correctCount: 0,
          bonusPoints: 0,
        };
        return {
          teamName: t.name,
          studentIds: t.studentIds,
          score: tsc.score,
          correctCount: tsc.correctCount,
          totalQuestions: questions.length || 1,
          bonusPoints: tsc.bonusPoints,
        };
      });

      const res = await fetch(`/api/game-sessions/${gameSession.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          status: "COMPLETED",
          results: compiledResults,
          ...(compiledTeamResults.length > 0
            ? { teamResults: compiledTeamResults }
            : {}),
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || "Không thể kết thúc phiên chơi");
      }

      setGameSession(data.gameSession);
      setStatusMessage(
        "Đã kết thúc phiên chơi và lưu kết quả xếp hạng thành công!"
      );
    } catch (err) {
      setStatusMessage(
        err instanceof Error ? err.message : "Lỗi khi lưu kết quả"
      );
    } finally {
      setFinishing(false);
    }
  };

  return (
    <div data-testid="live-game-projector-page" className="space-y-6">
      {/* Projector Top Header Bar */}
      <div className="flex flex-col gap-4 rounded-xl bg-slate-900 p-5 text-white shadow-lg lg:flex-row lg:items-center lg:justify-between">
        <div className="space-y-1">
          <div className="flex flex-wrap items-center gap-2">
            <Link href="/minigames">
              <Button
                variant="ghost"
                size="sm"
                className="text-slate-300 hover:bg-slate-800 hover:text-white"
              >
                <ArrowLeft className="mr-1 h-4 w-4" />
                Kho Minigame
              </Button>
            </Link>
            <Badge variant="default">
              {archetypeMeta?.name || archetypeType}
            </Badge>
            <Badge
              variant={
                gameSession.status === "COMPLETED" ? "success" : "warning"
              }
            >
              {gameSession.status === "COMPLETED"
                ? "Đã hoàn thành"
                : "Đang trình chiếu trực tiếp"}
            </Badge>
            <Badge variant="secondary">
              {gameSession.mode === "TEAM" ? "Thi đấu Đội" : "Thi đấu Cá nhân"}
            </Badge>
          </div>

          <h1 className="text-2xl font-bold tracking-tight">
            {gameSession.title}
          </h1>
          <p className="text-xs text-slate-300">
            Minigame: {gameSession.minigame?.title || gameSession.title} • Lớp:{" "}
            {gameSession.class?.name || "N/A"} • Câu {safeIdx + 1}/
            {Math.max(1, questions.length)}
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          {/* Timer Control */}
          <div className="flex items-center gap-2 rounded-lg bg-slate-800 px-3 py-2">
            <Clock className="h-5 w-5 text-amber-400" />
            <span className="font-mono text-xl font-bold text-amber-300">
              {timerSeconds}s
            </span>
            <Button
              size="sm"
              variant="ghost"
              className="text-white hover:bg-slate-700"
              onClick={() => setTimerRunning((r) => !r)}
            >
              {timerRunning ? (
                <Pause className="h-4 w-4" />
              ) : (
                <Play className="h-4 w-4" />
              )}
            </Button>
            <Button
              size="sm"
              variant="ghost"
              className="text-white hover:bg-slate-700"
              onClick={() => {
                setTimerRunning(false);
                setTimerSeconds(gameSession.minigame?.timeLimit || 30);
              }}
            >
              <RotateCcw className="h-4 w-4" />
            </Button>
          </div>

          <Button
            variant="success"
            data-testid="btn-finish-game-session"
            disabled={finishing}
            onClick={() => void handleFinishGameSession()}
          >
            <CheckCircle2 className="mr-2 h-4 w-4" />
            {finishing ? "Đang lưu..." : "Kết thúc & Lưu kết quả"}
          </Button>
        </div>
      </div>

      {statusMessage && (
        <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-medium text-emerald-800">
          {statusMessage}
        </div>
      )}

      {/* Main Split Layout: Stage on Left (2 cols) + Live Scoreboard on Right (1 col) */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        {/* Main Projector Stage */}
        <div className="space-y-6 lg:col-span-2">
          {/* Current Question Card */}
          <Card className="border-2 border-indigo-200 shadow-md">
            <CardHeader className="bg-indigo-50/60 pb-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <Badge variant="default">
                    Câu hỏi {safeIdx + 1} / {Math.max(1, questions.length)}
                  </Badge>
                  {currentQuestion && (
                    <>
                      <Badge variant="secondary">
                        {currentQuestion.subject}
                      </Badge>
                      <Badge variant="outline">{currentQuestion.topic}</Badge>
                    </>
                  )}
                </div>
                <span className="text-sm font-bold text-indigo-700">
                  +{currentQuestion?.points || pointsPerQuestion} điểm
                </span>
              </div>

              <CardTitle className="mt-3 text-xl leading-relaxed text-slate-900">
                {currentQuestion
                  ? currentQuestion.prompt
                  : "Chưa có câu hỏi trong phiên chơi này"}
              </CardTitle>
            </CardHeader>

            <CardContent className="p-6 space-y-5">
              {/* Multiple Choice Options or Prompt Display */}
              {currentQuestion &&
                Array.isArray(currentQuestion.optionsJson) &&
                currentQuestion.optionsJson.length > 0 && (
                  <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                    {currentQuestion.optionsJson.map((opt, idx) => {
                      const optId = opt.id || String.fromCharCode(65 + idx);
                      const isCorrect =
                        optId.toLowerCase() ===
                          currentQuestion.correctAnswer.toLowerCase() ||
                        String(opt.text).toLowerCase() ===
                          currentQuestion.correctAnswer.toLowerCase();

                      return (
                        <div
                          key={optId}
                          className={`flex items-center gap-3 rounded-xl border-2 p-4 text-base font-medium transition-all ${
                            answerRevealed && isCorrect
                              ? "border-emerald-500 bg-emerald-50 text-emerald-950 shadow-sm"
                              : "border-slate-200 bg-white text-slate-800"
                          }`}
                        >
                          <span
                            className={`inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-sm font-bold ${
                              answerRevealed && isCorrect
                                ? "bg-emerald-600 text-white"
                                : "bg-indigo-100 text-indigo-800"
                            }`}
                          >
                            {optId}
                          </span>
                          <span className="flex-1">{opt.text}</span>
                          {answerRevealed && isCorrect && (
                            <CheckCircle2 className="h-5 w-5 text-emerald-600" />
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}

              {answerRevealed && currentQuestion && (
                <div className="rounded-xl border border-emerald-300 bg-emerald-50 p-4 text-emerald-950 space-y-1">
                  <div className="font-bold">
                    Đáp án đúng: {currentQuestion.correctAnswer}
                  </div>
                  {currentQuestion.explanation && (
                    <div className="text-sm text-emerald-800">
                      Giải thích: {currentQuestion.explanation}
                    </div>
                  )}
                </div>
              )}

              {/* Archetype Interactive Controls */}
              {archetypeType === "LUCKY_WHEEL" && (
                <div className="flex flex-wrap items-center justify-between gap-4 rounded-xl border border-amber-200 bg-amber-50 p-4">
                  <div className="flex items-center gap-2">
                    <Sparkles className="h-5 w-5 text-amber-600" />
                    <div>
                      <div className="font-semibold text-amber-950">
                        Vòng Quay May Mắn (Lucky Wheel)
                      </div>
                      <div className="text-xs text-amber-800">
                        Quay vòng quay để nhận điểm thưởng ngẫu nhiên cho câu trả lời đúng!
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    {wheelPrize !== null && (
                      <Badge variant="warning" className="text-sm px-3 py-1">
                        Ô thưởng: +{wheelPrize} điểm!
                      </Badge>
                    )}
                    <Button
                      size="sm"
                      data-testid="btn-spin-wheel"
                      onClick={handleSpinWheel}
                    >
                      Quay vòng quay may mắn
                    </Button>
                  </div>
                </div>
              )}

              {archetypeType === "TEAM_BUZZER" && (
                <div className="rounded-xl border border-indigo-200 bg-indigo-50/70 p-4 space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="font-semibold text-sm text-indigo-950 flex items-center gap-1.5">
                      <Bell className="h-4 w-4 text-indigo-600" />
                      Chuông Đội Giành Quyền Trả Lời
                    </span>
                    {buzzerWinner && (
                      <Badge variant="success">
                        Đội bấm chuông: {buzzerWinner}
                      </Badge>
                    )}
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {Object.keys(teamScores).map((tName) => (
                      <Button
                        key={tName}
                        size="sm"
                        variant={
                          buzzerWinner === tName ? "default" : "outline"
                        }
                        onClick={() => setBuzzerWinner(tName)}
                      >
                        🔔 {tName} bấm chuông!
                      </Button>
                    ))}
                  </div>
                </div>
              )}

              {archetypeType === "FLASH_MATCH" && (
                <div className="rounded-xl border border-blue-200 bg-blue-50/50 p-4 space-y-2">
                  <div className="text-sm font-semibold text-blue-950">
                    Bảng Ghép Cặp Thẻ Nhanh (Flash Match)
                  </div>
                  <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                    {questions.map((q) => {
                      const matched = matchedQuestionIds.includes(q.id);
                      return (
                        <button
                          key={q.id}
                          type="button"
                          onClick={() =>
                            setMatchedQuestionIds((prev) =>
                              prev.includes(q.id)
                                ? prev.filter((id) => id !== q.id)
                                : [...prev, q.id]
                            )
                          }
                          className={`rounded-lg border p-2.5 text-left text-xs transition-all ${
                            matched
                              ? "border-emerald-400 bg-emerald-100 text-emerald-950"
                              : "border-slate-200 bg-white hover:border-blue-400"
                          }`}
                        >
                          <div className="font-semibold">{q.prompt}</div>
                          <div className="mt-1 text-emerald-700">
                            ↔ Đáp án: {q.correctAnswer}
                          </div>
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* Stage Navigation Bar */}
              <div className="flex flex-wrap items-center justify-between gap-2 border-t border-slate-200 pt-4">
                <div className="flex items-center gap-2">
                  <Button
                    variant="outline"
                    data-testid="btn-prev-question"
                    disabled={safeIdx <= 0}
                    onClick={handlePrevQuestion}
                  >
                    <ChevronLeft className="mr-1 h-4 w-4" />
                    Câu trước
                  </Button>
                  <Button
                    variant="outline"
                    data-testid="btn-next-question"
                    disabled={safeIdx >= questions.length - 1}
                    onClick={handleNextQuestion}
                  >
                    Câu tiếp theo
                    <ChevronRight className="ml-1 h-4 w-4" />
                  </Button>
                </div>

                <Button
                  variant="secondary"
                  data-testid="btn-reveal-answer"
                  onClick={handleRevealAnswer}
                >
                  <Eye className="mr-2 h-4 w-4" />
                  {answerRevealed ? "Ẩn đáp án" : "Hiện đáp án"}
                </Button>
              </div>
            </CardContent>
          </Card>

          {/* All Snapshot Questions Overview (ensures all snapshot prompts are rendered and accessible) */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base flex items-center gap-2">
                <Gamepad2 className="h-4 w-4 text-indigo-600" />
                Danh sách câu hỏi trong phiên chơi ({questions.length} câu)
              </CardTitle>
              <CardDescription>
                Bản chụp (snapshot) câu hỏi được lưu cố định cho phiên chơi này
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-2">
                {questions.map((q, idx) => (
                  <div
                    key={q.id || idx}
                    onClick={() => {
                      setCurrentQuestionIdx(idx);
                      setAnswerRevealed(false);
                    }}
                    className={`flex cursor-pointer items-center justify-between rounded-lg border px-3 py-2 text-sm transition-colors ${
                      idx === safeIdx
                        ? "border-indigo-500 bg-indigo-50 font-semibold text-indigo-950"
                        : "border-slate-200 hover:bg-slate-50"
                    }`}
                  >
                    <div className="flex items-center gap-2">
                      <span className="inline-flex h-6 w-6 items-center justify-center rounded-full bg-slate-200 text-xs font-bold">
                        {idx + 1}
                      </span>
                      <span>{q.prompt}</span>
                    </div>
                    <Badge variant="outline">{q.points}đ</Badge>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Right Column: Live Scoreboard & Final Rankings */}
        <div className="space-y-6">
          {/* Ranked Results Card (when results exist) */}
          {gameSession.results && gameSession.results.length > 0 && (
            <Card className="border-amber-300 bg-amber-50/30">
              <CardHeader className="pb-3">
                <CardTitle className="text-base flex items-center gap-2">
                  <Trophy className="h-5 w-5 text-amber-500" />
                  Bảng Xếp Hạng Kết Quả Phiên Chơi
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                {gameSession.results.map((r) => (
                  <div
                    key={r.id}
                    data-testid={`game-result-row-${r.studentId}`}
                    className="flex items-center justify-between rounded-lg border border-amber-200 bg-white px-3 py-2 text-sm"
                  >
                    <div className="flex items-center gap-2">
                      <Badge
                        variant={r.rank === 1 ? "warning" : "secondary"}
                      >
                        Hạng #{r.rank}
                      </Badge>
                      <div>
                        <div className="font-semibold text-slate-900">
                          {r.student?.fullName || r.studentId}
                        </div>
                        {r.teamName && (
                          <div className="text-xs text-slate-500">
                            {r.teamName} • Chính xác {r.accuracy}%
                          </div>
                        )}
                      </div>
                    </div>
                    <div className="text-right">
                      <div className="font-bold text-indigo-700">
                        {r.score + (r.bonusPoints || 0)} điểm
                      </div>
                      <div className="text-xs text-slate-500">
                        Đúng {r.correctCount}/{r.totalQuestions}
                      </div>
                    </div>
                  </div>
                ))}
              </CardContent>
            </Card>
          )}

          {/* Team Scoreboard Controls (when in TEAM mode) */}
          {gameSession.mode === "TEAM" && (
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base flex items-center gap-2">
                  <Users className="h-4 w-4 text-indigo-600" />
                  Bảng điểm các Đội thi đấu
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                {Object.entries(teamScores).map(([teamName, tsc]) => (
                  <div
                    key={teamName}
                    className="flex items-center justify-between rounded-lg border border-slate-200 p-3"
                  >
                    <div>
                      <div className="font-semibold text-slate-900">
                        {teamName}
                      </div>
                      <div className="text-xs text-indigo-600 font-bold">
                        {tsc.score} điểm ({tsc.correctCount} câu đúng)
                      </div>
                    </div>
                    <div className="flex items-center gap-1">
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() =>
                          adjustTeamScore(teamName, pointsPerQuestion, true)
                        }
                      >
                        +{pointsPerQuestion}
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => adjustTeamScore(teamName, -25, false)}
                      >
                        -25
                      </Button>
                    </div>
                  </div>
                ))}
              </CardContent>
            </Card>
          )}

          {/* Individual Student Live Scoreboard */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base flex items-center gap-2">
                <Award className="h-4 w-4 text-emerald-600" />
                Bảng điểm Học sinh ({rosterStudents.length})
              </CardTitle>
              <CardDescription>
                Cộng điểm nhanh khi học sinh trả lời đúng trên lớp
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-2 max-h-96 overflow-y-auto">
              {rosterStudents.map((st) => {
                const sc = studentScores[st.id] || {
                  score: 0,
                  correctCount: 0,
                  bonusPoints: 0,
                };
                return (
                  <div
                    key={st.id}
                    className="flex items-center justify-between rounded-lg border border-slate-200 px-3 py-2 text-sm"
                  >
                    <div>
                      <div className="font-medium text-slate-900">
                        {st.fullName}
                      </div>
                      <div className="text-xs text-slate-500">
                        {st.studentCode} • {sc.score} điểm ({sc.correctCount}{" "}
                        câu đúng)
                      </div>
                    </div>
                    <div className="flex items-center gap-1">
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() =>
                          adjustStudentScore(st.id, pointsPerQuestion, true)
                        }
                      >
                        +{pointsPerQuestion}
                      </Button>
                    </div>
                  </div>
                );
              })}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
