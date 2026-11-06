import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import {
  assertWorkspaceResource,
  handleApiError,
  requireWorkspace,
} from "@/lib/workspace";
import { validateTimeRange } from "@/lib/timetable";

type RouteContext = { params: Promise<{ id: string; slotId: string }> };

export async function PATCH(req: NextRequest, context: RouteContext) {
  try {
    const { workspaceId } = await requireWorkspace(req);
    const { id: classId, slotId } = await context.params;

    const slot = assertWorkspaceResource(
      await prisma.scheduleSlot.findFirst({
        where: { id: slotId, classId, workspaceId },
      }),
      workspaceId,
      "Không tìm thấy ca học trong workspace của bạn"
    );

    const body = await req.json();

    const dayOfWeek =
      body.dayOfWeek !== undefined ? Number(body.dayOfWeek) : slot.dayOfWeek;
    if (!Number.isInteger(dayOfWeek) || dayOfWeek < 0 || dayOfWeek > 6) {
      return NextResponse.json(
        { error: "Thứ trong tuần không hợp lệ (0-6)" },
        { status: 400 }
      );
    }

    const startTime =
      body.startTime !== undefined
        ? String(body.startTime).trim()
        : slot.startTime;
    const endTime =
      body.endTime !== undefined ? String(body.endTime).trim() : slot.endTime;

    const check = validateTimeRange(startTime, endTime);
    if (!check.valid) {
      return NextResponse.json({ error: check.error }, { status: 400 });
    }

    const updated = await prisma.scheduleSlot.update({
      where: { id: slot.id },
      data: {
        dayOfWeek,
        startTime,
        endTime,
        room:
          body.room !== undefined
            ? body.room
              ? String(body.room).trim()
              : null
            : slot.room,
      },
    });

    return NextResponse.json(
      { slot: updated, scheduleSlot: updated },
      { status: 200 }
    );
  } catch (error) {
    return handleApiError(error);
  }
}

export async function DELETE(req: NextRequest, context: RouteContext) {
  try {
    const { workspaceId } = await requireWorkspace(req);
    const { id: classId, slotId } = await context.params;

    const slot = assertWorkspaceResource(
      await prisma.scheduleSlot.findFirst({
        where: { id: slotId, classId, workspaceId },
      }),
      workspaceId,
      "Không tìm thấy ca học trong workspace của bạn"
    );

    await prisma.scheduleSlot.delete({
      where: { id: slot.id },
    });

    return NextResponse.json({ deleted: true }, { status: 200 });
  } catch (error) {
    return handleApiError(error);
  }
}
