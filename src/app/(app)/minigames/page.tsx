"use client";

import React, { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  Clock,
  Copy,
  Edit3,
  Gamepad2,
  Play,
  Plus,
  Sparkles,
  Trash2,
  Trophy,
  Users,
  Zap,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  MINIGAME_ARCHETYPES,
  type MinigameArchetypeCode,
} from "@/lib/game-engine";

interface MinigameItem {
  id: string;
  title: string;
  type: MinigameArchetypeCode;
  description: string | null;
  timeLimit: number;
  pointsPerQuestion: number;
  rulesJson: Record<string, unknown> | null;
  questionIdsJson: string[] | null;
  tagsJson: string[] | null;
  questionCount?: number;
  _count?: {
    gameSessions: number;
  };
}

interface QuestionItem {
  id: string;
  prompt: string;
  subject: string;
  topic: string;
  difficulty: string;
  points: number;
}

interface ClassItem {
  id: string;
  code: string;
  name: string;
  subject: string;
}

interface GameSessionHistoryItem {
  id: string;
  title: string;
  mode: "INDIVIDUAL" | "TEAM";
  status: "LOBBY" | "IN_PROGRESS" | "COMPLETED" | "CANCELLED";
  startedAt: string;
  endedAt: string | null;
  class?: {
    id: string;
    code: string;
    name: string;
  };
  minigame?: {
    id: string;
    title: string;
    type: MinigameArchetypeCode;
  };
  results?: Array<{
    id: string;
    rank: number;
    score: number;
    student?: {
      id: string;
      fullName: string;
    };
  }>;
}

export default function MinigamesBankPage() {
  const router = useRouter();
  const [minigames, setMinigames] = useState<MinigameItem[]>([]);
  const [questions, setQuestions] = useState<QuestionItem[]>([]);
  const [classes, setClasses] = useState<ClassItem[]>([]);
  const [gameSessions, setGameSessions] = useState<GameSessionHistoryItem[]>(
    []
  );
  const [loading, setLoading] = useState(true);

  const [typeFilter, setTypeFilter] = useState<string>("");
  const [searchQuery, setSearchQuery] = useState<string>("");
  const [banner, setBanner] = useState<{
    type: "success" | "error";
    text: string;
  } | null>(null);

  // Create / Edit Minigame Modal
  const [createOpen, setCreateOpen] = useState(false);
  const [editingMinigame, setEditingMinigame] = useState<MinigameItem | null>(
    null
  );
  const [formTitle, setFormTitle] = useState("");
  const [formType, setFormType] = useState<MinigameArchetypeCode>("SPEED_QUIZ");
  const [formDescription, setFormDescription] = useState("");
  const [formTimeLimit, setFormTimeLimit] = useState("30");
  const [formPoints, setFormPoints] = useState("100");
  const [selectedQuestionIds, setSelectedQuestionIds] = useState<string[]>([]);
  const [savingMinigame, setSavingMinigame] = useState(false);

  // Launch GameSession Modal
  const [launchOpen, setLaunchOpen] = useState(false);
  const [launchMinigameId, setLaunchMinigameId] = useState("");
  const [launchClassId, setLaunchClassId] = useState("");
  const [launchTitle, setLaunchTitle] = useState("");
  const [launchMode, setLaunchMode] = useState<"INDIVIDUAL" | "TEAM">(
    "INDIVIDUAL"
  );
  const [launching, setLaunching] = useState(false);

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const mgParams = new URLSearchParams();
      if (typeFilter) mgParams.set("type", typeFilter);
      if (searchQuery.trim()) mgParams.set("q", searchQuery.trim());

      const [mgRes, qRes, clsRes, gsRes] = await Promise.all([
        fetch(`/api/minigames?${mgParams.toString()}`),
        fetch("/api/questions"),
        fetch("/api/classes"),
        fetch("/api/game-sessions"),
      ]);

      if (mgRes.ok) {
        const mgData = await mgRes.json();
        const list: MinigameItem[] = Array.isArray(mgData.minigames)
          ? mgData.minigames
          : [];
        setMinigames(list);
        if (!launchMinigameId && list.length > 0) {
          setLaunchMinigameId(list[0].id);
        }
      }

      if (qRes.ok) {
        const qData = await qRes.json();
        setQuestions(Array.isArray(qData.questions) ? qData.questions : []);
      }

      if (clsRes.ok) {
        const clsData = await clsRes.json();
        const clsList: ClassItem[] = Array.isArray(clsData.classes)
          ? clsData.classes
          : [];
        setClasses(clsList);
        if (!launchClassId && clsList.length > 0) {
          setLaunchClassId(clsList[0].id);
        }
      }

      if (gsRes.ok) {
        const gsData = await gsRes.json();
        setGameSessions(
          Array.isArray(gsData.gameSessions) ? gsData.gameSessions : []
        );
      }
    } catch {
      // ignore non-critical load error
    } finally {
      setLoading(false);
    }
  }, [typeFilter, searchQuery, launchMinigameId, launchClassId]);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  const openCreateMinigameModal = (presetType?: MinigameArchetypeCode) => {
    const chosenType = presetType || "SPEED_QUIZ";
    const meta = MINIGAME_ARCHETYPES.find((a) => a.type === chosenType);
    setEditingMinigame(null);
    setFormTitle("");
    setFormType(chosenType);
    setFormDescription(meta?.description || "");
    setFormTimeLimit(String(meta?.defaultTimeLimit ?? 30));
    setFormPoints(String(meta?.defaultPointsPerQuestion ?? 100));
    setSelectedQuestionIds(questions.slice(0, 4).map((q) => q.id));
    setCreateOpen(true);
  };

  const openEditMinigameModal = (mg: MinigameItem) => {
    setEditingMinigame(mg);
    setFormTitle(mg.title);
    setFormType(mg.type);
    setFormDescription(mg.description || "");
    setFormTimeLimit(String(mg.timeLimit));
    setFormPoints(String(mg.pointsPerQuestion));
    setSelectedQuestionIds(
      Array.isArray(mg.questionIdsJson)
        ? mg.questionIdsJson.map((id) => String(id))
        : []
    );
    setCreateOpen(true);
  };

  const handleSaveMinigame = async (e: React.FormEvent) => {
    e.preventDefault();
    setSavingMinigame(true);
    try {
      const payload = {
        title: formTitle.trim(),
        type: formType,
        description: formDescription.trim() || null,
        timeLimit: Number(formTimeLimit),
        pointsPerQuestion: Number(formPoints),
        questionIdsJson: selectedQuestionIds,
      };

      const url = editingMinigame
        ? `/api/minigames/${editingMinigame.id}`
        : "/api/minigames";
      const method = editingMinigame ? "PATCH" : "POST";

      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || "Không thể lưu Minigame");
      }

      setCreateOpen(false);
      setBanner({
        type: "success",
        text: editingMinigame
          ? "Đã cập nhật mẫu Minigame!"
          : "Đã tạo Minigame mới thành công!",
      });
      await loadData();
    } catch (err) {
      setBanner({
        type: "error",
        text: err instanceof Error ? err.message : "Lỗi khi lưu Minigame",
      });
    } finally {
      setSavingMinigame(false);
    }
  };

  const handleCloneMinigame = async (mg: MinigameItem) => {
    try {
      const res = await fetch("/api/minigames", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ cloneFromId: mg.id }),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || "Không thể nhân bản Minigame");
      }
      setBanner({
        type: "success",
        text: `Đã nhân bản "${mg.title}"!`,
      });
      await loadData();
    } catch (err) {
      setBanner({
        type: "error",
        text: err instanceof Error ? err.message : "Lỗi khi nhân bản",
      });
    }
  };

  const handleDeleteMinigame = async (mg: MinigameItem) => {
    try {
      const res = await fetch(`/api/minigames/${mg.id}`, {
        method: "DELETE",
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Không thể xoá Minigame");
      }
      setBanner({
        type: "success",
        text: "Đã xoá Minigame khỏi kho.",
      });
      await loadData();
    } catch (err) {
      setBanner({
        type: "error",
        text: err instanceof Error ? err.message : "Lỗi khi xoá Minigame",
      });
    }
  };

  const openLaunchGameModal = (mg?: MinigameItem) => {
    if (mg) {
      setLaunchMinigameId(mg.id);
      setLaunchTitle(mg.title);
      setLaunchMode(mg.type === "TEAM_BUZZER" ? "TEAM" : "INDIVIDUAL");
    } else if (minigames.length > 0 && !launchMinigameId) {
      setLaunchMinigameId(minigames[0].id);
      setLaunchTitle(minigames[0].title);
    }
    if (classes.length > 0 && !launchClassId) {
      setLaunchClassId(classes[0].id);
    }
    setLaunchOpen(true);
  };

  const handleLaunchGameSession = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!launchMinigameId || !launchClassId) return;
    setLaunching(true);
    try {
      const res = await fetch("/api/game-sessions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          minigameId: launchMinigameId,
          classId: launchClassId,
          title: launchTitle.trim() || undefined,
          mode: launchMode,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || "Không thể khởi tạo phiên chơi");
      }
      setLaunchOpen(false);
      router.push(`/minigames/play/${data.gameSession.id}`);
    } catch (err) {
      setBanner({
        type: "error",
        text: err instanceof Error ? err.message : "Lỗi khi bắt đầu phiên chơi",
      });
    } finally {
      setLaunching(false);
    }
  };

  const toggleQuestionSelection = (qId: string) => {
    setSelectedQuestionIds((prev) =>
      prev.includes(qId) ? prev.filter((id) => id !== qId) : [...prev, qId]
    );
  };

  return (
    <div data-testid="minigames-page" className="space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 flex items-center gap-2">
            <Gamepad2 className="h-7 w-7 text-indigo-600" />
            Kho Minigame & Trò Chơi Lớp Học
          </h1>
          <p className="text-sm text-slate-500 mt-1">
            Thiết kế trò chơi tương tác 5 thể loại và trình chiếu trực tiếp trên màn hình lớp học
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <Button
            variant="outline"
            data-testid="btn-start-game-session"
            onClick={() => openLaunchGameModal()}
          >
            <Play className="mr-2 h-4 w-4 text-emerald-600" />
            Tổ chức chơi ngay
          </Button>
          <Button
            data-testid="btn-create-minigame"
            onClick={() => openCreateMinigameModal()}
          >
            <Plus className="mr-2 h-4 w-4" />
            Tạo Minigame mới
          </Button>
        </div>
      </div>

      {banner && (
        <div
          className={`flex items-center justify-between rounded-lg border px-4 py-3 text-sm ${
            banner.type === "success"
              ? "border-emerald-200 bg-emerald-50 text-emerald-800"
              : "border-red-200 bg-red-50 text-red-800"
          }`}
        >
          <span>{banner.text}</span>
          <button
            type="button"
            onClick={() => setBanner(null)}
            className="text-xs font-medium underline ml-4"
          >
            Đóng
          </button>
        </div>
      )}

      {/* 5 Game Archetypes Catalog Showcase */}
      <div className="space-y-3">
        <h2 className="text-sm font-semibold uppercase tracking-wider text-slate-500 flex items-center gap-1.5">
          <Sparkles className="h-4 w-4 text-amber-500" />5 Thể Loại Trò Chơi Tương Tác Chuẩn
        </h2>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-5">
          {MINIGAME_ARCHETYPES.map((arch) => (
            <Card
              key={arch.type}
              data-testid={`archetype-card-${arch.type}`}
              className={`cursor-pointer border transition-all hover:border-indigo-400 hover:shadow-sm ${
                typeFilter === arch.type
                  ? "border-indigo-600 bg-indigo-50/40"
                  : ""
              }`}
              onClick={() =>
                setTypeFilter((prev) => (prev === arch.type ? "" : arch.type))
              }
            >
              <CardContent className="p-4 space-y-2">
                <div className="flex items-center justify-between">
                  <Badge variant="default">{arch.shortLabel}</Badge>
                  <span className="text-xs text-slate-500">
                    {arch.defaultTimeLimit}s
                  </span>
                </div>
                <div className="font-semibold text-sm text-slate-900">
                  {arch.name}
                </div>
                <p className="text-xs text-slate-500 line-clamp-2">
                  {arch.description}
                </p>
              </CardContent>
            </Card>
          ))}
        </div>
      </div>

      {/* Filter & Search Bar */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <Input
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          placeholder="Tìm kiếm Minigame theo tên hoặc mô tả..."
          className="sm:max-w-sm"
        />
        <Select
          value={typeFilter}
          onChange={(e) => setTypeFilter(e.target.value)}
          className="sm:w-64"
        >
          <option value="">Tất cả 5 thể loại Minigame</option>
          {MINIGAME_ARCHETYPES.map((a) => (
            <option key={a.type} value={a.type}>
              {a.name}
            </option>
          ))}
        </Select>
      </div>

      {/* Minigame Templates Grid */}
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
        {loading ? (
          <Card className="col-span-full">
            <CardContent className="p-8 text-center text-sm text-slate-500">
              Đang tải kho Minigame...
            </CardContent>
          </Card>
        ) : minigames.length === 0 ? (
          <Card className="col-span-full">
            <CardContent className="p-8 text-center text-sm text-slate-500">
              Chưa có Minigame nào phù hợp. Hãy bấm &ldquo;Tạo Minigame mới&rdquo; để thiết kế trò chơi!
            </CardContent>
          </Card>
        ) : (
          minigames.map((mg) => {
            const archMeta = MINIGAME_ARCHETYPES.find(
              (a) => a.type === mg.type
            );
            const qCount =
              mg.questionCount ??
              (Array.isArray(mg.questionIdsJson)
                ? mg.questionIdsJson.length
                : 0);

            return (
              <Card
                key={mg.id}
                data-testid={`minigame-card-${mg.id}`}
                className="flex flex-col justify-between transition-shadow hover:shadow-md"
              >
                <CardHeader className="pb-3">
                  <div className="flex items-center justify-between gap-2">
                    <Badge variant="secondary">
                      {archMeta?.shortLabel || mg.type}
                    </Badge>
                    <span className="text-xs font-medium text-indigo-600 flex items-center gap-1">
                      <Zap className="h-3.5 w-3.5" />
                      {mg.pointsPerQuestion} điểm/câu
                    </span>
                  </div>
                  <CardTitle className="mt-2 text-lg">{mg.title}</CardTitle>
                  <CardDescription className="line-clamp-2">
                    {mg.description || archMeta?.description}
                  </CardDescription>
                </CardHeader>

                <CardContent className="pb-3">
                  <div className="flex items-center gap-4 text-xs text-slate-600">
                    <span className="flex items-center gap-1">
                      <Clock className="h-3.5 w-3.5 text-slate-400" />
                      {mg.timeLimit} giây/câu
                    </span>
                    <span>•</span>
                    <span>{qCount} câu hỏi liên kết</span>
                    <span>•</span>
                    <span>{mg._count?.gameSessions ?? 0} lượt tổ chức</span>
                  </div>
                </CardContent>

                <CardFooter className="flex flex-wrap items-center justify-between gap-2 border-t border-slate-100 pt-3">
                  <Button
                    size="sm"
                    data-testid={`btn-play-minigame-${mg.id}`}
                    onClick={() => openLaunchGameModal(mg)}
                  >
                    <Play className="mr-1.5 h-3.5 w-3.5" />
                    Chơi ngay
                  </Button>

                  <div className="flex items-center gap-1">
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => openEditMinigameModal(mg)}
                      title="Chỉnh sửa"
                    >
                      <Edit3 className="h-4 w-4" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => void handleCloneMinigame(mg)}
                      title="Nhân bản"
                    >
                      <Copy className="h-4 w-4" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => void handleDeleteMinigame(mg)}
                      title="Xoá"
                      className="text-red-600 hover:text-red-700"
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </CardFooter>
              </Card>
            );
          })
        )}
      </div>

      {/* Recent Game Sessions History */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg flex items-center gap-2">
            <Trophy className="h-5 w-5 text-amber-500" />
            Lịch sử phiên chơi trực tiếp gần đây
          </CardTitle>
          <CardDescription>
            Theo dõi các phiên trò chơi đã và đang diễn ra tại các lớp học
          </CardDescription>
        </CardHeader>
        <CardContent>
          {gameSessions.length === 0 ? (
            <p className="text-sm text-slate-500">
              Chưa có phiên chơi nào được ghi nhận.
            </p>
          ) : (
            <div className="space-y-3">
              {gameSessions.slice(0, 10).map((gs) => (
                <div
                  key={gs.id}
                  data-testid={`game-session-row-${gs.id}`}
                  className="flex flex-col justify-between gap-3 rounded-lg border border-slate-200 p-3 sm:flex-row sm:items-center"
                >
                  <div className="space-y-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-semibold text-slate-900">
                        {gs.title}
                      </span>
                      <Badge
                        variant={
                          gs.status === "COMPLETED" ? "success" : "warning"
                        }
                      >
                        {gs.status === "COMPLETED"
                          ? "Đã hoàn thành"
                          : "Đang diễn ra"}
                      </Badge>
                      <Badge variant="outline">
                        {gs.mode === "TEAM" ? (
                          <span className="flex items-center gap-1">
                            <Users className="h-3 w-3" /> Thi đấu Đội
                          </span>
                        ) : (
                          "Cá nhân"
                        )}
                      </Badge>
                    </div>
                    <div className="text-xs text-slate-500">
                      Lớp: {gs.class?.name || "N/A"} • Minigame:{" "}
                      {gs.minigame?.title || "N/A"} •{" "}
                      {gs.results?.length ?? 0} học sinh có điểm
                    </div>
                  </div>

                  <Link href={`/minigames/play/${gs.id}`}>
                    <Button variant="outline" size="sm">
                      {gs.status === "COMPLETED"
                        ? "Xem kết quả & Màn chiếu"
                        : "Mở màn chiếu trực tiếp"}
                    </Button>
                  </Link>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Create / Edit Minigame Modal */}
      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>
              {editingMinigame
                ? "Chỉnh sửa Minigame"
                : "Thiết kế Minigame lớp học mới"}
            </DialogTitle>
            <DialogDescription>
              Chọn thể loại trò chơi, thời gian mỗi câu và liên kết bộ câu hỏi từ Ngân hàng đề
            </DialogDescription>
          </DialogHeader>

          <form onSubmit={handleSaveMinigame} className="space-y-4">
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div>
                <Label>Tên Minigame</Label>
                <Input
                  data-testid="input-minigame-title"
                  value={formTitle}
                  onChange={(e) => setFormTitle(e.target.value)}
                  placeholder="VD: Đấu Trường Tốc Độ 9A"
                  className="mt-1"
                  required
                />
              </div>

              <div>
                <Label>Thể loại trò chơi (Archetype)</Label>
                <Select
                  data-testid="input-minigame-type"
                  value={formType}
                  onChange={(e) =>
                    setFormType(e.target.value as MinigameArchetypeCode)
                  }
                  className="mt-1"
                >
                  {MINIGAME_ARCHETYPES.map((a) => (
                    <option key={a.type} value={a.type}>
                      {a.name}
                    </option>
                  ))}
                </Select>
              </div>
            </div>

            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div>
                <Label>Thời gian mỗi câu (giây)</Label>
                <Input
                  type="number"
                  min={5}
                  data-testid="input-minigame-timelimit"
                  value={formTimeLimit}
                  onChange={(e) => setFormTimeLimit(e.target.value)}
                  className="mt-1"
                  required
                />
              </div>
              <div>
                <Label>Điểm thưởng mỗi câu</Label>
                <Input
                  type="number"
                  min={10}
                  data-testid="input-minigame-points"
                  value={formPoints}
                  onChange={(e) => setFormPoints(e.target.value)}
                  className="mt-1"
                  required
                />
              </div>
            </div>

            <div>
              <Label>Mô tả luật chơi / Ghi chú</Label>
              <Input
                value={formDescription}
                onChange={(e) => setFormDescription(e.target.value)}
                placeholder="Mô tả ngắn gọn về trò chơi..."
                className="mt-1"
              />
            </div>

            <div>
              <Label>
                Chọn câu hỏi liên kết ({selectedQuestionIds.length} câu đã chọn)
              </Label>
              <div className="mt-1 max-h-48 overflow-y-auto rounded-lg border border-slate-200 p-2 space-y-1.5">
                {questions.map((q) => {
                  const checked = selectedQuestionIds.includes(q.id);
                  return (
                    <label
                      key={q.id}
                      className={`flex cursor-pointer items-start gap-2 rounded-md p-2 text-xs ${
                        checked ? "bg-indigo-50 text-indigo-950" : "hover:bg-slate-50"
                      }`}
                    >
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={() => toggleQuestionSelection(q.id)}
                        className="mt-0.5"
                      />
                      <div className="flex-1">
                        <div className="font-medium">{q.prompt}</div>
                        <div className="text-slate-500">
                          {q.subject} • {q.topic} • {q.points}đ
                        </div>
                      </div>
                    </label>
                  );
                })}
              </div>
            </div>

            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                onClick={() => setCreateOpen(false)}
              >
                Huỷ
              </Button>
              <Button
                type="submit"
                data-testid="btn-save-minigame"
                disabled={savingMinigame}
              >
                {savingMinigame ? "Đang lưu..." : "Lưu Minigame"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Launch Game Session Modal */}
      <Dialog open={launchOpen} onOpenChange={setLaunchOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Tổ chức phiên chơi trực tiếp trên lớp</DialogTitle>
            <DialogDescription>
              Khởi tạo màn hình trình chiếu tương tác và bảng điểm trực tiếp cho lớp học
            </DialogDescription>
          </DialogHeader>

          <form onSubmit={handleLaunchGameSession} className="space-y-4">
            <div>
              <Label>Chọn Minigame</Label>
              <Select
                data-testid="select-launch-minigame"
                value={launchMinigameId}
                onChange={(e) => setLaunchMinigameId(e.target.value)}
                className="mt-1"
                required
              >
                {minigames.map((mg) => (
                  <option key={mg.id} value={mg.id}>
                    {mg.title}
                  </option>
                ))}
              </Select>
            </div>

            <div>
              <Label>Chọn Lớp học tham gia</Label>
              <Select
                data-testid="select-launch-class"
                value={launchClassId}
                onChange={(e) => setLaunchClassId(e.target.value)}
                className="mt-1"
                required
              >
                {classes.map((cls) => (
                  <option key={cls.id} value={cls.id}>
                    {cls.name} ({cls.code})
                  </option>
                ))}
              </Select>
            </div>

            <div>
              <Label>Tiêu đề phiên chơi (tuỳ chọn)</Label>
              <Input
                value={launchTitle}
                onChange={(e) => setLaunchTitle(e.target.value)}
                placeholder="VD: Đấu trường cuối giờ Toán 9A"
                className="mt-1"
              />
            </div>

            <div>
              <Label>Chế độ thi đấu</Label>
              <Select
                data-testid="select-launch-mode"
                value={launchMode}
                onChange={(e) =>
                  setLaunchMode(e.target.value as "INDIVIDUAL" | "TEAM")
                }
                className="mt-1"
              >
                <option value="INDIVIDUAL">Thi đấu Cá nhân (Individual)</option>
                <option value="TEAM">Thi đấu Theo đội (Team Mode)</option>
              </Select>
            </div>

            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                onClick={() => setLaunchOpen(false)}
              >
                Huỷ
              </Button>
              <Button
                type="submit"
                data-testid="btn-confirm-launch-game"
                disabled={launching}
              >
                {launching ? "Đang khởi tạo..." : "Bắt đầu trình chiếu"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
