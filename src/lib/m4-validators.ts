import type { QuestionDifficulty, QuestionType, MinigameType } from "@prisma/client";
import { WorkspaceAuthError } from "./workspace";
import { MINIGAME_ARCHETYPES } from "./game-engine";

export const VALID_QUESTION_TYPES: readonly QuestionType[] = [
  "MULTIPLE_CHOICE",
  "FILL_IN_BLANK",
  "SHORT_ANSWER",
  "ESSAY",
] as const;

export const VALID_QUESTION_DIFFICULTIES: readonly QuestionDifficulty[] = [
  "EASY",
  "MEDIUM",
  "HARD",
] as const;

export const VALID_MINIGAME_TYPES: readonly MinigameType[] = [
  "SPEED_QUIZ",
  "FLASH_MATCH",
  "WORD_CROSS",
  "TEAM_BUZZER",
  "LUCKY_WHEEL",
] as const;

export interface NormalizedMcqOption {
  id: string;
  text: string;
}

export interface ValidatedQuestionData {
  type: QuestionType;
  subject: string;
  topic: string;
  difficulty: QuestionDifficulty;
  prompt: string;
  optionsJson: NormalizedMcqOption[] | unknown[] | null;
  correctAnswer: string;
  explanation: string | null;
  points: number;
  tagsJson: string[];
}

export function normalizeTagsInput(raw: unknown): string[] {
  if (Array.isArray(raw)) {
    return Array.from(
      new Set(
        raw
          .map((item) => String(item ?? "").trim())
          .filter((item) => item.length > 0)
      )
    );
  }
  if (typeof raw === "string") {
    return Array.from(
      new Set(
        raw
          .split(",")
          .map((item) => item.trim())
          .filter((item) => item.length > 0)
      )
    );
  }
  return [];
}

export function validateQuestionInput(
  input: Record<string, unknown>
): ValidatedQuestionData {
  if (!input || typeof input !== "object") {
    throw new WorkspaceAuthError(400, "Dữ liệu câu hỏi không hợp lệ");
  }

  const rawType =
    input.type !== undefined && input.type !== null && String(input.type).trim() !== ""
      ? String(input.type).trim().toUpperCase()
      : "MULTIPLE_CHOICE";

  if (!VALID_QUESTION_TYPES.includes(rawType as QuestionType)) {
    throw new WorkspaceAuthError(400, "Loại câu hỏi không hợp lệ");
  }
  const type = rawType as QuestionType;

  const rawDifficulty =
    input.difficulty !== undefined &&
    input.difficulty !== null &&
    String(input.difficulty).trim() !== ""
      ? String(input.difficulty).trim().toUpperCase()
      : "MEDIUM";

  if (!VALID_QUESTION_DIFFICULTIES.includes(rawDifficulty as QuestionDifficulty)) {
    throw new WorkspaceAuthError(400, "Độ khó câu hỏi không hợp lệ");
  }
  const difficulty = rawDifficulty as QuestionDifficulty;

  const subject =
    input.subject !== undefined && input.subject !== null
      ? String(input.subject).trim()
      : "Tổng hợp";
  if (!subject) {
    throw new WorkspaceAuthError(400, "Môn học không được để trống");
  }

  const topic =
    input.topic !== undefined && input.topic !== null
      ? String(input.topic).trim()
      : "Chung";
  if (!topic) {
    throw new WorkspaceAuthError(400, "Chuyên đề (topic) không được để trống");
  }

  const prompt = String(input.prompt ?? "").trim();
  if (!prompt) {
    throw new WorkspaceAuthError(
      400,
      "Nội dung câu hỏi (prompt) không được để trống"
    );
  }

  const correctAnswer = String(input.correctAnswer ?? "").trim();
  if (!correctAnswer) {
    throw new WorkspaceAuthError(
      400,
      "Đáp án đúng (correctAnswer) không được để trống"
    );
  }

  const points =
    input.points !== undefined && input.points !== null
      ? Number(input.points)
      : 10;
  if (!Number.isFinite(points) || points <= 0) {
    throw new WorkspaceAuthError(400, "Điểm câu hỏi phải lớn hơn 0");
  }

  const explanation =
    input.explanation !== undefined &&
    input.explanation !== null &&
    String(input.explanation).trim() !== ""
      ? String(input.explanation).trim()
      : null;

  const tagsJson = normalizeTagsInput(input.tagsJson ?? input.tags);

  const rawOptions = input.optionsJson ?? input.options;
  let optionsJson: NormalizedMcqOption[] | unknown[] | null = null;

  if (type === "MULTIPLE_CHOICE") {
    if (!Array.isArray(rawOptions) || rawOptions.length < 2) {
      throw new WorkspaceAuthError(
        400,
        "Câu hỏi trắc nghiệm (MULTIPLE_CHOICE) phải có ít nhất 2 lựa chọn"
      );
    }

    const normalizedOptions: NormalizedMcqOption[] = rawOptions.map(
      (opt, idx) => {
        const fallbackId = String.fromCharCode(65 + idx);
        if (typeof opt === "string") {
          const text = opt.trim();
          return { id: fallbackId, text };
        }
        if (opt && typeof opt === "object") {
          const obj = opt as Record<string, unknown>;
          const id = String(obj.id ?? obj.key ?? fallbackId).trim() || fallbackId;
          const text = String(
            obj.text ?? obj.label ?? obj.value ?? obj.content ?? ""
          ).trim();
          return { id, text };
        }
        return { id: fallbackId, text: "" };
      }
    );

    if (normalizedOptions.some((o) => !o.id || !o.text)) {
      throw new WorkspaceAuthError(
        400,
        "Tất cả lựa chọn của câu hỏi trắc nghiệm phải có nội dung"
      );
    }

    const answerLower = correctAnswer.toLowerCase();
    const matchesOption = normalizedOptions.some(
      (o) =>
        o.id.toLowerCase() === answerLower ||
        o.text.toLowerCase() === answerLower
    );

    if (!matchesOption) {
      throw new WorkspaceAuthError(
        400,
        "Đáp án đúng phải trùng khớp với một trong các lựa chọn của câu hỏi trắc nghiệm"
      );
    }

    optionsJson = normalizedOptions;
  } else if (Array.isArray(rawOptions)) {
    optionsJson = rawOptions;
  }

  return {
    type,
    subject,
    topic,
    difficulty,
    prompt,
    optionsJson,
    correctAnswer,
    explanation,
    points,
    tagsJson,
  };
}

export interface ValidatedMinigameData {
  title: string;
  type: MinigameType;
  description: string | null;
  timeLimit: number;
  pointsPerQuestion: number;
  rulesJson: Record<string, unknown>;
  questionIds: string[];
  tagsJson: string[];
}

export function validateMinigameInput(
  input: Record<string, unknown>
): ValidatedMinigameData {
  if (!input || typeof input !== "object") {
    throw new WorkspaceAuthError(400, "Dữ liệu minigame không hợp lệ");
  }

  const title = String(input.title ?? "").trim();
  if (!title) {
    throw new WorkspaceAuthError(400, "Tên minigame không được để trống");
  }

  const rawType =
    input.type !== undefined && input.type !== null && String(input.type).trim() !== ""
      ? String(input.type).trim().toUpperCase()
      : "SPEED_QUIZ";

  if (!VALID_MINIGAME_TYPES.includes(rawType as MinigameType)) {
    throw new WorkspaceAuthError(400, "Thể loại minigame không hợp lệ");
  }
  const type = rawType as MinigameType;

  const archetypeMeta = MINIGAME_ARCHETYPES.find((a) => a.type === type);

  const timeLimit =
    input.timeLimit !== undefined && input.timeLimit !== null
      ? Math.round(Number(input.timeLimit))
      : (archetypeMeta?.defaultTimeLimit ?? 30);

  if (!Number.isFinite(timeLimit) || timeLimit <= 0) {
    throw new WorkspaceAuthError(
      400,
      "Thời gian mỗi câu (timeLimit) phải lớn hơn 0"
    );
  }

  const pointsPerQuestion =
    input.pointsPerQuestion !== undefined && input.pointsPerQuestion !== null
      ? Number(input.pointsPerQuestion)
      : (archetypeMeta?.defaultPointsPerQuestion ?? 100);

  if (!Number.isFinite(pointsPerQuestion) || pointsPerQuestion <= 0) {
    throw new WorkspaceAuthError(
      400,
      "Điểm mỗi câu (pointsPerQuestion) phải lớn hơn 0"
    );
  }

  const description =
    input.description !== undefined &&
    input.description !== null &&
    String(input.description).trim() !== ""
      ? String(input.description).trim()
      : null;

  const rulesJson: Record<string, unknown> =
    input.rulesJson && typeof input.rulesJson === "object" && !Array.isArray(input.rulesJson)
      ? (input.rulesJson as Record<string, unknown>)
      : { ...(archetypeMeta?.defaultRules ?? {}) };

  const rawQIds = input.questionIdsJson ?? input.questionIds;
  const questionIds = Array.isArray(rawQIds)
    ? Array.from(
        new Set(
          rawQIds
            .map((id) => String(id ?? "").trim())
            .filter((id) => id.length > 0)
        )
      )
    : [];

  const tagsJson = normalizeTagsInput(input.tagsJson ?? input.tags);

  return {
    title,
    type,
    description,
    timeLimit,
    pointsPerQuestion,
    rulesJson,
    questionIds,
    tagsJson,
  };
}
