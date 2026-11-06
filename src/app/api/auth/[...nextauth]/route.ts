import { NextRequest, NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { prisma } from "@/lib/db";
import {
  createSessionToken,
  attachSessionCookie,
  clearSessionCookie,
  getSessionFromRequest,
} from "@/lib/auth";

export async function GET(
  req: NextRequest,
  context: { params: Promise<{ nextauth: string[] }> }
) {
  const { nextauth } = await context.params;
  const action = nextauth?.[0] ?? "session";

  if (action === "csrf") {
    return NextResponse.json({ csrfToken: "cm-class-csrf-token" });
  }

  if (action === "providers") {
    return NextResponse.json({
      credentials: {
        id: "credentials",
        name: "Credentials",
        type: "credentials",
        signinUrl: "/api/auth/signin/credentials",
        callbackUrl: "/api/auth/callback/credentials",
      },
    });
  }

  if (action === "session") {
    const session = await getSessionFromRequest(req);
    if (!session) {
      return NextResponse.json({}, { status: 200 });
    }
    return NextResponse.json({
      user: {
        id: session.userId,
        email: session.email,
        name: session.fullName,
        fullName: session.fullName,
        workspaceId: session.workspaceId,
      },
      expires: new Date(Date.now() + 7 * 24 * 3600 * 1000).toISOString(),
    });
  }

  return NextResponse.json({ status: "ok" });
}

export async function POST(
  req: NextRequest,
  context: { params: Promise<{ nextauth: string[] }> }
) {
  const { nextauth } = await context.params;
  const action = nextauth?.[0] ?? "";

  if (action === "signout") {
    const res = NextResponse.json({ url: "/login", success: true });
    clearSessionCookie(res);
    return res;
  }

  // Handle credentials callback or sign-in
  let email = "";
  let password = "";
  const contentType = req.headers.get("content-type") || "";
  if (contentType.includes("application/json")) {
    const body = await req.json().catch(() => ({}));
    email = String(body.email || "").trim().toLowerCase();
    password = String(body.password || "");
  } else {
    const formData = await req.formData().catch(() => null);
    if (formData) {
      email = String(formData.get("email") || "").trim().toLowerCase();
      password = String(formData.get("password") || "");
    }
  }

  if (!email || !password) {
    return NextResponse.json(
      { error: "Email hoặc mật khẩu không đúng" },
      { status: 401 }
    );
  }

  const user = await prisma.user.findUnique({
    where: { email },
    include: { workspace: true },
  });

  if (!user || !(await bcrypt.compare(password, user.passwordHash))) {
    return NextResponse.json(
      { error: "Email hoặc mật khẩu không đúng" },
      { status: 401 }
    );
  }

  let workspace = user.workspace;
  if (!workspace) {
    workspace = await prisma.workspace.create({
      data: {
        userId: user.id,
        name: `Lớp học của ${user.fullName}`,
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

  const res = NextResponse.json({
    url: "/dashboard",
    user: {
      id: user.id,
      email: user.email,
      name: user.fullName,
      fullName: user.fullName,
      workspaceId: workspace.id,
    },
    workspace,
    token,
  });

  attachSessionCookie(res, token);
  return res;
}
