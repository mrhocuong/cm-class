import { NextRequest, NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import {
  requireWorkspace,
  assertWorkspaceResource,
  handleApiError,
} from "@/lib/workspace";
import { validateQuestionInput } from "@/lib/m4-validators";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { workspaceId } = await requireWorkspace(req);
    const { id } = await params;

    const question = assertWorkspaceResource(
      await prisma.exerciseQuestion.findFirst({
        where: { id, workspaceId },
      }),
      workspaceId,
      "Không tìm thấy câu hỏi trong workspace của bạn"
    );

    return NextResponse.json({ question });
  } catch (error) {
    return handleApiError(error);
  }
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { workspaceId } = await requireWorkspace(req);
    const { id } = await params;
    const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;

    const existing = assertWorkspaceResource(
      await prisma.exerciseQuestion.findFirst({
        where: { id, workspaceId },
      }),
      workspaceId,
      "Không tìm thấy câu hỏi trong workspace của bạn"
    );

    const merged: Record<string, unknown> = {
      type: body.type !== undefined ? body.type : existing.type,
      subject: body.subject !== undefined ? body.subject : existing.subject,
      topic: body.topic !== undefined ? body.topic : existing.topic,
      difficulty:
        body.difficulty !== undefined ? body.difficulty : existing.difficulty,
      prompt: body.prompt !== undefined ? body.prompt : existing.prompt,
      optionsJson:
        body.optionsJson !== undefined
          ? body.optionsJson
          : body.options !== undefined
          ? body.options
          : existing.optionsJson,
      correctAnswer:
        body.correctAnswer !== undefined
          ? body.correctAnswer
          : existing.correctAnswer,
      explanation:
        body.explanation !== undefined
          ? body.explanation
          : existing.explanation,
      points: body.points !== undefined ? body.points : existing.points,
      tagsJson:
        body.tagsJson !== undefined
          ? body.tagsJson
          : body.tags !== undefined
          ? body.tags
          : existing.tagsJson,
    };

    const validated = validateQuestionInput(merged);

    const updated = await prisma.exerciseQuestion.update({
      where: { id: existing.id },
      data: {
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

    return NextResponse.json({ question: updated });
  } catch (error) {
    return handleApiError(error);
  }
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { workspaceId } = await requireWorkspace(req);
    const { id } = await params;

    const existing = assertWorkspaceResource(
      await prisma.exerciseQuestion.findFirst({
        where: { id, workspaceId },
      }),
      workspaceId,
      "Không tìm thấy câu hỏi trong workspace của bạn"
    );

    await prisma.exerciseQuestion.delete({
      where: { id: existing.id },
    });

    return NextResponse.json({ success: true, deletedId: existing.id });
  } catch (error) {
    return handleApiError(error);
  }
}
