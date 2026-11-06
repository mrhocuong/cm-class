import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import {
  assertWorkspaceResource,
  handleApiError,
  requireWorkspace,
} from "@/lib/workspace";
import {
  detectScheduleConflicts,
  type ScheduleSlotCandidate,
  validateTimeRange,
} from "@/lib/timetable";

type RouteContext = { params: Promise<{ id: string }> };

export async function GET(req: NextRequest, context: RouteContext) {
  try {
    const { workspaceId } = await requireWorkspace(req);
    const { id: classId } = await context.params;

    const cls = await prisma.class.findFirst({
      where: { id: classId, workspaceId },
    });
    assertWorkspaceResource(
      cls,
      workspaceId,
      "Không tìm thấy lớp học trong workspace của bạn"
    );

    const slots = await prisma.scheduleSlot.findMany({
      where: { classId, workspaceId },
      orderBy: [{ dayOfWeek: "asc" }, { startTime: "asc" }],
    });

    return NextResponse.json({ slots }, { status: 200 });
  } catch (error) {
    return handleApiError(error);
  }
}

export async function POST(req: NextRequest, context: RouteContext) {
  try {
    const { workspaceId } = await requireWorkspace(req);
    const { id: classId } = await context.params;

    const cls = assertWorkspaceResource(
      await prisma.class.findFirst({
        where: { id: classId, workspaceId },
      }),
      workspaceId,
      "Không tìm thấy lớp học trong workspace của bạn"
    );

    const body = await req.json();

    const rawSlots: Array<{
      dayOfWeek: unknown;
      startTime: unknown;
      endTime: unknown;
      room?: unknown;
    }> = Array.isArray(body.slots)
      ? body.slots
      : body && typeof body === "object" && "dayOfWeek" in body
      ? [body]
      : [];

    if (rawSlots.length === 0 && !body.replace) {
      return NextResponse.json(
        { error: "Vui lòng cung cấp thông tin ca học" },
        { status: 400 }
      );
    }

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
          { error: "Thứ trong tuần phải là số nguyên từ 0 (Chủ nhật) đến 6 (Thứ bảy)" },
          { status: 400 }
        );
      }

      const startTime = String(s?.startTime ?? "").trim();
      const endTime = String(s?.endTime ?? "").trim();
      const check = validateTimeRange(startTime, endTime);
      if (!check.valid) {
        return NextResponse.json({ error: check.error }, { status: 400 });
      }

      const slotRoom =
        s?.room !== undefined && s?.room !== null && String(s.room).trim() !== ""
          ? String(s.room).trim()
          : cls.room || null;

      validatedSlots.push({
        dayOfWeek,
        startTime,
        endTime,
        room: slotRoom,
      });
    }

    const createdSlots = await prisma.$transaction(async (tx) => {
      if (body.replace === true) {
        await tx.scheduleSlot.deleteMany({
          where: { classId, workspaceId },
        });
      }

      const created = [];
      for (const slot of validatedSlots) {
        const record = await tx.scheduleSlot.create({
          data: {
            workspaceId,
            classId: cls.id,
            dayOfWeek: slot.dayOfWeek,
            startTime: slot.startTime,
            endTime: slot.endTime,
            room: slot.room,
          },
        });
        created.push(record);
      }
      return created;
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
      {
        slots: createdSlots,
        slot: createdSlots[0] ?? null,
        scheduleSlot: createdSlots[0] ?? null,
        conflicts,
      },
      { status: 201 }
    );
  } catch (error) {
    return handleApiError(error);
  }
}
