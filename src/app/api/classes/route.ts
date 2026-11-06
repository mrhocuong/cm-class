import { NextRequest, NextResponse } from "next/server";
import type { BillingCycle, ClassStatus, Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import {
  handleApiError,
  requireWorkspace,
  WorkspaceAuthError,
} from "@/lib/workspace";
import {
  detectScheduleConflicts,
  normalizeUtcDate,
  type ScheduleSlotCandidate,
  validateTimeRange,
} from "@/lib/timetable";

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

export async function GET(req: NextRequest) {
  try {
    const { workspaceId } = await requireWorkspace(req);
    const { searchParams } = new URL(req.url);
    const statusParam = (searchParams.get("status") || "").trim().toUpperCase();
    const search = (searchParams.get("search") || "").trim();

    const where: Prisma.ClassWhereInput = { workspaceId };

    if (
      statusParam &&
      statusParam !== "ALL" &&
      VALID_CLASS_STATUSES.includes(statusParam as ClassStatus)
    ) {
      where.status = statusParam as ClassStatus;
    }

    if (search) {
      where.OR = [
        { name: { contains: search, mode: "insensitive" } },
        { code: { contains: search, mode: "insensitive" } },
        { subject: { contains: search, mode: "insensitive" } },
        { room: { contains: search, mode: "insensitive" } },
      ];
    }

    const classes = await prisma.class.findMany({
      where,
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
      orderBy: { createdAt: "desc" },
    });

    return NextResponse.json({ classes }, { status: 200 });
  } catch (error) {
    return handleApiError(error);
  }
}

export async function POST(req: NextRequest) {
  try {
    const { workspaceId } = await requireWorkspace(req);
    const body = await req.json();

    const name = String(body.name ?? "").trim();
    const subject = String(body.subject ?? "").trim();

    if (!name) {
      return NextResponse.json(
        { error: "Vui lòng nhập tên lớp học" },
        { status: 400 }
      );
    }
    if (!subject) {
      return NextResponse.json(
        { error: "Vui lòng nhập môn học" },
        { status: 400 }
      );
    }

    let code = String(body.code ?? "")
      .trim()
      .toUpperCase();
    if (!code) {
      code = `CLS-${Date.now().toString(36).toUpperCase()}-${Math.floor(
        Math.random() * 900 + 100
      )}`;
    }

    const existingCode = await prisma.class.findUnique({
      where: {
        workspaceId_code: {
          workspaceId,
          code,
        },
      },
    });
    if (existingCode) {
      if (/^CLS-\d{10}$/.test(code)) {
        const count = await prisma.class.count({ where: { workspaceId } });
        code = `${code}-${count + 1}-${Math.floor(Math.random() * 900 + 100)}`;
      } else {
        return NextResponse.json(
          { error: "Mã lớp học đã tồn tại trong workspace" },
          { status: 409 }
        );
      }
    }

    const defaultFeeAmountRaw =
      body.defaultFeeAmount !== undefined ? Number(body.defaultFeeAmount) : 0;
    if (!Number.isFinite(defaultFeeAmountRaw) || defaultFeeAmountRaw < 0) {
      return NextResponse.json(
        { error: "Học phí mặc định không được nhỏ hơn 0" },
        { status: 400 }
      );
    }
    const defaultFeeAmount = Math.round(defaultFeeAmountRaw);

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

    const statusRaw = body.status
      ? String(body.status).trim().toUpperCase()
      : "ACTIVE";
    if (!VALID_CLASS_STATUSES.includes(statusRaw as ClassStatus)) {
      return NextResponse.json(
        { error: "Trạng thái lớp học không hợp lệ" },
        { status: 400 }
      );
    }
    const status = statusRaw as ClassStatus;

    let startDate: Date | null = null;
    let endDate: Date | null = null;
    try {
      if (body.startDate) {
        startDate = normalizeUtcDate(body.startDate);
      }
      if (body.endDate) {
        endDate = normalizeUtcDate(body.endDate);
      }
    } catch {
      return NextResponse.json(
        { error: "Định dạng ngày khai giảng / kết thúc không hợp lệ" },
        { status: 400 }
      );
    }

    if (startDate && endDate && startDate.getTime() > endDate.getTime()) {
      return NextResponse.json(
        { error: "Ngày bắt đầu không được lớn hơn ngày kết thúc" },
        { status: 400 }
      );
    }

    const rawSlots = Array.isArray(body.scheduleSlots)
      ? body.scheduleSlots
      : [];
    const validatedSlots: Array<{
      dayOfWeek: number;
      startTime: string;
      endTime: string;
      room: string | null;
    }> = [];

    for (const s of rawSlots) {
      const dayOfWeek = Number(s?.dayOfWeek);
      if (!Number.isInteger(dayOfWeek) || dayOfWeek < 0 || dayOfWeek > 6) {
        return NextResponse.json(
          { error: "Thứ trong tuần không hợp lệ (0-6)" },
          { status: 400 }
        );
      }
      const startTime = String(s?.startTime ?? "").trim();
      const endTime = String(s?.endTime ?? "").trim();
      const timeCheck = validateTimeRange(startTime, endTime);
      if (!timeCheck.valid) {
        return NextResponse.json({ error: timeCheck.error }, { status: 400 });
      }
      validatedSlots.push({
        dayOfWeek,
        startTime,
        endTime,
        room: s?.room ? String(s.room).trim() : null,
      });
    }

    const room = body.room ? String(body.room).trim() : null;
    const gradeLevel = body.gradeLevel ? String(body.gradeLevel).trim() : null;
    const description = body.description
      ? String(body.description).trim()
      : null;
    const color = body.color ? String(body.color).trim() : "#2563eb";

    const createdClass = await prisma.$transaction(async (tx) => {
      const cls = await tx.class.create({
        data: {
          workspaceId,
          code,
          name,
          subject,
          gradeLevel,
          room,
          defaultFeeAmount,
          billingCycle,
          startDate,
          endDate,
          description,
          color,
          status,
        },
      });

      if (validatedSlots.length > 0) {
        await tx.scheduleSlot.createMany({
          data: validatedSlots.map((slot) => ({
            workspaceId,
            classId: cls.id,
            dayOfWeek: slot.dayOfWeek,
            startTime: slot.startTime,
            endTime: slot.endTime,
            room: slot.room || cls.room || null,
          })),
        });
      }

      if (defaultFeeAmount > 0) {
        await tx.feePlan.create({
          data: {
            workspaceId,
            classId: cls.id,
            name: `Học phí tiêu chuẩn - ${cls.name}`,
            billingCycle: cls.billingCycle,
            amount: cls.defaultFeeAmount,
            currency: "VND",
            isDefault: true,
          },
        });
      }

      const fullClass = await tx.class.findUnique({
        where: { id: cls.id },
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
      if (!fullClass) {
        throw new WorkspaceAuthError(500, "Không thể tải lớp học vừa tạo");
      }
      return fullClass;
    });

    const allActiveSlots = await prisma.scheduleSlot.findMany({
      where: {
        workspaceId,
        class: { status: { not: "ARCHIVED" } },
      },
      include: {
        class: {
          select: { id: true, name: true, code: true, room: true },
        },
      },
    });

    const candidates: ScheduleSlotCandidate[] = allActiveSlots.map((s) => ({
      id: s.id,
      classId: s.classId,
      className: s.class.name,
      dayOfWeek: s.dayOfWeek,
      startTime: s.startTime,
      endTime: s.endTime,
      room: s.room ?? s.class.room,
    }));

    const conflicts = detectScheduleConflicts(candidates);

    return NextResponse.json(
      { class: createdClass, conflicts },
      { status: 201 }
    );
  } catch (error) {
    return handleApiError(error);
  }
}
