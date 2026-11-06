"use client";

import React, { useCallback, useEffect, useState } from "react";
import {
  Award,
  BookOpen,
  Calendar,
  CheckCircle2,
  Crown,
  Gamepad2,
  Medal,
  PlusCircle,
  Save,
  Sliders,
  Sparkles,
  Trophy,
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
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

interface RankedStudentEntry {
  rank: number;
  studentId: string;
  studentCode: string;
  fullName: string;
  avatarUrl: string | null;
  classNames: string[];
  attendanceCount: number;
  attendanceScore: number;
  homeworkCount: number;
  homeworkAvgRaw: number;
  homeworkScore: number;
  gameTotalRaw: number;
  gameScore: number;
  bonusPointsRaw: number;
  bonusScore: number;
  totalScore: number;
  student?: {
    id: string;
    studentCode: string;
    fullName: string;
    avatarUrl: string | null;
  };
}

interface LeaderboardConfigItem {
  id: string;
  name: string;
  classId: string | null;
  attendanceWeight: number;
  homeworkWeight: number;
  gameWeight: number;
  bonusWeight: number;
  isDefault: boolean;
}

interface ClassItem {
  id: string;
  code: string;
  name: string;
}

interface StudentItem {
  id: string;
  studentCode: string;
  fullName: string;
}

interface PointTransactionItem {
  id: string;
  studentId: string;
  points: number;
  reason: string;
  category: string;
  awardedAt: string;
  student?: {
    id: string;
    studentCode: string;
    fullName: string;
  };
  class?: {
    id: string;
    code: string;
    name: string;
  };
}

export default function LeaderboardPage() {
  const [rankings, setRankings] = useState<RankedStudentEntry[]>([]);
  const [normalizedWeights, setNormalizedWeights] = useState({
    attendance: 25,
    homework: 35,
    game: 25,
    bonus: 15,
  });
  const [configs, setConfigs] = useState<LeaderboardConfigItem[]>([]);
  const [classes, setClasses] = useState<ClassItem[]>([]);
  const [students, setStudents] = useState<StudentItem[]>([]);
  const [transactions, setTransactions] = useState<PointTransactionItem[]>([]);
  const [loading, setLoading] = useState(true);

  // Filters & Live Weight Sliders
  const [selectedClassId, setSelectedClassId] = useState("");
  const [selectedConfigId, setSelectedConfigId] = useState("");
  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");
  const [wAttendance, setWAttendance] = useState(25);
  const [wHomework, setWHomework] = useState(35);
  const [wGame, setWGame] = useState(25);
  const [wBonus, setWBonus] = useState(15);

  const [banner, setBanner] = useState<{
    type: "success" | "error";
    text: string;
  } | null>(null);

  // Save Config Modal
  const [saveConfigOpen, setSaveConfigOpen] = useState(false);
  const [configName, setConfigName] = useState("");
  const [configIsDefault, setConfigIsDefault] = useState(false);
  const [savingConfig, setSavingConfig] = useState(false);

  // Award Bonus / Penalty Points Modal
  const [awardModalOpen, setAwardModalOpen] = useState(false);
  const [awardStudentId, setAwardStudentId] = useState("");
  const [awardPoints, setAwardPoints] = useState("15");
  const [awardReason, setAwardReason] = useState(
    "Phát biểu xây dựng bài tích cực"
  );
  const [awardCategory, setAwardCategory] = useState("BONUS");
  const [awarding, setAwarding] = useState(false);

  const fetchLeaderboard = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (selectedClassId) params.set("classId", selectedClassId);
      if (selectedConfigId) params.set("configId", selectedConfigId);
      if (fromDate) params.set("from", fromDate);
      if (toDate) params.set("to", toDate);
      params.set("attendanceWeight", String(wAttendance));
      params.set("homeworkWeight", String(wHomework));
      params.set("gameWeight", String(wGame));
      params.set("bonusWeight", String(wBonus));

      const res = await fetch(`/api/leaderboards?${params.toString()}`);
      if (res.ok) {
        const data = await res.json();
        setRankings(Array.isArray(data.rankings) ? data.rankings : []);
        if (data.normalizedWeights) {
          setNormalizedWeights(data.normalizedWeights);
        }
      }
    } catch {
      // ignore non-critical error
    } finally {
      setLoading(false);
    }
  }, [
    selectedClassId,
    selectedConfigId,
    fromDate,
    toDate,
    wAttendance,
    wHomework,
    wGame,
    wBonus,
  ]);

  const fetchAuxiliaryData = useCallback(async () => {
    try {
      const [cfgRes, clsRes, stRes, ptRes] = await Promise.all([
        fetch("/api/leaderboards/configs"),
        fetch("/api/classes"),
        fetch("/api/students"),
        fetch("/api/points"),
      ]);

      if (cfgRes.ok) {
        const cfgData = await cfgRes.json();
        setConfigs(Array.isArray(cfgData.configs) ? cfgData.configs : []);
      }
      if (clsRes.ok) {
        const clsData = await clsRes.json();
        setClasses(Array.isArray(clsData.classes) ? clsData.classes : []);
      }
      if (stRes.ok) {
        const stData = await stRes.json();
        const stList: StudentItem[] = Array.isArray(stData.students)
          ? stData.students
          : [];
        setStudents(stList);
        if (!awardStudentId && stList.length > 0) {
          setAwardStudentId(stList[0].id);
        }
      }
      if (ptRes.ok) {
        const ptData = await ptRes.json();
        setTransactions(
          Array.isArray(ptData.transactions) ? ptData.transactions : []
        );
      }
    } catch {
      // ignore
    }
  }, [awardStudentId]);

  useEffect(() => {
    void fetchAuxiliaryData();
  }, [fetchAuxiliaryData]);

  useEffect(() => {
    void fetchLeaderboard();
  }, [fetchLeaderboard]);

  const handleSelectConfigPreset = (cfgId: string) => {
    setSelectedConfigId(cfgId);
    const found = configs.find((c) => c.id === cfgId);
    if (found) {
      setWAttendance(found.attendanceWeight);
      setWHomework(found.homeworkWeight);
      setWGame(found.gameWeight);
      setWBonus(found.bonusWeight);
      if (found.classId) {
        setSelectedClassId(found.classId);
      }
    }
  };

  const handleSaveConfig = async (e: React.FormEvent) => {
    e.preventDefault();
    setSavingConfig(true);
    try {
      const res = await fetch("/api/leaderboards/configs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: configName.trim() || "Cấu hình xếp hạng tuỳ chỉnh",
          classId: selectedClassId || null,
          attendanceWeight: wAttendance,
          homeworkWeight: wHomework,
          gameWeight: wGame,
          bonusWeight: wBonus,
          isDefault: configIsDefault,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || "Không thể lưu cấu hình");
      }
      setSaveConfigOpen(false);
      setConfigName("");
      setBanner({
        type: "success",
        text: "Đã lưu cấu hình trọng số bảng xếp hạng thành công!",
      });
      await fetchAuxiliaryData();
    } catch (err) {
      setBanner({
        type: "error",
        text: err instanceof Error ? err.message : "Lỗi lưu cấu hình",
      });
    } finally {
      setSavingConfig(false);
    }
  };

  const handleAwardPoints = async (e: React.FormEvent) => {
    e.preventDefault();
    setAwarding(true);
    try {
      const pts = Number(awardPoints);
      const res = await fetch("/api/points", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          studentId: awardStudentId,
          classId: selectedClassId || null,
          points: pts,
          reason: awardReason.trim(),
          category: awardCategory,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || "Không thể ghi nhận điểm thưởng/phạt");
      }
      setAwardModalOpen(false);
      setBanner({
        type: "success",
        text: `Đã ghi nhận ${pts > 0 ? `+${pts}` : pts} điểm thành công!`,
      });
      await Promise.all([fetchLeaderboard(), fetchAuxiliaryData()]);
    } catch (err) {
      setBanner({
        type: "error",
        text: err instanceof Error ? err.message : "Lỗi cộng/trừ điểm",
      });
    } finally {
      setAwarding(false);
    }
  };

  const podiumEntries = rankings.slice(0, 3);

  return (
    <div data-testid="leaderboard-page" className="space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 flex items-center gap-2">
            <Trophy className="h-7 w-7 text-amber-500" />
            Bảng Xếp Hạng Đa Tiêu Chí & Điểm Thưởng
          </h1>
          <p className="text-sm text-slate-500 mt-1">
            Tổng hợp điểm Chuyên cần, Bài tập về nhà, Minigame và Điểm thưởng theo trọng số tuỳ chỉnh
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <Button
            variant="outline"
            data-testid="btn-save-leaderboard-config"
            onClick={() => setSaveConfigOpen(true)}
          >
            <Save className="mr-2 h-4 w-4 text-blue-600" />
            Lưu cấu hình trọng số
          </Button>
          <Button
            data-testid="btn-award-bonus-points"
            onClick={() => setAwardModalOpen(true)}
          >
            <PlusCircle className="mr-2 h-4 w-4" />
            Thưởng / Phạt điểm
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

      {/* Filter & Custom Weight Sliders Card */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <Sliders className="h-4 w-4 text-indigo-600" />
            Bộ lọc Lớp học & Trọng số Xếp hạng Tuỳ chỉnh
          </CardTitle>
          <CardDescription>
            Thay đổi thanh trượt để tính toán lại thứ hạng theo thời gian thực (tự động chuẩn hoá về 100%)
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <div>
              <Label>Lọc theo Lớp học</Label>
              <Select
                data-testid="select-leaderboard-class"
                value={selectedClassId}
                onChange={(e) => setSelectedClassId(e.target.value)}
                className="mt-1"
              >
                <option value="">Tất cả lớp học trong Workspace</option>
                {classes.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name} ({c.code})
                  </option>
                ))}
              </Select>
            </div>

            <div>
              <Label>Mẫu cấu hình đã lưu</Label>
              <Select
                data-testid="select-leaderboard-config"
                value={selectedConfigId}
                onChange={(e) => handleSelectConfigPreset(e.target.value)}
                className="mt-1"
              >
                <option value="">Mặc định (25% - 35% - 25% - 15%)</option>
                {configs.map((cfg) => (
                  <option key={cfg.id} value={cfg.id}>
                    {cfg.name} ({cfg.attendanceWeight}/{cfg.homeworkWeight}/
                    {cfg.gameWeight}/{cfg.bonusWeight})
                  </option>
                ))}
              </Select>
            </div>

            <div>
              <Label>Từ ngày</Label>
              <Input
                type="date"
                value={fromDate}
                onChange={(e) => setFromDate(e.target.value)}
                className="mt-1"
              />
            </div>

            <div>
              <Label>Đến ngày</Label>
              <Input
                type="date"
                value={toDate}
                onChange={(e) => setToDate(e.target.value)}
                className="mt-1"
              />
            </div>
          </div>

          {/* 4 Live Weight Sliders */}
          <div className="grid grid-cols-1 gap-4 rounded-xl border border-slate-200 bg-slate-50 p-4 sm:grid-cols-2 lg:grid-cols-4">
            <div>
              <div className="flex items-center justify-between text-xs font-semibold text-slate-700">
                <span>Chuyên cần (S_att)</span>
                <span className="text-blue-600">
                  {wAttendance} ({normalizedWeights.attendance}%)
                </span>
              </div>
              <input
                type="range"
                min={0}
                max={100}
                value={wAttendance}
                onChange={(e) => setWAttendance(Number(e.target.value))}
                className="mt-2 w-full accent-blue-600"
              />
            </div>

            <div>
              <div className="flex items-center justify-between text-xs font-semibold text-slate-700">
                <span>Bài tập về nhà (S_hw)</span>
                <span className="text-emerald-600">
                  {wHomework} ({normalizedWeights.homework}%)
                </span>
              </div>
              <input
                type="range"
                min={0}
                max={100}
                value={wHomework}
                onChange={(e) => setWHomework(Number(e.target.value))}
                className="mt-2 w-full accent-emerald-600"
              />
            </div>

            <div>
              <div className="flex items-center justify-between text-xs font-semibold text-slate-700">
                <span>Minigame (S_game)</span>
                <span className="text-indigo-600">
                  {wGame} ({normalizedWeights.game}%)
                </span>
              </div>
              <input
                type="range"
                min={0}
                max={100}
                value={wGame}
                onChange={(e) => setWGame(Number(e.target.value))}
                className="mt-2 w-full accent-indigo-600"
              />
            </div>

            <div>
              <div className="flex items-center justify-between text-xs font-semibold text-slate-700">
                <span>Điểm thưởng (S_bonus)</span>
                <span className="text-amber-600">
                  {wBonus} ({normalizedWeights.bonus}%)
                </span>
              </div>
              <input
                type="range"
                min={0}
                max={100}
                value={wBonus}
                onChange={(e) => setWBonus(Number(e.target.value))}
                className="mt-2 w-full accent-amber-600"
              />
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Top 3 Podium */}
      <div
        data-testid="leaderboard-podium"
        className="grid grid-cols-1 gap-4 md:grid-cols-3"
      >
        {podiumEntries.map((entry, idx) => {
          const isFirst = idx === 0;
          return (
            <Card
              key={entry.studentId}
              className={`relative overflow-hidden border-2 transition-all ${
                isFirst
                  ? "border-amber-400 bg-gradient-to-b from-amber-50/70 to-white shadow-md"
                  : idx === 1
                  ? "border-slate-300 bg-gradient-to-b from-slate-50 to-white"
                  : "border-orange-300 bg-gradient-to-b from-orange-50/40 to-white"
              }`}
            >
              <CardContent className="p-5 space-y-3">
                <div className="flex items-center justify-between">
                  <Badge
                    variant={
                      isFirst ? "warning" : idx === 1 ? "secondary" : "default"
                    }
                    className="text-xs font-bold px-2.5 py-1"
                  >
                    {isFirst ? (
                      <span className="flex items-center gap-1">
                        <Crown className="h-3.5 w-3.5" /> Quán Quân - Hạng #
                        {entry.rank}
                      </span>
                    ) : (
                      <span className="flex items-center gap-1">
                        <Medal className="h-3.5 w-3.5" /> Hạng #{entry.rank}
                      </span>
                    )}
                  </Badge>
                  <span className="text-2xl font-extrabold text-slate-900">
                    {entry.totalScore}
                    <span className="text-xs font-normal text-slate-500">
                      /100
                    </span>
                  </span>
                </div>

                <div>
                  <h3 className="text-lg font-bold text-slate-900">
                    {entry.fullName}
                  </h3>
                  <p className="text-xs text-slate-500">
                    Mã HS: {entry.studentCode} •{" "}
                    {entry.classNames.join(", ") || "Đang theo học"}
                  </p>
                </div>

                <div className="grid grid-cols-2 gap-2 pt-1 text-xs">
                  <div className="rounded-md bg-blue-50 px-2.5 py-1.5 text-blue-900">
                    <span className="text-blue-600">Chuyên cần:</span>{" "}
                    <b>{entry.attendanceScore}%</b>
                  </div>
                  <div className="rounded-md bg-emerald-50 px-2.5 py-1.5 text-emerald-900">
                    <span className="text-emerald-600">Bài tập:</span>{" "}
                    <b>{entry.homeworkScore}%</b>
                  </div>
                  <div className="rounded-md bg-indigo-50 px-2.5 py-1.5 text-indigo-900">
                    <span className="text-indigo-600">Minigame:</span>{" "}
                    <b>{entry.gameTotalRaw}đ</b>
                  </div>
                  <div className="rounded-md bg-amber-50 px-2.5 py-1.5 text-amber-900">
                    <span className="text-amber-600">Điểm thưởng:</span>{" "}
                    <b>
                      {entry.bonusPointsRaw >= 0
                        ? `+${entry.bonusPointsRaw}`
                        : entry.bonusPointsRaw}
                    </b>
                  </div>
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>

      {/* Full Ranked Breakdown Table */}
      <Card data-testid="leaderboard-table">
        <CardHeader className="pb-3">
          <CardTitle className="text-lg flex items-center gap-2">
            <Award className="h-5 w-5 text-blue-600" />
            Bảng Xếp Hạng Chi Tiết ({rankings.length} học sinh)
          </CardTitle>
          <CardDescription>
            Điểm thành phần đã chuẩn hoá trên thang 100 và tổng điểm trọng số
          </CardDescription>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="py-8 text-center text-sm text-slate-500">
              Đang tính toán bảng xếp hạng...
            </div>
          ) : rankings.length === 0 ? (
            <div className="py-8 text-center text-sm text-slate-500">
              Không có dữ liệu học sinh phù hợp.
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Hạng</TableHead>
                  <TableHead>Học sinh</TableHead>
                  <TableHead>
                    <span className="flex items-center gap-1">
                      <Calendar className="h-3.5 w-3.5 text-blue-600" />
                      Chuyên cần ({normalizedWeights.attendance}%)
                    </span>
                  </TableHead>
                  <TableHead>
                    <span className="flex items-center gap-1">
                      <BookOpen className="h-3.5 w-3.5 text-emerald-600" />
                      Bài tập ({normalizedWeights.homework}%)
                    </span>
                  </TableHead>
                  <TableHead>
                    <span className="flex items-center gap-1">
                      <Gamepad2 className="h-3.5 w-3.5 text-indigo-600" />
                      Minigame ({normalizedWeights.game}%)
                    </span>
                  </TableHead>
                  <TableHead>
                    <span className="flex items-center gap-1">
                      <Sparkles className="h-3.5 w-3.5 text-amber-500" />
                      Điểm thưởng ({normalizedWeights.bonus}%)
                    </span>
                  </TableHead>
                  <TableHead>Tổng điểm</TableHead>
                  <TableHead className="text-right">Thao tác</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rankings.map((entry) => (
                  <TableRow
                    key={entry.studentId}
                    data-testid={`leaderboard-row-${entry.studentId}`}
                  >
                    <TableCell>
                      <Badge
                        variant={
                          entry.rank === 1
                            ? "warning"
                            : entry.rank <= 3
                            ? "default"
                            : "outline"
                        }
                      >
                        #{entry.rank}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <div className="font-semibold text-slate-900">
                        {entry.fullName}
                      </div>
                      <div className="text-xs text-slate-500">
                        {entry.studentCode} •{" "}
                        {entry.classNames.join(", ") || "Học sinh"}
                      </div>
                    </TableCell>
                    <TableCell>
                      <div className="font-medium text-slate-900">
                        {entry.attendanceScore}/100
                      </div>
                      <div className="text-xs text-slate-500">
                        {entry.attendanceCount} buổi điểm danh
                      </div>
                    </TableCell>
                    <TableCell>
                      <div className="font-medium text-slate-900">
                        {entry.homeworkScore}/100
                      </div>
                      <div className="text-xs text-slate-500">
                        TB {entry.homeworkAvgRaw}/10 ({entry.homeworkCount} bài)
                      </div>
                    </TableCell>
                    <TableCell>
                      <div className="font-medium text-slate-900">
                        {entry.gameScore}/100
                      </div>
                      <div className="text-xs text-slate-500">
                        Tổng {entry.gameTotalRaw} điểm game
                      </div>
                    </TableCell>
                    <TableCell>
                      <div className="font-medium text-slate-900">
                        {entry.bonusScore}/100
                      </div>
                      <div
                        className={`text-xs font-semibold ${
                          entry.bonusPointsRaw >= 0
                            ? "text-emerald-600"
                            : "text-red-600"
                        }`}
                      >
                        {entry.bonusPointsRaw >= 0
                          ? `+${entry.bonusPointsRaw}`
                          : entry.bonusPointsRaw}{" "}
                        điểm
                      </div>
                    </TableCell>
                    <TableCell>
                      <span className="inline-flex items-center rounded-lg bg-slate-900 px-2.5 py-1 text-sm font-bold text-white">
                        {entry.totalScore}
                      </span>
                    </TableCell>
                    <TableCell className="text-right">
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => {
                          setAwardStudentId(entry.studentId);
                          setAwardModalOpen(true);
                        }}
                      >
                        +/- Điểm
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* Recent Point Transactions History */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <CheckCircle2 className="h-4 w-4 text-emerald-600" />
            Nhật ký Cộng / Trừ Điểm Thưởng Gần Đây
          </CardTitle>
        </CardHeader>
        <CardContent>
          {transactions.length === 0 ? (
            <p className="text-sm text-slate-500">
              Chưa có giao dịch điểm thưởng/phạt nào.
            </p>
          ) : (
            <div className="space-y-2">
              {transactions.slice(0, 8).map((tx) => (
                <div
                  key={tx.id}
                  className="flex items-center justify-between rounded-lg border border-slate-200 px-3 py-2 text-sm"
                >
                  <div>
                    <span className="font-semibold text-slate-900">
                      {tx.student?.fullName || tx.studentId}
                    </span>
                    <span className="mx-2 text-slate-400">•</span>
                    <span className="text-slate-600">{tx.reason}</span>
                  </div>
                  <Badge
                    variant={tx.points > 0 ? "success" : "destructive"}
                  >
                    {tx.points > 0 ? `+${tx.points}` : tx.points} điểm
                  </Badge>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Save Leaderboard Config Modal */}
      <Dialog open={saveConfigOpen} onOpenChange={setSaveConfigOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Lưu cấu hình trọng số bảng xếp hạng</DialogTitle>
            <DialogDescription>
              Lưu bộ trọng số hiện tại ({wAttendance} - {wHomework} - {wGame} -{" "}
              {wBonus}) để tái sử dụng nhanh
            </DialogDescription>
          </DialogHeader>

          <form onSubmit={handleSaveConfig} className="space-y-4">
            <div>
              <Label>Tên cấu hình</Label>
              <Input
                data-testid="input-leaderboard-config-name"
                value={configName}
                onChange={(e) => setConfigName(e.target.value)}
                placeholder="VD: Đánh giá thi đua tháng 11"
                className="mt-1"
                required
              />
            </div>

            <label className="flex items-center gap-2 text-sm text-slate-700">
              <input
                type="checkbox"
                checked={configIsDefault}
                onChange={(e) => setConfigIsDefault(e.target.checked)}
              />
              Đặt làm cấu hình mặc định
            </label>

            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                onClick={() => setSaveConfigOpen(false)}
              >
                Huỷ
              </Button>
              <Button
                type="submit"
                data-testid="btn-confirm-save-config"
                disabled={savingConfig}
              >
                {savingConfig ? "Đang lưu..." : "Lưu cấu hình"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Award Bonus / Penalty Points Modal */}
      <Dialog open={awardModalOpen} onOpenChange={setAwardModalOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Thưởng / Phạt Điểm Học Sinh</DialogTitle>
            <DialogDescription>
              Cộng điểm khuyến khích hoặc trừ điểm nhắc nhở trực tiếp vào Bảng xếp hạng
            </DialogDescription>
          </DialogHeader>

          <form onSubmit={handleAwardPoints} className="space-y-4">
            <div>
              <Label>Chọn Học sinh</Label>
              <Select
                data-testid="select-award-student"
                value={awardStudentId}
                onChange={(e) => setAwardStudentId(e.target.value)}
                className="mt-1"
                required
              >
                {students.map((st) => (
                  <option key={st.id} value={st.id}>
                    {st.fullName} ({st.studentCode})
                  </option>
                ))}
              </Select>
            </div>

            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div>
                <Label>Số điểm (+ cộng / - trừ)</Label>
                <Input
                  type="number"
                  data-testid="input-award-points"
                  value={awardPoints}
                  onChange={(e) => setAwardPoints(e.target.value)}
                  className="mt-1"
                  required
                />
              </div>
              <div>
                <Label>Phân loại</Label>
                <Select
                  value={awardCategory}
                  onChange={(e) => setAwardCategory(e.target.value)}
                  className="mt-1"
                >
                  <option value="BONUS">Điểm thưởng (BONUS)</option>
                  <option value="ACHIEVEMENT">Thành tích (ACHIEVEMENT)</option>
                  <option value="PENALTY">Điểm trừ nhắc nhở (PENALTY)</option>
                </Select>
              </div>
            </div>

            <div>
              <Label>Lý do cộng / trừ điểm</Label>
              <Input
                data-testid="input-award-reason"
                value={awardReason}
                onChange={(e) => setAwardReason(e.target.value)}
                placeholder="VD: Phát biểu tích cực, giải bài khó..."
                className="mt-1"
                required
              />
            </div>

            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                onClick={() => setAwardModalOpen(false)}
              >
                Huỷ
              </Button>
              <Button
                type="submit"
                data-testid="btn-confirm-award-points"
                disabled={awarding}
              >
                {awarding ? "Đang lưu..." : "Xác nhận ghi điểm"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
