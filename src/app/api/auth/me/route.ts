import { NextRequest, NextResponse } from "next/server";
import { requireWorkspace, handleApiError } from "@/lib/workspace";

export async function GET(req: NextRequest) {
  try {
    const { user, workspace } = await requireWorkspace(req);
    return NextResponse.json(
      {
        user: {
          id: user.id,
          email: user.email,
          fullName: user.fullName,
          phone: user.phone,
          avatarUrl: user.avatarUrl,
          workspaceId: workspace.id,
        },
        workspace,
      },
      { status: 200 }
    );
  } catch (error) {
    return handleApiError(error);
  }
}
