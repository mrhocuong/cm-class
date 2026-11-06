import { NextRequest, NextResponse } from "next/server";
import type { BillingCycle, Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import {
  assertWorkspaceResource,
  handleApiError,
  requireWorkspace,
} from "@/lib/workspace";

const VALID_BILLING_CYCLES: BillingCycle[] = [
  "MONTHLY",
  "PER_COURSE",
  "PER_SESSION",
];

export async function GET(req: NextRequest) {
  try {
    const { workspaceId } = await requireWorkspace(req);
    const { searchParams } = new URL(req.url);
    const classId = (searchParams.get("classId") || "").trim();

    const where: Prisma.FeePlanWhereInput = { workspaceId };
    if (classId) {
      where.classId = classId;
    }

    const feePlans = await prisma.feePlan.findMany({
      where,
      include: {
        class: {
          select: {
            id: true,
            code: true,
            name: true,
            subject: true,
            billingCycle: true,
            defaultFeeAmount: true,
          },
        },
        _count: {
          select: { invoices: true },
        },
      },
      orderBy: [{ isDefault: "desc" }, { createdAt: "desc" }],
    });

    return NextResponse.json({ feePlans }, { status: 200 });
  } catch (error) {
    return handleApiError(error);
  }
}

export async function POST(req: NextRequest) {
  try {
    const { workspaceId } = await requireWorkspace(req);
    const body = await req.json();
    if (!body || typeof body !== "object" || Array.isArray(body)) {
      return NextResponse.json(
        { error: "Dữ liệu biểu phí không hợp lệ" },
        { status: 400 }
      );
    }

    const classId = String(body.classId ?? "").trim();
    if (!classId) {
      return NextResponse.json(
        { error: "Vui lòng chọn lớp học (classId)" },
        { status: 400 }
      );
    }
    const cls = assertWorkspaceResource(
      await prisma.class.findFirst({
        where: { id: classId, workspaceId },
      }),
      workspaceId,
      "Không tìm thấy lớp học trong workspace của bạn"
    );

    const name = String(body.name ?? "").trim();
    if (!name) {
      return NextResponse.json(
        { error: "Vui lòng nhập tên biểu phí" },
        { status: 400 }
      );
    }

    const billingCycleRaw = body.billingCycle
      ? String(body.billingCycle).trim().toUpperCase()
      : "MONTHLY";
    if (!VALID_BILLING_CYCLES.includes(billingCycleRaw as BillingCycle)) {
      return NextResponse.json(
        { error: "Chu kỳ thu học phí không hợp lệ" },
        { status: 400 }
      );
    }
    const billingCycle = billingCycleRaw as BillingCycle;

    const amountNum = Number(body.amount);
    if (!Number.isFinite(amountNum) || amountNum < 0) {
      return NextResponse.json(
        { error: "Số tiền biểu phí phải lớn hơn hoặc bằng 0" },
        { status: 400 }
      );
    }
    const amount = Math.round(amountNum);

    const isDefault =
      body.isDefault !== undefined ? Boolean(body.isDefault) : true;
    const currency = body.currency ? String(body.currency).trim() : "VND";
    const description = body.description
      ? String(body.description).trim()
      : null;

    const feePlan = await prisma.$transaction(async (tx) => {
      if (isDefault) {
        await tx.feePlan.updateMany({
          where: { workspaceId, classId: cls.id, isDefault: true },
          data: { isDefault: false },
        });
      }

      return tx.feePlan.create({
        data: {
          workspaceId,
          classId: cls.id,
          name,
          billingCycle,
          amount,
          currency,
          description,
          isDefault,
        },
        include: {
          class: {
            select: { id: true, code: true, name: true, subject: true },
          },
        },
      });
    });

    return NextResponse.json({ feePlan }, { status: 201 });
  } catch (error) {
    return handleApiError(error);
  }
}
