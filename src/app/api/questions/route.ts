import { NextRequest, NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import {
  requireWorkspace,
  assertWorkspaceResource,
  WorkspaceAuthError,
  handleApiError,
} from "@/lib/workspace";
import {
  validateQuestionInput,
  VALID_QUESTION_TYPES,
  VALID_QUESTION_DIFFICULTIES,
} from "@/lib/m4-validators";

export async function GET(req: NextRequest) {
  try {
    const { workspaceId } = await requireWorkspace(req);
    const { searchParams } = new URL(req.url);

    const subjectFilter = searchParams.get("subject")?.trim() || "";
    const topicFilter = searchParams.get("topic")?.trim() || "";
    const difficultyFilter =
      searchParams.get("difficulty")?.trim().toUpperCase() || "";
    const typeFilter = searchParams.get("type")?.trim().toUpperCase() || "";
    const tagFilter = searchParams.get("tag")?.trim().toLowerCase() || "";
    const keywordFilter = (
      searchParams.get("q") ??
      searchParams.get("search") ??
      ""
    )
      .trim()
      .toLowerCase();

    const allQuestions = await prisma.exerciseQuestion.findMany({
      where: { workspaceId },
      orderBy: [{ createdAt: "desc" }, { id: "asc" }],
    });

    // Build facets across the entire workspace
    const subjectsSet = new Set<string>();
    const topicsSet = new Set<string>();
    const tagsSet = new Set<string>();

    for (const q of allQuestions) {
      if (q.subject) subjectsSet.add(q.subject);
      if (q.topic) topicsSet.add(q.topic);
      if (Array.isArray(q.tagsJson)) {
        for (const t of q.tagsJson) {
          if (typeof t === "string" && t.trim()) {
            tagsSet.add(t.trim());
          }
        }
      }
    }

    const filtered = allQuestions.filter((q) => {
      if (
        difficultyFilter &&
        VALID_QUESTION_DIFFICULTIES.includes(
          difficultyFilter as (typeof VALID_QUESTION_DIFFICULTIES)[number]
        ) &&
        q.difficulty !== difficultyFilter
      ) {
        return false;
      }

      if (
        typeFilter &&
        VALID_QUESTION_TYPES.includes(
          typeFilter as (typeof VALID_QUESTION_TYPES)[number]
        ) &&
        q.type !== typeFilter
      ) {
        return false;
      }

      if (
        subjectFilter &&
        q.subject.toLowerCase() !== subjectFilter.toLowerCase()
      ) {
        return false;
      }

      if (
        topicFilter &&
        !q.topic.toLowerCase().includes(topicFilter.toLowerCase())
      ) {
        return false;
      }

      if (tagFilter) {
        const tags = Array.isArray(q.tagsJson)
          ? q.tagsJson.map((t) => String(t).toLowerCase())
          : [];
        if (!tags.includes(tagFilter)) {
          return false;
        }
      }

      if (keywordFilter) {
        const haystack = [
          q.prompt,
          q.explanation ?? "",
          q.topic,
          q.subject,
          q.correctAnswer,
        ]
          .join(" ")
          .toLowerCase();
        if (!haystack.includes(keywordFilter)) {
          return false;
        }
      }

      return true;
    });

    return NextResponse.json({
      questions: filtered,
      total: filtered.length,
      facets: {
        subjects: Array.from(subjectsSet).sort((a, b) => a.localeCompare(b, "vi")),
        topics: Array.from(topicsSet).sort((a, b) => a.localeCompare(b, "vi")),
        tags: Array.from(tagsSet).sort((a, b) => a.localeCompare(b, "vi")),
      },
    });
  } catch (error) {
    return handleApiError(error);
  }
}

export async function POST(req: NextRequest) {
  try {
    const { workspaceId } = await requireWorkspace(req);
    const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;

    // 1. Duplicate / Clone mode
    const duplicateFromId = String(
      body.duplicateFromId ?? body.cloneFromId ?? ""
    ).trim();
    if (duplicateFromId) {
      const source = assertWorkspaceResource(
        await prisma.exerciseQuestion.findFirst({
          where: { id: duplicateFromId, workspaceId },
        }),
        workspaceId,
        "Không tìm thấy câu hỏi gốc trong workspace của bạn"
      );

      const customPrompt =
        typeof body.prompt === "string" && body.prompt.trim().length > 0
          ? body.prompt.trim()
          : `${source.prompt} (Bản sao)`;

      const duplicated = await prisma.exerciseQuestion.create({
        data: {
          workspaceId,
          type: source.type,
          subject: source.subject,
          topic: source.topic,
          difficulty: source.difficulty,
          prompt: customPrompt,
          optionsJson:
            source.optionsJson !== null
              ? (source.optionsJson as Prisma.InputJsonValue)
              : Prisma.JsonNull,
          correctAnswer: source.correctAnswer,
          explanation: source.explanation,
          points: source.points,
          tagsJson:
            source.tagsJson !== null
              ? (source.tagsJson as Prisma.InputJsonValue)
              : Prisma.JsonNull,
        },
      });

      return NextResponse.json({ question: duplicated }, { status: 201 });
    }

    // 2. Transactional Bulk Import mode
    if (body.bulk === true || Array.isArray(body.questions)) {
      const rawQuestions = body.questions;
      if (!Array.isArray(rawQuestions) || rawQuestions.length === 0) {
        throw new WorkspaceAuthError(
          400,
          "Danh sách câu hỏi nhập hàng loạt không được để trống"
        );
      }

      const validatedBatch = rawQuestions.map((item, idx) => {
        if (!item || typeof item !== "object") {
          throw new WorkspaceAuthError(
            400,
            `Câu hỏi thứ ${idx + 1} không hợp lệ`
          );
        }
        return validateQuestionInput(item as Record<string, unknown>);
      });

      const createdQuestions = await prisma.$transaction(
        validatedBatch.map((q) =>
          prisma.exerciseQuestion.create({
            data: {
              workspaceId,
              type: q.type,
              subject: q.subject,
              topic: q.topic,
              difficulty: q.difficulty,
              prompt: q.prompt,
              optionsJson:
                q.optionsJson !== null
                  ? (q.optionsJson as Prisma.InputJsonValue)
                  : Prisma.JsonNull,
              correctAnswer: q.correctAnswer,
              explanation: q.explanation,
              points: q.points,
              tagsJson: q.tagsJson as Prisma.InputJsonValue,
            },
          })
        )
      );

      return NextResponse.json(
        {
          questions: createdQuestions,
          createdCount: createdQuestions.length,
        },
        { status: 201 }
      );
    }

    // 3. Single Question Creation mode
    const validated = validateQuestionInput(body);
    const created = await prisma.exerciseQuestion.create({
      data: {
        workspaceId,
        type: validated.type,
        subject: validated.subject,
        topic: validated.topic,
        difficulty: validated.difficulty,
        prompt: validated.prompt,
        optionsJson:
          validated.optionsJson !== null
            ? (validated.optionsJson as Prisma.InputJsonValue)
            : Prisma.JsonNull,
        correctAnswer: validated.correctAnswer,
        explanation: validated.explanation,
        points: validated.points,
        tagsJson: validated.tagsJson as Prisma.InputJsonValue,
      },
    });

    return NextResponse.json({ question: created }, { status: 201 });
  } catch (error) {
    return handleApiError(error);
  }
}
