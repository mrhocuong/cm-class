import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import {
  assertWorkspaceResource,
  handleApiError,
  requireWorkspace,
} from "@/lib/workspace";

type RouteContext = { params: Promise<{ id: string; guardianId: string }> };

export async function PATCH(req: NextRequest, context: RouteContext) {
  try {
    const { workspaceId } = await requireWorkspace(req);
    const { id: studentId, guardianId } = await context.params;

    const existing = assertWorkspaceResource(
      await prisma.guardian.findFirst({
        where: { id: guardianId, studentId, workspaceId },
      }),
      workspaceId,
      "Không tìm thấy thông tin phụ huynh trong workspace của bạn"
    );

    const body = await req.json();

    let nextFullName = existing.fullName;
    if (body.fullName !== undefined) {
      nextFullName = String(body.fullName ?? "").trim();
      if (!nextFullName) {
        return NextResponse.json(
          { error: "Họ tên phụ huynh không được để trống" },
          { status: 400 }
        );
      }
    }

    let nextPhone = existing.phone;
    if (body.phone !== undefined) {
      nextPhone = String(body.phone ?? "").trim();
      if (!nextPhone) {
        return NextResponse.json(
          { error: "Số điện thoại phụ huynh không được để trống" },
          { status: 400 }
        );
      }
    }

    const nextRelationship =
      body.relationship !== undefined
        ? String(body.relationship ?? "").trim() || existing.relationship
        : existing.relationship;

    const guardian = await prisma.$transaction(async (tx) => {
      let nextIsPrimary =
        body.isPrimary !== undefined
          ? Boolean(body.isPrimary)
          : existing.isPrimary;

      if (body.isPrimary === true) {
        await tx.guardian.updateMany({
          where: {
            studentId,
            workspaceId,
            id: { not: guardianId },
          },
          data: { isPrimary: false },
        });
      } else if (existing.isPrimary && body.isPrimary === false) {
        const replacement = await tx.guardian.findFirst({
          where: {
            studentId,
            workspaceId,
            id: { not: guardianId },
          },
          orderBy: { createdAt: "asc" },
        });
        if (replacement) {
          await tx.guardian.update({
            where: { id: replacement.id },
            data: { isPrimary: true },
          });
        } else {
          nextIsPrimary = true;
        }
      }

      return tx.guardian.update({
        where: { id: existing.id },
        data: {
          fullName: nextFullName,
          relationship: nextRelationship,
          phone: nextPhone,
          email:
            body.email !== undefined
              ? body.email
                ? String(body.email).trim()
                : null
              : existing.email,
          zalo:
            body.zalo !== undefined
              ? body.zalo
                ? String(body.zalo).trim()
                : null
              : existing.zalo,
          address:
            body.address !== undefined
              ? body.address
                ? String(body.address).trim()
                : null
              : existing.address,
          isPrimary: nextIsPrimary,
        },
      });
    });

    return NextResponse.json({ guardian }, { status: 200 });
  } catch (error) {
    return handleApiError(error);
  }
}

export async function DELETE(req: NextRequest, context: RouteContext) {
  try {
    const { workspaceId } = await requireWorkspace(req);
    const { id: studentId, guardianId } = await context.params;

    const existing = assertWorkspaceResource(
      await prisma.guardian.findFirst({
        where: { id: guardianId, studentId, workspaceId },
      }),
      workspaceId,
      "Không tìm thấy thông tin phụ huynh trong workspace của bạn"
    );

    await prisma.$transaction(async (tx) => {
      await tx.guardian.delete({
        where: { id: existing.id },
      });

      if (existing.isPrimary) {
        const nextPrimary = await tx.guardian.findFirst({
          where: { studentId, workspaceId },
          orderBy: { createdAt: "asc" },
        });
        if (nextPrimary) {
          await tx.guardian.update({
            where: { id: nextPrimary.id },
            data: { isPrimary: true },
          });
        }
      }
    });

    return NextResponse.json({ deleted: true }, { status: 200 });
  } catch (error) {
    return handleApiError(error);
  }
}
