import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import {
  WorkspaceAuthError,
  handleApiError,
  requireWorkspace,
} from "@/lib/workspace";

export async function DELETE(
  req: NextRequest,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  context: { params: any }
) {
  try {
    const { workspaceId } = await requireWorkspace(req);
    const { id } = await Promise.resolve<{ id: string }>(context.params);

    const existing = await prisma.faceDescriptor.findFirst({
      where: { id, workspaceId },
    });
    if (!existing) {
      throw new WorkspaceAuthError(
        404,
        "Không tìm thấy dữ liệu khuôn mặt trong workspace của bạn"
      );
    }

    await prisma.faceDescriptor.delete({
      where: { id: existing.id },
    });

    return NextResponse.json({
      success: true,
      deletedId: existing.id,
    });
  } catch (error) {
    return handleApiError(error);
  }
}
