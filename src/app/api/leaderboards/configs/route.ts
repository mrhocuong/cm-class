import { NextRequest, NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import {
  requireWorkspace,
  assertWorkspaceResource,
  WorkspaceAuthError,
  handleApiError,
} from "@/lib/workspace";

export async function GET(req: NextRequest) {
  try {
    const { workspaceId } = await requireWorkspace(req);
    const { searchParams } = new URL(req.url);
    const classId = searchParams.get("classId")?.trim() || null;

    const configs = await prisma.leaderboardConfig.findMany({
      where: {
        workspaceId,
        ...(classId ? { OR: [{ classId }, { classId: null }] } : {}),
      },
      include: {
        class: {
          select: { id: true, code: true, name: true },
        },
      },
      orderBy: [{ isDefault: "desc" }, { updatedAt: "desc" }],
    });

    return NextResponse.json({ configs });
  } catch (error) {
    return handleApiError(error);
  }
}

export async function POST(req: NextRequest) {
  try {
    const { workspaceId } = await requireWorkspace(req);
    const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;

    const name = String(body.name ?? "").trim();
    if (!name) {
      throw new WorkspaceAuthError(
        400,
        "Tên cấu hình bảng xếp hạng không được để trống"
      );
    }

    const classId =
      body.classId !== undefined &&
      body.classId !== null &&
      String(body.classId).trim() !== ""
        ? String(body.classId).trim()
        : null;

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
      body.attendanceWeight !== undefined ? Number(body.attendanceWeight) : 25;
    const homeworkWeight =
      body.homeworkWeight !== undefined ? Number(body.homeworkWeight) : 35;
    const gameWeight =
      body.gameWeight !== undefined ? Number(body.gameWeight) : 25;
    const bonusWeight =
      body.bonusWeight !== undefined ? Number(body.bonusWeight) : 15;

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
      body.periodStart && String(body.periodStart).trim()
        ? new Date(String(body.periodStart))
        : null;
    const periodEnd =
      body.periodEnd && String(body.periodEnd).trim()
        ? new Date(String(body.periodEnd))
        : null;

    if (
      (periodStart && Number.isNaN(periodStart.getTime())) ||
      (periodEnd && Number.isNaN(periodEnd.getTime())) ||
      (periodStart && periodEnd && periodStart > periodEnd)
    ) {
      throw new WorkspaceAuthError(400, "Khoảng thời gian cấu hình không hợp lệ");
    }

    const isDefault = Boolean(body.isDefault);
    const rulesJson =
      body.rulesJson && typeof body.rulesJson === "object"
        ? (body.rulesJson as Prisma.InputJsonValue)
        : Prisma.JsonNull;

    const config = await prisma.$transaction(async (tx) => {
      if (isDefault) {
        await tx.leaderboardConfig.updateMany({
          where: {
            workspaceId,
            classId,
            isDefault: true,
          },
          data: { isDefault: false },
        });
      }

      return tx.leaderboardConfig.create({
        data: {
          workspaceId,
          classId,
          name,
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

    return NextResponse.json({ config }, { status: 201 });
  } catch (error) {
    return handleApiError(error);
  }
}
