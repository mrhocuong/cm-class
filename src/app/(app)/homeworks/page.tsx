"use client";

import React, { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import {
  BookOpen,
  Calendar,
  CheckCircle2,
  Edit3,
  FileText,
  Plus,
  Search,
  Trash2,
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

interface ClassOption {
  id: string;
  code: string;
  name: string;
  subject: string;
}

interface QuestionItem {
  id: string;
  type: string;
  subject: string;
  topic: string;
  difficulty: string;
  prompt: string;
  points: number;
}

interface HomeworkItem {
  id: string;
  classId: string;
  sessionId: string | null;
  title: string;
  description: string | null;
  dueDate: string;
  maxScore: number;
  attachmentsJson: Array<{ title?: string; url?: string }> | null;
  questionIdsJson: string[] | null;
  class: {
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
  summary?: {
    totalEnrolled: number;
    submittedCount: number;
    gradedCount: number;
    lateCount: number;
  };
}

export default function HomeworksPage() {
  const [classes, setClasses] = useState<ClassOption[]>([]);
  const [questions, setQuestions] = useState<QuestionItem[]>([]);
  const [homeworks, setHomeworks] = useState<HomeworkItem[]>([]);
  const [loading, setLoading] = useState(true);

  const [filterClassId, setFilterClassId] = useState("");
  const [searchQuery, setSearchQuery] = useState("");

  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingHomework, setEditingHomework] = useState<HomeworkItem | null>(
    null
  );

  const [formClassId, setFormClassId] = useState("");
  const [formTitle, setFormTitle] = useState("");
  const [formDescription, setFormDescription] = useState("");
  const [formDueDate, setFormDueDate] = useState(() => {
    const d = new Date(Date.now() + 7 * 86400000);
    return d.toISOString().slice(0, 10);
  });
  const [formMaxScore, setFormMaxScore] = useState("10");
  const [formAttachmentTitle, setFormAttachmentTitle] = useState("");
  const [formAttachmentUrl, setFormAttachmentUrl] = useState("");
  const [selectedQuestionIds, setSelectedQuestionIds] = useState<string[]>([]);
  const [formError, setFormError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const loadMetadata = useCallback(async () => {
    try {
      const [clsRes, qRes] = await Promise.all([
        fetch("/api/classes"),
        fetch("/api/questions"),
      ]);
      if (clsRes.ok) {
        const clsData = await clsRes.json();
        const clsList: ClassOption[] = Array.isArray(clsData.classes)
          ? clsData.classes
          : [];
        setClasses(clsList);
        if (clsList.length > 0 && !formClassId) {
          setFormClassId(clsList[0].id);
        }
      }
      if (qRes.ok) {
        const qData = await qRes.json();
        setQuestions(Array.isArray(qData.questions) ? qData.questions : []);
      }
    } catch {
      // Ignore metadata error
    }
  }, [formClassId]);

  const loadHomeworks = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (filterClassId) params.set("classId", filterClassId);
      const res = await fetch(`/api/homeworks?${params.toString()}`);
      if (res.ok) {
        const data = await res.json();
        setHomeworks(Array.isArray(data.homeworks) ? data.homeworks : []);
      }
    } finally {
      setLoading(false);
    }
  }, [filterClassId]);

  useEffect(() => {
    loadMetadata();
  }, [loadMetadata]);

  useEffect(() => {
    loadHomeworks();
  }, [loadHomeworks]);

  const openCreateModal = () => {
    setEditingHomework(null);
    setFormError("");
    setFormClassId(classes[0]?.id ?? "");
    setFormTitle("");
    setFormDescription("");
    setFormDueDate(new Date(Date.now() + 7 * 86400000).toISOString().slice(0, 10));
    setFormMaxScore("10");
    setFormAttachmentTitle("");
    setFormAttachmentUrl("");
    setSelectedQuestionIds([]);
    setDialogOpen(true);
  };

  const openEditModal = (hw: HomeworkItem) => {
    setEditingHomework(hw);
    setFormError("");
    setFormClassId(hw.classId);
    setFormTitle(hw.title);
    setFormDescription(hw.description ?? "");
    setFormDueDate(
      hw.dueDate ? new Date(hw.dueDate).toISOString().slice(0, 10) : ""
    );
    setFormMaxScore(String(hw.maxScore ?? 10));
    const firstAtt =
      Array.isArray(hw.attachmentsJson) && hw.attachmentsJson.length > 0
        ? hw.attachmentsJson[0]
        : null;
    setFormAttachmentTitle(firstAtt?.title ?? "");
    setFormAttachmentUrl(firstAtt?.url ?? "");
    setSelectedQuestionIds(
      Array.isArray(hw.questionIdsJson) ? hw.questionIdsJson.map(String) : []
    );
    setDialogOpen(true);
  };

  const toggleQuestionId = (qId: string) => {
    setSelectedQuestionIds((prev) =>
      prev.includes(qId) ? prev.filter((id) => id !== qId) : [...prev, qId]
    );
  };

  const handleSubmitHomework = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError("");
    setSubmitting(true);
    try {
      const attachmentsJson = formAttachmentUrl.trim()
        ? [
            {
              title: formAttachmentTitle.trim() || "Tài liệu đính kèm",
              url: formAttachmentUrl.trim(),
            },
          ]
        : [];

      const payload = {
        classId: formClassId,
        title: formTitle.trim(),
        description: formDescription.trim() || null,
        dueDate: new Date(formDueDate).toISOString(),
        maxScore: Number(formMaxScore),
        attachmentsJson,
        questionIdsJson: selectedQuestionIds,
      };

      const url = editingHomework
        ? `/api/homeworks/${editingHomework.id}`
        : "/api/homeworks";
      const method = editingHomework ? "PATCH" : "POST";

      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (!res.ok) {
        setFormError(data.error || "Không thể lưu bài tập về nhà");
        return;
      }

      setDialogOpen(false);
      await loadHomeworks();
    } catch {
      setFormError("Lỗi kết nối máy chủ");
    } finally {
      setSubmitting(false);
    }
  };

  const handleDeleteHomework = async (id: string) => {
    const res = await fetch(`/api/homeworks/${id}`, { method: "DELETE" });
    if (res.ok) {
      await loadHomeworks();
    }
  };

  const filteredHomeworks = homeworks.filter((hw) => {
    if (!searchQuery.trim()) return true;
    const q = searchQuery.toLowerCase();
    return (
      hw.title.toLowerCase().includes(q) ||
      hw.class?.name?.toLowerCase().includes(q) ||
      hw.class?.code?.toLowerCase().includes(q)
    );
  });

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900">
            Quản lý Bài tập về nhà (BTVN)
          </h1>
          <p className="text-sm text-slate-600">
            Giao bài tập gắn với lớp học, buổi học và kho câu hỏi; theo dõi nộp
            bài và chấm điểm.
          </p>
        </div>

        <Button data-testid="btn-create-homework" onClick={openCreateModal}>
          <Plus className="h-4 w-4" />
          <span>Giao bài tập mới</span>
        </Button>
      </div>

      <Card>
        <CardContent className="p-4">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <div>
              <Label className="mb-1.5 block text-xs text-slate-500">
                Lọc theo lớp học
              </Label>
              <Select
                data-testid="filter-homework-class"
                value={filterClassId}
                onChange={(e) => setFilterClassId(e.target.value)}
              >
                <option value="">Tất cả lớp học</option>
                {classes.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.code} — {c.name}
                  </option>
                ))}
              </Select>
            </div>

            <div className="sm:col-span-2">
              <Label className="mb-1.5 block text-xs text-slate-500">
                Tìm kiếm bài tập
              </Label>
              <div className="relative">
                <Search className="pointer-events-none absolute left-3 top-3 h-4 w-4 text-slate-400" />
                <Input
                  data-testid="filter-homework-search"
                  className="pl-9"
                  placeholder="Tìm theo tiêu đề bài tập, mã lớp hoặc tên lớp..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                />
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {loading ? (
        <Card>
          <CardContent className="py-10 text-center text-sm text-slate-500">
            Đang tải danh sách bài tập về nhà...
          </CardContent>
        </Card>
      ) : filteredHomeworks.length === 0 ? (
        <Card>
          <CardContent className="py-10 text-center text-sm text-slate-500">
            Chưa có bài tập về nhà nào trong danh sách.
          </CardContent>
        </Card>
      ) : (
        <div
          className="grid grid-cols-1 gap-4 md:grid-cols-2"
          data-testid="homeworks-list"
        >
          {filteredHomeworks.map((hw) => {
            const qCount = Array.isArray(hw.questionIdsJson)
              ? hw.questionIdsJson.length
              : 0;
            const totalEnrolled = hw.summary?.totalEnrolled ?? 0;
            const submittedCount = hw.summary?.submittedCount ?? 0;
            const gradedCount = hw.summary?.gradedCount ?? 0;
            const lateCount = hw.summary?.lateCount ?? 0;

            return (
              <Card key={hw.id} className="flex flex-col justify-between">
                <CardHeader>
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <Badge variant="outline" className="mb-2">
                        {hw.class?.code} — {hw.class?.name}
                      </Badge>
                      <CardTitle className="text-lg">{hw.title}</CardTitle>
                    </div>
                    <Badge variant="default">Thang điểm: {hw.maxScore}</Badge>
                  </div>
                  {hw.description && (
                    <CardDescription className="line-clamp-2 pt-1">
                      {hw.description}
                    </CardDescription>
                  )}
                </CardHeader>

                <CardContent className="space-y-4">
                  <div className="flex flex-wrap items-center gap-2 text-xs text-slate-600">
                    <span className="inline-flex items-center gap-1 font-medium text-slate-800">
                      <Calendar className="h-3.5 w-3.5 text-blue-600" />
                      Hạn nộp: {formatDateVn(hw.dueDate)}
                    </span>
                    {qCount > 0 && (
                      <Badge variant="secondary">
                        <FileText className="mr-1 h-3 w-3" />
                        {qCount} câu hỏi đính kèm
                      </Badge>
                    )}
                  </div>

                  <div className="flex flex-wrap items-center gap-2">
                    <Badge variant="success">
                      <CheckCircle2 className="mr-1 h-3 w-3" />
                      Đã nộp: {submittedCount}/{totalEnrolled}
                    </Badge>
                    <Badge variant="default">Đã chấm: {gradedCount}</Badge>
                    {lateCount > 0 && (
                      <Badge variant="warning">Nộp muộn: {lateCount}</Badge>
                    )}
                  </div>

                  <div className="flex items-center justify-between border-t border-slate-100 pt-3">
                    <Link href={`/homeworks/${hw.id}`}>
                      <Button size="sm">
                        <BookOpen className="h-3.5 w-3.5" />
                        <span>Chấm bài & Chi tiết</span>
                      </Button>
                    </Link>

                    <div className="flex items-center gap-2">
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => openEditModal(hw)}
                      >
                        <Edit3 className="h-3.5 w-3.5" />
                        <span>Sửa</span>
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => handleDeleteHomework(hw.id)}
                      >
                        <Trash2 className="h-3.5 w-3.5 text-red-600" />
                      </Button>
                    </div>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-xl">
          <DialogHeader>
            <DialogTitle>
              {editingHomework
                ? "Cập nhật Bài tập về nhà"
                : "Giao Bài tập về nhà mới"}
            </DialogTitle>
            <DialogDescription>
              Thiết lập nội dung bài tập, hạn nộp, thang điểm và liên kết câu
              hỏi từ ngân hàng bài tập.
            </DialogDescription>
          </DialogHeader>

          <form onSubmit={handleSubmitHomework} className="space-y-4">
            {formError && (
              <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
                {formError}
              </div>
            )}

            <div className="space-y-1.5">
              <Label>Lớp học *</Label>
              <Select
                data-testid="select-homework-class"
                value={formClassId}
                onChange={(e) => setFormClassId(e.target.value)}
                disabled={Boolean(editingHomework)}
                required
              >
                <option value="">-- Chọn lớp học --</option>
                {classes.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.code} — {c.name}
                  </option>
                ))}
              </Select>
            </div>

            <div className="space-y-1.5">
              <Label>Tiêu đề bài tập *</Label>
              <Input
                data-testid="input-homework-title"
                placeholder="VD: BTVN Buổi 1: Hàm số bậc nhất"
                value={formTitle}
                onChange={(e) => setFormTitle(e.target.value)}
                required
              />
            </div>

            <div className="space-y-1.5">
              <Label>Mô tả / Hướng dẫn làm bài</Label>
              <Input
                data-testid="input-homework-description"
                placeholder="Hướng dẫn chi tiết cho học sinh..."
                value={formDescription}
                onChange={(e) => setFormDescription(e.target.value)}
              />
            </div>

            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label>Hạn nộp bài *</Label>
                <Input
                  type="date"
                  data-testid="input-homework-duedate"
                  value={formDueDate}
                  onChange={(e) => setFormDueDate(e.target.value)}
                  required
                />
              </div>
              <div className="space-y-1.5">
                <Label>Thang điểm tối đa *</Label>
                <Input
                  type="number"
                  step="0.5"
                  min="1"
                  max="100"
                  data-testid="input-homework-maxscore"
                  value={formMaxScore}
                  onChange={(e) => setFormMaxScore(e.target.value)}
                  required
                />
              </div>
            </div>

            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label>Tên tài liệu đính kèm (Tuỳ chọn)</Label>
                <Input
                  placeholder="VD: Đề PDF Chương 1"
                  value={formAttachmentTitle}
                  onChange={(e) => setFormAttachmentTitle(e.target.value)}
                />
              </div>
              <div className="space-y-1.5">
                <Label>Đường dẫn tài liệu (URL)</Label>
                <Input
                  placeholder="https://example.com/de-btvn.pdf"
                  value={formAttachmentUrl}
                  onChange={(e) => setFormAttachmentUrl(e.target.value)}
                />
              </div>
            </div>

            {questions.length > 0 && (
              <div className="space-y-1.5">
                <Label>
                  Liên kết câu hỏi từ Kho bài tập ({selectedQuestionIds.length}{" "}
                  đã chọn)
                </Label>
                <div className="max-h-36 space-y-1.5 overflow-y-auto rounded-lg border border-slate-200 p-2.5">
                  {questions.map((q) => (
                    <label
                      key={q.id}
                      className="flex cursor-pointer items-start gap-2 rounded-md p-1.5 text-xs hover:bg-slate-50"
                    >
                      <input
                        type="checkbox"
                        checked={selectedQuestionIds.includes(q.id)}
                        onChange={() => toggleQuestionId(q.id)}
                        className="mt-0.5"
                      />
                      <div>
                        <span className="font-semibold text-slate-800">
                          [{q.subject} - {q.topic}]
                        </span>{" "}
                        <span className="text-slate-700">{q.prompt}</span>
                      </div>
                    </label>
                  ))}
                </div>
              </div>
            )}

            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                onClick={() => setDialogOpen(false)}
              >
                Huỷ
              </Button>
              <Button type="submit" disabled={submitting}>
                {submitting
                  ? "Đang lưu..."
                  : editingHomework
                  ? "Lưu thay đổi"
                  : "Giao bài tập"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
