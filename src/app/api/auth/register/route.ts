import { NextRequest, NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { prisma } from "@/lib/db";
import { createSessionToken, attachSessionCookie } from "@/lib/auth";

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => null);
    if (!body || typeof body !== "object") {
      return NextResponse.json(
        { error: "Dữ liệu đăng ký không hợp lệ" },
        { status: 400 }
      );
    }

    const fullName = typeof body.fullName === "string" ? body.fullName.trim() : "";
    const email = typeof body.email === "string" ? body.email.trim().toLowerCase() : "";
    const password = typeof body.password === "string" ? body.password : "";
    const workspaceName =
      typeof body.workspaceName === "string" && body.workspaceName.trim().length > 0
        ? body.workspaceName.trim()
        : `Lớp học của ${fullName}`;
    const phone =
      typeof body.phone === "string" && body.phone.trim().length > 0
        ? body.phone.trim()
        : null;

    if (!fullName || fullName.length < 2) {
      return NextResponse.json(
        { error: "Vui lòng nhập họ tên giáo viên (ít nhất 2 ký tự)" },
        { status: 400 }
      );
    }

    if (!email || !EMAIL_REGEX.test(email)) {
      return NextResponse.json(
        { error: "Địa chỉ email không hợp lệ" },
        { status: 400 }
      );
    }

    if (!password || password.length < 6) {
      return NextResponse.json(
        { error: "Mật khẩu phải có ít nhất 6 ký tự" },
        { status: 400 }
      );
    }

    const existingUser = await prisma.user.findUnique({
      where: { email },
    });

    if (existingUser) {
      return NextResponse.json(
        { error: "Email này đã được đăng ký" },
        { status: 409 }
      );
    }

    const passwordHash = await bcrypt.hash(password, 10);

    const { user, workspace } = await prisma.$transaction(async (tx) => {
      const createdUser = await tx.user.create({
        data: {
          email,
          passwordHash,
          fullName,
          phone,
        },
      });

      const createdWorkspace = await tx.workspace.create({
        data: {
          userId: createdUser.id,
          name: workspaceName,
          phone,
          currency: "VND",
        },
      });

      await tx.leaderboardConfig.create({
        data: {
          workspaceId: createdWorkspace.id,
          name: "Bảng xếp hạng tiêu chuẩn",
          attendanceWeight: 25,
          homeworkWeight: 35,
          gameWeight: 25,
          bonusWeight: 15,
          isDefault: true,
        },
      });

      return { user: createdUser, workspace: createdWorkspace };
    });

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
      { status: 201 }
    );

    attachSessionCookie(response, token);
    return response;
  } catch (error) {
    console.error("[POST /api/auth/register] Error:", error);
    return NextResponse.json(
      { error: "Đã xảy ra lỗi khi đăng ký tài khoản" },
      { status: 500 }
    );
  }
}
