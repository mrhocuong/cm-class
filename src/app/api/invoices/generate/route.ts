import { NextRequest, NextResponse } from "next/server";
import type { InvoiceStatus } from "@prisma/client";
import { prisma } from "@/lib/db";
import {
  assertWorkspaceResource,
  handleApiError,
  requireWorkspace,
  WorkspaceAuthError,
} from "@/lib/workspace";

export async function POST(req: NextRequest) {
  try {
    const { workspaceId } = await requireWorkspace(req);
    const body = await req.json();
    if (!body || typeof body !== "object" || Array.isArray(body)) {
      return NextResponse.json(
        { error: "Dữ liệu tạo phiếu thu không hợp lệ" },
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

    const billingPeriod = String(body.billingPeriod ?? "").trim();
    if (!billingPeriod || !/^\d{4}-\d{2}$/.test(billingPeriod)) {
      return NextResponse.json(
        { error: "Kỳ thu học phí phải có định dạng YYYY-MM (VD: 2026-11)" },
        { status: 400 }
      );
    }

    const dueDateObj = body.dueDate
      ? new Date(body.dueDate)
      : new Date(`${billingPeriod}-10T00:00:00.000Z`);
    if (Number.isNaN(dueDateObj.getTime())) {
      return NextResponse.json(
        { error: "Hạn đóng học phí (dueDate) không hợp lệ" },
        { status: 400 }
      );
    }

    let feePlan = null;
    if (body.feePlanId) {
      feePlan = await prisma.feePlan.findFirst({
        where: {
          id: String(body.feePlanId),
          workspaceId,
          classId: cls.id,
        },
      });
      assertWorkspaceResource(
        feePlan,
        workspaceId,
        "Không tìm thấy biểu phí hợp lệ trong workspace"
      );
    } else {
      feePlan = await prisma.feePlan.findFirst({
        where: { workspaceId, classId: cls.id },
        orderBy: [{ isDefault: "desc" }, { createdAt: "desc" }],
      });
    }

    const billingCycle = feePlan?.billingCycle ?? cls.billingCycle;
    const unitAmount = feePlan?.amount ?? cls.defaultFeeAmount;

    if (body.sessionCount !== undefined) {
      const sc = Number(body.sessionCount);
      if (!Number.isFinite(sc) || sc < 0) {
        return NextResponse.json(
          { error: "Số buổi học không hợp lệ" },
          { status: 400 }
        );
      }
    }

    const sessionCount =
      billingCycle === "PER_SESSION"
        ? Math.max(1, Math.round(Number(body.sessionCount ?? 1)))
        : body.sessionCount !== undefined
        ? Math.round(Number(body.sessionCount))
        : null;

    const rawStudentIds: string[] | undefined =
      Array.isArray(body.studentIds) && body.studentIds.length > 0
        ? body.studentIds.map(String)
        : body.studentId
        ? [String(body.studentId)]
        : undefined;
    const targetStudentIds = rawStudentIds
      ? Array.from(new Set(rawStudentIds.map((s) => s.trim()).filter(Boolean)))
      : undefined;

    if (targetStudentIds && targetStudentIds.length > 0) {
      const validStudents = await prisma.student.findMany({
        where: { id: { in: targetStudentIds }, workspaceId },
        select: { id: true },
      });
      if (validStudents.length !== targetStudentIds.length) {
        throw new WorkspaceAuthError(
          404,
          "Không tìm thấy học sinh trong workspace của bạn"
        );
      }
    }

    const enrollments = await prisma.enrollment.findMany({
      where: {
        workspaceId,
        classId: cls.id,
        status: "ACTIVE",
        ...(targetStudentIds ? { studentId: { in: targetStudentIds } } : {}),
      },
      include: {
        student: true,
      },
      orderBy: { enrolledAt: "asc" },
    });

    const existingInvoices = await prisma.invoice.findMany({
      where: {
        workspaceId,
        classId: cls.id,
        billingPeriod,
        status: { not: "CANCELLED" },
      },
      include: {
        student: { select: { id: true, studentCode: true, fullName: true } },
        class: { select: { id: true, code: true, name: true } },
        feePlan: { select: { id: true, name: true, billingCycle: true, amount: true } },
        payments: true,
      },
    });
    const existingStudentIds = new Set(
      existingInvoices.map((inv) => inv.studentId)
    );

    const periodCompact = billingPeriod.replace("-", "");
    const prefix = `INV-${periodCompact}-`;
    const allWorkspacePeriodInvoices = await prisma.invoice.findMany({
      where: {
        workspaceId,
        invoiceNumber: { startsWith: prefix },
      },
      select: { invoiceNumber: true },
    });

    let maxSeq = 0;
    for (const row of allWorkspacePeriodInvoices) {
      const suffix = row.invoiceNumber.slice(prefix.length);
      const parsed = parseInt(suffix, 10);
      if (!Number.isNaN(parsed) && parsed > maxSeq) {
        maxSeq = parsed;
      }
    }

    let createdCount = 0;
    let skippedCount = 0;
    const createdInvoices = [];

    const overrides: Record<
      string,
      {
        baseAmount?: number;
        discountAmount?: number;
        discountReason?: string;
      }
    > =
      body.overrides && typeof body.overrides === "object"
        ? body.overrides
        : {};

    for (const enrollment of enrollments) {
      if (existingStudentIds.has(enrollment.studentId)) {
        skippedCount += 1;
        continue;
      }

      const stuOverride = overrides[enrollment.studentId];

      const defaultBase =
        billingCycle === "PER_SESSION"
          ? unitAmount * (sessionCount ?? 1)
          : unitAmount;
      const baseAmount =
        stuOverride?.baseAmount !== undefined
          ? Math.round(Number(stuOverride.baseAmount))
          : defaultBase;

      if (!Number.isFinite(baseAmount) || baseAmount < 0) {
        return NextResponse.json(
          { error: "Học phí gốc không hợp lệ" },
          { status: 400 }
        );
      }

      let discountAmount = 0;
      if (stuOverride?.discountAmount !== undefined) {
        discountAmount = Math.round(Number(stuOverride.discountAmount));
      } else if (enrollment.discountType === "PERCENTAGE") {
        discountAmount = Math.round(
          (baseAmount * enrollment.customFeeDiscount) / 100
        );
      } else {
        discountAmount = enrollment.customFeeDiscount;
      }

      if (
        !Number.isFinite(discountAmount) ||
        discountAmount < 0 ||
        discountAmount > baseAmount
      ) {
        return NextResponse.json(
          { error: "Số tiền giảm trừ không được vượt quá học phí gốc" },
          { status: 400 }
        );
      }

      const netAmount = baseAmount - discountAmount;
      const status: InvoiceStatus = netAmount === 0 ? "PAID" : "UNPAID";

      maxSeq += 1;
      const invoiceNumber = `${prefix}${String(maxSeq).padStart(4, "0")}`;

      const created = await prisma.invoice.create({
        data: {
          workspaceId,
          classId: cls.id,
          studentId: enrollment.studentId,
          feePlanId: feePlan?.id ?? null,
          invoiceNumber,
          title: body.title
            ? String(body.title).trim()
            : `Học phí kỳ ${billingPeriod} - Lớp ${cls.code}`,
          billingPeriod,
          sessionCount,
          baseAmount,
          discountAmount,
          discountReason:
            stuOverride?.discountReason ?? enrollment.discountNote ?? null,
          netAmount,
          paidAmount: 0,
          status,
          dueDate: dueDateObj,
          notes: body.notes ? String(body.notes).trim() : null,
        },
        include: {
          student: { select: { id: true, studentCode: true, fullName: true } },
          class: { select: { id: true, code: true, name: true } },
          feePlan: {
            select: { id: true, name: true, billingCycle: true, amount: true },
          },
          payments: true,
        },
      });

      createdCount += 1;
      createdInvoices.push(created);
    }

    return NextResponse.json(
      {
        createdCount,
        skippedCount,
        invoices:
          createdInvoices.length > 0 ? createdInvoices : existingInvoices,
      },
      { status: 201 }
    );
  } catch (error) {
    return handleApiError(error);
  }
}
