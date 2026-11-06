"use client";

import React, { useCallback, useEffect, useState } from "react";
import {
  BookOpen,
  Copy,
  Edit3,
  FileJson,
  Filter,
  HelpCircle,
  Plus,
  RefreshCw,
  Search,
  Tag,
  Trash2,
  CheckCircle2,
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
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

type QuestionType =
  | "MULTIPLE_CHOICE"
  | "FILL_IN_BLANK"
  | "SHORT_ANSWER"
  | "ESSAY";
type QuestionDifficulty = "EASY" | "MEDIUM" | "HARD";

interface McqOption {
  id: string;
  text: string;
}

interface ExerciseQuestionItem {
  id: string;
  type: QuestionType;
  subject: string;
  topic: string;
  difficulty: QuestionDifficulty;
  prompt: string;
  optionsJson: McqOption[] | null;
  correctAnswer: string;
  explanation: string | null;
  points: number;
  tagsJson: string[] | null;
  createdAt: string;
}

interface QuestionFacets {
  subjects: string[];
  topics: string[];
  tags: string[];
}

const QUESTION_TYPE_LABELS: Record<QuestionType, string> = {
  MULTIPLE_CHOICE: "Trắc nghiệm",
  FILL_IN_BLANK: "Điền vào chỗ trống",
  SHORT_ANSWER: "Trả lời ngắn",
  ESSAY: "Tự luận",
};

const DIFFICULTY_META: Record<
  QuestionDifficulty,
  { label: string; variant: "success" | "warning" | "destructive" }
> = {
  EASY: { label: "Dễ", variant: "success" },
  MEDIUM: { label: "Trung bình", variant: "warning" },
  HARD: { label: "Khó", variant: "destructive" },
};

const SAMPLE_BULK_JSON = JSON.stringify(
  [
    {
      type: "MULTIPLE_CHOICE",
      subject: "Toán",
      topic: "Phương trình bậc hai",
      difficulty: "MEDIUM",
      prompt: "Nghiệm dương của phương trình x² - 9 = 0 là bao nhiêu?",
      optionsJson: [
        { id: "A", text: "3" },
        { id: "B", text: "-3" },
        { id: "C", text: "9" },
        { id: "D", text: "0" },
      ],
      correctAnswer: "A",
      explanation: "x² = 9 => x = 3 hoặc x = -3. Nghiệm dương là 3.",
      points: 10,
      tagsJson: ["toan9", "phuong-trinh"],
    },
    {
      type: "FILL_IN_BLANK",
      subject: "Tiếng Anh",
      topic: "Conditional Sentences",
      difficulty: "EASY",
      prompt: "If it rains tomorrow, we ___ stay at home.",
      correctAnswer: "will",
      explanation: "Câu điều kiện loại 1 dùng will + V nguyên mẫu ở mệnh đề chính.",
      points: 10,
      tagsJson: ["ielts", "grammar"],
    },
  ],
  null,
  2
);

export default function QuestionsBankPage() {
  const [questions, setQuestions] = useState<ExerciseQuestionItem[]>([]);
  const [facets, setFacets] = useState<QuestionFacets>({
    subjects: [],
    topics: [],
    tags: [],
  });
  const [loading, setLoading] = useState(true);
  const [bannerMessage, setBannerMessage] = useState<{
    type: "success" | "error";
    text: string;
  } | null>(null);

  // Filter state
  const [searchQuery, setSearchQuery] = useState("");
  const [subjectFilter, setSubjectFilter] = useState("");
  const [topicFilter, setTopicFilter] = useState("");
  const [difficultyFilter, setDifficultyFilter] = useState("");
  const [typeFilter, setTypeFilter] = useState("");
  const [tagFilter, setTagFilter] = useState("");

  // Create / Edit Modal state
  const [modalOpen, setModalOpen] = useState(false);
  const [editingQuestion, setEditingQuestion] =
    useState<ExerciseQuestionItem | null>(null);
  const [formType, setFormType] = useState<QuestionType>("MULTIPLE_CHOICE");
  const [formDifficulty, setFormDifficulty] =
    useState<QuestionDifficulty>("MEDIUM");
  const [formSubject, setFormSubject] = useState("Toán");
  const [formTopic, setFormTopic] = useState("Căn bậc hai");
  const [formPoints, setFormPoints] = useState("10");
  const [formPrompt, setFormPrompt] = useState("");
  const [formOptions, setFormOptions] = useState<McqOption[]>([
    { id: "A", text: "" },
    { id: "B", text: "" },
    { id: "C", text: "" },
    { id: "D", text: "" },
  ]);
  const [formCorrectAnswer, setFormCorrectAnswer] = useState("A");
  const [formExplanation, setFormExplanation] = useState("");
  const [formTags, setFormTags] = useState("");
  const [formError, setFormError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  // Bulk Import Modal state
  const [bulkModalOpen, setBulkModalOpen] = useState(false);
  const [bulkJsonText, setBulkJsonText] = useState(SAMPLE_BULK_JSON);
  const [bulkError, setBulkError] = useState<string | null>(null);
  const [bulkSubmitting, setBulkSubmitting] = useState(false);

  const fetchQuestions = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (searchQuery.trim()) params.set("q", searchQuery.trim());
      if (subjectFilter) params.set("subject", subjectFilter);
      if (topicFilter) params.set("topic", topicFilter);
      if (difficultyFilter) params.set("difficulty", difficultyFilter);
      if (typeFilter) params.set("type", typeFilter);
      if (tagFilter) params.set("tag", tagFilter);

      const res = await fetch(`/api/questions?${params.toString()}`);
      if (!res.ok) {
        throw new Error("Không thể tải danh sách câu hỏi");
      }
      const data = await res.json();
      setQuestions(Array.isArray(data.questions) ? data.questions : []);
      if (data.facets) {
        setFacets({
          subjects: Array.isArray(data.facets.subjects)
            ? data.facets.subjects
            : [],
          topics: Array.isArray(data.facets.topics) ? data.facets.topics : [],
          tags: Array.isArray(data.facets.tags) ? data.facets.tags : [],
        });
      }
    } catch (err) {
      setBannerMessage({
        type: "error",
        text: err instanceof Error ? err.message : "Lỗi tải dữ liệu",
      });
    } finally {
      setLoading(false);
    }
  }, [
    searchQuery,
    subjectFilter,
    topicFilter,
    difficultyFilter,
    typeFilter,
    tagFilter,
  ]);

  useEffect(() => {
    void fetchQuestions();
  }, [fetchQuestions]);

  const openCreateModal = () => {
    setEditingQuestion(null);
    setFormType("MULTIPLE_CHOICE");
    setFormDifficulty("MEDIUM");
    setFormSubject("Toán");
    setFormTopic("Đại số 9");
    setFormPoints("10");
    setFormPrompt("");
    setFormOptions([
      { id: "A", text: "" },
      { id: "B", text: "" },
      { id: "C", text: "" },
      { id: "D", text: "" },
    ]);
    setFormCorrectAnswer("A");
    setFormExplanation("");
    setFormTags("toan9, on-tap");
    setFormError(null);
    setModalOpen(true);
  };

  const openEditModal = (q: ExerciseQuestionItem) => {
    setEditingQuestion(q);
    setFormType(q.type);
    setFormDifficulty(q.difficulty);
    setFormSubject(q.subject);
    setFormTopic(q.topic);
    setFormPoints(String(q.points));
    setFormPrompt(q.prompt);
    const opts =
      Array.isArray(q.optionsJson) && q.optionsJson.length >= 2
        ? q.optionsJson.map((o, idx) => ({
            id: o.id || String.fromCharCode(65 + idx),
            text: o.text || "",
          }))
        : [
            { id: "A", text: "" },
            { id: "B", text: "" },
            { id: "C", text: "" },
            { id: "D", text: "" },
          ];
    setFormOptions(opts);
    setFormCorrectAnswer(q.correctAnswer);
    setFormExplanation(q.explanation || "");
    setFormTags(Array.isArray(q.tagsJson) ? q.tagsJson.join(", ") : "");
    setFormError(null);
    setModalOpen(true);
  };

  const handleSaveQuestion = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);
    setSubmitting(true);

    try {
      const payload: Record<string, unknown> = {
        type: formType,
        difficulty: formDifficulty,
        subject: formSubject.trim(),
        topic: formTopic.trim(),
        points: Number(formPoints),
        prompt: formPrompt.trim(),
        correctAnswer: formCorrectAnswer.trim(),
        explanation: formExplanation.trim() || null,
        tagsJson: formTags
          .split(",")
          .map((t) => t.trim())
          .filter(Boolean),
      };

      if (formType === "MULTIPLE_CHOICE") {
        payload.optionsJson = formOptions.map((o, idx) => ({
          id: o.id || String.fromCharCode(65 + idx),
          text: o.text.trim(),
        }));
      }

      const url = editingQuestion
        ? `/api/questions/${editingQuestion.id}`
        : "/api/questions";
      const method = editingQuestion ? "PATCH" : "POST";

      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || "Không thể lưu câu hỏi");
      }

      setModalOpen(false);
      setBannerMessage({
        type: "success",
        text: editingQuestion
          ? "Đã cập nhật câu hỏi thành công!"
          : "Đã thêm câu hỏi mới vào ngân hàng đề!",
      });
      await fetchQuestions();
    } catch (err) {
      setFormError(err instanceof Error ? err.message : "Lỗi khi lưu câu hỏi");
    } finally {
      setSubmitting(false);
    }
  };

  const handleDuplicateQuestion = async (q: ExerciseQuestionItem) => {
    try {
      const res = await fetch("/api/questions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ duplicateFromId: q.id }),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || "Không thể nhân bản câu hỏi");
      }
      setBannerMessage({
        type: "success",
        text: "Đã nhân bản câu hỏi thành công!",
      });
      await fetchQuestions();
    } catch (err) {
      setBannerMessage({
        type: "error",
        text: err instanceof Error ? err.message : "Lỗi khi nhân bản câu hỏi",
      });
    }
  };

  const handleDeleteQuestion = async (q: ExerciseQuestionItem) => {
    try {
      const res = await fetch(`/api/questions/${q.id}`, {
        method: "DELETE",
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || "Không thể xoá câu hỏi");
      }
      setBannerMessage({
        type: "success",
        text: "Đã xoá câu hỏi khỏi kho bài tập.",
      });
      await fetchQuestions();
    } catch (err) {
      setBannerMessage({
        type: "error",
        text: err instanceof Error ? err.message : "Lỗi khi xoá câu hỏi",
      });
    }
  };

  const handleBulkImport = async (e: React.FormEvent) => {
    e.preventDefault();
    setBulkError(null);
    setBulkSubmitting(true);

    try {
      let parsed: unknown;
      try {
        parsed = JSON.parse(bulkJsonText);
      } catch {
        throw new Error("Định dạng JSON không hợp lệ. Vui lòng kiểm tra cú pháp.");
      }

      const questionsArray = Array.isArray(parsed)
        ? parsed
        : parsed &&
          typeof parsed === "object" &&
          Array.isArray((parsed as { questions?: unknown }).questions)
        ? (parsed as { questions: unknown[] }).questions
        : null;

      if (!questionsArray || questionsArray.length === 0) {
        throw new Error("Vui lòng nhập mảng JSON chứa ít nhất 1 câu hỏi.");
      }

      const res = await fetch("/api/questions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          bulk: true,
          questions: questionsArray,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || "Nhập hàng loạt thất bại");
      }

      setBulkModalOpen(false);
      setBannerMessage({
        type: "success",
        text: `Đã nhập thành công ${data.createdCount || questionsArray.length} câu hỏi vào kho!`,
      });
      await fetchQuestions();
    } catch (err) {
      setBulkError(err instanceof Error ? err.message : "Lỗi nhập hàng loạt");
    } finally {
      setBulkSubmitting(false);
    }
  };

  const subjectOptions = Array.from(
    new Set(["Toán", "Tiếng Anh", "Vật Lý", "Hoá Học", "Ngữ Văn", ...facets.subjects])
  );

  return (
    <div data-testid="questions-page" className="space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 flex items-center gap-2">
            <BookOpen className="h-7 w-7 text-blue-600" />
            Kho bài tập & Ngân hàng câu hỏi
          </h1>
          <p className="text-sm text-slate-500 mt-1">
            Quản lý câu hỏi trắc nghiệm, điền từ, trả lời ngắn, tự luận để giao bài tập về nhà và tổ chức Minigame
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <Button
            variant="outline"
            data-testid="btn-bulk-import-questions"
            onClick={() => {
              setBulkError(null);
              setBulkModalOpen(true);
            }}
          >
            <FileJson className="mr-2 h-4 w-4 text-blue-600" />
            Nhập hàng loạt (JSON)
          </Button>
          <Button
            data-testid="btn-create-question"
            onClick={openCreateModal}
          >
            <Plus className="mr-2 h-4 w-4" />
            Tạo câu hỏi mới
          </Button>
        </div>
      </div>

      {/* Feedback Banner */}
      {bannerMessage && (
        <div
          className={`flex items-center justify-between rounded-lg border px-4 py-3 text-sm ${
            bannerMessage.type === "success"
              ? "border-emerald-200 bg-emerald-50 text-emerald-800"
              : "border-red-200 bg-red-50 text-red-800"
          }`}
        >
          <span>{bannerMessage.text}</span>
          <button
            type="button"
            onClick={() => setBannerMessage(null)}
            className="text-xs font-medium underline ml-4"
          >
            Đóng
          </button>
        </div>
      )}

      {/* KPI Summary Cards */}
      <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
        <Card>
          <CardContent className="p-4">
            <div className="text-xs font-medium text-slate-500">
              Tổng số câu hỏi hiển thị
            </div>
            <div className="mt-1 text-2xl font-bold text-slate-900">
              {questions.length}
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="text-xs font-medium text-slate-500">
              Trắc nghiệm (MCQ)
            </div>
            <div className="mt-1 text-2xl font-bold text-blue-600">
              {questions.filter((q) => q.type === "MULTIPLE_CHOICE").length}
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="text-xs font-medium text-slate-500">
              Môn học trong kho
            </div>
            <div className="mt-1 text-2xl font-bold text-emerald-600">
              {facets.subjects.length || 1}
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="text-xs font-medium text-slate-500">
              Chuyên đề / Chủ đề
            </div>
            <div className="mt-1 text-2xl font-bold text-amber-600">
              {facets.topics.length || 1}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Multi-Criteria Filter Bar */}
      <Card data-testid="questions-filter-bar">
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <Filter className="h-4 w-4 text-slate-500" />
            Bộ lọc đa tiêu chí
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
            <div className="relative sm:col-span-2 lg:col-span-3 xl:col-span-2">
              <Search className="absolute left-3 top-3 h-4 w-4 text-slate-400" />
              <Input
                data-testid="filter-question-search"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Tìm theo nội dung câu hỏi, chủ đề, giải thích..."
                className="pl-9"
              />
            </div>

            <div>
              <Select
                data-testid="filter-question-subject"
                value={subjectFilter}
                onChange={(e) => setSubjectFilter(e.target.value)}
              >
                <option value="">Tất cả môn học</option>
                {subjectOptions.map((subj) => (
                  <option key={subj} value={subj}>
                    {subj}
                  </option>
                ))}
              </Select>
            </div>

            <div>
              <Select
                data-testid="filter-question-topic"
                value={topicFilter}
                onChange={(e) => setTopicFilter(e.target.value)}
              >
                <option value="">Tất cả chuyên đề</option>
                {facets.topics.map((top) => (
                  <option key={top} value={top}>
                    {top}
                  </option>
                ))}
              </Select>
            </div>

            <div>
              <Select
                data-testid="filter-question-difficulty"
                value={difficultyFilter}
                onChange={(e) => setDifficultyFilter(e.target.value)}
              >
                <option value="">Tất cả độ khó</option>
                <option value="EASY">Dễ (Easy)</option>
                <option value="MEDIUM">Trung bình (Medium)</option>
                <option value="HARD">Khó (Hard)</option>
              </Select>
            </div>

            <div>
              <Select
                data-testid="filter-question-type"
                value={typeFilter}
                onChange={(e) => setTypeFilter(e.target.value)}
              >
                <option value="">Tất cả loại câu hỏi</option>
                <option value="MULTIPLE_CHOICE">Trắc nghiệm</option>
                <option value="FILL_IN_BLANK">Điền vào chỗ trống</option>
                <option value="SHORT_ANSWER">Trả lời ngắn</option>
                <option value="ESSAY">Tự luận</option>
              </Select>
            </div>
          </div>

          <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-xs font-medium text-slate-500 flex items-center gap-1">
                <Tag className="h-3.5 w-3.5" /> Nhãn (Tag):
              </span>
              <Select
                data-testid="filter-question-tag"
                value={tagFilter}
                onChange={(e) => setTagFilter(e.target.value)}
                className="h-8 w-44 text-xs py-1"
              >
                <option value="">Tất cả nhãn (tag)</option>
                {facets.tags.map((t) => (
                  <option key={t} value={t}>
                    #{t}
                  </option>
                ))}
              </Select>
            </div>

            <Button
              variant="ghost"
              size="sm"
              onClick={() => {
                setSearchQuery("");
                setSubjectFilter("");
                setTopicFilter("");
                setDifficultyFilter("");
                setTypeFilter("");
                setTagFilter("");
              }}
            >
              <RefreshCw className="mr-1.5 h-3.5 w-3.5" />
              Đặt lại bộ lọc
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Questions List */}
      <div data-testid="questions-list" className="space-y-4">
        {loading ? (
          <Card>
            <CardContent className="p-8 text-center text-sm text-slate-500">
              Đang tải ngân hàng câu hỏi...
            </CardContent>
          </Card>
        ) : questions.length === 0 ? (
          <Card>
            <CardContent className="p-8 text-center">
              <HelpCircle className="mx-auto h-10 w-10 text-slate-300" />
              <p className="mt-2 font-medium text-slate-700">
                Không tìm thấy câu hỏi nào phù hợp với bộ lọc
              </p>
              <p className="text-xs text-slate-500 mt-1">
                Hãy thử xoá bộ lọc hoặc tạo câu hỏi mới vào kho bài tập.
              </p>
            </CardContent>
          </Card>
        ) : (
          questions.map((q) => {
            const diffMeta =
              DIFFICULTY_META[q.difficulty] || DIFFICULTY_META.MEDIUM;
            const tags = Array.isArray(q.tagsJson) ? q.tagsJson : [];

            return (
              <Card
                key={q.id}
                data-testid={`question-card-${q.id}`}
                className="transition-shadow hover:shadow-md"
              >
                <CardContent className="p-5">
                  <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                    <div className="space-y-2 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <Badge variant="default">
                          {QUESTION_TYPE_LABELS[q.type] || q.type}
                        </Badge>
                        <Badge variant={diffMeta.variant}>
                          {diffMeta.label}
                        </Badge>
                        <Badge variant="secondary">{q.subject}</Badge>
                        <Badge variant="outline">{q.topic}</Badge>
                        <span className="text-xs font-semibold text-blue-700 bg-blue-50 px-2 py-0.5 rounded-md">
                          {q.points} điểm
                        </span>
                      </div>

                      <h3 className="text-base font-semibold text-slate-900">
                        {q.prompt}
                      </h3>

                      {q.type === "MULTIPLE_CHOICE" &&
                      Array.isArray(q.optionsJson) ? (
                        <div className="grid grid-cols-1 gap-2 pt-1 sm:grid-cols-2">
                          {q.optionsJson.map((opt, idx) => {
                            const optId =
                              opt.id || String.fromCharCode(65 + idx);
                            const isCorrect =
                              optId.toLowerCase() ===
                                q.correctAnswer.toLowerCase() ||
                              String(opt.text).toLowerCase() ===
                                q.correctAnswer.toLowerCase();

                            return (
                              <div
                                key={optId}
                                className={`flex items-center gap-2 rounded-lg border px-3 py-2 text-sm ${
                                  isCorrect
                                    ? "border-emerald-300 bg-emerald-50 font-medium text-emerald-900"
                                    : "border-slate-200 bg-slate-50 text-slate-700"
                                }`}
                              >
                                <span
                                  className={`inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-xs font-bold ${
                                    isCorrect
                                      ? "bg-emerald-600 text-white"
                                      : "bg-slate-200 text-slate-700"
                                  }`}
                                >
                                  {optId}
                                </span>
                                <span className="flex-1">{opt.text}</span>
                                {isCorrect && (
                                  <CheckCircle2 className="h-4 w-4 text-emerald-600 shrink-0" />
                                )}
                              </div>
                            );
                          })}
                        </div>
                      ) : (
                        <div className="rounded-lg border border-emerald-200 bg-emerald-50/70 px-3 py-2 text-sm text-emerald-900">
                          <span className="font-semibold">Đáp án đúng: </span>
                          {q.correctAnswer}
                        </div>
                      )}

                      {q.explanation && (
                        <p className="text-xs text-slate-600 bg-slate-100 rounded-md px-3 py-2">
                          <span className="font-semibold text-slate-700">
                            Giải thích:{" "}
                          </span>
                          {q.explanation}
                        </p>
                      )}

                      {tags.length > 0 && (
                        <div className="flex flex-wrap items-center gap-1.5 pt-1">
                          {tags.map((t) => (
                            <span
                              key={t}
                              className="inline-flex items-center rounded-md bg-slate-100 px-2 py-0.5 text-xs text-slate-600"
                            >
                              #{t}
                            </span>
                          ))}
                        </div>
                      )}
                    </div>

                    <div className="flex sm:flex-col items-center gap-2 shrink-0">
                      <Button
                        variant="outline"
                        size="sm"
                        data-testid={`btn-duplicate-question-${q.id}`}
                        onClick={() => void handleDuplicateQuestion(q)}
                        title="Nhân bản câu hỏi"
                      >
                        <Copy className="mr-1.5 h-3.5 w-3.5" />
                        Nhân bản
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        data-testid={`btn-edit-question-${q.id}`}
                        onClick={() => openEditModal(q)}
                        title="Chỉnh sửa câu hỏi"
                      >
                        <Edit3 className="mr-1.5 h-3.5 w-3.5" />
                        Sửa
                      </Button>
                      <Button
                        variant="destructive"
                        size="sm"
                        data-testid={`btn-delete-question-${q.id}`}
                        onClick={() => void handleDeleteQuestion(q)}
                        title="Xoá câu hỏi"
                      >
                        <Trash2 className="mr-1.5 h-3.5 w-3.5" />
                        Xoá
                      </Button>
                    </div>
                  </div>
                </CardContent>
              </Card>
            );
          })
        )}
      </div>

      {/* Create / Edit Question Modal */}
      <Dialog open={modalOpen} onOpenChange={setModalOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>
              {editingQuestion ? "Chỉnh sửa câu hỏi" : "Tạo câu hỏi mới"}
            </DialogTitle>
            <DialogDescription>
              Thiết lập nội dung câu hỏi, đáp án đúng, giải thích và phân loại chuyên đề
            </DialogDescription>
          </DialogHeader>

          <form
            data-testid="question-form"
            onSubmit={handleSaveQuestion}
            className="space-y-4"
          >
            {formError && (
              <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">
                {formError}
              </div>
            )}

            <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
              <div>
                <Label>Loại câu hỏi</Label>
                <Select
                  data-testid="input-question-type"
                  value={formType}
                  onChange={(e) => setFormType(e.target.value as QuestionType)}
                  className="mt-1"
                >
                  <option value="MULTIPLE_CHOICE">Trắc nghiệm (MCQ)</option>
                  <option value="FILL_IN_BLANK">Điền vào chỗ trống</option>
                  <option value="SHORT_ANSWER">Trả lời ngắn</option>
                  <option value="ESSAY">Tự luận</option>
                </Select>
              </div>

              <div>
                <Label>Độ khó</Label>
                <Select
                  data-testid="input-question-difficulty"
                  value={formDifficulty}
                  onChange={(e) =>
                    setFormDifficulty(e.target.value as QuestionDifficulty)
                  }
                  className="mt-1"
                >
                  <option value="EASY">Dễ (Easy)</option>
                  <option value="MEDIUM">Trung bình (Medium)</option>
                  <option value="HARD">Khó (Hard)</option>
                </Select>
              </div>

              <div>
                <Label>Điểm số</Label>
                <Input
                  type="number"
                  min={1}
                  step="any"
                  data-testid="input-question-points"
                  value={formPoints}
                  onChange={(e) => setFormPoints(e.target.value)}
                  className="mt-1"
                  required
                />
              </div>
            </div>

            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div>
                <Label>Môn học</Label>
                <Input
                  data-testid="input-question-subject"
                  value={formSubject}
                  onChange={(e) => setFormSubject(e.target.value)}
                  placeholder="VD: Toán, Tiếng Anh..."
                  className="mt-1"
                  required
                />
              </div>
              <div>
                <Label>Chuyên đề / Chủ đề</Label>
                <Input
                  data-testid="input-question-topic"
                  value={formTopic}
                  onChange={(e) => setFormTopic(e.target.value)}
                  placeholder="VD: Căn bậc hai, Hàm số..."
                  className="mt-1"
                  required
                />
              </div>
            </div>

            <div>
              <Label>Nội dung câu hỏi (Prompt)</Label>
              <textarea
                data-testid="input-question-prompt"
                value={formPrompt}
                onChange={(e) => setFormPrompt(e.target.value)}
                rows={3}
                className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none"
                placeholder="Nhập đề bài hoặc câu hỏi..."
                required
              />
            </div>

            {formType === "MULTIPLE_CHOICE" ? (
              <div className="space-y-2 rounded-lg border border-slate-200 bg-slate-50 p-3">
                <div className="flex items-center justify-between">
                  <Label>Các phương án lựa chọn (tối thiểu 2 lựa chọn)</Label>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() =>
                      setFormOptions((prev) => [
                        ...prev,
                        {
                          id: String.fromCharCode(65 + prev.length),
                          text: "",
                        },
                      ])
                    }
                  >
                    + Thêm lựa chọn
                  </Button>
                </div>

                {formOptions.map((opt, idx) => (
                  <div key={opt.id} className="flex items-center gap-2">
                    <span className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-blue-100 text-xs font-bold text-blue-800">
                      {opt.id}
                    </span>
                    <Input
                      value={opt.text}
                      onChange={(e) => {
                        const val = e.target.value;
                        setFormOptions((prev) =>
                          prev.map((item, i) =>
                            i === idx ? { ...item, text: val } : item
                          )
                        );
                      }}
                      placeholder={`Nội dung phương án ${opt.id}`}
                      required
                    />
                    {formOptions.length > 2 && (
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        onClick={() =>
                          setFormOptions((prev) =>
                            prev.filter((_, i) => i !== idx)
                          )
                        }
                      >
                        Xoá
                      </Button>
                    )}
                  </div>
                ))}

                <div className="pt-2">
                  <Label>Đáp án đúng (Mã phương án hoặc nội dung)</Label>
                  <Input
                    data-testid="input-question-correct-answer"
                    value={formCorrectAnswer}
                    onChange={(e) => setFormCorrectAnswer(e.target.value)}
                    placeholder="VD: A"
                    className="mt-1"
                    required
                  />
                </div>
              </div>
            ) : (
              <div>
                <Label>Đáp án chuẩn (Correct Answer)</Label>
                <Input
                  data-testid="input-question-correct-answer"
                  value={formCorrectAnswer}
                  onChange={(e) => setFormCorrectAnswer(e.target.value)}
                  placeholder="Nhập đáp án đúng..."
                  className="mt-1"
                  required
                />
              </div>
            )}

            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div>
                <Label>Giải thích đáp án (tuỳ chọn)</Label>
                <Input
                  data-testid="input-question-explanation"
                  value={formExplanation}
                  onChange={(e) => setFormExplanation(e.target.value)}
                  placeholder="Hướng dẫn giải ngắn gọn..."
                  className="mt-1"
                />
              </div>
              <div>
                <Label>Nhãn phân loại (Tags - cách nhau dấu phẩy)</Label>
                <Input
                  data-testid="input-question-tags"
                  value={formTags}
                  onChange={(e) => setFormTags(e.target.value)}
                  placeholder="toan9, dai-so, on-thi"
                  className="mt-1"
                />
              </div>
            </div>

            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                onClick={() => setModalOpen(false)}
              >
                Huỷ
              </Button>
              <Button
                type="submit"
                data-testid="btn-save-question"
                disabled={submitting}
              >
                {submitting ? "Đang lưu..." : "Lưu câu hỏi"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Bulk Import Modal */}
      <Dialog open={bulkModalOpen} onOpenChange={setBulkModalOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Nhập câu hỏi hàng loạt (Transactional Bulk Import)</DialogTitle>
            <DialogDescription>
              Dán danh sách câu hỏi định dạng JSON. Toàn bộ danh sách sẽ được kiểm tra tính hợp lệ và lưu nguyên tử (transaction).
            </DialogDescription>
          </DialogHeader>

          <form onSubmit={handleBulkImport} className="space-y-4">
            {bulkError && (
              <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">
                {bulkError}
              </div>
            )}

            <div className="flex items-center justify-between">
              <Label>Mảng JSON các câu hỏi</Label>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => setBulkJsonText(SAMPLE_BULK_JSON)}
              >
                Chèn mẫu JSON chuẩn
              </Button>
            </div>

            <textarea
              data-testid="input-bulk-questions-json"
              value={bulkJsonText}
              onChange={(e) => setBulkJsonText(e.target.value)}
              rows={10}
              className="w-full rounded-lg border border-slate-300 bg-slate-950 p-3 font-mono text-xs text-emerald-400 focus:border-blue-500 focus:outline-none"
            />

            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                onClick={() => setBulkModalOpen(false)}
              >
                Huỷ
              </Button>
              <Button
                type="submit"
                data-testid="btn-submit-bulk-questions"
                disabled={bulkSubmitting}
              >
                {bulkSubmitting
                  ? "Đang nhập..."
                  : "Xác nhận nhập hàng loạt"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
