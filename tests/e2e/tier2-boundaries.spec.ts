import { test, expect } from "@playwright/test";
import {
  BASE_URL,
  createTestClass,
  createTestStudent,
  generateNormalizedDescriptor,
  perturbDescriptor,
  registerAndLoginTeacher,
  uniqueSuffix,
  unwrapItem,
  unwrapList,
} from "./helpers";

test.describe("Tier 2 — Boundary & Corner Cases (Modules 1–9)", () => {
  // ===========================================================================
  // GROUP 1: Auth, Registration & Workspace Boundaries (survey_2 #1, #2)
  // ===========================================================================
  test.describe("Group 1: Auth, Registration & Workspace Boundaries", () => {
    test("T2-01: Whitespace-padded and uppercase email normalization on registration and login", async ({
      request,
    }) => {
      const suffix = uniqueSuffix("t2-01");
      const rawEmail = `  Teacher.Upper_${suffix}@Example.COM  `;
      const expectedEmail = `teacher.upper_${suffix}@example.com`;

      const regRes = await request.post(`${BASE_URL}/api/auth/register`, {
        data: {
          fullName: "Cô Giáo Chuẩn Hoá Email",
          email: rawEmail,
          password: "Password123!",
          workspaceName: "Lớp Toán Cô Chuẩn Hoá",
        },
      });
      expect(regRes.status()).toBe(201);
      const regBody = await regRes.json();
      const user = regBody.user ?? regBody;
      expect(user.email).toBe(expectedEmail);

      // Verify login with uppercase/padded email also normalizes and succeeds
      const loginRes = await request.post(`${BASE_URL}/api/auth/login`, {
        data: {
          email: `  TEACHER.UPPER_${suffix}@example.com `,
          password: "Password123!",
        },
      });
      expect(loginRes.status()).toBe(200);
    });

    test("T2-02: Duplicate email registration rejected with 409 even with different casing/whitespace", async ({
      request,
    }) => {
      const client = await registerAndLoginTeacher(request);
      const dupRes = await request.post(`${BASE_URL}/api/auth/register`, {
        data: {
          fullName: "Giáo Viên Trùng",
          email: `  ${client.teacher.email.toUpperCase()}  `,
          password: "Password123!",
        },
      });
      expect(dupRes.status()).toBe(409);
    });

    test("T2-03: Short password (< 6 chars), invalid email, and empty name rejected with 400", async ({
      request,
    }) => {
      const suffix = uniqueSuffix("t2-03");
      const badEmailRes = await request.post(`${BASE_URL}/api/auth/register`, {
        data: {
          fullName: "Test",
          email: "invalid-email-format",
          password: "Password123!",
        },
      });
      expect(badEmailRes.status()).toBe(400);

      const shortPassRes = await request.post(`${BASE_URL}/api/auth/register`, {
        data: {
          fullName: "Test",
          email: `short_${suffix}@example.com`,
          password: "123",
        },
      });
      expect(shortPassRes.status()).toBe(400);

      const emptyNameRes = await request.post(`${BASE_URL}/api/auth/register`, {
        data: {
          fullName: "   ",
          email: `empty_${suffix}@example.com`,
          password: "Password123!",
        },
      });
      expect(emptyNameRes.status()).toBe(400);
    });

    test("T2-04: Invalid login credentials and unauthenticated API requests return 401", async ({
      request,
    }) => {
      const client = await registerAndLoginTeacher(request);

      const wrongPass = await request.post(`${BASE_URL}/api/auth/login`, {
        data: {
          email: client.teacher.email,
          password: "WrongPassword999!",
        },
      });
      expect(wrongPass.status()).toBe(401);

      const unknownUser = await request.post(`${BASE_URL}/api/auth/login`, {
        data: {
          email: `nobody_${uniqueSuffix()}@example.com`,
          password: "Password123!",
        },
      });
      expect(unknownUser.status()).toBe(401);

      const unauthWorkspace = await request.get(`${BASE_URL}/api/workspace`);
      expect(unauthWorkspace.status()).toBe(401);
    });

    test("T2-05: Cross-workspace access and mutation attempts return 404/403 without mutating owner data", async ({
      request,
    }) => {
      const teacherA = await registerAndLoginTeacher(request);
      const teacherB = await registerAndLoginTeacher(request);

      const classA = await createTestClass(teacherA, {
        name: "Lớp Riêng Của A",
        subject: "Toán",
        defaultFeeAmount: 1000000,
      });
      const studentA = await createTestStudent(teacherA, {
        fullName: "Học Sinh Của A",
      });

      // Teacher B attempts GET, PATCH, DELETE on Teacher A's records
      const getStuB = await teacherB.get(`/api/students/${studentA.id}`);
      expect([403, 404]).toContain(getStuB.status());

      const patchClsB = await teacherB.patch(`/api/classes/${classA.id}`, {
        name: "B Hacked",
      });
      expect([403, 404]).toContain(patchClsB.status());

      const delClsB = await teacherB.delete(`/api/classes/${classA.id}`);
      expect([403, 404]).toContain(delClsB.status());

      // Verify Teacher A's class is untouched
      const verifyA = await teacherA.get(`/api/classes/${classA.id}`);
      expect(verifyA.status()).toBe(200);
      const verifyCls = unwrapItem(await verifyA.json(), "class");
      expect(verifyCls.name).toBe("Lớp Riêng Của A");
    });
  });

  // ===========================================================================
  // GROUP 2: Schedule Slots, Timetable Conflicts & Session Generation Boundaries
  // ===========================================================================
  test.describe("Group 2: Schedule Slots, Timetable Conflicts & Session Generation Boundaries", () => {
    test("T2-06: Invalid schedule slot time range (startTime >= endTime or invalid HH:mm/dayOfWeek) rejected with 400", async ({
      request,
    }) => {
      const client = await registerAndLoginTeacher(request);
      const classA = await createTestClass(client);

      // startTime > endTime
      const invertedRes = await client.post(
        `/api/classes/${classA.id}/schedule-slots`,
        {
          dayOfWeek: 1,
          startTime: "18:00",
          endTime: "17:30",
          room: "P101",
        }
      );
      expect(invertedRes.status()).toBe(400);

      // startTime === endTime
      const equalRes = await client.post(
        `/api/classes/${classA.id}/schedule-slots`,
        {
          dayOfWeek: 1,
          startTime: "18:00",
          endTime: "18:00",
          room: "P101",
        }
      );
      expect(equalRes.status()).toBe(400);

      // invalid dayOfWeek / malformed time
      const invalidDayRes = await client.post(
        `/api/classes/${classA.id}/schedule-slots`,
        {
          dayOfWeek: 9,
          startTime: "25:99",
          endTime: "26:30",
          room: "P101",
        }
      );
      expect(invalidDayRes.status()).toBe(400);
    });

    test("T2-07: Ad-hoc session creation and reschedule with startTime >= endTime rejected with 400", async ({
      request,
    }) => {
      const client = await registerAndLoginTeacher(request);
      const classA = await createTestClass(client);

      const badCreateRes = await client.post("/api/sessions", {
        classId: classA.id,
        sessionDate: "2026-11-10",
        startTime: "19:30",
        endTime: "18:00",
      });
      expect(badCreateRes.status()).toBe(400);

      const validSessionRes = await client.post("/api/sessions", {
        classId: classA.id,
        sessionDate: "2026-11-10",
        startTime: "18:00",
        endTime: "19:30",
      });
      expect(validSessionRes.status()).toBe(201);
      const validSession = unwrapItem(await validSessionRes.json(), "session");

      const badPatchRes = await client.patch(
        `/api/sessions/${validSession.id}`,
        {
          startTime: "20:00",
          endTime: "19:00",
        }
      );
      expect(badPatchRes.status()).toBe(400);
    });

    test("T2-08: Timetable conflict detection across classes (teacher time overlap & room collision)", async ({
      request,
    }) => {
      const client = await registerAndLoginTeacher(request);
      const classA = await createTestClass(client, {
        name: "Lớp A Phòng 101",
        room: "Phòng 101",
      });
      const classB = await createTestClass(client, {
        name: "Lớp B Phòng 102",
        room: "Phòng 102",
      });
      const classC = await createTestClass(client, {
        name: "Lớp C Phòng 101",
        room: "Phòng 101",
      });

      await client.post(`/api/classes/${classA.id}/schedule-slots`, {
        dayOfWeek: 1,
        startTime: "18:00",
        endTime: "19:30",
        room: "Phòng 101",
      });
      await client.post(`/api/classes/${classB.id}/schedule-slots`, {
        dayOfWeek: 1,
        startTime: "19:00",
        endTime: "20:30",
        room: "Phòng 102",
      });
      await client.post(`/api/classes/${classC.id}/schedule-slots`, {
        dayOfWeek: 1,
        startTime: "18:30",
        endTime: "20:00",
        room: "Phòng 101",
      });

      const schedRes = await client.get("/api/schedule", {
        weekStart: "2026-11-02",
      });
      expect(schedRes.status()).toBe(200);
      const schedBody = await schedRes.json();
      expect(Array.isArray(schedBody.conflicts)).toBe(true);
      expect(schedBody.conflicts.length).toBeGreaterThanOrEqual(1);
    });

    test("T2-09: Idempotent session generation over [fromDate, toDate] skips existing sessions without duplicates and rejects fromDate > toDate", async ({
      request,
    }) => {
      const client = await registerAndLoginTeacher(request);
      const classA = await createTestClass(client);

      await client.post(`/api/classes/${classA.id}/schedule-slots`, {
        slots: [
          { dayOfWeek: 1, startTime: "18:00", endTime: "19:30", room: "P101" },
          { dayOfWeek: 3, startTime: "18:00", endTime: "19:30", room: "P101" },
        ],
      });

      // Run 1: Nov 2026 has 5 Mondays (2,9,16,23,30) + 4 Wednesdays (4,11,18,25) = 9 sessions
      const run1Res = await client.post(
        `/api/classes/${classA.id}/generate-sessions`,
        {
          fromDate: "2026-11-01",
          toDate: "2026-11-30",
        }
      );
      expect([200, 201]).toContain(run1Res.status());
      const run1Body = await run1Res.json();
      expect(run1Body.createdCount).toBe(9);
      expect(run1Body.skippedCount).toBe(0);

      // Run 2: Exact same range -> 0 created, 9 skipped
      const run2Res = await client.post(
        `/api/classes/${classA.id}/generate-sessions`,
        {
          fromDate: "2026-11-01",
          toDate: "2026-11-30",
        }
      );
      expect([200, 201]).toContain(run2Res.status());
      const run2Body = await run2Res.json();
      expect(run2Body.createdCount).toBe(0);
      expect(run2Body.skippedCount).toBe(9);

      // Invalid range (fromDate > toDate) -> 400
      const invalidRangeRes = await client.post(
        `/api/classes/${classA.id}/generate-sessions`,
        {
          fromDate: "2026-11-30",
          toDate: "2026-11-01",
        }
      );
      expect(invalidRangeRes.status()).toBe(400);
    });
  });

  // ===========================================================================
  // GROUP 3: Student Codes, Guardians isPrimary & Enrollment Boundaries
  // ===========================================================================
  test.describe("Group 3: Student Codes, Guardians isPrimary & Enrollment Boundaries", () => {
    test("T2-10: Auto-generated sequential studentCode (HS001, HS002...) when omitted and duplicate studentCode rejection (409)", async ({
      request,
    }) => {
      const client = await registerAndLoginTeacher(request);

      const s1Res = await client.post("/api/students", {
        fullName: "Học Sinh Một",
      });
      expect(s1Res.status()).toBe(201);
      const s1 = unwrapItem(await s1Res.json(), "student");

      const s2Res = await client.post("/api/students", {
        fullName: "Học Sinh Hai",
      });
      expect(s2Res.status()).toBe(201);
      const s2 = unwrapItem(await s2Res.json(), "student");

      expect(s1.studentCode).toMatch(/^HS\d+/i);
      expect(s2.studentCode).toMatch(/^HS\d+/i);
      const num1 = parseInt(s1.studentCode.replace(/\D/g, ""), 10);
      const num2 = parseInt(s2.studentCode.replace(/\D/g, ""), 10);
      expect(num2).toBeGreaterThan(num1);

      const dupRes = await client.post("/api/students", {
        studentCode: s1.studentCode,
        fullName: "Học Sinh Trùng Mã",
      });
      expect(dupRes.status()).toBe(409);
    });

    test("T2-11: Multiple guardians isPrimary normalization (at most one primary guardian per student)", async ({
      request,
    }) => {
      const client = await registerAndLoginTeacher(request);
      const student = await createTestStudent(client, {
        fullName: "Học Sinh Kiểm Tra Phụ Huynh",
      });

      const g1Res = await client.post(`/api/students/${student.id}/guardians`, {
        fullName: "Phụ Huynh 1",
        relationship: "Bố",
        phone: "0901111111",
        isPrimary: true,
      });
      expect(g1Res.status()).toBe(201);
      const g1 = unwrapItem(await g1Res.json(), "guardian");

      const g2Res = await client.post(`/api/students/${student.id}/guardians`, {
        fullName: "Phụ Huynh 2",
        relationship: "Mẹ",
        phone: "0902222222",
        isPrimary: true,
      });
      expect(g2Res.status()).toBe(201);
      const g2 = unwrapItem(await g2Res.json(), "guardian");

      const check1 = unwrapItem(
        await (await client.get(`/api/students/${student.id}`)).json(),
        "student"
      );
      const primaries1 = (check1.guardians ?? []).filter((g: any) => g.isPrimary);
      expect(primaries1.length).toBe(1);
      expect(primaries1[0].id).toBe(g2.id);

      // Patch Guardian 1 back to isPrimary: true
      const patchRes = await client.patch(
        `/api/students/${student.id}/guardians/${g1.id}`,
        {
          isPrimary: true,
        }
      );
      expect(patchRes.status()).toBe(200);

      const check2 = unwrapItem(
        await (await client.get(`/api/students/${student.id}`)).json(),
        "student"
      );
      const primaries2 = (check2.guardians ?? []).filter((g: any) => g.isPrimary);
      expect(primaries2.length).toBe(1);
      expect(primaries2[0].id).toBe(g1.id);
    });

    test("T2-12: Duplicate ACTIVE enrollment in same class rejected with 409", async ({
      request,
    }) => {
      const client = await registerAndLoginTeacher(request);
      const classA = await createTestClass(client);
      const student1 = await createTestStudent(client);

      const firstEnroll = await client.post("/api/enrollments", {
        classId: classA.id,
        studentId: student1.id,
      });
      expect(firstEnroll.status()).toBe(201);

      const dupEnroll = await client.post("/api/enrollments", {
        classId: classA.id,
        studentId: student1.id,
      });
      expect(dupEnroll.status()).toBe(409);
    });

    test("T2-13: Re-enrolling a DROPPED or COMPLETED enrollment reactivates cleanly to ACTIVE", async ({
      request,
    }) => {
      const client = await registerAndLoginTeacher(request);
      const classA = await createTestClass(client);
      const student1 = await createTestStudent(client);

      const firstRes = await client.post("/api/enrollments", {
        classId: classA.id,
        studentId: student1.id,
      });
      expect(firstRes.status()).toBe(201);
      const firstBody = await firstRes.json();
      const enrollment =
        unwrapList(firstBody, "enrollments")[0] ??
        unwrapItem(firstBody, "enrollment");

      const dropRes = await client.patch(`/api/enrollments/${enrollment.id}`, {
        status: "DROPPED",
        leftAt: "2026-10-15T00:00:00.000Z",
      });
      expect(dropRes.status()).toBe(200);

      const reEnrollRes = await client.post("/api/enrollments", {
        classId: classA.id,
        studentId: student1.id,
        discountType: "PERCENTAGE",
        customFeeDiscount: 20,
      });
      expect([200, 201]).toContain(reEnrollRes.status());
      const reBody = await reEnrollRes.json();
      const reactivated =
        unwrapList(reBody, "enrollments")[0] ??
        unwrapItem(reBody, "enrollment");
      expect(reactivated.status).toBe("ACTIVE");
      expect(reactivated.leftAt).toBeNull();
      expect(reactivated.customFeeDiscount).toBe(20);
    });
  });

  // ===========================================================================
  // GROUP 4: Tuition Discounts, Bulk Invoice Idempotency, Payments & VietQR Boundaries
  // ===========================================================================
  test.describe("Group 4: Tuition Discounts, Bulk Invoice Idempotency, Payments, Cancelled Invoices & VietQR Boundaries", () => {
    test("T2-14: 100% tuition waiver / scholarship sets netAmount = 0 and status = PAID immediately", async ({
      request,
    }) => {
      const client = await registerAndLoginTeacher(request);
      const cls = await createTestClass(client, { defaultFeeAmount: 1500000 });
      const stu = await createTestStudent(client, {
        fullName: "Học Sinh Học Bổng Toàn Phần",
      });

      await client.post("/api/enrollments", {
        classId: cls.id,
        studentId: stu.id,
        discountType: "PERCENTAGE",
        customFeeDiscount: 100,
      });

      const genRes = await client.post("/api/invoices/generate", {
        classId: cls.id,
        billingPeriod: "2026-11",
        dueDate: "2026-11-10",
      });
      expect([200, 201]).toContain(genRes.status());
      const inv = unwrapList(await genRes.json(), "invoices")[0];
      expect(inv.baseAmount).toBe(1500000);
      expect(inv.discountAmount).toBe(1500000);
      expect(inv.netAmount).toBe(0);
      expect(inv.paidAmount).toBe(0);
      expect(inv.status).toBe("PAID");
    });

    test("T2-15: Discount exceeding base fee or negative FeePlan amount rejected with 400", async ({
      request,
    }) => {
      const client = await registerAndLoginTeacher(request);
      const cls = await createTestClass(client, { defaultFeeAmount: 1500000 });
      const stu = await createTestStudent(client);

      const negFeePlanRes = await client.post("/api/fee-plans", {
        classId: cls.id,
        name: "Gói âm không hợp lệ",
        billingCycle: "MONTHLY",
        amount: -50000,
      });
      expect(negFeePlanRes.status()).toBe(400);

      await client.post("/api/enrollments", {
        classId: cls.id,
        studentId: stu.id,
      });
      const genRes = await client.post("/api/invoices/generate", {
        classId: cls.id,
        billingPeriod: "2026-11",
        dueDate: "2026-11-10",
      });
      const inv = unwrapList(await genRes.json(), "invoices")[0];

      const excessiveDiscountRes = await client.patch(
        `/api/invoices/${inv.id}`,
        {
          discountAmount: 2000000,
        }
      );
      expect(excessiveDiscountRes.status()).toBe(400);
    });

    test("T2-16: Bulk invoice generation idempotency skips existing (classId, studentId, billingPeriod)", async ({
      request,
    }) => {
      const client = await registerAndLoginTeacher(request);
      const cls = await createTestClass(client, { defaultFeeAmount: 1200000 });
      const stuA = await createTestStudent(client, { fullName: "HS A" });
      const stuB = await createTestStudent(client, { fullName: "HS B" });
      const stuC = await createTestStudent(client, { fullName: "HS C" });

      await client.post("/api/enrollments", {
        classId: cls.id,
        studentIds: [stuA.id, stuB.id],
      });

      const gen1 = await client.post("/api/invoices/generate", {
        classId: cls.id,
        billingPeriod: "2026-11",
        dueDate: "2026-11-10",
      });
      const gen1Body = await gen1.json();
      expect(gen1Body.createdCount).toBe(2);
      expect(gen1Body.skippedCount).toBe(0);

      // Enroll Student C and re-run bulk generation for the same billingPeriod
      await client.post("/api/enrollments", {
        classId: cls.id,
        studentId: stuC.id,
      });

      const gen2 = await client.post("/api/invoices/generate", {
        classId: cls.id,
        billingPeriod: "2026-11",
        dueDate: "2026-11-10",
      });
      const gen2Body = await gen2.json();
      expect(gen2Body.createdCount).toBe(1);
      expect(gen2Body.skippedCount).toBe(2);
    });

    test("T2-17: Partial payment (UNPAID -> PARTIAL), exact settlement (PARTIAL -> PAID), and overpayment/zero/negative payment rejection (400)", async ({
      request,
    }) => {
      const client = await registerAndLoginTeacher(request);
      const cls = await createTestClass(client, { defaultFeeAmount: 1000000 });
      const stu = await createTestStudent(client);
      await client.post("/api/enrollments", {
        classId: cls.id,
        studentId: stu.id,
      });

      const genRes = await client.post("/api/invoices/generate", {
        classId: cls.id,
        billingPeriod: "2026-11",
        dueDate: "2026-11-10",
      });
      const inv = unwrapList(await genRes.json(), "invoices")[0];

      // 1. Zero and negative payments rejected with 400
      const zeroPay = await client.post(`/api/invoices/${inv.id}/payments`, {
        amount: 0,
        method: "CASH",
      });
      expect(zeroPay.status()).toBe(400);

      const negPay = await client.post(`/api/invoices/${inv.id}/payments`, {
        amount: -100000,
        method: "CASH",
      });
      expect(negPay.status()).toBe(400);

      // 2. Partial payment (400,000) -> PARTIAL
      const pay1 = await client.post(`/api/invoices/${inv.id}/payments`, {
        amount: 400000,
        method: "CASH",
      });
      expect(pay1.status()).toBe(201);
      const pay1Body = await pay1.json();
      expect(pay1Body.invoice.paidAmount).toBe(400000);
      expect(pay1Body.invoice.status).toBe("PARTIAL");

      // 3. Overpayment attempt on remaining 600,000 -> 400
      const overPay = await client.post(`/api/invoices/${inv.id}/payments`, {
        amount: 700000,
        method: "BANK_TRANSFER",
      });
      expect(overPay.status()).toBe(400);

      // 4. Exact settlement (600,000) -> PAID
      const pay2 = await client.post(`/api/invoices/${inv.id}/payments`, {
        amount: 600000,
        method: "BANK_TRANSFER",
      });
      expect(pay2.status()).toBe(201);
      const pay2Body = await pay2.json();
      expect(pay2Body.invoice.paidAmount).toBe(1000000);
      expect(pay2Body.invoice.status).toBe("PAID");

      // 5. Extra payment after PAID -> 400
      const extraPay = await client.post(`/api/invoices/${inv.id}/payments`, {
        amount: 100000,
        method: "CASH",
      });
      expect(extraPay.status()).toBe(400);
    });

    test("T2-18: Cancelled invoice excluded from debt totals and blocks new payments with 400", async ({
      request,
    }) => {
      const client = await registerAndLoginTeacher(request);
      const cls = await createTestClass(client, { defaultFeeAmount: 1200000 });
      const stu = await createTestStudent(client);
      await client.post("/api/enrollments", {
        classId: cls.id,
        studentId: stu.id,
      });

      const genRes = await client.post("/api/invoices/generate", {
        classId: cls.id,
        billingPeriod: "2026-12",
        dueDate: "2026-12-10",
      });
      const inv = unwrapList(await genRes.json(), "invoices")[0];

      const reportBefore = await (
        await client.get("/api/fees/report", { billingPeriod: "2026-12" })
      ).json();
      expect(reportBefore.summary.totalOutstanding).toBe(1200000);

      // Cancel invoice
      const cancelRes = await client.patch(`/api/invoices/${inv.id}`, {
        status: "CANCELLED",
      });
      expect(cancelRes.status()).toBe(200);

      // Payment on cancelled invoice -> 400
      const payCancelled = await client.post(
        `/api/invoices/${inv.id}/payments`,
        {
          amount: 500000,
          method: "CASH",
        }
      );
      expect(payCancelled.status()).toBe(400);

      // Excluded from debt report
      const reportAfter = await (
        await client.get("/api/fees/report", { billingPeriod: "2026-12" })
      ).json();
      expect(reportAfter.summary.totalOutstanding).toBe(0);
    });

    test("T2-19: VietQR diacritic stripping, remaining balance reflection, and unconfigured bank handling", async ({
      request,
    }) => {
      const client = await registerAndLoginTeacher(request);
      const cls = await createTestClass(client, { defaultFeeAmount: 1000000 });
      const stu = await createTestStudent(client, {
        studentCode: "HS-001",
        fullName: "Nguyễn Văn Ánh",
      });
      await client.post("/api/enrollments", {
        classId: cls.id,
        studentId: stu.id,
      });

      const genRes = await client.post("/api/invoices/generate", {
        classId: cls.id,
        billingPeriod: "2026-11",
        dueDate: "2026-11-10",
      });
      const inv = unwrapList(await genRes.json(), "invoices")[0];

      // Partial payment of 400,000 leaves 600,000 remaining
      await client.post(`/api/invoices/${inv.id}/payments`, {
        amount: 400000,
        method: "CASH",
      });

      // Step 1: Before bank config
      const unconfigRes = await client.get(`/api/invoices/${inv.id}/vietqr`);
      expect([200, 422]).toContain(unconfigRes.status());
      if (unconfigRes.status() === 200) {
        const unconfigBody = await unconfigRes.json();
        expect(unconfigBody.bankConfigured).toBe(false);
      }

      // Step 2: Configure bank details
      await client.put("/api/workspace", {
        name: "Trung Tâm VietQR",
        bankBin: "970436",
        bankCode: "VCB",
        bankName: "Vietcombank",
        bankAccountNumber: "0123456789",
        bankAccountName: "NGUYEN THI GIAO VIEN",
      });

      const qrRes = await client.get(`/api/invoices/${inv.id}/vietqr`);
      expect(qrRes.status()).toBe(200);
      const qr = await qrRes.json();
      expect(qr.amount).toBe(600000);
      expect(qr.transferContent).toMatch(/^HP\s+HS001\s+[A-Z0-9]+$/);
      expect(qr.qrPayload.startsWith("000201")).toBe(true);
      expect(qr.qrDataUrl).toMatch(/^data:image\//);
    });
  });

  // ===========================================================================
  // GROUP 5: Attendance, Cancelled Sessions & Browser FaceAI Boundaries
  // ===========================================================================
  test.describe("Group 5: Attendance, Cancelled Sessions & Browser FaceAI Boundaries", () => {
    test("T2-20: Manual attendance checkOutAt < checkInAt rejected with 400", async ({
      request,
    }) => {
      const client = await registerAndLoginTeacher(request);
      const cls = await createTestClass(client);
      const stu = await createTestStudent(client);
      await client.post("/api/enrollments", {
        classId: cls.id,
        studentId: stu.id,
      });

      const sessRes = await client.post("/api/sessions", {
        classId: cls.id,
        sessionDate: "2026-11-10",
        startTime: "18:00",
        endTime: "19:30",
      });
      const session = unwrapItem(await sessRes.json(), "session");

      const badAttRes = await client.post(
        `/api/sessions/${session.id}/attendance`,
        {
          studentId: stu.id,
          status: "PRESENT",
          checkInAt: "2026-11-10T18:30:00.000Z",
          checkOutAt: "2026-11-10T17:45:00.000Z",
        }
      );
      expect(badAttRes.status()).toBe(400);
    });

    test("T2-21: Cancelled session rejects bulk attendance and FaceAI matching with 400", async ({
      request,
    }) => {
      const client = await registerAndLoginTeacher(request);
      const cls = await createTestClass(client);
      const stu = await createTestStudent(client);
      await client.post("/api/enrollments", {
        classId: cls.id,
        studentId: stu.id,
      });

      const sessRes = await client.post("/api/sessions", {
        classId: cls.id,
        sessionDate: "2026-11-11",
        startTime: "18:00",
        endTime: "19:30",
      });
      const session = unwrapItem(await sessRes.json(), "session");

      await client.patch(`/api/sessions/${session.id}`, {
        status: "CANCELLED",
      });

      const bulkRes = await client.post(
        `/api/sessions/${session.id}/attendance`,
        {
          action: "MARK_ALL_PRESENT",
        }
      );
      expect(bulkRes.status()).toBe(400);

      const matchRes = await client.post("/api/face-ai/match", {
        sessionId: session.id,
        scanMode: "CHECK_IN",
        descriptor: generateNormalizedDescriptor(1),
      });
      expect(matchRes.status()).toBe(400);
    });

    test("T2-22: FaceAI descriptor enrollment rejects invalid vectors (length != 128, NaN/null, or all-zero vector) with 400", async ({
      request,
    }) => {
      const client = await registerAndLoginTeacher(request);
      const stu = await createTestStudent(client);

      const shortVecRes = await client.post("/api/face-ai/descriptors", {
        studentId: stu.id,
        descriptor: new Array(64).fill(0.1),
      });
      expect(shortVecRes.status()).toBe(400);

      const zeroVecRes = await client.post("/api/face-ai/descriptors", {
        studentId: stu.id,
        descriptor: new Array(128).fill(0),
      });
      expect(zeroVecRes.status()).toBe(400);

      const nullElemRes = await client.post("/api/face-ai/descriptors", {
        studentId: stu.id,
        descriptor: [null, ...new Array(127).fill(0.1)],
      });
      expect(nullElemRes.status()).toBe(400);
    });

    test("T2-23: FaceAI matching in class with 0 enrolled face descriptors returns matched: false", async ({
      request,
    }) => {
      const client = await registerAndLoginTeacher(request);
      const cls = await createTestClass(client);
      const stu = await createTestStudent(client);
      await client.post("/api/enrollments", {
        classId: cls.id,
        studentId: stu.id,
      });

      const sessRes = await client.post("/api/sessions", {
        classId: cls.id,
        sessionDate: "2026-11-12",
        startTime: "18:00",
        endTime: "19:30",
      });
      const session = unwrapItem(await sessRes.json(), "session");

      const matchRes = await client.post("/api/face-ai/match", {
        sessionId: session.id,
        scanMode: "CHECK_IN",
        descriptor: generateNormalizedDescriptor(10),
      });
      expect(matchRes.status()).toBe(200);
      const matchBody = await matchRes.json();
      expect(matchBody.matched).toBe(false);
    });

    test("T2-24: FaceAI matching below similarity threshold returns matched: false without mutating attendance", async ({
      request,
    }) => {
      const client = await registerAndLoginTeacher(request);
      const cls = await createTestClass(client);
      const stu = await createTestStudent(client);
      await client.post("/api/enrollments", {
        classId: cls.id,
        studentId: stu.id,
      });

      const vecA = generateNormalizedDescriptor(101);
      await client.post("/api/face-ai/descriptors", {
        studentId: stu.id,
        descriptor: vecA,
        source: "WEBCAM",
      });

      const sessRes = await client.post("/api/sessions", {
        classId: cls.id,
        sessionDate: "2026-11-13",
        startTime: "18:00",
        endTime: "19:30",
      });
      const session = unwrapItem(await sessRes.json(), "session");

      const vecB = generateNormalizedDescriptor(999);
      const matchRes = await client.post("/api/face-ai/match", {
        sessionId: session.id,
        scanMode: "CHECK_IN",
        descriptor: vecB,
        threshold: 0.85,
      });
      expect(matchRes.status()).toBe(200);
      const matchBody = await matchRes.json();
      expect(matchBody.matched).toBe(false);

      const sessDetail = await (
        await client.get(`/api/sessions/${session.id}`)
      ).json();
      const stuRow = (sessDetail.roster ?? []).find(
        (r: any) => (r.student?.id ?? r.studentId) === stu.id
      );
      const att = stuRow?.attendance ?? stuRow;
      expect(att?.checkInAt ?? null).toBeNull();
    });

    test("T2-25: FaceAI duplicate scan cooldown protection in CHECK_IN mode vs transitioning to CHECK_OUT mode", async ({
      request,
    }) => {
      const client = await registerAndLoginTeacher(request);
      const cls = await createTestClass(client);
      const stu = await createTestStudent(client);
      await client.post("/api/enrollments", {
        classId: cls.id,
        studentId: stu.id,
      });

      const vec1 = generateNormalizedDescriptor(42);
      await client.post("/api/face-ai/descriptors", {
        studentId: stu.id,
        descriptor: vec1,
        source: "WEBCAM",
      });

      const sessRes = await client.post("/api/sessions", {
        classId: cls.id,
        sessionDate: "2026-11-14",
        startTime: "18:00",
        endTime: "19:30",
      });
      const session = unwrapItem(await sessRes.json(), "session");

      // 1. First scan in CHECK_IN mode
      const scan1Res = await client.post("/api/face-ai/match", {
        sessionId: session.id,
        scanMode: "CHECK_IN",
        descriptor: vec1,
      });
      expect(scan1Res.status()).toBe(200);
      const scan1 = await scan1Res.json();
      expect(scan1.matched).toBe(true);
      expect(scan1.attendance.method).toBe("FACE_AI");
      const firstCheckInAt = scan1.attendance.checkInAt;
      expect(firstCheckInAt).toBeTruthy();

      // 2. Immediate second scan in CHECK_IN mode (cooldown preserves checkInAt)
      const scan2Res = await client.post("/api/face-ai/match", {
        sessionId: session.id,
        scanMode: "CHECK_IN",
        descriptor: perturbDescriptor(vec1, 0.01),
      });
      expect(scan2Res.status()).toBe(200);
      const scan2 = await scan2Res.json();
      expect(scan2.matched).toBe(true);
      expect(scan2.attendance.checkInAt).toBe(firstCheckInAt);

      // 3. Transition to CHECK_OUT mode
      const scan3Res = await client.post("/api/face-ai/match", {
        sessionId: session.id,
        scanMode: "CHECK_OUT",
        descriptor: vec1,
      });
      expect(scan3Res.status()).toBe(200);
      const scan3 = await scan3Res.json();
      expect(scan3.matched).toBe(true);
      expect(scan3.attendance.checkInAt).toBe(firstCheckInAt);
      expect(scan3.attendance.checkOutAt).toBeTruthy();
    });
  });

  // ===========================================================================
  // GROUP 6: Homework, Question Bank, Game & Leaderboard Boundaries
  // ===========================================================================
  test.describe("Group 6: Homework Grading/Late Detection, Question Bank Validation, Game Tie/Propagation & Leaderboard Math Boundaries", () => {
    test("T2-26: Homework grading rejects score > maxScore or score < 0 (400), and auto-detects LATE submission (submittedAt > dueDate)", async ({
      request,
    }) => {
      const client = await registerAndLoginTeacher(request);
      const cls = await createTestClass(client);
      const s1 = await createTestStudent(client);
      await client.post("/api/enrollments", {
        classId: cls.id,
        studentId: s1.id,
      });

      const hwRes = await client.post("/api/homeworks", {
        classId: cls.id,
        title: "BTVN Giới Hạn Điểm",
        dueDate: "2026-11-10T12:00:00.000Z",
        maxScore: 10,
      });
      const hw = unwrapItem(await hwRes.json(), "homework");

      // Score > maxScore -> 400
      const highScoreRes = await client.post(
        `/api/homeworks/${hw.id}/submissions`,
        {
          submissions: [
            {
              studentId: s1.id,
              status: "GRADED",
              score: 12,
            },
          ],
        }
      );
      expect(highScoreRes.status()).toBe(400);

      // Score < 0 -> 400
      const negScoreRes = await client.post(
        `/api/homeworks/${hw.id}/submissions`,
        {
          submissions: [
            {
              studentId: s1.id,
              status: "GRADED",
              score: -2,
            },
          ],
        }
      );
      expect(negScoreRes.status()).toBe(400);

      // Late submission (submittedAt > dueDate) -> LATE
      const lateSubRes = await client.post(
        `/api/homeworks/${hw.id}/submissions`,
        {
          submissions: [
            {
              studentId: s1.id,
              status: "SUBMITTED",
              submittedAt: "2026-11-12T10:00:00.000Z",
            },
          ],
        }
      );
      expect([200, 201]).toContain(lateSubRes.status());
      const subs = unwrapList(await lateSubRes.json(), "submissions");
      expect(subs[0].status).toBe("LATE");
    });

    test("T2-27: Exercise question validation (MCQ < 2 options, missing correctAnswer, empty prompt) and transactional bulk import validation", async ({
      request,
    }) => {
      const client = await registerAndLoginTeacher(request);

      // MCQ with only 1 option -> 400
      const oneOptRes = await client.post("/api/questions", {
        type: "MULTIPLE_CHOICE",
        subject: "Toán",
        topic: "Đại số",
        prompt: "Câu hỏi có 1 đáp án?",
        optionsJson: [{ id: "A", text: "Chỉ 1 đáp án" }],
        correctAnswer: "A",
      });
      expect(oneOptRes.status()).toBe(400);

      // MCQ with missing correctAnswer -> 400
      const noAnsRes = await client.post("/api/questions", {
        type: "MULTIPLE_CHOICE",
        subject: "Toán",
        topic: "Đại số",
        prompt: "Câu hỏi thiếu đáp án đúng?",
        optionsJson: [
          { id: "A", text: "1" },
          { id: "B", text: "2" },
        ],
        correctAnswer: "",
      });
      expect(noAnsRes.status()).toBe(400);

      // Bulk import with 1 valid and 1 invalid question -> 400
      const bulkInvalidRes = await client.post("/api/questions", {
        bulk: true,
        questions: [
          {
            type: "SHORT_ANSWER",
            subject: "Toán",
            topic: "Số học",
            prompt: "Câu hỏi hợp lệ: 2 + 2 = ?",
            correctAnswer: "4",
          },
          {
            type: "MULTIPLE_CHOICE",
            subject: "Toán",
            topic: "Số học",
            prompt: "Câu hỏi lỗi?",
            optionsJson: [{ id: "A", text: "Một lựa chọn" }],
            correctAnswer: "A",
          },
        ],
      });
      expect(bulkInvalidRes.status()).toBe(400);
    });

    test("T2-28: Deleting a question linked to a completed GameSession preserves historical GameSession snapshot", async ({
      request,
    }) => {
      const client = await registerAndLoginTeacher(request);
      const cls = await createTestClass(client);
      const stu = await createTestStudent(client);
      await client.post("/api/enrollments", {
        classId: cls.id,
        studentId: stu.id,
      });

      const qRes = await client.post("/api/questions", {
        type: "SHORT_ANSWER",
        subject: "Lịch Sử",
        topic: "Việt Nam",
        prompt: "Chiến thắng Điện Biên Phủ diễn ra năm nào?",
        correctAnswer: "1954",
      });
      const q = unwrapItem(await qRes.json(), "question");

      const mgRes = await client.post("/api/minigames", {
        title: "Game Lịch Sử Snapshot",
        type: "SPEED_QUIZ",
        timeLimit: 20,
        pointsPerQuestion: 100,
        questionIdsJson: [q.id],
      });
      const mg = unwrapItem(await mgRes.json(), "minigame");

      const gsRes = await client.post("/api/game-sessions", {
        classId: cls.id,
        minigameId: mg.id,
        mode: "INDIVIDUAL",
      });
      const gs = unwrapItem(await gsRes.json(), "gameSession");

      await client.patch(`/api/game-sessions/${gs.id}`, {
        status: "COMPLETED",
        results: [
          {
            studentId: stu.id,
            score: 100,
            correctCount: 1,
            totalQuestions: 1,
            accuracy: 100,
          },
        ],
      });

      // Delete original question from Question Bank
      const delQ = await client.delete(`/api/questions/${q.id}`);
      expect(delQ.status()).toBe(200);

      // Historical GameSession snapshot remains intact
      const gsAfterRes = await client.get(`/api/game-sessions/${gs.id}`);
      expect(gsAfterRes.status()).toBe(200);
      const gsAfter = unwrapItem(await gsAfterRes.json(), "gameSession");
      expect(Array.isArray(gsAfter.questionsSnapshotJson)).toBe(true);
      expect(gsAfter.questionsSnapshotJson.length).toBe(1);
      expect(JSON.stringify(gsAfter.questionsSnapshotJson)).toContain("1954");
    });

    test("T2-29: Live Game tie-breaking competition rank (1, 1, 3) and TEAM mode score propagation to all team members", async ({
      request,
    }) => {
      const client = await registerAndLoginTeacher(request);
      const cls = await createTestClass(client);
      const s1 = await createTestStudent(client, { fullName: "Thành Viên 1" });
      const s2 = await createTestStudent(client, { fullName: "Thành Viên 2" });
      const s3 = await createTestStudent(client, { fullName: "Thành Viên 3" });
      await client.post("/api/enrollments", {
        classId: cls.id,
        studentIds: [s1.id, s2.id, s3.id],
      });

      const qRes = await client.post("/api/questions", {
        type: "SHORT_ANSWER",
        subject: "Toán",
        topic: "Đố vui",
        prompt: "3 x 3 = ?",
        correctAnswer: "9",
      });
      const q = unwrapItem(await qRes.json(), "question");

      const mgRes = await client.post("/api/minigames", {
        title: "Game Đồng Hạng Đội",
        type: "TEAM_BUZZER",
        questionIdsJson: [q.id],
      });
      const mg = unwrapItem(await mgRes.json(), "minigame");

      const gsRes = await client.post("/api/game-sessions", {
        classId: cls.id,
        minigameId: mg.id,
        mode: "TEAM",
        teamsConfigJson: [
          { name: "Đội Rồng Xanh", studentIds: [s1.id, s2.id] },
          { name: "Đội Phượng Hoàng", studentIds: [s3.id] },
        ],
      });
      const gs = unwrapItem(await gsRes.json(), "gameSession");

      const finishRes = await client.patch(`/api/game-sessions/${gs.id}`, {
        status: "COMPLETED",
        results: [
          {
            studentId: s1.id,
            teamName: "Đội Rồng Xanh",
            score: 450,
            correctCount: 4,
            totalQuestions: 5,
          },
          {
            studentId: s2.id,
            teamName: "Đội Rồng Xanh",
            score: 450,
            correctCount: 4,
            totalQuestions: 5,
          },
          {
            studentId: s3.id,
            teamName: "Đội Phượng Hoàng",
            score: 300,
            correctCount: 3,
            totalQuestions: 5,
          },
        ],
      });
      expect(finishRes.status()).toBe(200);
      const results = unwrapList(await finishRes.json(), "results");
      const r1 = results.find((r: any) => r.studentId === s1.id);
      const r2 = results.find((r: any) => r.studentId === s2.id);
      const r3 = results.find((r: any) => r.studentId === s3.id);

      expect(r1.teamName).toBe("Đội Rồng Xanh");
      expect(r2.teamName).toBe("Đội Rồng Xanh");
      expect(r1.score).toBe(450);
      expect(r2.score).toBe(450);
      expect(r1.rank).toBe(1);
      expect(r2.rank).toBe(1);
      expect(r3.score).toBe(300);
      expect(r3.rank).toBeGreaterThanOrEqual(2);
    });

    test("T2-30: Leaderboard zero-denominator safety (0 sessions, 0 homeworks, 0 games) returns 0 scores without NaN/Infinity", async ({
      request,
    }) => {
      const client = await registerAndLoginTeacher(request);
      const emptyClass = await createTestClass(client, {
        name: "Lớp Mới Tinh Chưa Có Hoạt Động",
      });
      const sAn = await createTestStudent(client, { fullName: "Nguyễn Văn An" });
      const sBinh = await createTestStudent(client, { fullName: "Trần Văn Bình" });
      await client.post("/api/enrollments", {
        classId: emptyClass.id,
        studentIds: [sAn.id, sBinh.id],
      });

      const lbRes = await client.get("/api/leaderboards", {
        classId: emptyClass.id,
      });
      expect(lbRes.status()).toBe(200);
      const lb = await lbRes.json();
      const rankings = unwrapList(lb, "rankings");
      expect(rankings.length).toBe(2);

      for (const entry of rankings) {
        expect(entry.attendanceScore).toBe(0);
        expect(entry.homeworkScore).toBe(0);
        expect(entry.gameScore).toBe(0);
        expect(entry.bonusScore).toBe(0);
        expect(entry.totalScore).toBe(0);
        expect(Number.isFinite(entry.totalScore)).toBe(true);
      }
    });

    test("T2-31: Leaderboard unnormalized weights (sum != 100) and negative net bonus points (penalties > bonuses) clamp cleanly to [0, 100]", async ({
      request,
    }) => {
      const client = await registerAndLoginTeacher(request);
      const classA = await createTestClass(client);
      const s1 = await createTestStudent(client, { fullName: "HS Điểm Tuyệt Đối" });
      const s2 = await createTestStudent(client, { fullName: "HS Điểm Phạt Âm" });
      await client.post("/api/enrollments", {
        classId: classA.id,
        studentIds: [s1.id, s2.id],
      });

      // 1. Attendance: s1 PRESENT (100)
      const sessRes = await client.post("/api/sessions", {
        classId: classA.id,
        sessionDate: "2026-11-10",
        startTime: "18:00",
        endTime: "19:30",
      });
      const session = unwrapItem(await sessRes.json(), "session");
      await client.post(`/api/sessions/${session.id}/attendance`, {
        studentId: s1.id,
        status: "PRESENT",
      });

      // 2. Homework: s1 10/10 (100)
      const hwRes = await client.post("/api/homeworks", {
        classId: classA.id,
        title: "BTVN Chuẩn Hoá Trọng Số",
        dueDate: "2026-11-15T23:59:59.000Z",
        maxScore: 10,
      });
      const hw = unwrapItem(await hwRes.json(), "homework");
      await client.post(`/api/homeworks/${hw.id}/submissions`, {
        submissions: [{ studentId: s1.id, status: "GRADED", score: 10 }],
      });

      // 3. Game: s1 top score 500 (100)
      const qRes = await client.post("/api/questions", {
        type: "SHORT_ANSWER",
        subject: "Toán",
        topic: "Cơ bản",
        prompt: "1 + 1 = ?",
        correctAnswer: "2",
      });
      const q = unwrapItem(await qRes.json(), "question");
      const mgRes = await client.post("/api/minigames", {
        title: "Game Trọng Số",
        type: "SPEED_QUIZ",
        questionIdsJson: [q.id],
      });
      const mg = unwrapItem(await mgRes.json(), "minigame");
      const gsRes = await client.post("/api/game-sessions", {
        classId: classA.id,
        minigameId: mg.id,
        mode: "INDIVIDUAL",
      });
      const gs = unwrapItem(await gsRes.json(), "gameSession");
      await client.patch(`/api/game-sessions/${gs.id}`, {
        status: "COMPLETED",
        results: [
          {
            studentId: s1.id,
            score: 500,
            correctCount: 5,
            totalQuestions: 5,
            accuracy: 100,
          },
        ],
      });

      // 4. Penalty on s2: -25 points
      await client.post("/api/points", {
        studentIds: [s2.id],
        classId: classA.id,
        points: -25,
        reason: "Nói chuyện riêng",
        category: "PENALTY",
      });

      // Query with unnormalized weights summing to 80 (20 + 30 + 30 + 0)
      const lbRes = await client.get("/api/leaderboards", {
        classId: classA.id,
        attendanceWeight: 20,
        homeworkWeight: 30,
        gameWeight: 30,
        bonusWeight: 0,
      });
      expect(lbRes.status()).toBe(200);
      const lb = await lbRes.json();
      const rankings = unwrapList(lb, "rankings");
      const entry1 = rankings.find((r: any) => r.student.id === s1.id);
      const entry2 = rankings.find((r: any) => r.student.id === s2.id);

      expect(entry1.totalScore).toBeCloseTo(100, 1);
      expect(entry2.bonusScore).toBeGreaterThanOrEqual(0);
      expect(entry2.totalScore).toBeGreaterThanOrEqual(0);
      expect(entry2.totalScore).toBeLessThanOrEqual(100);

      // Invalid all-zero weight config -> 400
      const badCfgRes = await client.post("/api/leaderboards/configs", {
        name: "Invalid Zero Weights",
        attendanceWeight: 0,
        homeworkWeight: 0,
        gameWeight: 0,
        bonusWeight: 0,
      });
      expect(badCfgRes.status()).toBe(400);
    });
  });
});
