import { NextRequest, NextResponse } from "next/server";
import type { BillingCycle } from "@prisma/client";
import { prisma } from "@/lib/db";
import {
  assertWorkspaceResource,
  handleApiError,
  requireWorkspace,
} from "@/lib/workspace";

type RouteContext = { params: Promise<{ id: string }> };

const VALID_BILLING_CYCLES: BillingCycle[] = [
  "MONTHLY",
  "PER_COURSE",
  "PER_SESSION",
];

export async function PATCH(req: NextRequest, context: RouteContext) {
  try {
    const { workspaceId } = await requireWorkspace(req);
    const { id } = await context.params;

    const existing = assertWorkspaceResource(
      await prisma.feePlan.findFirst({
        where: { id, workspaceId },
      }),
      workspaceId,
      "Không tìm thấy biểu phí trong workspace của bạn"
    );

    const body = await req.json();

    let nextName = existing.name;
    if (body.name !== undefined) {
      nextName = String(body.name ?? "").trim();
      if (!nextName) {
        return NextResponse.json(
          { error: "Tên biểu phí không được để trống" },
          { status: 400 }
        );
      }
    }

    let nextBillingCycle = existing.billingCycle;
    if (body.billingCycle !== undefined) {
      const bc = String(body.billingCycle).trim().toUpperCase();
      if (!VALID_BILLING_CYCLES.includes(bc as BillingCycle)) {
        return NextResponse.json(
          { error: "Chu kỳ thu học phí không hợp lệ" },
          { status: 400 }
        );
      }
      nextBillingCycle = bc as BillingCycle;
    }

    let nextAmount = existing.amount;
    if (body.amount !== undefined) {
      const amountNum = Number(body.amount);
      if (!Number.isFinite(amountNum) || amountNum < 0) {
        return NextResponse.json(
          { error: "Số tiền biểu phí không hợp lệ" },
          { status: 400 }
        );
      }
      nextAmount = Math.round(amountNum);
    }

    const nextIsDefault =
      body.isDefault !== undefined
        ? Boolean(body.isDefault)
        : existing.isDefault;

    const feePlan = await prisma.$transaction(async (tx) => {
      if (body.isDefault === true) {
        await tx.feePlan.updateMany({
          where: {
            workspaceId,
            classId: existing.classId,
            id: { not: existing.id },
            isDefault: true,
          },
          data: { isDefault: false },
        });
      }

      return tx.feePlan.update({
        where: { id: existing.id },
        data: {
          name: nextName,
          billingCycle: nextBillingCycle,
          amount: nextAmount,
          description:
            body.description !== undefined
              ? body.description
                ? String(body.description).trim()
                : null
              : existing.description,
          isDefault: nextIsDefault,
        },
        include: {
          class: {
            select: { id: true, code: true, name: true, subject: true },
          },
        },
      });
    });

    return NextResponse.json({ feePlan }, { status: 200 });
  } catch (error) {
    return handleApiError(error);
  }
}

export async function DELETE(req: NextRequest, context: RouteContext) {
  try {
    const { workspaceId } = await requireWorkspace(req);
    const { id } = await context.params;

    const existing = assertWorkspaceResource(
      await prisma.feePlan.findFirst({
        where: { id, workspaceId },
      }),
      workspaceId,
      "Không tìm thấy biểu phí trong workspace của bạn"
    );

    await prisma.feePlan.delete({
      where: { id: existing.id },
    });

    return NextResponse.json({ deleted: true }, { status: 200 });
  } catch (error) {
    return handleApiError(error);
  }
}
