import { NextRequest, NextResponse } from "next/server";
import type { DiscountType, EnrollmentStatus } from "@prisma/client";
import { prisma } from "@/lib/db";
import {
  assertWorkspaceResource,
  handleApiError,
  requireWorkspace,
} from "@/lib/workspace";

type RouteContext = { params: Promise<{ id: string }> };

const VALID_ENROLLMENT_STATUSES: EnrollmentStatus[] = [
  "ACTIVE",
  "PAUSED",
  "DROPPED",
  "COMPLETED",
];

const VALID_DISCOUNT_TYPES: DiscountType[] = ["FIXED", "PERCENTAGE"];

export async function PATCH(req: NextRequest, context: RouteContext) {
  try {
    const { workspaceId } = await requireWorkspace(req);
    const { id } = await context.params;

    const existing = assertWorkspaceResource(
      await prisma.enrollment.findFirst({
        where: { id, workspaceId },
      }),
      workspaceId,
      "Không tìm thấy thông tin ghi danh trong workspace của bạn"
    );

    const body = await req.json();

    let nextStatus = existing.status;
    if (body.status !== undefined) {
      const st = String(body.status).trim().toUpperCase();
      if (!VALID_ENROLLMENT_STATUSES.includes(st as EnrollmentStatus)) {
        return NextResponse.json(
          { error: "Trạng thái ghi danh không hợp lệ" },
          { status: 400 }
        );
      }
      nextStatus = st as EnrollmentStatus;
    }

    let nextLeftAt = existing.leftAt;
    if (body.leftAt !== undefined) {
      if (!body.leftAt) {
        nextLeftAt = null;
      } else {
        const parsed = new Date(body.leftAt);
        if (Number.isNaN(parsed.getTime())) {
          return NextResponse.json(
            { error: "Ngày nghỉ học / kết thúc không hợp lệ" },
            { status: 400 }
          );
        }
        nextLeftAt = parsed;
      }
    } else if (nextStatus === "ACTIVE") {
      nextLeftAt = null;
    } else if (
      (nextStatus === "DROPPED" || nextStatus === "COMPLETED") &&
      !existing.leftAt
    ) {
      nextLeftAt = new Date();
    }

    let nextDiscountType = existing.discountType;
    if (body.discountType !== undefined) {
      const dt = String(body.discountType).trim().toUpperCase();
      if (!VALID_DISCOUNT_TYPES.includes(dt as DiscountType)) {
        return NextResponse.json(
          { error: "Loại giảm trừ học phí không hợp lệ" },
          { status: 400 }
        );
      }
      nextDiscountType = dt as DiscountType;
    }

    let nextDiscount = existing.customFeeDiscount;
    if (body.customFeeDiscount !== undefined) {
      const discNum = Number(body.customFeeDiscount);
      if (!Number.isFinite(discNum) || discNum < 0) {
        return NextResponse.json(
          { error: "Mức giảm học phí không được nhỏ hơn 0" },
          { status: 400 }
        );
      }
      nextDiscount = Math.round(discNum);
    }

    if (nextDiscountType === "PERCENTAGE" && nextDiscount > 100) {
      return NextResponse.json(
        { error: "Mức giảm học phí theo phần trăm không được vượt quá 100%" },
        { status: 400 }
      );
    }

    const updated = await prisma.enrollment.update({
      where: { id: existing.id },
      data: {
        status: nextStatus,
        leftAt: nextLeftAt,
        discountType: nextDiscountType,
        customFeeDiscount: nextDiscount,
        discountNote:
          body.discountNote !== undefined
            ? body.discountNote
              ? String(body.discountNote).trim()
              : null
            : existing.discountNote,
      },
      include: {
        student: {
          include: {
            guardians: {
              orderBy: [{ isPrimary: "desc" }, { createdAt: "asc" }],
            },
          },
        },
        class: true,
      },
    });

    return NextResponse.json({ enrollment: updated }, { status: 200 });
  } catch (error) {
    return handleApiError(error);
  }
}

export async function DELETE(req: NextRequest, context: RouteContext) {
  try {
    const { workspaceId } = await requireWorkspace(req);
    const { id } = await context.params;

    const existing = assertWorkspaceResource(
      await prisma.enrollment.findFirst({
        where: { id, workspaceId },
      }),
      workspaceId,
      "Không tìm thấy thông tin ghi danh trong workspace của bạn"
    );

    await prisma.enrollment.delete({
      where: { id: existing.id },
    });

    return NextResponse.json({ deleted: true }, { status: 200 });
  } catch (error) {
    return handleApiError(error);
  }
}
