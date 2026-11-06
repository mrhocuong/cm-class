import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import {
  assertWorkspaceResource,
  handleApiError,
  requireWorkspace,
} from "@/lib/workspace";

type RouteContext = { params: Promise<{ id: string }> };

export async function GET(req: NextRequest, context: RouteContext) {
  try {
    const { workspaceId } = await requireWorkspace(req);
    const { id: studentId } = await context.params;

    const student = await prisma.student.findFirst({
      where: { id: studentId, workspaceId },
    });
    assertWorkspaceResource(
      student,
      workspaceId,
      "Không tìm thấy học sinh trong workspace của bạn"
    );

    const guardians = await prisma.guardian.findMany({
      where: { studentId, workspaceId },
      orderBy: [{ isPrimary: "desc" }, { createdAt: "asc" }],
    });

    return NextResponse.json({ guardians }, { status: 200 });
  } catch (error) {
    return handleApiError(error);
  }
}

export async function POST(req: NextRequest, context: RouteContext) {
  try {
    const { workspaceId } = await requireWorkspace(req);
    const { id: studentId } = await context.params;

    const student = await prisma.student.findFirst({
      where: { id: studentId, workspaceId },
    });
    assertWorkspaceResource(
      student,
      workspaceId,
      "Không tìm thấy học sinh trong workspace của bạn"
    );

    const body = await req.json();
    const fullName = String(body.fullName ?? "").trim();
    const relationship =
      String(body.relationship ?? "Phụ huynh").trim() || "Phụ huynh";
    const phone = String(body.phone ?? "").trim();
    const email = body.email ? String(body.email).trim() : null;
    const zalo = body.zalo ? String(body.zalo).trim() : null;
    const address = body.address ? String(body.address).trim() : null;

    if (!fullName || !phone) {
      return NextResponse.json(
        { error: "Vui lòng nhập họ tên và số điện thoại phụ huynh" },
        { status: 400 }
      );
    }

    const guardian = await prisma.$transaction(async (tx) => {
      const existingPrimaryCount = await tx.guardian.count({
        where: { studentId, workspaceId, isPrimary: true },
      });
      const shouldBePrimary =
        body.isPrimary === true || existingPrimaryCount === 0;

      if (shouldBePrimary) {
        await tx.guardian.updateMany({
          where: { studentId, workspaceId, isPrimary: true },
          data: { isPrimary: false },
        });
      }

      return tx.guardian.create({
        data: {
          workspaceId,
          studentId,
          fullName,
          relationship,
          phone,
          email,
          zalo,
          address,
          isPrimary: shouldBePrimary,
        },
      });
    });

    return NextResponse.json({ guardian }, { status: 201 });
  } catch (error) {
    return handleApiError(error);
  }
}
