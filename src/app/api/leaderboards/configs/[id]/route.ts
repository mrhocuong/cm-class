import { NextRequest, NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import {
  requireWorkspace,
  assertWorkspaceResource,
  WorkspaceAuthError,
  handleApiError,
} from "@/lib/workspace";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { workspaceId } = await requireWorkspace(req);
    const { id } = await params;

    const config = assertWorkspaceResource(
      await prisma.leaderboardConfig.findFirst({
        where: { id, workspaceId },
        include: {
          class: {
            select: { id: true, code: true, name: true },
          },
        },
      }),
      workspaceId,
      "Không tìm thấy cấu hình bảng xếp hạng trong workspace của bạn"
    );

    return NextResponse.json({ config });
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
      await prisma.leaderboardConfig.findFirst({
        where: { id, workspaceId },
      }),
      workspaceId,
      "Không tìm thấy cấu hình bảng xếp hạng trong workspace của bạn"
    );

    const name =
      body.name !== undefined ? String(body.name).trim() : existing.name;
    if (!name) {
      throw new WorkspaceAuthError(
        400,
        "Tên cấu hình bảng xếp hạng không được để trống"
      );
    }

    const classId =
      body.classId !== undefined
        ? body.classId && String(body.classId).trim() !== ""
          ? String(body.classId).trim()
          : null
        : existing.classId;

    if (classId) {
      assertWorkspaceResource(
        await prisma.class.findFirst({
          where: { id: classId, workspaceId },
        }),
        workspaceId,
        "Không tìm thấy lớp học trong workspace của bạn"
      );
    }

    const attendanceWeight =
      body.attendanceWeight !== undefined
        ? Number(body.attendanceWeight)
        : existing.attendanceWeight;
    const homeworkWeight =
      body.homeworkWeight !== undefined
        ? Number(body.homeworkWeight)
        : existing.homeworkWeight;
    const gameWeight =
      body.gameWeight !== undefined
        ? Number(body.gameWeight)
        : existing.gameWeight;
    const bonusWeight =
      body.bonusWeight !== undefined
        ? Number(body.bonusWeight)
        : existing.bonusWeight;

    const weights = [
      attendanceWeight,
      homeworkWeight,
      gameWeight,
      bonusWeight,
    ];
    if (
      weights.some((w) => !Number.isFinite(w) || w < 0) ||
      attendanceWeight + homeworkWeight + gameWeight + bonusWeight <= 0
    ) {
      throw new WorkspaceAuthError(
        400,
        "Tổng trọng số xếp hạng phải lớn hơn 0 và không được âm"
      );
    }

    const periodStart =
      body.periodStart !== undefined
        ? body.periodStart && String(body.periodStart).trim()
          ? new Date(String(body.periodStart))
          : null
        : existing.periodStart;

    const periodEnd =
      body.periodEnd !== undefined
        ? body.periodEnd && String(body.periodEnd).trim()
          ? new Date(String(body.periodEnd))
          : null
        : existing.periodEnd;

    if (
      (periodStart && Number.isNaN(periodStart.getTime())) ||
      (periodEnd && Number.isNaN(periodEnd.getTime())) ||
      (periodStart && periodEnd && periodStart > periodEnd)
    ) {
      throw new WorkspaceAuthError(400, "Khoảng thời gian cấu hình không hợp lệ");
    }

    const isDefault =
      body.isDefault !== undefined ? Boolean(body.isDefault) : existing.isDefault;

    const rulesJson =
      body.rulesJson !== undefined
        ? body.rulesJson && typeof body.rulesJson === "object"
          ? (body.rulesJson as Prisma.InputJsonValue)
          : Prisma.JsonNull
        : existing.rulesJson !== null
        ? (existing.rulesJson as Prisma.InputJsonValue)
        : Prisma.JsonNull;

    const config = await prisma.$transaction(async (tx) => {
      if (isDefault) {
        await tx.leaderboardConfig.updateMany({
          where: {
            workspaceId,
            classId,
            isDefault: true,
            id: { not: existing.id },
          },
          data: { isDefault: false },
        });
      }

      return tx.leaderboardConfig.update({
        where: { id: existing.id },
        data: {
          name,
          classId,
          attendanceWeight,
          homeworkWeight,
          gameWeight,
          bonusWeight,
          periodStart,
          periodEnd,
          rulesJson,
          isDefault,
        },
        include: {
          class: {
            select: { id: true, code: true, name: true },
          },
        },
      });
    });

    return NextResponse.json({ config });
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
      await prisma.leaderboardConfig.findFirst({
        where: { id, workspaceId },
      }),
      workspaceId,
      "Không tìm thấy cấu hình bảng xếp hạng trong workspace của bạn"
    );

    await prisma.leaderboardConfig.delete({
      where: { id: existing.id },
    });

    return NextResponse.json({ success: true, id: existing.id });
  } catch (error) {
    return handleApiError(error);
  }
}
