import { NextRequest, NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { prisma } from "@/lib/db";
import {
  createSessionToken,
  attachSessionCookie,
  clearSessionCookie,
} from "@/lib/auth";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => null);
    if (!body || typeof body !== "object") {
      return clearSessionCookie(
        NextResponse.json(
          { error: "Vui lòng nhập email và mật khẩu" },
          { status: 400 }
        )
      );
    }

    const email = typeof body.email === "string" ? body.email.trim().toLowerCase() : "";
    const password = typeof body.password === "string" ? body.password : "";

    if (!email || !password) {
      return clearSessionCookie(
        NextResponse.json(
          { error: "Vui lòng nhập đầy đủ email và mật khẩu" },
          { status: 400 }
        )
      );
    }

    const user = await prisma.user.findUnique({
      where: { email },
      include: { workspace: true },
    });

    if (!user) {
      return clearSessionCookie(
        NextResponse.json(
          { error: "Email hoặc mật khẩu không đúng" },
          { status: 401 }
        )
      );
    }

    const isValid = await bcrypt.compare(password, user.passwordHash);
    if (!isValid) {
      return clearSessionCookie(
        NextResponse.json(
          { error: "Email hoặc mật khẩu không đúng" },
          { status: 401 }
        )
      );
    }

    // Auto-provision workspace if somehow missing
    let workspace = user.workspace;
    if (!workspace) {
      workspace = await prisma.workspace.create({
        data: {
          userId: user.id,
          name: `Lớp học của ${user.fullName}`,
          phone: user.phone,
          currency: "VND",
        },
      });
    }

    const token = createSessionToken({
      userId: user.id,
      email: user.email,
      fullName: user.fullName,
      workspaceId: workspace.id,
    });

    const response = NextResponse.json(
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
        token,
      },
      { status: 200 }
    );

    attachSessionCookie(response, token);
    return response;
  } catch (error) {
    console.error("[POST /api/auth/login] Error:", error);
    return NextResponse.json(
      { error: "Đã xảy ra lỗi khi đăng nhập" },
      { status: 500 }
    );
  }
}
