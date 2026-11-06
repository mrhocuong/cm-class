"use client";

import React, { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import {
  AlertTriangle,
  ArrowLeft,
  CheckCircle2,
  Clock,
  FileText,
  Save,
  Users,
} from "lucide-react";
import { formatDateVn } from "@/lib/utils";
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
import { Select } from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

type SubmissionStatus = "MISSING" | "SUBMITTED" | "LATE" | "GRADED";

interface SubmissionRow {
  studentId: string;
  student: {
    id: string;
    studentCode: string;
    fullName: string;
    phone?: string | null;
  };
  status: SubmissionStatus;
  score: string;
  feedback: string;
  submissionNote: string;
  submittedAt: string;
}

interface LinkedQuestion {
  id: string;
  type: string;
  subject: string;
  topic: string;
  difficulty: string;
  prompt: string;
  correctAnswer: string;
  points: number;
}

export default function HomeworkDetailPage() {
  const params = useParams<{ id: string }>();
  const homeworkId = params?.id ?? "";

  const [loading, setLoading] = useState(true);
  const [homework, setHomework] = useState<{
    id: string;
    classId: string;
    sessionId: string | null;
    title: string;
    description: string | null;
    dueDate: string;
    maxScore: number;
    class?: {
      id: string;
      code: string;
      name: string;
      subject: string;
    };
    session?: {
      id: string;
      sessionDate: string;
      startTime: string;
      endTime: string;
      topic: string | null;
    } | null;
  } | null>(null);

  const [rows, setRows] = useState<SubmissionRow[]>([]);
  const [questions, setQuestions] = useState<LinkedQuestion[]>([]);
  const [saving, setSaving] = useState(false);
  const [successMsg, setSuccessMsg] = useState("");
  const [errorMsg, setErrorMsg] = useState("");

  const loadHomeworkDetail = useCallback(async () => {
    if (!homeworkId) return;
    setLoading(true);
    try {
      const res = await fetch(`/api/homeworks/${homeworkId}`);
      if (!res.ok) return;
      const data = await res.json();
      setHomework(data.homework);
      setQuestions(Array.isArray(data.questions) ? data.questions : []);

      const rawSubs = Array.isArray(data.submissions) ? data.submissions : [];
      const mapped: SubmissionRow[] = rawSubs.map(
        (sub: {
          studentId: string;
          student: {
            id: string;
            studentCode: string;
            fullName: string;
            phone?: string | null;
          };
          status?: SubmissionStatus;
          score?: number | null;
          feedback?: string | null;
          submissionNote?: string | null;
          submittedAt?: string | null;
        }) => ({
          studentId: sub.studentId,
          student: sub.student,
          status: sub.status ?? "MISSING",
          score:
            sub.score !== undefined && sub.score !== null
              ? String(sub.score)
              : "",
          feedback: sub.feedback ?? "",
          submissionNote: sub.submissionNote ?? "",
          submittedAt: sub.submittedAt
            ? new Date(sub.submittedAt).toISOString().slice(0, 16)
            : "",
        })
      );
      setRows(mapped);
    } finally {
      setLoading(false);
    }
  }, [homeworkId]);

  useEffect(() => {
    loadHomeworkDetail();
  }, [loadHomeworkDetail]);

  const updateRow = (
    studentId: string,
    patch: Partial<Omit<SubmissionRow, "studentId" | "student">>
  ) => {
    setRows((prev) =>
      prev.map((r) => (r.studentId === studentId ? { ...r, ...patch } : r))
    );
  };

  const handleMarkAllSubmitted = () => {
    const nowIso = new Date().toISOString().slice(0, 16);
    setRows((prev) =>
      prev.map((r) =>
        r.status === "MISSING"
          ? {
              ...r,
              status: "SUBMITTED",
              submittedAt: r.submittedAt || nowIso,
            }
          : r
      )
    );
  };

  const handleSaveAllGrades = async () => {
    if (!homework) return;
    setSaving(true);
    setSuccessMsg("");
    setErrorMsg("");

    for (const r of rows) {
      if (r.score.trim() !== "") {
        const num = Number(r.score);
        if (Number.isNaN(num) || num < 0 || num > homework.maxScore) {
          setErrorMsg(
            `Điểm của học sinh ${r.student.fullName} phải từ 0 đến ${homework.maxScore}`
          );
          setSaving(false);
          return;
        }
      }
    }

    try {
      const payload = rows.map((r) => {
        const hasScore = r.score.trim() !== "";
        const numScore = hasScore ? Number(r.score) : null;
        const effectiveStatus: SubmissionStatus =
          hasScore && r.status === "MISSING" ? "GRADED" : r.status;

        return {
          studentId: r.studentId,
          status: effectiveStatus,
          score: numScore,
          feedback: r.feedback.trim() || null,
          submissionNote: r.submissionNote.trim() || null,
          submittedAt: r.submittedAt
            ? new Date(r.submittedAt).toISOString()
            : null,
        };
      });

      const res = await fetch(`/api/homeworks/${homework.id}/submissions`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ submissions: payload }),
      });
      const data = await res.json();
      if (!res.ok) {
        setErrorMsg(data.error || "Không thể lưu bảng điểm BTVN");
        return;
      }

      setSuccessMsg("Đã lưu bảng điểm BTVN thành công!");
      await loadHomeworkDetail();
    } catch {
      setErrorMsg("Lỗi kết nối máy chủ khi lưu điểm");
    } finally {
      setSaving(false);
    }
  };

  if (loading && !homework) {
    return (
      <div className="p-8 text-center text-sm text-slate-500">
        Đang tải chi tiết bài tập về nhà...
      </div>
    );
  }

  if (!homework) {
    return (
      <div className="space-y-4 p-8 text-center">
        <p className="text-base font-medium text-slate-700">
          Không tìm thấy bài tập về nhà trong workspace của bạn.
        </p>
        <Link href="/homeworks">
          <Button variant="outline">Quay lại danh sách BTVN</Button>
        </Link>
      </div>
    );
  }

  const totalStudents = rows.length;
  const gradedCount = rows.filter((r) => r.status === "GRADED").length;
  const submittedOrLateCount = rows.filter(
    (r) => r.status === "SUBMITTED" || r.status === "LATE"
  ).length;
  const missingCount = rows.filter((r) => r.status === "MISSING").length;

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="space-y-1">
          <div className="flex items-center gap-2 text-sm text-slate-500">
            <Link
              href="/homeworks"
              className="inline-flex items-center gap-1 hover:text-slate-900"
            >
              <ArrowLeft className="h-4 w-4" />
              <span>Danh sách Bài tập về nhà</span>
            </Link>
            <span>/</span>
            <span>{homework.class?.code}</span>
          </div>
          <h1 className="text-2xl font-bold text-slate-900">{homework.title}</h1>
          <p className="text-sm text-slate-600">
            Lớp: {homework.class?.name} • Hạn nộp:{" "}
            {formatDateVn(homework.dueDate)} • Điểm tối đa: {homework.maxScore}
          </p>
        </div>

        <div className="flex items-center gap-2">
          <Button variant="outline" onClick={handleMarkAllSubmitted}>
            Đánh dấu tất cả đã nộp
          </Button>
          <Button
            data-testid="btn-save-homework-grades"
            onClick={handleSaveAllGrades}
            disabled={saving}
          >
            <Save className="h-4 w-4" />
            <span>{saving ? "Đang lưu..." : "Lưu bảng điểm BTVN"}</span>
          </Button>
        </div>
      </div>

      {successMsg && (
        <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-medium text-emerald-800">
          {successMsg}
        </div>
      )}

      {errorMsg && (
        <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-medium text-red-700">
          {errorMsg}
        </div>
      )}

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardContent className="flex items-center justify-between p-4">
            <div>
              <p className="text-xs font-medium uppercase text-slate-500">
                Tổng học sinh lớp
              </p>
              <p className="mt-1 text-2xl font-bold text-slate-900">
                {totalStudents}
              </p>
            </div>
            <Users className="h-5 w-5 text-blue-600" />
          </CardContent>
        </Card>

        <Card>
          <CardContent className="flex items-center justify-between p-4">
            <div>
              <p className="text-xs font-medium uppercase text-slate-500">
                Đã chấm điểm (GRADED)
              </p>
              <p className="mt-1 text-2xl font-bold text-emerald-600">
                {gradedCount}
              </p>
            </div>
            <CheckCircle2 className="h-5 w-5 text-emerald-600" />
          </CardContent>
        </Card>

        <Card>
          <CardContent className="flex items-center justify-between p-4">
            <div>
              <p className="text-xs font-medium uppercase text-slate-500">
                Đã nộp / Chờ chấm
              </p>
              <p className="mt-1 text-2xl font-bold text-amber-600">
                {submittedOrLateCount}
              </p>
            </div>
            <Clock className="h-5 w-5 text-amber-600" />
          </CardContent>
        </Card>

        <Card>
          <CardContent className="flex items-center justify-between p-4">
            <div>
              <p className="text-xs font-medium uppercase text-slate-500">
                Chưa nộp bài (MISSING)
              </p>
              <p className="mt-1 text-2xl font-bold text-red-600">
                {missingCount}
              </p>
            </div>
            <AlertTriangle className="h-5 w-5 text-red-600" />
          </CardContent>
        </Card>
      </div>

      {questions.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <FileText className="h-4 w-4 text-blue-600" />
              <span>Câu hỏi đính kèm từ Ngân hàng Bài tập ({questions.length})</span>
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
              {questions.map((q, idx) => (
                <div
                  key={q.id}
                  className="rounded-xl border border-slate-200 bg-slate-50 p-3 text-xs"
                >
                  <div className="mb-1 flex items-center justify-between">
                    <span className="font-semibold text-slate-900">
                      Câu {idx + 1} ({q.type})
                    </span>
                    <Badge variant="outline">{q.points} điểm</Badge>
                  </div>
                  <p className="text-slate-800">{q.prompt}</p>
                  <p className="mt-1 text-emerald-700">
                    Đáp án chuẩn: {q.correctAnswer}
                  </p>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle>Bảng theo dõi nộp bài & Chấm điểm BTVN</CardTitle>
          <CardDescription>
            Hệ thống tự động phát hiện nộp muộn (LATE) nếu thời điểm nộp vượt
            quá hạn nộp {formatDateVn(homework.dueDate)}.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Table data-testid="homework-grading-table">
            <TableHeader>
              <TableRow>
                <TableHead>Học sinh</TableHead>
                <TableHead>Trạng thái nộp bài</TableHead>
                <TableHead>Thời điểm nộp</TableHead>
                <TableHead>Điểm số (/{homework.maxScore})</TableHead>
                <TableHead>Nhận xét của giáo viên</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((row) => (
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
                    <Select
                      data-testid={`select-sub-status-${row.studentId}`}
                      value={row.status}
                      onChange={(e) =>
                        updateRow(row.studentId, {
                          status: e.target.value as SubmissionStatus,
                        })
                      }
                      className="w-40"
                    >
                      <option value="MISSING">Chưa nộp (MISSING)</option>
                      <option value="SUBMITTED">Đã nộp (SUBMITTED)</option>
                      <option value="LATE">Nộp muộn (LATE)</option>
                      <option value="GRADED">Đã chấm (GRADED)</option>
                    </Select>
                  </TableCell>
                  <TableCell>
                    <Input
                      type="datetime-local"
                      value={row.submittedAt}
                      onChange={(e) =>
                        updateRow(row.studentId, {
                          submittedAt: e.target.value,
                          status:
                            row.status === "MISSING" ? "SUBMITTED" : row.status,
                        })
                      }
                      className="w-48 text-xs"
                    />
                  </TableCell>
                  <TableCell>
                    <Input
                      type="number"
                      step="0.25"
                      min={0}
                      max={homework.maxScore}
                      data-testid={`input-sub-score-${row.studentId}`}
                      placeholder={`0 - ${homework.maxScore}`}
                      value={row.score}
                      onChange={(e) => {
                        const val = e.target.value;
                        updateRow(row.studentId, {
                          score: val,
                          ...(val.trim() !== "" ? { status: "GRADED" } : {}),
                        });
                      }}
                      className="w-28"
                    />
                  </TableCell>
                  <TableCell>
                    <Input
                      data-testid={`input-sub-feedback-${row.studentId}`}
                      placeholder="Nhận xét bài làm..."
                      value={row.feedback}
                      onChange={(e) =>
                        updateRow(row.studentId, { feedback: e.target.value })
                      }
                    />
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
