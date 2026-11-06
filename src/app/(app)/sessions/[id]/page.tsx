"use client";

import React, { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import {
  ArrowLeft,
  BookOpen,
  Camera,
  CheckCircle2,
  Clock,
  Gamepad2,
  LogOut,
  Plus,
  ScanFace,
  Sparkles,
  Trash2,
  UserCheck,
} from "lucide-react";
import { formatDateVn } from "@/lib/utils";
import {
  DEFAULT_SIMILARITY_THRESHOLD,
  extractDeterministicDescriptorFromPixels,
  generateSyntheticPortraitPixels,
} from "@/lib/face-ai";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
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
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

type SessionStatus = "SCHEDULED" | "IN_PROGRESS" | "COMPLETED" | "CANCELLED";
type AttendanceStatus =
  | "PRESENT"
  | "LATE"
  | "ABSENT_EXCUSED"
  | "ABSENT_UNEXCUSED";

interface RosterItem {
  studentId: string;
  student: {
    id: string;
    studentCode: string;
    fullName: string;
    avatarUrl: string | null;
    faceDescriptorCount: number;
  };
  enrollmentId: string | null;
  status: AttendanceStatus | null;
  checkInAt: string | null;
  checkOutAt: string | null;
  method: "MANUAL" | "FACE_AI" | null;
  confidenceScore: number | null;
  notes: string | null;
}

interface EnrolledDescriptor {
  id: string;
  studentId: string;
  label: string | null;
  source: string;
  createdAt: string;
  student?: {
    id: string;
    studentCode: string;
    fullName: string;
  };
}

interface HomeworkSummary {
  id: string;
  title: string;
  description: string | null;
  dueDate: string;
  maxScore: number;
}

interface GameSessionSummary {
  id: string;
  title: string;
  mode: "INDIVIDUAL" | "TEAM";
  status: string;
  startedAt: string;
  minigame?: {
    id: string;
    title: string;
    type: string;
  };
  results?: Array<{
    id: string;
    studentId: string;
    score: number;
    rank: number;
    student?: {
      fullName: string;
      studentCode: string;
    };
  }>;
}

interface ScanLogItem {
  id: string;
  timestamp: string;
  matched: boolean;
  scanMode: "CHECK_IN" | "CHECK_OUT";
  studentName?: string;
  studentCode?: string;
  similarity?: number;
  confidenceScore?: number;
  alreadyCheckedIn?: boolean;
  reason?: string;
  message?: string;
}

function getStudentSeedKey(student: {
  id: string;
  studentCode?: string | null;
}): string {
  return student.studentCode || student.id;
}

function drawPixelsToCanvas(
  canvas: HTMLCanvasElement | null,
  pixels: Uint8ClampedArray,
  width: number = 64,
  height: number = 64
) {
  if (!canvas) return;
  const ctx = canvas.getContext("2d");
  if (!ctx) return;
  const imgData = ctx.createImageData(width, height);
  imgData.data.set(pixels);
  ctx.putImageData(imgData, 0, 0);
}

function formatTimeShort(iso: string | null | undefined): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleTimeString("vi-VN", {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
}

export default function SessionDetailPage() {
  const params = useParams<{ id: string }>();
  const sessionId = params?.id ?? "";

  const [loading, setLoading] = useState(true);
  const [session, setSession] = useState<{
    id: string;
    classId: string;
    sessionDate: string;
    startTime: string;
    endTime: string;
    room: string | null;
    topic: string | null;
    notes: string | null;
    status: SessionStatus;
    class?: {
      id: string;
      code: string;
      name: string;
      subject: string;
      room: string | null;
    };
  } | null>(null);

  const [roster, setRoster] = useState<RosterItem[]>([]);
  const [homeworks, setHomeworks] = useState<HomeworkSummary[]>([]);
  const [gameSessions, setGameSessions] = useState<GameSessionSummary[]>([]);
  const [descriptors, setDescriptors] = useState<EnrolledDescriptor[]>([]);

  // Session Metadata Edits
  const [statusEdit, setStatusEdit] = useState<SessionStatus>("SCHEDULED");
  const [topicEdit, setTopicEdit] = useState("");
  const [notesEdit, setNotesEdit] = useState("");
  const [savingMeta, setSavingMeta] = useState(false);
  const [feedbackBanner, setFeedbackBanner] = useState("");
  const [errorBanner, setErrorBanner] = useState("");

  // Per-student notes state
  const [studentNotes, setStudentNotes] = useState<Record<string, string>>({});

  // FaceAI Scanner & Enrollment state
  const [scanMode, setScanMode] = useState<"CHECK_IN" | "CHECK_OUT">(
    "CHECK_IN"
  );
  const [cameraSource, setCameraSource] = useState<
    "SYNTHETIC_CANVAS" | "WEBCAM" | "IP_CAMERA" | "UPLOAD"
  >("SYNTHETIC_CANVAS");
  const [ipStreamUrl, setIpStreamUrl] = useState(
    "/api/face-ai/stream-proxy?studentCode=HS001"
  );
  const [scanTargetStudentId, setScanTargetStudentId] = useState<string>("");
  const [threshold, setThreshold] = useState<number>(
    DEFAULT_SIMILARITY_THRESHOLD
  );
  const [scanning, setScanning] = useState(false);
  const [scanLogs, setScanLogs] = useState<ScanLogItem[]>([]);

  const [enrollStudentId, setEnrollStudentId] = useState<string>("");
  const [enrollLabel, setEnrollLabel] = useState("Ảnh chính diện mẫu 1");
  const [enrollSource, setEnrollSource] = useState<
    "SYNTHETIC" | "WEBCAM" | "UPLOAD"
  >("SYNTHETIC");
  const [enrolling, setEnrolling] = useState(false);

  const scannerCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const enrollCanvasRef = useRef<HTMLCanvasElement | null>(null);

  // Quick Homework Creation in Tab 3
  const [hwTitle, setHwTitle] = useState("");
  const [hwDesc, setHwDesc] = useState("");
  const [hwDueDate, setHwDueDate] = useState(() => {
    const d = new Date(Date.now() + 7 * 86400000);
    return d.toISOString().slice(0, 10);
  });
  const [hwMaxScore, setHwMaxScore] = useState("10");
  const [creatingHw, setCreatingHw] = useState(false);

  const loadSessionDetail = useCallback(async () => {
    if (!sessionId) return;
    setLoading(true);
    try {
      const res = await fetch(`/api/sessions/${sessionId}`);
      if (!res.ok) return;
      const data = await res.json();
      setSession(data.session);
      setStatusEdit(data.session.status);
      setTopicEdit(data.session.topic ?? "");
      setNotesEdit(data.session.notes ?? "");

      const loadedRoster: RosterItem[] = Array.isArray(data.roster)
        ? data.roster
        : [];
      setRoster(loadedRoster);

      const notesMap: Record<string, string> = {};
      for (const r of loadedRoster) {
        notesMap[r.studentId] = r.notes ?? "";
      }
      setStudentNotes(notesMap);

      if (loadedRoster.length > 0) {
        setScanTargetStudentId((prev) => prev || loadedRoster[0].studentId);
        setEnrollStudentId((prev) => prev || loadedRoster[0].studentId);
      }

      setHomeworks(Array.isArray(data.homeworks) ? data.homeworks : []);
      setGameSessions(
        Array.isArray(data.gameSessions) ? data.gameSessions : []
      );

      if (data.session?.classId) {
        const descRes = await fetch(
          `/api/face-ai/descriptors?classId=${data.session.classId}`
        );
        if (descRes.ok) {
          const descData = await descRes.json();
          setDescriptors(
            Array.isArray(descData.descriptors) ? descData.descriptors : []
          );
        }
      }
    } finally {
      setLoading(false);
    }
  }, [sessionId]);

  useEffect(() => {
    loadSessionDetail();
  }, [loadSessionDetail]);

  // Keep scanner canvas updated when target student changes
  useEffect(() => {
    let seedKey = "stranger-unregistered-face-9999";
    if (scanTargetStudentId !== "__STRANGER__") {
      const found = roster.find((r) => r.studentId === scanTargetStudentId);
      if (found) {
        seedKey = getStudentSeedKey(found.student);
      }
    }
    const pixels = generateSyntheticPortraitPixels(seedKey, 64, 64);
    drawPixelsToCanvas(scannerCanvasRef.current, pixels, 64, 64);
  }, [scanTargetStudentId, roster, cameraSource]);

  // Keep enrollment preview canvas updated when enrollStudentId changes
  useEffect(() => {
    const found = roster.find((r) => r.studentId === enrollStudentId);
    if (!found) return;
    const seedKey = getStudentSeedKey(found.student);
    const pixels = generateSyntheticPortraitPixels(seedKey, 64, 64);
    drawPixelsToCanvas(enrollCanvasRef.current, pixels, 64, 64);
  }, [enrollStudentId, roster]);

  const handleSaveSessionMetadata = async () => {
    if (!session) return;
    setSavingMeta(true);
    setFeedbackBanner("");
    setErrorBanner("");
    try {
      const res = await fetch(`/api/sessions/${session.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          status: statusEdit,
          topic: topicEdit,
          notes: notesEdit,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setErrorBanner(data.error || "Không thể lưu thông tin buổi học");
        return;
      }
      setFeedbackBanner("Đã cập nhật thông tin buổi học thành công!");
      await loadSessionDetail();
    } finally {
      setSavingMeta(false);
    }
  };

  const handleBulkAction = async (
    action: "MARK_ALL_PRESENT" | "CHECK_OUT_ALL"
  ) => {
    if (!session) return;
    setFeedbackBanner("");
    setErrorBanner("");
    const res = await fetch(`/api/sessions/${session.id}/attendance`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action }),
    });
    const data = await res.json();
    if (!res.ok) {
      setErrorBanner(data.error || "Không thể thực hiện điểm danh hàng loạt");
      return;
    }
    setFeedbackBanner(
      action === "MARK_ALL_PRESENT"
        ? `Đã điểm danh có mặt cho ${data.updatedCount ?? 0} học sinh!`
        : `Đã ghi nhận giờ ra về cho ${data.updatedCount ?? 0} học sinh!`
    );
    await loadSessionDetail();
  };

  const handleSingleStudentUpdate = async (
    studentId: string,
    payload: {
      status?: AttendanceStatus;
      checkInAt?: string;
      checkOutAt?: string;
      notes?: string;
    }
  ) => {
    if (!session) return;
    setFeedbackBanner("");
    setErrorBanner("");
    const res = await fetch(`/api/sessions/${session.id}/attendance`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        studentId,
        ...payload,
        notes: payload.notes ?? studentNotes[studentId] ?? undefined,
      }),
    });
    const data = await res.json();
    if (!res.ok) {
      setErrorBanner(data.error || "Lỗi cập nhật điểm danh học sinh");
      return;
    }
    await loadSessionDetail();
  };

  const handleEnrollFace = async () => {
    if (!enrollStudentId) return;
    const found = roster.find((r) => r.studentId === enrollStudentId);
    if (!found) return;

    setEnrolling(true);
    setErrorBanner("");
    setFeedbackBanner("");
    try {
      const seedKey = getStudentSeedKey(found.student);
      const pixels = generateSyntheticPortraitPixels(seedKey, 64, 64);
      drawPixelsToCanvas(enrollCanvasRef.current, pixels, 64, 64);
      const descriptor = extractDeterministicDescriptorFromPixels(
        pixels,
        64,
        64
      );

      const res = await fetch("/api/face-ai/descriptors", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          studentId: found.studentId,
          descriptor,
          label: enrollLabel || `Mẫu khuôn mặt ${found.student.fullName}`,
          source: enrollSource,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setErrorBanner(data.error || "Không thể đăng ký mẫu khuôn mặt");
        return;
      }
      setFeedbackBanner(
        `Đã đăng ký mẫu khuôn mặt 128-chiều cho ${found.student.fullName}!`
      );
      await loadSessionDetail();
    } finally {
      setEnrolling(false);
    }
  };

  const handleDeleteDescriptor = async (descriptorId: string) => {
    const res = await fetch(`/api/face-ai/descriptors/${descriptorId}`, {
      method: "DELETE",
    });
    if (res.ok) {
      await loadSessionDetail();
    }
  };

  const handleFaceScan = async () => {
    if (!session) return;
    setScanning(true);
    setErrorBanner("");
    setFeedbackBanner("");
    try {
      let seedKey = "stranger-unregistered-face-9999";
      if (scanTargetStudentId !== "__STRANGER__") {
        const found = roster.find((r) => r.studentId === scanTargetStudentId);
        if (found) {
          seedKey = getStudentSeedKey(found.student);
        }
      }

      const pixels = generateSyntheticPortraitPixels(seedKey, 64, 64);
      drawPixelsToCanvas(scannerCanvasRef.current, pixels, 64, 64);
      const descriptor = extractDeterministicDescriptorFromPixels(
        pixels,
        64,
        64
      );

      const res = await fetch("/api/face-ai/match", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sessionId: session.id,
          scanMode,
          descriptor,
          threshold,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setErrorBanner(data.error || "Không thể thực hiện quét FaceAI");
        return;
      }

      const logItem: ScanLogItem = {
        id: `${Date.now()}-${Math.random()}`,
        timestamp: new Date().toLocaleTimeString("vi-VN"),
        matched: Boolean(data.matched),
        scanMode,
        studentName: data.student?.fullName,
        studentCode: data.student?.studentCode,
        similarity: data.similarity ?? data.bestSimilarity,
        confidenceScore: data.confidenceScore,
        alreadyCheckedIn: data.alreadyCheckedIn,
        reason: data.reason,
        message: data.message,
      };
      setScanLogs((prev) => [logItem, ...prev.slice(0, 14)]);

      if (data.matched) {
        setFeedbackBanner(
          `Nhận diện thành công: ${data.student?.fullName} (${Math.round(
            (data.confidenceScore ?? 0) * 100
          )}% độ tin cậy)`
        );
        await loadSessionDetail();
      } else {
        setErrorBanner(
          data.message ||
            "Không tìm thấy học sinh khớp vượt ngưỡng nhận diện FaceAI"
        );
      }
    } finally {
      setScanning(false);
    }
  };

  const handleCreateSessionHomework = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!session || !hwTitle.trim()) return;
    setCreatingHw(true);
    setErrorBanner("");
    try {
      const res = await fetch("/api/homeworks", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          classId: session.classId,
          sessionId: session.id,
          title: hwTitle.trim(),
          description: hwDesc.trim() || undefined,
          dueDate: new Date(hwDueDate).toISOString(),
          maxScore: Number(hwMaxScore) || 10,
        }),
      });
      if (res.ok) {
        setHwTitle("");
        setHwDesc("");
        setFeedbackBanner("Đã tạo bài tập về nhà cho buổi học!");
        await loadSessionDetail();
      }
    } finally {
      setCreatingHw(false);
    }
  };

  if (loading && !session) {
    return (
      <div className="p-8 text-center text-sm text-slate-500">
        Đang tải chi tiết buổi học...
      </div>
    );
  }

  if (!session) {
    return (
      <div className="space-y-4 p-8 text-center">
        <p className="text-base font-medium text-slate-700">
          Không tìm thấy buổi học trong workspace của bạn.
        </p>
        <Link href="/sessions">
          <Button variant="outline">Quay lại danh sách buổi học</Button>
        </Link>
      </div>
    );
  }

  const isCancelled = session.status === "CANCELLED";

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="space-y-1">
          <div className="flex items-center gap-2 text-sm text-slate-500">
            <Link
              href="/sessions"
              className="inline-flex items-center gap-1 hover:text-slate-900"
            >
              <ArrowLeft className="h-4 w-4" />
              <span>Danh sách buổi học</span>
            </Link>
            <span>/</span>
            <span>{session.class?.code}</span>
          </div>
          <h1 className="text-2xl font-bold text-slate-900">
            {session.class?.name} — {formatDateVn(session.sessionDate)} (
            {session.startTime} – {session.endTime})
          </h1>
          <p className="text-sm text-slate-600">
            Phòng: {session.room || session.class?.room || "Chưa xếp phòng"} •
            Chủ đề: {session.topic || "Buổi học định kỳ"}
          </p>
        </div>

        <div className="flex items-center gap-2">
          <Badge
            variant={
              session.status === "COMPLETED"
                ? "success"
                : session.status === "IN_PROGRESS"
                ? "warning"
                : session.status === "CANCELLED"
                ? "destructive"
                : "default"
            }
          >
            {session.status}
          </Badge>
        </div>
      </div>

      {feedbackBanner && (
        <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-medium text-emerald-800">
          {feedbackBanner}
        </div>
      )}

      {errorBanner && (
        <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-medium text-red-700">
          {errorBanner}
        </div>
      )}

      <Tabs defaultValue="attendance">
        <TabsList className="flex flex-wrap gap-1 h-auto p-1">
          <TabsTrigger value="attendance" data-testid="tab-attendance">
            <UserCheck className="mr-1.5 h-4 w-4" />
            <span>Điểm danh & Sĩ số ({roster.length})</span>
          </TabsTrigger>
          <TabsTrigger value="face-ai" data-testid="tab-face-ai">
            <ScanFace className="mr-1.5 h-4 w-4" />
            <span>Điểm danh FaceAI</span>
          </TabsTrigger>
          <TabsTrigger value="homework" data-testid="tab-session-homework">
            <BookOpen className="mr-1.5 h-4 w-4" />
            <span>Bài tập về nhà ({homeworks.length})</span>
          </TabsTrigger>
          <TabsTrigger value="games" data-testid="tab-session-games">
            <Gamepad2 className="mr-1.5 h-4 w-4" />
            <span>Minigame buổi học ({gameSessions.length})</span>
          </TabsTrigger>
        </TabsList>

        {/* TAB 1: MANUAL & BULK ATTENDANCE */}
        <TabsContent value="attendance" className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Thông tin & Trạng thái buổi học</CardTitle>
              <CardDescription>
                Cập nhật chủ đề bài giảng, ghi chú buổi học và chuyển trạng thái
                tiết dạy.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 gap-4 md:grid-cols-4">
                <div className="space-y-1.5">
                  <Label>Trạng thái buổi học</Label>
                  <Select
                    data-testid="select-session-status"
                    value={statusEdit}
                    onChange={(e) =>
                      setStatusEdit(e.target.value as SessionStatus)
                    }
                  >
                    <option value="SCHEDULED">Đã lên lịch (SCHEDULED)</option>
                    <option value="IN_PROGRESS">
                      Đang diễn ra (IN_PROGRESS)
                    </option>
                    <option value="COMPLETED">Đã hoàn thành (COMPLETED)</option>
                    <option value="CANCELLED">Đã huỷ (CANCELLED)</option>
                  </Select>
                </div>

                <div className="space-y-1.5">
                  <Label>Chủ đề bài giảng</Label>
                  <Input
                    data-testid="input-detail-topic"
                    value={topicEdit}
                    onChange={(e) => setTopicEdit(e.target.value)}
                    placeholder="Nhập chủ đề bài giảng..."
                  />
                </div>

                <div className="space-y-1.5">
                  <Label>Ghi chú giáo viên</Label>
                  <Input
                    data-testid="input-detail-notes"
                    value={notesEdit}
                    onChange={(e) => setNotesEdit(e.target.value)}
                    placeholder="Ghi chú tình hình lớp..."
                  />
                </div>

                <div className="flex items-end">
                  <Button
                    data-testid="btn-save-session-info"
                    onClick={handleSaveSessionMetadata}
                    disabled={savingMeta}
                    className="w-full"
                  >
                    {savingMeta ? "Đang lưu..." : "Lưu thông tin buổi học"}
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <CardTitle>Danh sách học sinh & Điểm danh đến / về</CardTitle>
                <CardDescription>
                  Điểm danh nhanh toàn bộ lớp chỉ với 1 cú nhấp chuột hoặc cập
                  nhật chi tiết từng học sinh.
                </CardDescription>
              </div>

              <div className="flex flex-wrap items-center gap-2">
                <Button
                  data-testid="btn-mark-all-present"
                  variant="success"
                  disabled={isCancelled}
                  onClick={() => handleBulkAction("MARK_ALL_PRESENT")}
                >
                  <CheckCircle2 className="h-4 w-4" />
                  <span>Điểm danh có mặt tất cả</span>
                </Button>
                <Button
                  data-testid="btn-checkout-all"
                  variant="secondary"
                  disabled={isCancelled}
                  onClick={() => handleBulkAction("CHECK_OUT_ALL")}
                >
                  <LogOut className="h-4 w-4" />
                  <span>Ghi nhận ra về tất cả</span>
                </Button>
              </div>
            </CardHeader>

            <CardContent>
              {isCancelled && (
                <div className="mb-4 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">
                  Buổi học này đã bị huỷ (CANCELLED). Không thể thực hiện điểm
                  danh trừ khi khôi phục trạng thái buổi học.
                </div>
              )}

              <Table data-testid="session-roster-table">
                <TableHeader>
                  <TableRow>
                    <TableHead>Học sinh</TableHead>
                    <TableHead>Mẫu FaceAI</TableHead>
                    <TableHead>Trạng thái điểm danh</TableHead>
                    <TableHead>Giờ đến (Check-in)</TableHead>
                    <TableHead>Giờ về (Check-out)</TableHead>
                    <TableHead>Phương thức</TableHead>
                    <TableHead>Ghi chú & Thao tác</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {roster.map((row) => (
                    <TableRow key={row.studentId}>
                      <TableCell>
                        <div className="font-semibold text-slate-900">
                          {row.student.fullName}
                        </div>
                        <div className="text-xs text-slate-500">
                          {row.student.studentCode}
                        </div>
                      </TableCell>
                      <TableCell>
                        {row.student.faceDescriptorCount > 0 ? (
                          <Badge variant="success">
                            Đã ĐK ({row.student.faceDescriptorCount} mẫu)
                          </Badge>
                        ) : (
                          <Badge variant="outline">Chưa có mẫu mặt</Badge>
                        )}
                      </TableCell>
                      <TableCell>
                        <Select
                          disabled={isCancelled}
                          value={row.status ?? ""}
                          onChange={(e) => {
                            const nextStatus = e.target
                              .value as AttendanceStatus;
                            if (!nextStatus) return;
                            handleSingleStudentUpdate(row.studentId, {
                              status: nextStatus,
                            });
                          }}
                          className="w-40"
                        >
                          <option value="">-- Chưa điểm danh --</option>
                          <option value="PRESENT">Có mặt (PRESENT)</option>
                          <option value="LATE">Đi muộn (LATE)</option>
                          <option value="ABSENT_EXCUSED">
                            Vắng có phép (EXCUSED)
                          </option>
                          <option value="ABSENT_UNEXCUSED">
                            Vắng không phép (UNEXCUSED)
                          </option>
                        </Select>
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          <span className="text-xs font-medium text-slate-700">
                            {formatTimeShort(row.checkInAt)}
                          </span>
                          {!row.checkInAt && !isCancelled && (
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() =>
                                handleSingleStudentUpdate(row.studentId, {
                                  status: row.status ?? "PRESENT",
                                  checkInAt: new Date().toISOString(),
                                })
                              }
                            >
                              <Clock className="h-3 w-3" />
                              <span>Đến</span>
                            </Button>
                          )}
                        </div>
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          <span className="text-xs font-medium text-slate-700">
                            {formatTimeShort(row.checkOutAt)}
                          </span>
                          {!isCancelled && (
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() =>
                                handleSingleStudentUpdate(row.studentId, {
                                  status: row.status ?? "PRESENT",
                                  checkOutAt: new Date().toISOString(),
                                })
                              }
                            >
                              <LogOut className="h-3 w-3" />
                              <span>Ra về</span>
                            </Button>
                          )}
                        </div>
                      </TableCell>
                      <TableCell>
                        {row.method === "FACE_AI" ? (
                          <Badge variant="default">
                            FACE_AI{" "}
                            {row.confidenceScore
                              ? `(${Math.round(row.confidenceScore * 100)}%)`
                              : ""}
                          </Badge>
                        ) : row.method === "MANUAL" ? (
                          <Badge variant="secondary">Thủ công</Badge>
                        ) : (
                          <span className="text-xs text-slate-400">—</span>
                        )}
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          <Input
                            disabled={isCancelled}
                            value={studentNotes[row.studentId] ?? ""}
                            onChange={(e) =>
                              setStudentNotes((prev) => ({
                                ...prev,
                                [row.studentId]: e.target.value,
                              }))
                            }
                            placeholder="Ghi chú..."
                            className="h-8 w-36 text-xs"
                          />
                          <Button
                            size="sm"
                            variant="outline"
                            disabled={isCancelled}
                            onClick={() =>
                              handleSingleStudentUpdate(row.studentId, {
                                status: row.status ?? "PRESENT",
                                notes: studentNotes[row.studentId] ?? "",
                              })
                            }
                          >
                            Lưu
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        {/* TAB 2: BROWSER FACE AI SCANNER & ENROLLMENT */}
        <TabsContent value="face-ai" className="space-y-6">
          <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
            {/* LEFT: CLASSROOM CAMERA SCANNER */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Camera className="h-5 w-5 text-blue-600" />
                  <span>Trạm Quét Điểm Danh Khuôn Mặt (Browser FaceAI)</span>
                </CardTitle>
                <CardDescription>
                  Trích xuất vector đặc trưng khuôn mặt 128-chiều ngay trên
                  trình duyệt và đối sánh Cosine Similarity / Euclidean
                  Distance.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex flex-wrap gap-2">
                  <Button
                    type="button"
                    data-testid="btn-mode-checkin"
                    variant={scanMode === "CHECK_IN" ? "default" : "outline"}
                    onClick={() => setScanMode("CHECK_IN")}
                  >
                    Chế độ: Điểm danh đến (Check-in)
                  </Button>
                  <Button
                    type="button"
                    data-testid="btn-mode-checkout"
                    variant={scanMode === "CHECK_OUT" ? "default" : "outline"}
                    onClick={() => setScanMode("CHECK_OUT")}
                  >
                    Chế độ: Điểm danh ra về (Check-out)
                  </Button>
                </div>

                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  <div className="space-y-1.5">
                    <Label>Nguồn Camera lớp học</Label>
                    <Select
                      data-testid="select-camera-source"
                      value={cameraSource}
                      onChange={(e) =>
                        setCameraSource(
                          e.target.value as
                            | "SYNTHETIC_CANVAS"
                            | "WEBCAM"
                            | "IP_CAMERA"
                            | "UPLOAD"
                        )
                      }
                    >
                      <option value="SYNTHETIC_CANVAS">
                        Chân dung giả lập HTML5 Canvas (Deterministic)
                      </option>
                      <option value="WEBCAM">Webcam Trình duyệt</option>
                      <option value="IP_CAMERA">
                        Camera IP Lớp học (CORS Proxy)
                      </option>
                      <option value="UPLOAD">Tải ảnh khuôn mặt lên</option>
                    </Select>
                  </div>

                  <div className="space-y-1.5">
                    <Label>Khuôn mặt trước ống kính</Label>
                    <Select
                      data-testid="select-scan-target-student"
                      value={scanTargetStudentId}
                      onChange={(e) => setScanTargetStudentId(e.target.value)}
                    >
                      {roster.map((r) => (
                        <option key={r.studentId} value={r.studentId}>
                          {r.student.studentCode} — {r.student.fullName}
                        </option>
                      ))}
                      <option value="__STRANGER__">
                        Khuôn mặt lạ (Chưa đăng ký)
                      </option>
                    </Select>
                  </div>
                </div>

                {cameraSource === "IP_CAMERA" && (
                  <div className="space-y-1.5">
                    <Label>Luồng Camera IP (qua /api/face-ai/stream-proxy)</Label>
                    <Input
                      value={ipStreamUrl}
                      onChange={(e) => setIpStreamUrl(e.target.value)}
                    />
                  </div>
                )}

                <div className="flex flex-col items-center justify-center rounded-xl border border-slate-200 bg-slate-950 p-5 text-white">
                  <canvas
                    ref={scannerCanvasRef}
                    width={64}
                    height={64}
                    data-testid="face-ai-canvas"
                    className="h-40 w-40 rounded-lg border-2 border-emerald-400 image-rendering-pixelated shadow-lg"
                  />
                  <p className="mt-2 text-xs text-slate-300">
                    Khung lưới đặc trưng khuôn mặt 8×4 (128-float L2-normalized)
                  </p>
                </div>

                <div className="space-y-1.5">
                  <div className="flex items-center justify-between text-xs font-medium text-slate-700">
                    <span>Ngưỡng tương đồng Cosine (Threshold)</span>
                    <span>{Math.round(threshold * 100)}%</span>
                  </div>
                  <Input
                    type="range"
                    min="0.50"
                    max="0.95"
                    step="0.05"
                    data-testid="input-face-threshold"
                    value={threshold}
                    onChange={(e) => setThreshold(Number(e.target.value))}
                  />
                </div>

                <Button
                  type="button"
                  data-testid="btn-face-scan"
                  disabled={scanning || isCancelled}
                  onClick={handleFaceScan}
                  className="w-full"
                  size="lg"
                >
                  <ScanFace className="h-5 w-5" />
                  <span>
                    {scanning
                      ? "Đang phân tích & đối sánh..."
                      : `Quét & Nhận diện ngay (${
                          scanMode === "CHECK_IN" ? "Đến lớp" : "Ra về"
                        })`}
                  </span>
                </Button>

                {scanLogs.length > 0 && (
                  <div className="space-y-2 pt-2">
                    <p className="text-xs font-semibold uppercase text-slate-500">
                      Nhật ký nhận diện trực tiếp
                    </p>
                    <div className="max-h-48 space-y-1.5 overflow-y-auto">
                      {scanLogs.map((log) => (
                        <div
                          key={log.id}
                          className={`flex items-center justify-between rounded-lg border px-3 py-2 text-xs ${
                            log.matched
                              ? "border-emerald-200 bg-emerald-50 text-emerald-900"
                              : "border-amber-200 bg-amber-50 text-amber-900"
                          }`}
                        >
                          <div>
                            <span className="font-semibold">
                              [{log.timestamp}]{" "}
                              {log.matched
                                ? `${log.studentCode} - ${log.studentName}`
                                : `Không khớp (${log.reason})`}
                            </span>
                            {log.alreadyCheckedIn && (
                              <span className="ml-2 text-emerald-700">
                                • Giữ nguyên giờ đến ban đầu (Cooldown)
                              </span>
                            )}
                          </div>
                          <Badge
                            variant={log.matched ? "success" : "warning"}
                          >
                            {Math.round((log.confidenceScore ?? 0) * 100)}%
                          </Badge>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>

            {/* RIGHT: STUDENT FACE DESCRIPTOR ENROLLMENT */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Sparkles className="h-5 w-5 text-emerald-600" />
                  <span>Đăng ký mẫu khuôn mặt Học sinh (Face Enrollment)</span>
                </CardTitle>
                <CardDescription>
                  Lưu trữ vector 128 số thực đã chuẩn hoá L2 cho từng học sinh
                  trong lớp để điểm danh tự động.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-1.5">
                  <Label>Chọn học sinh đăng ký khuôn mặt</Label>
                  <Select
                    data-testid="select-enroll-student"
                    value={enrollStudentId}
                    onChange={(e) => setEnrollStudentId(e.target.value)}
                  >
                    {roster.map((r) => (
                      <option key={r.studentId} value={r.studentId}>
                        {r.student.studentCode} — {r.student.fullName} (
                        {r.student.faceDescriptorCount} mẫu)
                      </option>
                    ))}
                  </Select>
                </div>

                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  <div className="space-y-1.5">
                    <Label>Nhãn mẫu khuôn mặt</Label>
                    <Input
                      data-testid="input-enroll-label"
                      value={enrollLabel}
                      onChange={(e) => setEnrollLabel(e.target.value)}
                      placeholder="VD: Ảnh chính diện mẫu 1"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label>Nguồn trích xuất</Label>
                    <Select
                      value={enrollSource}
                      onChange={(e) =>
                        setEnrollSource(
                          e.target.value as "SYNTHETIC" | "WEBCAM" | "UPLOAD"
                        )
                      }
                    >
                      <option value="SYNTHETIC">Chân dung chuẩn hoá</option>
                      <option value="WEBCAM">Webcam trực tiếp</option>
                      <option value="UPLOAD">Ảnh tải lên</option>
                    </Select>
                  </div>
                </div>

                <div className="flex items-center gap-4 rounded-xl border border-slate-200 bg-slate-50 p-3">
                  <canvas
                    ref={enrollCanvasRef}
                    width={64}
                    height={64}
                    className="h-16 w-16 rounded-lg border border-slate-300"
                  />
                  <div className="text-xs text-slate-600">
                    <p className="font-semibold text-slate-900">
                      Vector 128-Float L2 Normalized
                    </p>
                    <p>
                      Mỗi học sinh có thể đăng ký một hoặc nhiều góc mặt để tăng
                      độ chính xác khi quét camera lớp học.
                    </p>
                  </div>
                </div>

                <Button
                  type="button"
                  data-testid="btn-enroll-face"
                  variant="success"
                  disabled={enrolling || !enrollStudentId}
                  onClick={handleEnrollFace}
                  className="w-full"
                >
                  <Sparkles className="h-4 w-4" />
                  <span>
                    {enrolling
                      ? "Đang trích xuất & lưu..."
                      : "Đăng ký khuôn mặt"}
                  </span>
                </Button>

                <div
                  className="space-y-2 pt-3"
                  data-testid="enrolled-descriptors-list"
                >
                  <p className="text-xs font-semibold uppercase text-slate-500">
                    Danh sách mẫu khuôn mặt đã đăng ký ({descriptors.length})
                  </p>
                  {descriptors.length === 0 ? (
                    <p className="text-xs text-slate-500">
                      Chưa có mẫu khuôn mặt nào được đăng ký cho lớp này.
                    </p>
                  ) : (
                    <div className="max-h-56 space-y-2 overflow-y-auto">
                      {descriptors.map((d) => (
                        <div
                          key={d.id}
                          className="flex items-center justify-between rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs"
                        >
                          <div>
                            <div className="font-semibold text-slate-900">
                              {d.student?.studentCode} — {d.student?.fullName}
                            </div>
                            <div className="text-slate-500">
                              {d.label || "Mẫu khuôn mặt"} • Nguồn: {d.source}
                            </div>
                          </div>
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => handleDeleteDescriptor(d.id)}
                          >
                            <Trash2 className="h-3.5 w-3.5 text-red-600" />
                          </Button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        {/* TAB 3: SESSION HOMEWORK */}
        <TabsContent value="homework" className="space-y-6">
          <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
            <Card className="lg:col-span-2">
              <CardHeader>
                <CardTitle>Bài tập về nhà của buổi học</CardTitle>
                <CardDescription>
                  Danh sách bài tập được giao gắn với buổi học này.
                </CardDescription>
              </CardHeader>
              <CardContent>
                {homeworks.length === 0 ? (
                  <p className="py-6 text-center text-sm text-slate-500">
                    Chưa có bài tập về nhà nào gắn với buổi học này.
                  </p>
                ) : (
                  <div className="space-y-3">
                    {homeworks.map((hw) => (
                      <div
                        key={hw.id}
                        className="flex flex-col justify-between gap-3 rounded-xl border border-slate-200 p-4 sm:flex-row sm:items-center"
                      >
                        <div>
                          <h4 className="font-semibold text-slate-900">
                            {hw.title}
                          </h4>
                          <p className="text-xs text-slate-500">
                            Hạn nộp: {formatDateVn(hw.dueDate)} • Thang điểm:{" "}
                            {hw.maxScore}
                          </p>
                        </div>
                        <Link href={`/homeworks/${hw.id}`}>
                          <Button size="sm">Chấm điểm & Chi tiết</Button>
                        </Link>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Giao nhanh BTVN cho buổi học</CardTitle>
                <CardDescription>
                  Tạo bài tập mới gắn trực tiếp với buổi học này.
                </CardDescription>
              </CardHeader>
              <CardContent>
                <form
                  onSubmit={handleCreateSessionHomework}
                  className="space-y-3"
                >
                  <div className="space-y-1">
                    <Label>Tiêu đề bài tập *</Label>
                    <Input
                      value={hwTitle}
                      onChange={(e) => setHwTitle(e.target.value)}
                      placeholder="VD: BTVN Phương trình bậc hai"
                      required
                    />
                  </div>
                  <div className="space-y-1">
                    <Label>Mô tả / Hướng dẫn</Label>
                    <Input
                      value={hwDesc}
                      onChange={(e) => setHwDesc(e.target.value)}
                      placeholder="Làm bài 1 đến bài 5 trang 42..."
                    />
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <div className="space-y-1">
                      <Label>Hạn nộp *</Label>
                      <Input
                        type="date"
                        value={hwDueDate}
                        onChange={(e) => setHwDueDate(e.target.value)}
                        required
                      />
                    </div>
                    <div className="space-y-1">
                      <Label>Điểm tối đa</Label>
                      <Input
                        type="number"
                        min="1"
                        max="100"
                        value={hwMaxScore}
                        onChange={(e) => setHwMaxScore(e.target.value)}
                      />
                    </div>
                  </div>
                  <Button
                    type="submit"
                    disabled={creatingHw}
                    className="w-full"
                  >
                    <Plus className="h-4 w-4" />
                    <span>{creatingHw ? "Đang tạo..." : "Giao bài tập"}</span>
                  </Button>
                </form>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        {/* TAB 4: SESSION MINIGAMES */}
        <TabsContent value="games" className="space-y-6">
          <Card>
            <CardHeader className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <CardTitle>Minigame tương tác trong buổi học</CardTitle>
                <CardDescription>
                  Tổ chức trò chơi học tập trực tiếp trên lớp và lưu kết quả vào
                  bảng xếp hạng.
                </CardDescription>
              </div>
              <Link
                href={`/minigames?classId=${session.classId}&sessionId=${session.id}`}
                prefetch={false}
              >
                <Button data-testid="btn-launch-session-game">
                  <Gamepad2 className="h-4 w-4" />
                  <span>Tổ chức Minigame cho buổi học</span>
                </Button>
              </Link>
            </CardHeader>
            <CardContent>
              {gameSessions.length === 0 ? (
                <p className="py-8 text-center text-sm text-slate-500">
                  Chưa có phiên chơi minigame nào trong buổi học này.
                </p>
              ) : (
                <div className="space-y-3">
                  {gameSessions.map((gs) => (
                    <div
                      key={gs.id}
                      className="flex flex-col justify-between gap-3 rounded-xl border border-slate-200 p-4 sm:flex-row sm:items-center"
                    >
                      <div>
                        <div className="flex items-center gap-2">
                          <h4 className="font-semibold text-slate-900">
                            {gs.title}
                          </h4>
                          <Badge variant="outline">{gs.mode}</Badge>
                          <Badge
                            variant={
                              gs.status === "COMPLETED" ? "success" : "warning"
                            }
                          >
                            {gs.status}
                          </Badge>
                        </div>
                        {gs.results && gs.results.length > 0 && (
                          <p className="mt-1 text-xs text-slate-600">
                            Top 1:{" "}
                            {gs.results[0].student?.fullName || "Học sinh"} (
                            {gs.results[0].score} điểm)
                          </p>
                        )}
                      </div>
                      <Link
                        href={`/minigames/play/${gs.id}`}
                        prefetch={false}
                      >
                        <Button size="sm" variant="outline">
                          Xem bảng điểm & Sân khấu
                        </Button>
                      </Link>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
