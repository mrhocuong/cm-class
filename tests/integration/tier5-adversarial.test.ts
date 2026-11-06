import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { NextRequest } from "next/server";
import { prisma } from "@/lib/db";
import {
  SESSION_COOKIE_NAME,
  signSessionToken,
  verifySessionToken,
} from "@/lib/auth";
import {
  registerTeacherWithWorkspace,
  requireWorkspace,
} from "@/lib/workspace";
import {
  buildVietQrPayload,
  computeCrc16Ccitt,
  formatTransferMemo,
  generateVietQrBundle,
} from "@/lib/vietqr";
import { detectScheduleConflicts } from "@/lib/timetable";
import { extractDeterministicDescriptorFromPixels } from "@/lib/face-ai";
import {
  calculateGameAccuracy,
  propagateTeamResultsToStudents,
} from "@/lib/game-engine";
import { computeLeaderboard } from "@/lib/leaderboard";

import { POST as postClass } from "@/app/api/classes/route";
import { POST as postScheduleSlots } from "@/app/api/classes/[id]/schedule-slots/route";
import { POST as generateClassSessions } from "@/app/api/classes/[id]/generate-sessions/route";
import { POST as generateWorkspaceSessions } from "@/app/api/schedule/generate-sessions/route";
import { POST as postStudent } from "@/app/api/students/route";
import { GET as getGuardians } from "@/app/api/students/[id]/guardians/route";
import {
  PATCH as patchGuardianById,
  DELETE as deleteGuardianById,
} from "@/app/api/students/[id]/guardians/[guardianId]/route";
import { POST as postEnrollment } from "@/app/api/enrollments/route";
import { POST as postFeePlan } from "@/app/api/fee-plans/route";
import { POST as generateInvoices } from "@/app/api/invoices/generate/route";
import { PATCH as patchInvoiceById } from "@/app/api/invoices/[id]/route";
import { POST as postInvoicePayment } from "@/app/api/invoices/[id]/payments/route";

function makeReq(
  url: string,
  token: string,
  options?: {
    method?: string;
    body?: unknown;
    rawBody?: string;
    headers?: Record<string, string>;
  }
): NextRequest {
  const headers: Record<string, string> = {
    cookie: `${SESSION_COOKIE_NAME}=${token}`,
    ...(options?.headers ?? {}),
  };
  let bodyStr: string | undefined;
  if (options?.rawBody !== undefined) {
    headers["content-type"] = "application/json";
    bodyStr = options.rawBody;
  } else if (options?.body !== undefined) {
    headers["content-type"] = "application/json";
    bodyStr = JSON.stringify(options.body);
  }
  return new NextRequest(url, {
    method: options?.method ?? "GET",
    headers,
    body: bodyStr,
  });
}

describe("Tier 5 White-Box Adversarial — Modules 1–4 & Core Libraries", () => {
  let teacherA: Awaited<ReturnType<typeof registerTeacherWithWorkspace>>;
  let teacherB: Awaited<ReturnType<typeof registerTeacherWithWorkspace>>;

  beforeAll(async () => {
    const suffix = `${Date.now()}-${Math.floor(Math.random() * 10000)}`;
    teacherA = await registerTeacherWithWorkspace({
      fullName: "Giáo Viên T5 A",
      email: `t5.m14.a.${suffix}@cmclass.vn`,
      password: "Password123!",
      workspaceName: "Workspace T5 A",
    });
    teacherB = await registerTeacherWithWorkspace({
      fullName: "Giáo Viên T5 B",
      email: `t5.m14.b.${suffix}@cmclass.vn`,
      password: "Password123!",
      workspaceName: "Workspace T5 B",
    });
  });

  afterAll(async () => {
    const ids = [teacherA?.user?.id, teacherB?.user?.id].filter(
      Boolean
    ) as string[];
    if (ids.length > 0) {
      await prisma.user.deleteMany({ where: { id: { in: ids } } });
    }
  });

  it("T5-M14-01: Auth & Session Token Forgery, Tampering, Expiry, Deleted-User & Bearer Header Resilience", async () => {
    // 1. Expired JWT token returns null
    const expiredToken = signSessionToken(
      {
        userId: teacherA.user.id,
        workspaceId: teacherA.workspace.id,
        email: teacherA.user.email,
        fullName: teacherA.user.fullName,
      },
      -10
    );
    expect(verifySessionToken(expiredToken)).toBeNull();

    // 2. Tampered payload segment & tampered signature segment rejected
    const parts = teacherA.token.split(".");
    const forgedPayload = Buffer.from(
      JSON.stringify({
        userId: teacherB.user.id,
        workspaceId: teacherB.workspace.id,
        email: teacherB.user.email,
        fullName: "Forged",
        iat: Math.floor(Date.now() / 1000),
        exp: Math.floor(Date.now() / 1000) + 3600,
      })
    ).toString("base64url");
    expect(
      verifySessionToken(`${parts[0]}.${forgedPayload}.${parts[2]}`)
    ).toBeNull();
    expect(
      verifySessionToken(`${parts[0]}.${parts[1]}.invalidsignature`)
    ).toBeNull();

    // 3. Valid HMAC token referencing a non-existent / deleted userId rejected by requireWorkspace with 401
    const ghostToken = signSessionToken({
      userId: "ghost-user-id-does-not-exist",
      workspaceId: teacherA.workspace.id,
      email: "ghost@cmclass.vn",
      fullName: "Ghost Teacher",
    });
    const ghostReq = new Request("http://localhost:3000/api/classes", {
      headers: { authorization: `Bearer ${ghostToken}` },
    });
    await expect(requireWorkspace(ghostReq)).rejects.toMatchObject({
      status: 401,
    });

    // 4. Valid Authorization: Bearer token resolves workspace context
    const bearerReq = new Request("http://localhost:3000/api/classes", {
      headers: { authorization: `Bearer ${teacherA.token}` },
    });
    const ctx = await requireWorkspace(bearerReq);
    expect(ctx.workspaceId).toBe(teacherA.workspace.id);

    // 5. Non-existent x-test-user-email rejected with 401
    const badTestHeaderReq = new Request("http://localhost:3000/api/classes", {
      headers: { "x-test-user-email": "nonexistent.hacker@cmclass.vn" },
    });
    await expect(requireWorkspace(badTestHeaderReq)).rejects.toMatchObject({
      status: 401,
    });
  });

  it("T5-M14-02: VietQR Zero-Amount Static QR (010211), 50-Char Memo Truncation Without Trailing Space & Diacritic Stripping", async () => {
    // 1. Special characters & Vietnamese diacritics in studentCode and invoiceNumber
    const memo = formatTransferMemo("HS-ĐẶC_BIỆT#01", "INV-2026/11-0009!");
    expect(memo).toBe("HP HSDACBIET01 INV2026110009");

    // 2. Zero-amount QR generates Static QR (000201010211) without Tag 54 and valid CRC-16
    const zeroPayload = buildVietQrPayload({
      bankBin: "970436",
      accountNumber: "0123456789",
      amount: 0,
      transferMemo: memo,
    });
    expect(zeroPayload.startsWith("000201010211")).toBe(true);
    expect(zeroPayload).not.toContain("54010");
    const expectedCrc = computeCrc16Ccitt(zeroPayload.slice(0, -4));
    expect(zeroPayload.slice(-4)).toBe(expectedCrc);

    // 3. Long custom memo (> 50 chars) where index 49 lands on a space is trimmed cleanly
    const longMemo =
      "Đóng học phí cho học sinh Nguyễn Đặng Ánh Tuyết lớp Toán nâng cao học kỳ 2 năm 2026";
    const bundle = await generateVietQrBundle({
      bankBin: "970422",
      accountNumber: "9988776655",
      accountName: "Cô Giáo Đặng Thị Ánh!",
      amount: 1250000,
      studentCode: "HS001",
      invoiceNumber: "INV-202611-0001",
      customMemo: longMemo,
    });
    expect(bundle.transferContent.length).toBeLessThanOrEqual(50);
    expect(bundle.transferContent.endsWith(" ")).toBe(false);
    expect(bundle.bankInfo.bankAccountName).toBe("CO GIAO DANG THI ANH");

    // 4. Invalid bank BIN or empty account number throws error
    expect(() =>
      buildVietQrPayload({
        bankBin: "123",
        accountNumber: "0123456789",
        amount: 100000,
        transferMemo: "HP HS001",
      })
    ).toThrow();
    expect(() =>
      buildVietQrPayload({
        bankBin: "970436",
        accountNumber: "   ",
        amount: 100000,
        transferMemo: "HP HS001",
      })
    ).toThrow();
  });

  it("T5-M14-03: Timetable Back-to-Back Touching Slots, Case/Whitespace Room Normalization & Null-Room Overlap", async () => {
    const conflicts = detectScheduleConflicts([
      {
        id: "s1",
        classId: "c1",
        className: "Lớp 1",
        dayOfWeek: 2,
        startTime: "17:30",
        endTime: "19:00",
        room: "  Phòng   201 ",
      },
      {
        id: "s2",
        classId: "c2",
        className: "Lớp 2 (Liền kề)",
        dayOfWeek: 2,
        startTime: "19:00",
        endTime: "20:30",
        room: "phòng 201",
      },
      {
        id: "s3",
        classId: "c3",
        className: "Lớp 3 (Trùng phòng)",
        dayOfWeek: 2,
        startTime: "18:15",
        endTime: "19:45",
        room: "PHÒNG 201",
      },
      {
        id: "s4",
        classId: "c4",
        className: "Lớp 4 (Không phòng A)",
        dayOfWeek: 4,
        startTime: "18:00",
        endTime: "19:30",
        room: null,
      },
      {
        id: "s5",
        classId: "c5",
        className: "Lớp 5 (Không phòng B)",
        dayOfWeek: 4,
        startTime: "18:30",
        endTime: "20:00",
        room: "   ",
      },
    ]);

    // s1 (17:30-19:00) and s2 (19:00-20:30) touch at 19:00 -> NO conflict between s1 & s2
    expect(
      conflicts.some(
        (c) =>
          (c.slotA.id === "s1" && c.slotB.id === "s2") ||
          (c.slotA.id === "s2" && c.slotB.id === "s1")
      )
    ).toBe(false);

    // s1 & s3 and s2 & s3 overlap in same normalized room "phòng 201" -> TEACHER_AND_ROOM
    const s1s3 = conflicts.find(
      (c) => c.slotA.id === "s1" && c.slotB.id === "s3"
    );
    expect(s1s3?.type).toBe("TEACHER_AND_ROOM");
    expect(s1s3?.overlapStart).toBe("18:15");
    expect(s1s3?.overlapEnd).toBe("19:00");

    // s4 & s5 overlap on day 4 with null/empty rooms -> TEACHER_OVERLAP (not TEACHER_AND_ROOM)
    const s4s5 = conflicts.find(
      (c) => c.slotA.id === "s4" && c.slotB.id === "s5"
    );
    expect(s4s5?.type).toBe("TEACHER_OVERLAP");
  });

  it("T5-M14-04: Session Generation >366 Days Guard, Class Start/End Date Fallback & Cross-Tenant classIds Rejection", async () => {
    const clsARes = await postClass(
      makeReq("http://localhost:3000/api/classes", teacherA.token, {
        method: "POST",
        body: {
          name: "Lớp T5 Session Boundary",
          subject: "Toán",
          startDate: "2026-11-01",
          endDate: "2026-11-15",
          scheduleSlots: [
            { dayOfWeek: 1, startTime: "18:00", endTime: "19:30", room: "P101" },
          ],
        },
      })
    );
    const clsA = (await clsARes.json()).class;

    const clsBRes = await postClass(
      makeReq("http://localhost:3000/api/classes", teacherB.token, {
        method: "POST",
        body: {
          name: "Lớp Của B",
          subject: "Lý",
        },
      })
    );
    const clsB = (await clsBRes.json()).class;

    // 1. > 366 days rejected with 400
    const tooLongRes = await generateClassSessions(
      makeReq(
        `http://localhost:3000/api/classes/${clsA.id}/generate-sessions`,
        teacherA.token,
        {
          method: "POST",
          body: { fromDate: "2026-01-01", toDate: "2027-01-10" },
        }
      ),
      { params: Promise.resolve({ id: clsA.id }) }
    );
    expect(tooLongRes.status).toBe(400);

    // 2. Omitting fromDate & toDate falls back to Class.startDate (2026-11-01) and Class.endDate (2026-11-15) -> 2 Mondays (Nov 2, Nov 9)
    const fallbackRes = await generateClassSessions(
      makeReq(
        `http://localhost:3000/api/classes/${clsA.id}/generate-sessions`,
        teacherA.token,
        {
          method: "POST",
          body: {},
        }
      ),
      { params: Promise.resolve({ id: clsA.id }) }
    );
    expect(fallbackRes.status).toBe(200);
    const fallbackBody = await fallbackRes.json();
    expect(fallbackBody.createdCount).toBe(2);

    // 3. Atomic slot replacement with replace: true
    const replaceSlotsRes = await postScheduleSlots(
      makeReq(
        `http://localhost:3000/api/classes/${clsA.id}/schedule-slots`,
        teacherA.token,
        {
          method: "POST",
          body: {
            replace: true,
            slots: [
              { dayOfWeek: 5, startTime: "19:00", endTime: "20:30", room: "P202" },
            ],
          },
        }
      ),
      { params: Promise.resolve({ id: clsA.id }) }
    );
    expect(replaceSlotsRes.status).toBe(201);
    const replaceBody = await replaceSlotsRes.json();
    expect(replaceBody.slots.length).toBe(1);
    expect(replaceBody.slots[0].dayOfWeek).toBe(5);

    // 4. Cross-tenant classIds injection on POST /api/schedule/generate-sessions rejected with 404
    const crossGenRes = await generateWorkspaceSessions(
      makeReq(
        "http://localhost:3000/api/schedule/generate-sessions",
        teacherA.token,
        {
          method: "POST",
          body: {
            fromDate: "2026-11-01",
            toDate: "2026-11-30",
            classIds: [clsA.id, clsB.id],
          },
        }
      )
    );
    expect(crossGenRes.status).toBe(404);
  });

  it("T5-M14-05: Guardian Single-Primary Normalization on Demotion (PATCH isPrimary: false) & Sole Guardian Protection", async () => {
    const stuRes = await postStudent(
      makeReq("http://localhost:3000/api/students", teacherA.token, {
        method: "POST",
        body: {
          fullName: "Học Sinh T5 Guardian",
          guardians: [
            {
              fullName: "Phụ Huynh A",
              relationship: "Bố",
              phone: "0901111111",
              isPrimary: false,
            },
            {
              fullName: "Phụ Huynh B",
              relationship: "Mẹ",
              phone: "0902222222",
              isPrimary: false,
            },
          ],
        },
      })
    );
    expect(stuRes.status).toBe(201);
    const stu = (await stuRes.json()).student;

    // Even when all initial guardians pass isPrimary: false, index 0 is normalized to primary
    expect(stu.guardians.filter((g: any) => g.isPrimary).length).toBe(1);
    const gA = stu.guardians.find((g: any) => g.fullName === "Phụ Huynh A");
    const gB = stu.guardians.find((g: any) => g.fullName === "Phụ Huynh B");
    expect(gA.isPrimary).toBe(true);

    // Demoting primary Guardian A via PATCH { isPrimary: false } promotes Guardian B to primary
    const demoteRes = await patchGuardianById(
      makeReq(
        `http://localhost:3000/api/students/${stu.id}/guardians/${gA.id}`,
        teacherA.token,
        {
          method: "PATCH",
          body: { isPrimary: false },
        }
      ),
      { params: Promise.resolve({ id: stu.id, guardianId: gA.id }) }
    );
    expect(demoteRes.status).toBe(200);

    const listAfterDemote = await (
      await getGuardians(
        makeReq(
          `http://localhost:3000/api/students/${stu.id}/guardians`,
          teacherA.token
        ),
        { params: Promise.resolve({ id: stu.id }) }
      )
    ).json();
    const primariesAfterDemote = listAfterDemote.guardians.filter(
      (g: any) => g.isPrimary
    );
    expect(primariesAfterDemote.length).toBe(1);
    expect(primariesAfterDemote[0].id).toBe(gB.id);

    // Delete Guardian A so Guardian B is the sole guardian, then attempt PATCH { isPrimary: false } on Guardian B
    await deleteGuardianById(
      makeReq(
        `http://localhost:3000/api/students/${stu.id}/guardians/${gA.id}`,
        teacherA.token,
        { method: "DELETE" }
      ),
      { params: Promise.resolve({ id: stu.id, guardianId: gA.id }) }
    );

    const soleDemoteRes = await patchGuardianById(
      makeReq(
        `http://localhost:3000/api/students/${stu.id}/guardians/${gB.id}`,
        teacherA.token,
        {
          method: "PATCH",
          body: { isPrimary: false },
        }
      ),
      { params: Promise.resolve({ id: stu.id, guardianId: gB.id }) }
    );
    expect(soleDemoteRes.status).toBe(200);
    expect((await soleDemoteRes.json()).guardian.isPrimary).toBe(true);
  });

  it("T5-M14-06: Cross-Tenant Nested ID Injection on Student enrollClassIds, Bulk Enrollment studentIds & Invoice feePlanId/studentIds", async () => {
    const clsA1 = (
      await (
        await postClass(
          makeReq("http://localhost:3000/api/classes", teacherA.token, {
            method: "POST",
            body: { name: "Lớp A1", subject: "Toán", defaultFeeAmount: 1000000 },
          })
        )
      ).json()
    ).class;
    const clsA2 = (
      await (
        await postClass(
          makeReq("http://localhost:3000/api/classes", teacherA.token, {
            method: "POST",
            body: { name: "Lớp A2", subject: "Anh", defaultFeeAmount: 2000000 },
          })
        )
      ).json()
    ).class;
    const clsB = (
      await (
        await postClass(
          makeReq("http://localhost:3000/api/classes", teacherB.token, {
            method: "POST",
            body: { name: "Lớp B", subject: "Hóa", defaultFeeAmount: 500000 },
          })
        )
      ).json()
    ).class;

    const stuA = (
      await (
        await postStudent(
          makeReq("http://localhost:3000/api/students", teacherA.token, {
            method: "POST",
            body: { fullName: "Học Sinh A" },
          })
        )
      ).json()
    ).student;
    const stuB = (
      await (
        await postStudent(
          makeReq("http://localhost:3000/api/students", teacherB.token, {
            method: "POST",
            body: { fullName: "Học Sinh B" },
          })
        )
      ).json()
    ).student;

    // 1. Teacher A creates Student with enrollClassIds: [clsA1.id, clsB.id] -> 404
    const crossStuCreate = await postStudent(
      makeReq("http://localhost:3000/api/students", teacherA.token, {
        method: "POST",
        body: {
          fullName: "Học Sinh Chèn Lớp B",
          enrollClassIds: [clsA1.id, clsB.id],
        },
      })
    );
    expect(crossStuCreate.status).toBe(404);

    // 2. Teacher A bulk-enrolls [stuA.id, stuB.id] into clsA1.id -> 404
    const crossBulkEnroll = await postEnrollment(
      makeReq("http://localhost:3000/api/enrollments", teacherA.token, {
        method: "POST",
        body: {
          classId: clsA1.id,
          studentIds: [stuA.id, stuB.id],
        },
      })
    );
    expect(crossBulkEnroll.status).toBe(404);

    // Enroll stuA legitimately into clsA1
    await postEnrollment(
      makeReq("http://localhost:3000/api/enrollments", teacherA.token, {
        method: "POST",
        body: { classId: clsA1.id, studentId: stuA.id },
      })
    );

    // 3. Teacher A generates invoices for clsA1 using Teacher B's feePlanId -> 404
    const crossFeePlanGen = await generateInvoices(
      makeReq("http://localhost:3000/api/invoices/generate", teacherA.token, {
        method: "POST",
        body: {
          classId: clsA1.id,
          feePlanId: clsB.feePlans[0].id,
          billingPeriod: "2026-11",
        },
      })
    );
    expect(crossFeePlanGen.status).toBe(404);

    // 4. Teacher A generates invoices for clsA1 using clsA2's feePlanId (wrong class) -> 404
    const wrongClassFeePlanGen = await generateInvoices(
      makeReq("http://localhost:3000/api/invoices/generate", teacherA.token, {
        method: "POST",
        body: {
          classId: clsA1.id,
          feePlanId: clsA2.feePlans[0].id,
          billingPeriod: "2026-11",
        },
      })
    );
    expect(wrongClassFeePlanGen.status).toBe(404);

    // 5. Teacher A generates invoices for clsA1 passing studentIds: [stuA.id, stuB.id] -> 404
    const crossStudentInvoiceGen = await generateInvoices(
      makeReq("http://localhost:3000/api/invoices/generate", teacherA.token, {
        method: "POST",
        body: {
          classId: clsA1.id,
          studentIds: [stuA.id, stuB.id],
          billingPeriod: "2026-11",
        },
      })
    );
    expect(crossStudentInvoiceGen.status).toBe(404);
  });

  it("T5-M14-07 & T5-M14-08 & T5-M14-09: Invoice Partial Payment Cancellation Guard, Discount Auto-Settlement, Cancelled Invoice Re-Generation & PER_SESSION Overrides", async () => {
    const cls = (
      await (
        await postClass(
          makeReq("http://localhost:3000/api/classes", teacherA.token, {
            method: "POST",
            body: {
              name: "Lớp T5 Học Phí",
              subject: "Toán",
              defaultFeeAmount: 200000,
              billingCycle: "PER_SESSION",
            },
          })
        )
      ).json()
    ).class;

    const stu1 = (
      await (
        await postStudent(
          makeReq("http://localhost:3000/api/students", teacherA.token, {
            method: "POST",
            body: { fullName: "HS T5 Học Phí 1" },
          })
        )
      ).json()
    ).student;
    const stu2 = (
      await (
        await postStudent(
          makeReq("http://localhost:3000/api/students", teacherA.token, {
            method: "POST",
            body: { fullName: "HS T5 Học Phí 2" },
          })
        )
      ).json()
    ).student;

    await postEnrollment(
      makeReq("http://localhost:3000/api/enrollments", teacherA.token, {
        method: "POST",
        body: { classId: cls.id, studentIds: [stu1.id, stu2.id] },
      })
    );

    // 1. Reject overrides where discountAmount > baseAmount -> 400
    const badOverrideGen = await generateInvoices(
      makeReq("http://localhost:3000/api/invoices/generate", teacherA.token, {
        method: "POST",
        body: {
          classId: cls.id,
          billingPeriod: "2026-11",
          sessionCount: 8,
          overrides: {
            [stu1.id]: { baseAmount: 1000000, discountAmount: 1500000 },
          },
        },
      })
    );
    expect(badOverrideGen.status).toBe(400);

    // 2. Generate PER_SESSION invoices (8 sessions * 200,000 = 1,600,000) with override on stu1
    const gen1Res = await generateInvoices(
      makeReq("http://localhost:3000/api/invoices/generate", teacherA.token, {
        method: "POST",
        body: {
          classId: cls.id,
          billingPeriod: "2026-11",
          sessionCount: 8,
          overrides: {
            [stu1.id]: {
              discountAmount: 200000,
              discountReason: "Ưu đãi nghỉ 1 buổi có phép",
            },
          },
        },
      })
    );
    expect(gen1Res.status).toBe(201);
    const gen1Body = await gen1Res.json();
    const inv1 = gen1Body.invoices.find((i: any) => i.studentId === stu1.id);
    const inv2 = gen1Body.invoices.find((i: any) => i.studentId === stu2.id);
    expect(inv1.baseAmount).toBe(1600000);
    expect(inv1.discountAmount).toBe(200000);
    expect(inv1.netAmount).toBe(1400000);
    expect(inv2.netAmount).toBe(1600000);

    // 3. Record partial payment of 1,000,000 on inv1 -> PARTIAL
    const payRes = await postInvoicePayment(
      makeReq(
        `http://localhost:3000/api/invoices/${inv1.id}/payments`,
        teacherA.token,
        {
          method: "POST",
          body: { amount: 1000000, method: "CASH" },
        }
      ),
      { params: Promise.resolve({ id: inv1.id }) }
    );
    expect(payRes.status).toBe(201);

    // 4. Attempting to CANCEL an invoice with paidAmount > 0 is rejected with 400
    const cancelPaidAttempt = await patchInvoiceById(
      makeReq(`http://localhost:3000/api/invoices/${inv1.id}`, teacherA.token, {
        method: "PATCH",
        body: { status: "CANCELLED" },
      }),
      { params: Promise.resolve({ id: inv1.id }) }
    );
    expect(cancelPaidAttempt.status).toBe(400);

    // 5. Attempting to increase discountAmount so newNetAmount (800,000) < paidAmount (1,000,000) is rejected with 400
    const reduceBelowPaidAttempt = await patchInvoiceById(
      makeReq(`http://localhost:3000/api/invoices/${inv1.id}`, teacherA.token, {
        method: "PATCH",
        body: { discountAmount: 800000 },
      }),
      { params: Promise.resolve({ id: inv1.id }) }
    );
    expect(reduceBelowPaidAttempt.status).toBe(400);

    // 6. Increasing discountAmount to 600,000 so newNetAmount (1,000,000) === paidAmount (1,000,000) transitions PARTIAL -> PAID
    const autoSettleRes = await patchInvoiceById(
      makeReq(`http://localhost:3000/api/invoices/${inv1.id}`, teacherA.token, {
        method: "PATCH",
        body: { discountAmount: 600000 },
      }),
      { params: Promise.resolve({ id: inv1.id }) }
    );
    expect(autoSettleRes.status).toBe(200);
    expect((await autoSettleRes.json()).invoice.status).toBe("PAID");

    // 7. Cancel unpaid inv2 -> CANCELLED, then verify mutating/un-cancelling inv2 is rejected with 400
    const cancelInv2 = await patchInvoiceById(
      makeReq(`http://localhost:3000/api/invoices/${inv2.id}`, teacherA.token, {
        method: "PATCH",
        body: { status: "CANCELLED" },
      }),
      { params: Promise.resolve({ id: inv2.id }) }
    );
    expect(cancelInv2.status).toBe(200);

    const uncancelAttempt = await patchInvoiceById(
      makeReq(`http://localhost:3000/api/invoices/${inv2.id}`, teacherA.token, {
        method: "PATCH",
        body: { status: "UNPAID" },
      }),
      { params: Promise.resolve({ id: inv2.id }) }
    );
    expect(uncancelAttempt.status).toBe(400);

    // 8. Re-run bulk invoice generation for period 2026-11: stu1 is skipped, stu2 (whose invoice was CANCELLED) gets a new invoice with incremented sequence number
    const regenRes = await generateInvoices(
      makeReq("http://localhost:3000/api/invoices/generate", teacherA.token, {
        method: "POST",
        body: {
          classId: cls.id,
          billingPeriod: "2026-11",
          sessionCount: 8,
        },
      })
    );
    expect(regenRes.status).toBe(201);
    const regenBody = await regenRes.json();
    expect(regenBody.createdCount).toBe(1);
    expect(regenBody.skippedCount).toBe(1);
    expect(regenBody.invoices[0].studentId).toBe(stu2.id);
    expect(regenBody.invoices[0].invoiceNumber).not.toBe(inv2.invoiceNumber);
    expect(regenBody.invoices[0].status).toBe("UNPAID");
  });

  it("T5-M14-10: Malformed JSON Body Resilience Across Modules 2–4 Endpoints Returns 400 (Never 500)", async () => {
    const badClassRes = await postClass(
      makeReq("http://localhost:3000/api/classes", teacherA.token, {
        method: "POST",
        rawBody: "{ malformed json",
      })
    );
    expect(badClassRes.status).toBe(400);

    const badStudentRes = await postStudent(
      makeReq("http://localhost:3000/api/students", teacherA.token, {
        method: "POST",
        rawBody: "{ malformed json",
      })
    );
    expect(badStudentRes.status).toBe(400);

    const badEnrollRes = await postEnrollment(
      makeReq("http://localhost:3000/api/enrollments", teacherA.token, {
        method: "POST",
        rawBody: "{ malformed json",
      })
    );
    expect(badEnrollRes.status).toBe(400);

    const badFeePlanRes = await postFeePlan(
      makeReq("http://localhost:3000/api/fee-plans", teacherA.token, {
        method: "POST",
        rawBody: "{ malformed json",
      })
    );
    expect(badFeePlanRes.status).toBe(400);

    const badInvoiceGenRes = await generateInvoices(
      makeReq("http://localhost:3000/api/invoices/generate", teacherA.token, {
        method: "POST",
        rawBody: "{ malformed json",
      })
    );
    expect(badInvoiceGenRes.status).toBe(400);
  });
});

describe("Modules 5–9 Specialized Engines White-Box Edge Cases (FaceAI, GameEngine, Leaderboard)", () => {
  it("handles uniform-color zero-variance images and dimension boundaries in extractDeterministicDescriptorFromPixels", () => {
    // Uniform flat gray 16x16 image -> variance = 0 in all 4 channels (std < 1e-8 branch)
    const uniformPixels = new Uint8ClampedArray(16 * 16 * 4).fill(128);
    const desc = extractDeterministicDescriptorFromPixels(
      uniformPixels,
      16,
      16
    );
    expect(desc).toHaveLength(128);
    expect(desc.every((v) => v === 0)).toBe(true);

    // Invalid dimensions or short buffer throw descriptive Vietnamese error
    expect(() =>
      extractDeterministicDescriptorFromPixels(new Uint8ClampedArray(10), 0, 10)
    ).toThrow(/không hợp lệ/);
    expect(() =>
      extractDeterministicDescriptorFromPixels(
        new Uint8ClampedArray(10),
        16,
        16
      )
    ).toThrow(/không hợp lệ/);
  });

  it("deduplicates students listed in multiple teams and clamps out-of-range correctCount in GameEngine", () => {
    expect(calculateGameAccuracy(0, 0)).toBe(100);
    expect(calculateGameAccuracy(10, 5)).toBe(100);
    expect(calculateGameAccuracy(-3, 5)).toBe(0);

    const propagated = propagateTeamResultsToStudents(
      [
        { name: "  Đội A  ", studentIds: ["s1", "s2"] },
        { name: "Đội B", studentIds: ["s2", "s3"] }, // s2 duplicated across teams
      ],
      [
        { teamName: "đội a", score: 400, correctCount: 4, totalQuestions: 5 },
        { teamName: "ĐỘI B", score: 200, correctCount: 2, totalQuestions: 5 },
      ]
    );
    // s2 appears only once (in Đội A)
    expect(propagated).toHaveLength(3);
    expect(propagated.filter((p) => p.studentId === "s2")).toHaveLength(1);
    expect(propagated.find((p) => p.studentId === "s2")?.teamName).toBe(
      "  Đội A  "
    );
  });

  it("ignores non-overdue MISSING homeworks while penalizing overdue MISSING homeworks as 0% in computeLeaderboard", () => {
    const res = computeLeaderboard([
      {
        studentId: "s1",
        studentCode: "HS001",
        fullName: "Học Sinh 1",
        attendances: [],
        homeworks: [
          { status: "GRADED", score: 8, maxScore: 10 }, // 80%
          { status: "MISSING", score: null, maxScore: 10, isOverdue: false }, // Not overdue yet -> ignored!
        ],
        gameResults: [],
        pointTransactions: [],
      },
      {
        studentId: "s2",
        studentCode: "HS002",
        fullName: "Học Sinh 2",
        attendances: [],
        homeworks: [
          { status: "GRADED", score: 8, maxScore: 10 }, // 80%
          { status: "MISSING", score: null, maxScore: 10, isOverdue: true }, // Overdue -> counts as 0%!
        ],
        gameResults: [],
        pointTransactions: [],
      },
    ]);

    const r1 = res.rankings.find((r) => r.studentId === "s1")!;
    const r2 = res.rankings.find((r) => r.studentId === "s2")!;
    expect(r1.homeworkCount).toBe(1);
    expect(r1.homeworkScore).toBe(80);
    expect(r2.homeworkCount).toBe(2);
    expect(r2.homeworkScore).toBe(40);
  });
});
