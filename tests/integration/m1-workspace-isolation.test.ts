import { describe, expect, it } from "vitest";
import { NextRequest } from "next/server";
import { prisma } from "@/lib/db";
import { signSessionToken, SESSION_COOKIE_NAME } from "@/lib/auth";
import {
  WorkspaceAuthError,
  assertWorkspaceResource,
  loginTeacherWithCredentials,
  registerTeacherWithWorkspace,
  requireWorkspace,
} from "@/lib/workspace";
import { GET as getWorkspace, PUT as putWorkspace } from "@/app/api/workspace/route";
import { GET as getDashboard } from "@/app/api/dashboard/route";
import { GET as getMe } from "@/app/api/auth/me/route";

describe("Milestone 1 Integration: Auth & Multi-Tenant Workspace Isolation", () => {
  it("rejects unauthenticated requests with 401 WorkspaceAuthError", async () => {
    const req = new Request("http://localhost:3000/api/workspace");
    await expect(requireWorkspace(req)).rejects.toMatchObject({
      status: 401,
      message: "Vui lòng đăng nhập",
    });

    const unauthNextReq = new NextRequest("http://localhost:3000/api/dashboard");
    const unauthRes = await getDashboard(unauthNextReq);
    expect(unauthRes.status).toBe(401);
  });

  it("enforces strict isolation between Teacher A and Teacher B workspaces", async () => {
    const teacherA = await prisma.user.findUnique({
      where: { email: "giaovien@cmclass.vn" },
      include: { workspace: true },
    });
    const teacherB = await prisma.user.findUnique({
      where: { email: "giaovien2@cmclass.vn" },
      include: { workspace: true },
    });

    expect(teacherA?.workspace).toBeDefined();
    expect(teacherB?.workspace).toBeDefined();
    expect(teacherA!.workspace!.id).not.toBe(teacherB!.workspace!.id);

    // Resolve Teacher A via signed session cookie
    const tokenA = signSessionToken({
      userId: teacherA!.id,
      workspaceId: teacherA!.workspace!.id,
      email: teacherA!.email,
      fullName: teacherA!.fullName,
    });
    const reqA = new Request("http://localhost:3000/api/classes", {
      headers: {
        cookie: `${SESSION_COOKIE_NAME}=${tokenA}`,
      },
    });
    const ctxA = await requireWorkspace(reqA);
    expect(ctxA.workspaceId).toBe(teacherA!.workspace!.id);

    // Fetch a class and student belonging to Teacher B
    const classB = await prisma.class.findFirst({
      where: { workspaceId: teacherB!.workspace!.id },
    });
    const studentB = await prisma.student.findFirst({
      where: { workspaceId: teacherB!.workspace!.id },
    });
    expect(classB).not.toBeNull();
    expect(studentB).not.toBeNull();

    // Teacher A attempting to look up Teacher B's class or student scoped by ctxA.workspaceId gets null / 404
    const crossTenantClassLookup = await prisma.class.findFirst({
      where: { id: classB!.id, workspaceId: ctxA.workspaceId },
    });
    expect(crossTenantClassLookup).toBeNull();

    expect(() =>
      assertWorkspaceResource(crossTenantClassLookup, ctxA.workspaceId)
    ).toThrowError(WorkspaceAuthError);

    expect(() =>
      assertWorkspaceResource(studentB, ctxA.workspaceId)
    ).toThrowError(WorkspaceAuthError);

    // Verify /api/dashboard for Teacher A vs Teacher B
    const dashReqA = new NextRequest("http://localhost:3000/api/dashboard", {
      headers: { cookie: `${SESSION_COOKIE_NAME}=${tokenA}` },
    });
    const dashResA = await getDashboard(dashReqA);
    expect(dashResA.status).toBe(200);
    const dashDataA = await dashResA.json();
    expect(dashDataA.workspace.id).toBe(teacherA!.workspace!.id);
    expect(dashDataA.kpis.totalClasses).toBe(3);
    expect(dashDataA.kpis.totalStudents).toBe(20);
    expect(dashDataA.todaySessions.length).toBeGreaterThanOrEqual(2);

    const tokenB = signSessionToken({
      userId: teacherB!.id,
      workspaceId: teacherB!.workspace!.id,
      email: teacherB!.email,
      fullName: teacherB!.fullName,
    });
    const dashReqB = new NextRequest("http://localhost:3000/api/dashboard", {
      headers: { cookie: `${SESSION_COOKIE_NAME}=${tokenB}` },
    });
    const dashResB = await getDashboard(dashReqB);
    expect(dashResB.status).toBe(200);
    const dashDataB = await dashResB.json();
    expect(dashDataB.workspace.id).toBe(teacherB!.workspace!.id);
    expect(dashDataB.kpis.totalClasses).toBe(1);
    expect(dashDataB.kpis.totalStudents).toBe(2);

    // Verify /api/workspace GET and partial bank rejection on PUT
    const wsReqA = new NextRequest("http://localhost:3000/api/workspace", {
      headers: { cookie: `${SESSION_COOKIE_NAME}=${tokenA}` },
    });
    const wsResA = await getWorkspace(wsReqA);
    expect(wsResA.status).toBe(200);
    const wsDataA = await wsResA.json();
    expect(wsDataA.vietqrPreview).toBeDefined();
    expect(wsDataA.vietqrPreview.qrPayload).toContain("970436");

    const invalidBankPutReq = new NextRequest("http://localhost:3000/api/workspace", {
      method: "PUT",
      headers: {
        cookie: `${SESSION_COOKIE_NAME}=${tokenA}`,
        "content-type": "application/json",
      },
      body: JSON.stringify({
        name: "Trung tâm Luyện thi Sao Khuê",
        bankBin: "970436",
        bankAccountNumber: "",
        bankAccountName: "",
      }),
    });
    const invalidBankRes = await putWorkspace(invalidBankPutReq);
    expect(invalidBankRes.status).toBe(400);

    // Verify /api/auth/me
    const meReq = new NextRequest("http://localhost:3000/api/auth/me", {
      headers: { cookie: `${SESSION_COOKIE_NAME}=${tokenA}` },
    });
    const meRes = await getMe(meReq);
    expect(meRes.status).toBe(200);
    const meData = await meRes.json();
    expect(meData.user.email).toBe("giaovien@cmclass.vn");
  });

  it("atomically registers a new teacher + 1-to-1 workspace and authenticates login", async () => {
    const uniqueEmail = `  Test.Teacher.${Date.now()}@CMClass.vn `;
    const reg = await registerTeacherWithWorkspace({
      fullName: "Thầy Trần Quốc Tuấn",
      email: uniqueEmail,
      password: "Password123!",
      workspaceName: "Trung tâm Toán Thầy Tuấn",
    });

    expect(reg.user.email).toBe(uniqueEmail.trim().toLowerCase());
    expect(reg.workspace.userId).toBe(reg.user.id);
    expect(reg.workspace.name).toBe("Trung tâm Toán Thầy Tuấn");

    // Duplicate registration must fail with 409
    await expect(
      registerTeacherWithWorkspace({
        fullName: "Trùng Email",
        email: uniqueEmail,
        password: "Password123!",
      })
    ).rejects.toMatchObject({ status: 409 });

    // Login with credentials succeeds
    const loginRes = await loginTeacherWithCredentials({
      email: uniqueEmail.toUpperCase(),
      password: "Password123!",
    });
    expect(loginRes.workspace.id).toBe(reg.workspace.id);

    // Clean up test user (cascades workspace)
    await prisma.user.delete({ where: { id: reg.user.id } });
  });
});
