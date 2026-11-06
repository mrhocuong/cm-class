import { NextResponse } from "next/server";
import type { User, Workspace } from "@prisma/client";
import { prisma } from "./db";
import {
  getSessionUser,
  hashPassword,
  normalizeEmail,
  signSessionToken,
  verifyPassword,
} from "./auth";

export class WorkspaceAuthError extends Error {
  public readonly status: number;

  constructor(status: number = 401, message: string = "Vui lòng đăng nhập") {
    super(message);
    this.name = "WorkspaceAuthError";
    this.status = status;
  }
}

export interface WorkspaceContext {
  userId: string;
  workspaceId: string;
  user: User;
  workspace: Workspace;
}

function isTestHeaderAllowed(): boolean {
  return (
    process.env.NODE_ENV === "test" ||
    process.env.ALLOW_TEST_HEADERS === "1"
  );
}

/**
 * Resolves the authenticated teacher and their 1-to-1 Workspace.
 * Throws WorkspaceAuthError(401, "Vui lòng đăng nhập") if not authenticated.
 */
export async function requireWorkspace(
  req?: Request
): Promise<WorkspaceContext> {
  // 1. Check test headers when running in test mode
  if (req && isTestHeaderAllowed()) {
    const testEmail = req.headers.get("x-test-user-email");
    if (testEmail) {
      const normalized = normalizeEmail(testEmail);
      const userWithWs = await prisma.user.findUnique({
        where: { email: normalized },
        include: { workspace: true },
      });
      if (!userWithWs || !userWithWs.workspace) {
        throw new WorkspaceAuthError(401, "Vui lòng đăng nhập");
      }
      const { workspace, ...user } = userWithWs;
      return {
        userId: user.id,
        workspaceId: workspace.id,
        user,
        workspace,
      };
    }
  }

  // 2. Check signed session token from cookie or Authorization Bearer header
  const sessionPayload = await getSessionUser(req);
  if (!sessionPayload) {
    throw new WorkspaceAuthError(401, "Vui lòng đăng nhập");
  }

  const userWithWs = await prisma.user.findUnique({
    where: { id: sessionPayload.userId },
    include: { workspace: true },
  });

  if (!userWithWs || !userWithWs.workspace) {
    throw new WorkspaceAuthError(401, "Vui lòng đăng nhập");
  }

  const { workspace, ...user } = userWithWs;
  return {
    userId: user.id,
    workspaceId: workspace.id,
    user,
    workspace,
  };
}

/**
 * Non-throwing helper for Server Components (e.g., layouts and root redirects).
 */
export async function getServerWorkspaceContext(): Promise<WorkspaceContext | null> {
  try {
    return await requireWorkspace();
  } catch {
    return null;
  }
}

/**
 * Helper to assert an entity fetched from Prisma exists and belongs to the current workspace.
 * Throws 404 WorkspaceAuthError if null or mismatched workspaceId.
 */
export function assertWorkspaceResource<T extends { workspaceId: string }>(
  resource: T | null | undefined,
  workspaceId: string,
  notFoundMessage: string = "Không tìm thấy dữ liệu trong workspace của bạn"
): T {
  if (!resource || resource.workspaceId !== workspaceId) {
    throw new WorkspaceAuthError(404, notFoundMessage);
  }
  return resource;
}

/**
 * Atomic teacher registration & 1-to-1 workspace provisioning (F03).
 */
export async function registerTeacherWithWorkspace(input: {
  fullName: string;
  email: string;
  password: string;
  workspaceName?: string;
  phone?: string;
}): Promise<{
  user: User;
  workspace: Workspace;
  token: string;
}> {
  const fullName = String(input.fullName || "").trim();
  const email = normalizeEmail(input.email);
  const password = String(input.password || "");
  const phone = input.phone ? String(input.phone).trim() : null;

  if (!fullName || fullName.length < 2) {
    throw new WorkspaceAuthError(400, "Vui lòng nhập họ tên giáo viên");
  }
  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    throw new WorkspaceAuthError(400, "Địa chỉ email không hợp lệ");
  }
  if (password.length < 6) {
    throw new WorkspaceAuthError(400, "Mật khẩu phải có ít nhất 6 ký tự");
  }

  const existing = await prisma.user.findUnique({
    where: { email },
  });
  if (existing) {
    throw new WorkspaceAuthError(409, "Email này đã được đăng ký");
  }

  const passwordHash = await hashPassword(password);
  const workspaceName =
    input.workspaceName && input.workspaceName.trim().length > 0
      ? input.workspaceName.trim()
      : `Lớp học của ${fullName}`;

  const result = await prisma.$transaction(async (tx) => {
    const user = await tx.user.create({
      data: {
        email,
        passwordHash,
        fullName,
        phone,
      },
    });

    const workspace = await tx.workspace.create({
      data: {
        userId: user.id,
        name: workspaceName,
        phone,
        currency: "VND",
      },
    });

    // Also create default LeaderboardConfig for the workspace
    await tx.leaderboardConfig.create({
      data: {
        workspaceId: workspace.id,
        name: "Xếp hạng tổng hợp mặc định",
        attendanceWeight: 25,
        homeworkWeight: 35,
        gameWeight: 25,
        bonusWeight: 15,
        isDefault: true,
      },
    });

    return { user, workspace };
  });

  const token = signSessionToken({
    userId: result.user.id,
    workspaceId: result.workspace.id,
    email: result.user.email,
    fullName: result.user.fullName,
  });

  return {
    user: result.user,
    workspace: result.workspace,
    token,
  };
}

/**
 * Authenticates teacher credentials and returns user, workspace, and signed token (F04).
 */
export async function loginTeacherWithCredentials(input: {
  email: string;
  password: string;
}): Promise<{
  user: User;
  workspace: Workspace;
  token: string;
}> {
  const email = normalizeEmail(input.email);
  const password = String(input.password || "");

  if (!email || !password) {
    throw new WorkspaceAuthError(400, "Vui lòng nhập email và mật khẩu");
  }

  const userWithWs = await prisma.user.findUnique({
    where: { email },
    include: { workspace: true },
  });

  if (!userWithWs || !userWithWs.workspace) {
    throw new WorkspaceAuthError(401, "Email hoặc mật khẩu không đúng");
  }

  const valid = await verifyPassword(password, userWithWs.passwordHash);
  if (!valid) {
    throw new WorkspaceAuthError(401, "Email hoặc mật khẩu không đúng");
  }

  const { workspace, ...user } = userWithWs;
  const token = signSessionToken({
    userId: user.id,
    workspaceId: workspace.id,
    email: user.email,
    fullName: user.fullName,
  });

  return { user, workspace, token };
}

/**
 * Converts WorkspaceAuthError and unexpected errors into clean NextResponse JSON responses.
 */
export function handleApiError(error: unknown): NextResponse {
  if (error instanceof WorkspaceAuthError) {
    return NextResponse.json(
      { error: error.message },
      { status: error.status }
    );
  }
  if (
    error instanceof SyntaxError ||
    (error instanceof Error && error.name === "SyntaxError")
  ) {
    return NextResponse.json(
      { error: "Dữ liệu JSON không hợp lệ" },
      { status: 400 }
    );
  }
  if (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    (error as { code?: string }).code === "P2002"
  ) {
    return NextResponse.json(
      { error: "Dữ liệu bị trùng lặp trong hệ thống" },
      { status: 409 }
    );
  }
  console.error("[API Error]", error);
  const message =
    error instanceof Error ? error.message : "Lỗi hệ thống nội bộ";
  return NextResponse.json({ error: message }, { status: 500 });
}
