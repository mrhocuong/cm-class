import { NextRequest, NextResponse } from "next/server";
import type { BillingCycle, ClassStatus } from "@prisma/client";
import { prisma } from "@/lib/db";
import {
  assertWorkspaceResource,
  handleApiError,
  requireWorkspace,
} from "@/lib/workspace";
import { normalizeUtcDate } from "@/lib/timetable";

type RouteContext = { params: Promise<{ id: string }> };

const VALID_CLASS_STATUSES: ClassStatus[] = [
  "ACTIVE",
  "UPCOMING",
  "COMPLETED",
  "ARCHIVED",
];

const VALID_BILLING_CYCLES: BillingCycle[] = [
  "MONTHLY",
  "PER_COURSE",
  "PER_SESSION",
];

export async function GET(req: NextRequest, context: RouteContext) {
  try {
    const { workspaceId } = await requireWorkspace(req);
    const { id } = await context.params;

    const cls = await prisma.class.findFirst({
      where: { id, workspaceId },
      include: {
        scheduleSlots: {
          orderBy: [{ dayOfWeek: "asc" }, { startTime: "asc" }],
        },
        enrollments: {
          include: {
            student: {
              include: {
                guardians: {
                  orderBy: [{ isPrimary: "desc" }, { createdAt: "asc" }],
                },
              },
            },
          },
          orderBy: { enrolledAt: "desc" },
        },
        feePlans: {
          orderBy: [{ isDefault: "desc" }, { createdAt: "desc" }],
        },
        sessions: {
          orderBy: [{ sessionDate: "asc" }, { startTime: "asc" }],
          include: {
            _count: {
              select: { attendances: true },
            },
          },
        },
        invoices: {
          include: {
            student: true,
            payments: { orderBy: { paidAt: "desc" } },
          },
          orderBy: { createdAt: "desc" },
        },
        _count: {
          select: {
            enrollments: { where: { status: "ACTIVE" } },
            sessions: true,
            scheduleSlots: true,
          },
        },
      },
    });

    assertWorkspaceResource(
      cls,
      workspaceId,
      "Không tìm thấy lớp học trong workspace của bạn"
    );

    return NextResponse.json({ class: cls }, { status: 200 });
  } catch (error) {
    return handleApiError(error);
  }
}

export async function PATCH(req: NextRequest, context: RouteContext) {
  try {
    const { workspaceId } = await requireWorkspace(req);
    const { id } = await context.params;

    const existing = assertWorkspaceResource(
      await prisma.class.findFirst({
        where: { id, workspaceId },
      }),
      workspaceId,
      "Không tìm thấy lớp học trong workspace của bạn"
    );

    const body = await req.json();

    let nextCode = existing.code;
    if (body.code !== undefined) {
      nextCode = String(body.code ?? "")
        .trim()
        .toUpperCase();
      if (!nextCode) {
        return NextResponse.json(
          { error: "Mã lớp học không được để trống" },
          { status: 400 }
        );
      }
      if (nextCode !== existing.code) {
        const collision = await prisma.class.findUnique({
          where: {
            workspaceId_code: {
              workspaceId,
              code: nextCode,
            },
          },
        });
        if (collision) {
          return NextResponse.json(
            { error: "Mã lớp học đã tồn tại trong workspace" },
            { status: 409 }
          );
        }
      }
    }

    let nextName = existing.name;
    if (body.name !== undefined) {
      nextName = String(body.name ?? "").trim();
      if (!nextName) {
        return NextResponse.json(
          { error: "Tên lớp học không được để trống" },
          { status: 400 }
        );
      }
    }

    let nextSubject = existing.subject;
    if (body.subject !== undefined) {
      nextSubject = String(body.subject ?? "").trim();
      if (!nextSubject) {
        return NextResponse.json(
          { error: "Môn học không được để trống" },
          { status: 400 }
        );
      }
    }

    let nextDefaultFee = existing.defaultFeeAmount;
    if (body.defaultFeeAmount !== undefined) {
      const feeNum = Number(body.defaultFeeAmount);
      if (!Number.isFinite(feeNum) || feeNum < 0) {
        return NextResponse.json(
          { error: "Học phí mặc định không hợp lệ" },
          { status: 400 }
        );
      }
      nextDefaultFee = Math.round(feeNum);
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

    let nextStatus = existing.status;
    if (body.status !== undefined) {
      const st = String(body.status).trim().toUpperCase();
      if (!VALID_CLASS_STATUSES.includes(st as ClassStatus)) {
        return NextResponse.json(
          { error: "Trạng thái lớp học không hợp lệ" },
          { status: 400 }
        );
      }
      nextStatus = st as ClassStatus;
    }

    let nextStartDate = existing.startDate;
    let nextEndDate = existing.endDate;
    try {
      if (body.startDate !== undefined) {
        nextStartDate = body.startDate
          ? normalizeUtcDate(body.startDate)
          : null;
      }
      if (body.endDate !== undefined) {
        nextEndDate = body.endDate ? normalizeUtcDate(body.endDate) : null;
      }
    } catch {
      return NextResponse.json(
        { error: "Định dạng ngày khai giảng / kết thúc không hợp lệ" },
        { status: 400 }
      );
    }

    if (
      nextStartDate &&
      nextEndDate &&
      nextStartDate.getTime() > nextEndDate.getTime()
    ) {
      return NextResponse.json(
        { error: "Ngày bắt đầu không được lớn hơn ngày kết thúc" },
        { status: 400 }
      );
    }

    const updated = await prisma.class.update({
      where: { id: existing.id },
      data: {
        code: nextCode,
        name: nextName,
        subject: nextSubject,
        gradeLevel:
          body.gradeLevel !== undefined
            ? body.gradeLevel
              ? String(body.gradeLevel).trim()
              : null
            : existing.gradeLevel,
        room:
          body.room !== undefined
            ? body.room
              ? String(body.room).trim()
              : null
            : existing.room,
        defaultFeeAmount: nextDefaultFee,
        billingCycle: nextBillingCycle,
        startDate: nextStartDate,
        endDate: nextEndDate,
        description:
          body.description !== undefined
            ? body.description
              ? String(body.description).trim()
              : null
            : existing.description,
        color:
          body.color !== undefined
            ? body.color
              ? String(body.color).trim()
              : null
            : existing.color,
        status: nextStatus,
      },
      include: {
        scheduleSlots: {
          orderBy: [{ dayOfWeek: "asc" }, { startTime: "asc" }],
        },
        feePlans: {
          orderBy: [{ isDefault: "desc" }, { createdAt: "desc" }],
        },
        _count: {
          select: {
            enrollments: { where: { status: "ACTIVE" } },
            scheduleSlots: true,
            sessions: true,
          },
        },
      },
    });

    return NextResponse.json({ class: updated }, { status: 200 });
  } catch (error) {
    return handleApiError(error);
  }
}

export async function DELETE(req: NextRequest, context: RouteContext) {
  try {
    const { workspaceId } = await requireWorkspace(req);
    const { id } = await context.params;

    const existing = assertWorkspaceResource(
      await prisma.class.findFirst({
        where: { id, workspaceId },
      }),
      workspaceId,
      "Không tìm thấy lớp học trong workspace của bạn"
    );

    await prisma.class.delete({
      where: { id: existing.id },
    });

    return NextResponse.json({ deleted: true }, { status: 200 });
  } catch (error) {
    return handleApiError(error);
  }
}
