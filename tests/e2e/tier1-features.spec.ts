import { test, expect } from "@playwright/test";
import {
  BASE_URL,
  authenticatePageForTeacher,
  createTestClass,
  createTestStudent,
  generateNormalizedDescriptor,
  perturbDescriptor,
  registerAndLoginTeacher,
  uniqueSuffix,
  unwrapItem,
  unwrapList,
} from "./helpers";

test.describe("Tier 1 — Feature Coverage Suite (F01–F37 across Modules 1–9)", () => {
  // ===========================================================================
  // GROUP 1: Auth, Workspace Settings, Multi-Tenancy & Dashboard (F01–F08)
  // ===========================================================================
  test.describe("Group 1: Auth, Workspace Settings, Multi-Tenancy & Dashboard (F01–F08)", () => {
    test("T1-G01-01 (F01, F03): Register new teacher & auto-provision 1-to-1 Workspace with VND currency", async ({
      request,
    }) => {
      const tag = uniqueSuffix("reg");
      const email = `  Teacher.${tag}@Example.COM `;
      const res = await request.post(`${BASE_URL}/api/auth/register`, {
        data: {
          fullName: `Cô Giáo ${tag}`,
          email,
          password: "Password123!",
          workspaceName: `Trung Tâm Ánh Sao ${tag}`,
          phone: "0909111222",
        },
      });
      expect(res.status()).toBe(201);
      const body = await res.json();
      expect(body.user).toBeDefined();
      expect(body.workspace).toBeDefined();
      expect(body.user.email).toBe(`teacher.${tag}@example.com`.toLowerCase());
      expect(body.workspace.name).toContain(`Trung Tâm Ánh Sao ${tag}`);
      expect(body.workspace.currency ?? "VND").toBe("VND");
    });

    test("T1-G01-02 (F04): Teacher login with credentials establishes authenticated workspace session", async ({
      request,
    }) => {
      const client = await registerAndLoginTeacher(request);
      const loginRes = await request.post(`${BASE_URL}/api/auth/login`, {
        data: {
          email: client.teacher.email,
          password: client.teacher.password,
        },
      });
      expect(loginRes.status()).toBe(200);
      const loginBody = await loginRes.json();
      const user = loginBody.user ?? loginBody;
      expect(user.email).toBe(client.teacher.email);

      const wsRes = await client.get("/api/workspace");
      expect(wsRes.status()).toBe(200);
      const wsBody = await wsRes.json();
      const ws = unwrapItem(wsBody, "workspace");
      expect(ws.id).toBe(client.teacher.workspaceId);
    });

    test("T1-G01-03 (F05): Unauthenticated API requests return 401 and unauthenticated UI routes redirect to /login", async ({
      request,
      page,
    }) => {
      const unauthApi = await request.get(`${BASE_URL}/api/workspace`);
      expect(unauthApi.status()).toBe(401);

      const unauthClasses = await request.get(`${BASE_URL}/api/classes`);
      expect(unauthClasses.status()).toBe(401);

      await page.context().clearCookies();
      await page.goto(`${BASE_URL}/dashboard`);
      await expect(page).toHaveURL(/\/login/);
    });

    test("T1-G01-04 (F06): Update Workspace profile & VietQR bank configuration via API and /settings UI", async ({
      request,
      page,
    }) => {
      const client = await registerAndLoginTeacher(request);
      const updateRes = await client.put("/api/workspace", {
        name: "Trung Tâm Toán Lý Hoá Quốc Gia",
        phone: "0988777666",
        address: "123 Nguyễn Trãi, Hà Nội",
        currency: "VND",
        bankBin: "970436",
        bankCode: "VCB",
        bankName: "Vietcombank",
        bankAccountNumber: "0011001234567",
        bankAccountName: "NGUYEN VAN GIAO VIEN",
        cameraStreamUrl: "http://localhost:3000/api/face-ai/stream-proxy",
      });
      expect(updateRes.status()).toBe(200);
      const updated = unwrapItem(await updateRes.json(), "workspace");
      expect(updated.name).toBe("Trung Tâm Toán Lý Hoá Quốc Gia");
      expect(updated.bankBin).toBe("970436");
      expect(updated.bankCode).toBe("VCB");
      expect(updated.bankAccountNumber).toBe("0011001234567");
      expect(updated.bankAccountName).toBe("NGUYEN VAN GIAO VIEN");

      await authenticatePageForTeacher(page, client);
      await page.goto(`${BASE_URL}/settings`);
      await expect(page.locator("body")).toContainText("Vietcombank");
    });

    test("T1-G01-05 (F07): Multi-Tenant Workspace Isolation Guard blocks cross-workspace access with 404/403", async ({
      request,
    }) => {
      const teacherA = await registerAndLoginTeacher(request);
      const teacherB = await registerAndLoginTeacher(request);

      const classB = await createTestClass(teacherB, {
        name: "Lớp Bí Mật Của Giáo Viên B",
      });

      const getCross = await teacherA.get(`/api/classes/${classB.id}`);
      expect([403, 404]).toContain(getCross.status());

      const patchCross = await teacherA.patch(`/api/classes/${classB.id}`, {
        name: "Hacked by A",
      });
      expect([403, 404]).toContain(patchCross.status());

      const delCross = await teacherA.delete(`/api/classes/${classB.id}`);
      expect([403, 404]).toContain(delCross.status());
    });

    test("T1-G01-06 (F02, F08): Workspace Overview Dashboard returns accurate real-time KPIs & renders /dashboard UI", async ({
      request,
      page,
    }) => {
      const client = await registerAndLoginTeacher(request);
      const cls = await createTestClass(client);
      const stu = await createTestStudent(client);
      await client.post("/api/enrollments", {
        classId: cls.id,
        studentId: stu.id,
      });

      const dashRes = await client.get("/api/dashboard");
      expect(dashRes.status()).toBe(200);
      const dash = await dashRes.json();
      expect(dash.kpis).toBeDefined();
      expect(dash.kpis.totalClasses).toBeGreaterThanOrEqual(1);
      expect(dash.kpis.activeClasses).toBeGreaterThanOrEqual(1);
      expect(dash.kpis.totalStudents).toBeGreaterThanOrEqual(1);
      expect(dash.kpis.activeStudents).toBeGreaterThanOrEqual(1);
      expect(Array.isArray(dash.todaySessions)).toBe(true);

      await authenticatePageForTeacher(page, client);
      await page.goto(`${BASE_URL}/dashboard`);
      await expect(page.locator("body")).toContainText(/Tổng quan|Lớp|Học sinh/i);
    });
  });

  // ===========================================================================
  // GROUP 2: Classes, Schedule Slots, Timetable & Session Generation (F09–F13)
  // ===========================================================================
  test.describe("Group 2: Classes, Schedule Slots, Timetable & Session Generation (F09–F13)", () => {
    test("T1-G02-01 (F09): Class CRUD (Create, List, Get Detail, Update, Archive/Delete) & /classes UI", async ({
      request,
      page,
    }) => {
      const client = await registerAndLoginTeacher(request);
      const code = uniqueSuffix("TOAN9").toUpperCase().slice(0, 12);
      const cls = await createTestClass(client, {
        code,
        name: "Toán 9 Luyện Thi Vào 10",
        subject: "Toán",
        gradeLevel: "Lớp 9",
        room: "Phòng 201",
        defaultFeeAmount: 1800000,
        billingCycle: "MONTHLY",
      });
      expect(cls.id).toBeTruthy();
      expect(cls.code).toBe(code);

      const listRes = await client.get("/api/classes", { status: "ACTIVE" });
      expect(listRes.status()).toBe(200);
      const classes = unwrapList(await listRes.json(), "classes");
      expect(classes.some((c: any) => c.id === cls.id)).toBe(true);

      const detailRes = await client.get(`/api/classes/${cls.id}`);
      expect(detailRes.status()).toBe(200);

      const patchRes = await client.patch(`/api/classes/${cls.id}`, {
        name: "Toán 9 Chuyên Đề Nâng Cao",
        room: "Phòng 202",
      });
      expect(patchRes.status()).toBe(200);
      const updated = unwrapItem(await patchRes.json(), "class");
      expect(updated.name).toBe("Toán 9 Chuyên Đề Nâng Cao");

      await authenticatePageForTeacher(page, client);
      await page.goto(`${BASE_URL}/classes`);
      await expect(page.locator("body")).toContainText("Toán 9 Chuyên Đề Nâng Cao");

      const delRes = await client.delete(`/api/classes/${cls.id}`);
      expect(delRes.status()).toBe(200);
    });

    test("T1-G02-02 (F10): Manage recurring weekly ScheduleSlot items (create & delete)", async ({
      request,
    }) => {
      const client = await registerAndLoginTeacher(request);
      const cls = await createTestClass(client);

      const addSlotRes = await client.post(
        `/api/classes/${cls.id}/schedule-slots`,
        {
          dayOfWeek: 1, // Monday
          startTime: "18:00",
          endTime: "19:30",
          room: "Phòng 101",
        }
      );
      expect([200, 201]).toContain(addSlotRes.status());
      const slotBody = await addSlotRes.json();
      const slots = unwrapList(slotBody, "slots");
      const createdSlot =
        slots[0] ?? unwrapItem(slotBody, "slot") ?? unwrapItem(slotBody, "scheduleSlot");
      expect(createdSlot.id).toBeTruthy();
      expect(createdSlot.dayOfWeek).toBe(1);
      expect(createdSlot.startTime).toBe("18:00");

      const delSlotRes = await client.delete(
        `/api/classes/${cls.id}/schedule-slots/${createdSlot.id}`
      );
      expect(delSlotRes.status()).toBe(200);
    });

    test("T1-G02-03 (F11): Weekly Timetable Grid & automatic overlap conflict detection", async ({
      request,
      page,
    }) => {
      const client = await registerAndLoginTeacher(request);
      const classA = await createTestClass(client, {
        name: "Lớp Vật Lý 10A",
        room: "Phòng 301",
      });
      const classB = await createTestClass(client, {
        name: "Lớp Hoá Học 10B",
        room: "Phòng 301",
      });

      await client.post(`/api/classes/${classA.id}/schedule-slots`, {
        dayOfWeek: 3, // Wednesday
        startTime: "18:00",
        endTime: "19:30",
        room: "Phòng 301",
      });
      await client.post(`/api/classes/${classB.id}/schedule-slots`, {
        dayOfWeek: 3, // Wednesday overlapping
        startTime: "19:00",
        endTime: "20:30",
        room: "Phòng 301",
      });

      const schedRes = await client.get("/api/schedule", {
        weekStart: "2026-11-02",
      });
      expect(schedRes.status()).toBe(200);
      const schedBody = await schedRes.json();
      expect(Array.isArray(schedBody.slots)).toBe(true);
      expect(schedBody.slots.length).toBeGreaterThanOrEqual(2);
      expect(Array.isArray(schedBody.conflicts)).toBe(true);
      expect(schedBody.conflicts.length).toBeGreaterThanOrEqual(1);

      await authenticatePageForTeacher(page, client);
      await page.goto(`${BASE_URL}/schedule`);
      await expect(page.locator("body")).toContainText("Lớp Vật Lý 10A");
    });

    test("T1-G02-04 (F12): Auto-generate Session records from ScheduleSlot over [fromDate, toDate]", async ({
      request,
    }) => {
      const client = await registerAndLoginTeacher(request);
      const cls = await createTestClass(client, {
        startDate: "2026-11-01",
        endDate: "2026-11-30",
      });
      // Add Monday (dayOfWeek = 1) and Thursday (dayOfWeek = 4)
      await client.post(`/api/classes/${cls.id}/schedule-slots`, {
        slots: [
          { dayOfWeek: 1, startTime: "18:00", endTime: "19:30", room: "P101" },
          { dayOfWeek: 4, startTime: "18:00", endTime: "19:30", room: "P101" },
        ],
      });

      const genRes = await client.post(
        `/api/classes/${cls.id}/generate-sessions`,
        {
          fromDate: "2026-11-01",
          toDate: "2026-11-30",
        }
      );
      expect([200, 201]).toContain(genRes.status());
      const genBody = await genRes.json();
      expect(genBody.createdCount).toBeGreaterThanOrEqual(8);

      // Workspace-wide generation endpoint check
      const bulkGenRes = await client.post("/api/schedule/generate-sessions", {
        fromDate: "2026-11-01",
        toDate: "2026-11-30",
      });
      expect([200, 201]).toContain(bulkGenRes.status());
      const bulkGenBody = await bulkGenRes.json();
      expect(bulkGenBody.skippedCount).toBeGreaterThanOrEqual(8);
    });

    test("T1-G02-05 (F13): Manual ad-hoc session creation, reschedule, and cancellation", async ({
      request,
    }) => {
      const client = await registerAndLoginTeacher(request);
      const cls = await createTestClass(client);

      const createRes = await client.post("/api/sessions", {
        classId: cls.id,
        sessionDate: "2026-11-15",
        startTime: "09:00",
        endTime: "11:00",
        room: "Phòng Bù 1",
        topic: "Buổi học bù Hình học không gian",
        notes: "Ôn tập chương 2",
      });
      expect(createRes.status()).toBe(201);
      const session = unwrapItem(await createRes.json(), "session");
      expect(session.id).toBeTruthy();

      const patchRes = await client.patch(`/api/sessions/${session.id}`, {
        startTime: "09:30",
        endTime: "11:30",
        topic: "Buổi học bù Hình học (Đã dời giờ)",
        status: "COMPLETED",
      });
      expect(patchRes.status()).toBe(200);
      const updated = unwrapItem(await patchRes.json(), "session");
      expect(updated.startTime).toBe("09:30");
      expect(updated.status).toBe("COMPLETED");

      const delRes = await client.delete(`/api/sessions/${session.id}`);
      expect(delRes.status()).toBe(200);
    });
  });

  // ===========================================================================
  // GROUP 3: Students, Multiple Guardians & Class Enrollments (F14–F16)
  // ===========================================================================
  test.describe("Group 3: Students, Multiple Guardians & Class Enrollments (F14–F16)", () => {
    test("T1-G03-01 (F14): Create Student with sequential studentCode auto-generation & view profile", async ({
      request,
    }) => {
      const client = await registerAndLoginTeacher(request);
      const s1 = await createTestStudent(client, {
        fullName: "Nguyễn Minh Anh",
        school: "THCS Nguyễn Du",
      });
      const s2 = await createTestStudent(client, {
        fullName: "Trần Quốc Bảo",
        school: "THCS Nguyễn Du",
      });
      expect(s1.studentCode).toMatch(/^HS\d+/i);
      expect(s2.studentCode).toMatch(/^HS\d+/i);
      expect(s1.studentCode).not.toBe(s2.studentCode);

      const detailRes = await client.get(`/api/students/${s1.id}`);
      expect(detailRes.status()).toBe(200);
      const profile = unwrapItem(await detailRes.json(), "student");
      expect(profile.fullName).toBe("Nguyễn Minh Anh");
    });

    test("T1-G03-02 (F14): Search & filter students by keyword, status, and classId + /students UI", async ({
      request,
      page,
    }) => {
      const client = await registerAndLoginTeacher(request);
      const cls = await createTestClass(client);
      const s1 = await createTestStudent(client, {
        fullName: "Lê Hoàng Phương Thảo",
        phone: "0977111999",
      });
      await createTestStudent(client, {
        fullName: "Phạm Gia Huy",
        status: "INACTIVE",
      });
      await client.post("/api/enrollments", {
        classId: cls.id,
        studentId: s1.id,
      });

      const searchRes = await client.get("/api/students", {
        search: "Phương Thảo",
      });
      expect(searchRes.status()).toBe(200);
      const found = unwrapList(await searchRes.json(), "students");
      expect(found.length).toBe(1);
      expect(found[0].id).toBe(s1.id);

      const byClassRes = await client.get("/api/students", {
        classId: cls.id,
      });
      const byClass = unwrapList(await byClassRes.json(), "students");
      expect(byClass.some((st: any) => st.id === s1.id)).toBe(true);

      await authenticatePageForTeacher(page, client);
      await page.goto(`${BASE_URL}/students`);
      await expect(page.locator("body")).toContainText("Lê Hoàng Phương Thảo");
    });

    test("T1-G03-03 (F15): Add, update, and delete multiple Guardians per Student with primary guardian normalization", async ({
      request,
    }) => {
      const client = await registerAndLoginTeacher(request);
      const stu = await createTestStudent(client, {
        fullName: "Đỗ Tuấn Kiệt",
      });

      const g1Res = await client.post(`/api/students/${stu.id}/guardians`, {
        fullName: "Đỗ Văn Bố",
        relationship: "Bố",
        phone: "0911222333",
        zalo: "0911222333",
        isPrimary: true,
      });
      expect(g1Res.status()).toBe(201);
      const g1 = unwrapItem(await g1Res.json(), "guardian");

      const g2Res = await client.post(`/api/students/${stu.id}/guardians`, {
        fullName: "Nguyễn Thị Mẹ",
        relationship: "Mẹ",
        phone: "0944555666",
        email: "me.kiet@example.com",
        isPrimary: true, // Should become primary and unset g1
      });
      expect(g2Res.status()).toBe(201);
      const g2 = unwrapItem(await g2Res.json(), "guardian");

      const stuDetail = unwrapItem(
        await (await client.get(`/api/students/${stu.id}`)).json(),
        "student"
      );
      const guardians: any[] = stuDetail.guardians ?? [];
      expect(guardians.length).toBe(2);
      const primaries = guardians.filter((g) => g.isPrimary);
      expect(primaries.length).toBe(1);
      expect(primaries[0].id).toBe(g2.id);

      const patchG1 = await client.patch(
        `/api/students/${stu.id}/guardians/${g1.id}`,
        {
          phone: "0911999888",
          isPrimary: true,
        }
      );
      expect(patchG1.status()).toBe(200);

      const delG2 = await client.delete(
        `/api/students/${stu.id}/guardians/${g2.id}`
      );
      expect(delG2.status()).toBe(200);
    });

    test("T1-G03-04 (F16): Enroll students into a Class with FIXED and PERCENTAGE customFeeDiscount", async ({
      request,
    }) => {
      const client = await registerAndLoginTeacher(request);
      const cls = await createTestClass(client, { defaultFeeAmount: 2000000 });
      const stu1 = await createTestStudent(client, { fullName: "HS Giảm Tiền Mặt" });
      const stu2 = await createTestStudent(client, { fullName: "HS Học Bổng Phần Trăm" });

      const e1Res = await client.post("/api/enrollments", {
        classId: cls.id,
        studentId: stu1.id,
        discountType: "FIXED",
        customFeeDiscount: 300000,
        discountNote: "Giảm anh chị em ruột",
      });
      expect(e1Res.status()).toBe(201);

      const e2Res = await client.post("/api/enrollments", {
        classId: cls.id,
        studentId: stu2.id,
        discountType: "PERCENTAGE",
        customFeeDiscount: 25,
        discountNote: "Học bổng 25%",
      });
      expect(e2Res.status()).toBe(201);

      const listRes = await client.get("/api/enrollments", { classId: cls.id });
      expect(listRes.status()).toBe(200);
      const enrollments = unwrapList(await listRes.json(), "enrollments");
      expect(enrollments.length).toBe(2);
    });

    test("T1-G03-05 (F16): Update Enrollment status (PAUSED/DROPPED/COMPLETED) and delete enrollment", async ({
      request,
    }) => {
      const client = await registerAndLoginTeacher(request);
      const cls = await createTestClass(client);
      const stu = await createTestStudent(client);

      const enrollRes = await client.post("/api/enrollments", {
        classId: cls.id,
        studentId: stu.id,
      });
      expect(enrollRes.status()).toBe(201);
      const enrollBody = await enrollRes.json();
      const enrollment =
        unwrapList(enrollBody, "enrollments")[0] ??
        unwrapItem(enrollBody, "enrollment");

      const patchRes = await client.patch(`/api/enrollments/${enrollment.id}`, {
        status: "PAUSED",
        customFeeDiscount: 100000,
      });
      expect(patchRes.status()).toBe(200);
      const updated = unwrapItem(await patchRes.json(), "enrollment");
      expect(updated.status).toBe("PAUSED");

      const delRes = await client.delete(`/api/enrollments/${enrollment.id}`);
      expect(delRes.status()).toBe(200);
    });
  });

  // ===========================================================================
  // GROUP 4: Tuition FeePlans, Invoices, Payments, VietQR & Debt Report (F17–F21)
  // ===========================================================================
  test.describe("Group 4: Tuition FeePlans, Invoices, Payments, VietQR & Debt Report (F17–F21)", () => {
    test("T1-G04-01 (F17): Configure Class FeePlans (MONTHLY, PER_COURSE, PER_SESSION) CRUD", async ({
      request,
    }) => {
      const client = await registerAndLoginTeacher(request);
      const cls = await createTestClass(client);

      const fpMonthlyRes = await client.post("/api/fee-plans", {
        classId: cls.id,
        name: "Học phí tháng tiêu chuẩn",
        billingCycle: "MONTHLY",
        amount: 1600000,
        isDefault: true,
      });
      expect(fpMonthlyRes.status()).toBe(201);
      const fpMonthly = unwrapItem(await fpMonthlyRes.json(), "feePlan");

      const fpSessionRes = await client.post("/api/fee-plans", {
        classId: cls.id,
        name: "Học phí theo buổi",
        billingCycle: "PER_SESSION",
        amount: 200000,
        isDefault: false,
      });
      expect(fpSessionRes.status()).toBe(201);
      const fpSession = unwrapItem(await fpSessionRes.json(), "feePlan");

      const listRes = await client.get("/api/fee-plans", { classId: cls.id });
      expect(listRes.status()).toBe(200);
      const plans = unwrapList(await listRes.json(), "feePlans");
      expect(plans.length).toBeGreaterThanOrEqual(2);

      const patchRes = await client.patch(`/api/fee-plans/${fpMonthly.id}`, {
        amount: 1750000,
      });
      expect(patchRes.status()).toBe(200);

      const delRes = await client.delete(`/api/fee-plans/${fpSession.id}`);
      expect(delRes.status()).toBe(200);
    });

    test("T1-G04-02 (F18): Bulk & individual Invoice generation applying enrollment discounts and PER_SESSION counts", async ({
      request,
    }) => {
      const client = await registerAndLoginTeacher(request);
      const cls = await createTestClass(client, { defaultFeeAmount: 2000000 });
      const stuFixed = await createTestStudent(client, { fullName: "HS Giảm 500k" });
      const stuPct = await createTestStudent(client, { fullName: "HS Giảm 20%" });

      await client.post("/api/enrollments", {
        classId: cls.id,
        studentId: stuFixed.id,
        discountType: "FIXED",
        customFeeDiscount: 500000,
      });
      await client.post("/api/enrollments", {
        classId: cls.id,
        studentId: stuPct.id,
        discountType: "PERCENTAGE",
        customFeeDiscount: 20,
      });

      const genRes = await client.post("/api/invoices/generate", {
        classId: cls.id,
        billingPeriod: "2026-11",
        dueDate: "2026-11-10",
      });
      expect([200, 201]).toContain(genRes.status());
      const genBody = await genRes.json();
      expect(genBody.createdCount).toBe(2);

      const invoices = unwrapList(genBody, "invoices");
      const invFixed = invoices.find((i: any) => i.studentId === stuFixed.id);
      const invPct = invoices.find((i: any) => i.studentId === stuPct.id);

      expect(invFixed.baseAmount).toBe(2000000);
      expect(invFixed.discountAmount).toBe(500000);
      expect(invFixed.netAmount).toBe(1500000);
      expect(invFixed.status).toBe("UNPAID");

      expect(invPct.baseAmount).toBe(2000000);
      expect(invPct.discountAmount).toBe(400000);
      expect(invPct.netAmount).toBe(1600000);
      expect(invPct.status).toBe("UNPAID");
    });

    test("T1-G04-03 (F19): Manual Payment recording (partial CASH then remaining BANK_TRANSFER) transitions UNPAID -> PARTIAL -> PAID", async ({
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
        dueDate: "2026-11-15",
      });
      const inv = unwrapList(await genRes.json(), "invoices")[0];
      expect(inv.netAmount).toBe(1000000);

      // Partial payment 1: 400,000 CASH
      const pay1Res = await client.post(`/api/invoices/${inv.id}/payments`, {
        amount: 400000,
        method: "CASH",
        collectorName: "Cô Lan",
        receiptNote: "Đóng đợt 1",
      });
      expect(pay1Res.status()).toBe(201);
      const pay1Body = await pay1Res.json();
      expect(pay1Body.invoice.paidAmount).toBe(400000);
      expect(pay1Body.invoice.status).toBe("PARTIAL");

      // Remaining payment 2: 600,000 BANK_TRANSFER
      const pay2Res = await client.post(`/api/invoices/${inv.id}/payments`, {
        amount: 600000,
        method: "BANK_TRANSFER",
        referenceCode: "FT26310999888",
        receiptNote: "Tất toán đợt 2",
      });
      expect(pay2Res.status()).toBe(201);
      const pay2Body = await pay2Res.json();
      expect(pay2Body.invoice.paidAmount).toBe(1000000);
      expect(pay2Body.invoice.status).toBe("PAID");
    });

    test("T1-G04-04 (F20): Dynamic VietQR generation per Invoice returns EMVCo payload, SVG/DataURL, remaining balance & sanitized memo", async ({
      request,
      page,
    }) => {
      const client = await registerAndLoginTeacher(request);
      await client.put("/api/workspace", {
        name: "Trung Tâm VietQR Test",
        bankBin: "970422",
        bankCode: "MB",
        bankName: "MBBank",
        bankAccountNumber: "0987654321",
        bankAccountName: "TRAN THI GIAO VIEN",
      });

      const cls = await createTestClass(client, { defaultFeeAmount: 1200000 });
      const stu = await createTestStudent(client, {
        studentCode: "HS-099",
        fullName: "Nguyễn Văn Ánh",
      });
      await client.post("/api/enrollments", {
        classId: cls.id,
        studentId: stu.id,
      });

      const genRes = await client.post("/api/invoices/generate", {
        classId: cls.id,
        billingPeriod: "2026-11",
        dueDate: "2026-11-20",
      });
      const inv = unwrapList(await genRes.json(), "invoices")[0];

      // Pay 200,000 first so remaining balance is 1,000,000
      await client.post(`/api/invoices/${inv.id}/payments`, {
        amount: 200000,
        method: "CASH",
      });

      const qrRes = await client.get(`/api/invoices/${inv.id}/vietqr`);
      expect(qrRes.status()).toBe(200);
      const qr = await qrRes.json();
      expect(qr.amount).toBe(1000000);
      expect(qr.qrPayload).toContain("000201");
      expect(qr.qrDataUrl).toMatch(/^data:image\/(png|svg\+xml)/);
      expect(qr.transferContent).toMatch(/^HP\s+HS099\s+/i);

      await authenticatePageForTeacher(page, client);
      await page.goto(`${BASE_URL}/fees`);
      await expect(page.locator("body")).toContainText("Nguyễn Văn Ánh");
    });

    test("T1-G04-05 (F21): Debt & Arrears Report (/api/fees/report) aggregates collection & outstanding debt by class and month", async ({
      request,
    }) => {
      const client = await registerAndLoginTeacher(request);
      const cls = await createTestClass(client, { defaultFeeAmount: 1500000 });
      const s1 = await createTestStudent(client);
      const s2 = await createTestStudent(client);
      await client.post("/api/enrollments", {
        classId: cls.id,
        studentIds: [s1.id, s2.id],
      });

      const genRes = await client.post("/api/invoices/generate", {
        classId: cls.id,
        billingPeriod: "2026-11",
        dueDate: "2026-11-01",
      });
      const invoices = unwrapList(await genRes.json(), "invoices");
      await client.post(`/api/invoices/${invoices[0].id}/payments`, {
        amount: 1500000,
        method: "BANK_TRANSFER",
      });

      const reportRes = await client.get("/api/fees/report", {
        billingPeriod: "2026-11",
        classId: cls.id,
      });
      expect(reportRes.status()).toBe(200);
      const report = await reportRes.json();
      expect(report.summary).toBeDefined();
      expect(report.summary.totalNet).toBe(3000000);
      expect(report.summary.totalPaid).toBe(1500000);
      expect(report.summary.totalOutstanding).toBe(1500000);
      expect(Array.isArray(report.byClass)).toBe(true);
    });
  });

  // ===========================================================================
  // GROUP 5: Session Roster, Manual Check-in/Check-out & Bulk Attendance (F22–F24)
  // ===========================================================================
  test.describe("Group 5: Session Roster, Manual Check-in/Check-out & Bulk Attendance (F22–F24)", () => {
    test("T1-G05-01 (F22): Session detail endpoint & /sessions/[id] UI auto-initialize roster for active enrolled students", async ({
      request,
      page,
    }) => {
      const client = await registerAndLoginTeacher(request);
      const cls = await createTestClass(client);
      const s1 = await createTestStudent(client, { fullName: "Học Sinh Điểm Danh 1" });
      const s2 = await createTestStudent(client, { fullName: "Học Sinh Điểm Danh 2" });
      await client.post("/api/enrollments", {
        classId: cls.id,
        studentIds: [s1.id, s2.id],
      });

      const sessRes = await client.post("/api/sessions", {
        classId: cls.id,
        sessionDate: "2026-11-10",
        startTime: "18:00",
        endTime: "19:30",
        topic: "Phương trình bậc hai",
      });
      const session = unwrapItem(await sessRes.json(), "session");

      const detailRes = await client.get(`/api/sessions/${session.id}`);
      expect(detailRes.status()).toBe(200);
      const detail = await detailRes.json();
      expect(Array.isArray(detail.roster)).toBe(true);
      expect(detail.roster.length).toBe(2);

      await authenticatePageForTeacher(page, client);
      await page.goto(`${BASE_URL}/sessions/${session.id}`);
      await expect(page.locator("body")).toContainText("Học Sinh Điểm Danh 1");
      await expect(page.locator("body")).toContainText("Học Sinh Điểm Danh 2");
    });

    test("T1-G05-02 (F22): Update Session lesson topic, teacher notes, and status lifecycle (SCHEDULED -> IN_PROGRESS -> COMPLETED)", async ({
      request,
    }) => {
      const client = await registerAndLoginTeacher(request);
      const cls = await createTestClass(client);
      const sessRes = await client.post("/api/sessions", {
        classId: cls.id,
        sessionDate: "2026-11-11",
        startTime: "18:00",
        endTime: "19:30",
      });
      const session = unwrapItem(await sessRes.json(), "session");
      expect(session.status).toBe("SCHEDULED");

      const inProgRes = await client.patch(`/api/sessions/${session.id}`, {
        status: "IN_PROGRESS",
        topic: "Định lý Vi-ét và ứng dụng",
        notes: "Lớp học sôi nổi",
      });
      expect(inProgRes.status()).toBe(200);
      expect(unwrapItem(await inProgRes.json(), "session").status).toBe("IN_PROGRESS");

      const compRes = await client.patch(`/api/sessions/${session.id}`, {
        status: "COMPLETED",
      });
      expect(compRes.status()).toBe(200);
      expect(unwrapItem(await compRes.json(), "session").status).toBe("COMPLETED");
    });

    test("T1-G05-03 (F23): Manual single-student Check-in and Check-out records status, timestamps, notes & MANUAL method", async ({
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

      const attRes = await client.post(
        `/api/sessions/${session.id}/attendance`,
        {
          studentId: stu.id,
          status: "PRESENT",
          checkInAt: "2026-11-12T17:58:00.000Z",
          checkOutAt: "2026-11-12T19:31:00.000Z",
          notes: "Đi học đúng giờ",
        }
      );
      expect([200, 201]).toContain(attRes.status());
      const att = unwrapItem(await attRes.json(), "attendance");
      expect(att.status).toBe("PRESENT");
      expect(att.method).toBe("MANUAL");
      expect(att.checkInAt).toBeTruthy();
      expect(att.checkOutAt).toBeTruthy();
    });

    test("T1-G05-04 (F24): Bulk quick attendance MARK_ALL_PRESENT marks entire enrolled roster PRESENT", async ({
      request,
    }) => {
      const client = await registerAndLoginTeacher(request);
      const cls = await createTestClass(client);
      const s1 = await createTestStudent(client);
      const s2 = await createTestStudent(client);
      const s3 = await createTestStudent(client);
      await client.post("/api/enrollments", {
        classId: cls.id,
        studentIds: [s1.id, s2.id, s3.id],
      });
      const sessRes = await client.post("/api/sessions", {
        classId: cls.id,
        sessionDate: "2026-11-13",
        startTime: "18:00",
        endTime: "19:30",
      });
      const session = unwrapItem(await sessRes.json(), "session");

      const bulkRes = await client.post(
        `/api/sessions/${session.id}/attendance`,
        {
          action: "MARK_ALL_PRESENT",
        }
      );
      expect([200, 201]).toContain(bulkRes.status());
      const bulkBody = await bulkRes.json();
      expect(bulkBody.updatedCount).toBe(3);
    });

    test("T1-G05-05 (F24): Bulk quick attendance CHECK_OUT_ALL sets checkOutAt for all checked-in students", async ({
      request,
    }) => {
      const client = await registerAndLoginTeacher(request);
      const cls = await createTestClass(client);
      const s1 = await createTestStudent(client);
      const s2 = await createTestStudent(client);
      await client.post("/api/enrollments", {
        classId: cls.id,
        studentIds: [s1.id, s2.id],
      });
      const sessRes = await client.post("/api/sessions", {
        classId: cls.id,
        sessionDate: "2026-11-14",
        startTime: "18:00",
        endTime: "19:30",
      });
      const session = unwrapItem(await sessRes.json(), "session");

      await client.post(`/api/sessions/${session.id}/attendance`, {
        action: "MARK_ALL_PRESENT",
      });

      const checkoutRes = await client.post(
        `/api/sessions/${session.id}/attendance`,
        {
          action: "CHECK_OUT_ALL",
        }
      );
      expect([200, 201]).toContain(checkoutRes.status());
      const checkoutBody = await checkoutRes.json();
      expect(checkoutBody.updatedCount).toBe(2);

      const detail = await (await client.get(`/api/sessions/${session.id}`)).json();
      for (const row of detail.roster) {
        const att = row.attendance ?? row;
        expect(att.checkOutAt).toBeTruthy();
      }
    });
  });

  // ===========================================================================
  // GROUP 6: Browser FaceAI Enrollment, Camera/Proxy & Realtime Matching (F25–F27)
  // ===========================================================================
  test.describe("Group 6: Browser FaceAI Enrollment, Camera/Proxy & Realtime Matching (F25–F27)", () => {
    test("T1-G06-01 (F25): Enroll student 128-float L2-normalized FaceDescriptor & list enrolled descriptors", async ({
      request,
    }) => {
      const client = await registerAndLoginTeacher(request);
      const cls = await createTestClass(client);
      const stu = await createTestStudent(client, { fullName: "Học Sinh FaceAI 01" });
      await client.post("/api/enrollments", {
        classId: cls.id,
        studentId: stu.id,
      });

      const descriptor = generateNormalizedDescriptor("student-face-01");
      expect(descriptor.length).toBe(128);

      const enrollRes = await client.post("/api/face-ai/descriptors", {
        studentId: stu.id,
        descriptor,
        label: "Ảnh chính diện mẫu 1",
        source: "SYNTHETIC",
      });
      expect(enrollRes.status()).toBe(201);
      const saved = unwrapItem(await enrollRes.json(), "descriptor");
      expect(saved.id).toBeTruthy();
      expect(saved.studentId).toBe(stu.id);

      const listRes = await client.get("/api/face-ai/descriptors", {
        classId: cls.id,
      });
      expect(listRes.status()).toBe(200);
      const list = unwrapList(await listRes.json(), "descriptors");
      expect(list.some((d: any) => d.id === saved.id)).toBe(true);
    });

    test("T1-G06-02 (F25): Delete enrolled FaceDescriptor and verify removal", async ({
      request,
    }) => {
      const client = await registerAndLoginTeacher(request);
      const stu = await createTestStudent(client);
      const descriptor = generateNormalizedDescriptor("student-face-delete");

      const enrollRes = await client.post("/api/face-ai/descriptors", {
        studentId: stu.id,
        descriptor,
        source: "UPLOAD",
      });
      const saved = unwrapItem(await enrollRes.json(), "descriptor");

      const delRes = await client.delete(`/api/face-ai/descriptors/${saved.id}`);
      expect(delRes.status()).toBe(200);

      const listRes = await client.get("/api/face-ai/descriptors", {
        studentId: stu.id,
      });
      const list = unwrapList(await listRes.json(), "descriptors");
      expect(list.some((d: any) => d.id === saved.id)).toBe(false);
    });

    test("T1-G06-03 (F26): Classroom Camera selector UI & IP Camera CORS stream-proxy endpoint", async ({
      request,
      page,
    }) => {
      const client = await registerAndLoginTeacher(request);
      const cls = await createTestClass(client);
      const sessRes = await client.post("/api/sessions", {
        classId: cls.id,
        sessionDate: "2026-11-16",
        startTime: "18:00",
        endTime: "19:30",
      });
      const session = unwrapItem(await sessRes.json(), "session");

      // Verify stream-proxy endpoint responds deterministically (200 synthetic frame or 400 validation on missing URL)
      const proxyNoUrl = await client.get("/api/face-ai/stream-proxy");
      expect([200, 400]).toContain(proxyNoUrl.status());

      await authenticatePageForTeacher(page, client);
      await page.goto(`${BASE_URL}/sessions/${session.id}`);
      const faceTab = page.getByTestId("tab-face-ai");
      if ((await faceTab.count()) > 0) {
        await faceTab.click();
      }
      await expect(page.locator("body")).toContainText(/FaceAI|Điểm danh/i);
    });

    test("T1-G06-04 (F27): Realtime FaceAI matching in CHECK_IN mode matches enrolled student & records FACE_AI attendance", async ({
      request,
    }) => {
      const client = await registerAndLoginTeacher(request);
      const cls = await createTestClass(client);
      const s1 = await createTestStudent(client, { fullName: "Trần Mặt Thật 1" });
      const s2 = await createTestStudent(client, { fullName: "Lê Mặt Thật 2" });
      await client.post("/api/enrollments", {
        classId: cls.id,
        studentIds: [s1.id, s2.id],
      });

      const baseVec1 = generateNormalizedDescriptor(1001);
      const baseVec2 = generateNormalizedDescriptor(2002);
      await client.post("/api/face-ai/descriptors", {
        studentId: s1.id,
        descriptor: baseVec1,
        source: "WEBCAM",
      });
      await client.post("/api/face-ai/descriptors", {
        studentId: s2.id,
        descriptor: baseVec2,
        source: "WEBCAM",
      });

      const sessRes = await client.post("/api/sessions", {
        classId: cls.id,
        sessionDate: "2026-11-17",
        startTime: "18:00",
        endTime: "19:30",
      });
      const session = unwrapItem(await sessRes.json(), "session");

      // Perturb s1's descriptor slightly (cosine similarity ~0.985 >= 0.80)
      const probeVec1 = perturbDescriptor(baseVec1, 0.04, 77);
      const matchRes = await client.post("/api/face-ai/match", {
        sessionId: session.id,
        scanMode: "CHECK_IN",
        descriptor: probeVec1,
        threshold: 0.8,
      });
      expect(matchRes.status()).toBe(200);
      const matchBody = await matchRes.json();
      expect(matchBody.matched).toBe(true);
      expect(matchBody.student.id).toBe(s1.id);
      expect(matchBody.confidenceScore).toBeGreaterThanOrEqual(0.8);
      expect(matchBody.attendance.method).toBe("FACE_AI");
      expect(matchBody.attendance.checkInAt).toBeTruthy();
    });

    test("T1-G06-05 (F27): Realtime FaceAI matching in CHECK_OUT mode preserves checkInAt and sets checkOutAt + cooldown protection", async ({
      request,
    }) => {
      const client = await registerAndLoginTeacher(request);
      const cls = await createTestClass(client);
      const stu = await createTestStudent(client, { fullName: "Phạm CheckOut FaceAI" });
      await client.post("/api/enrollments", {
        classId: cls.id,
        studentId: stu.id,
      });

      const vec = generateNormalizedDescriptor(3003);
      await client.post("/api/face-ai/descriptors", {
        studentId: stu.id,
        descriptor: vec,
        source: "WEBCAM",
      });

      const sessRes = await client.post("/api/sessions", {
        classId: cls.id,
        sessionDate: "2026-11-18",
        startTime: "18:00",
        endTime: "19:30",
      });
      const session = unwrapItem(await sessRes.json(), "session");

      // 1. Scan CHECK_IN
      const checkInRes = await client.post("/api/face-ai/match", {
        sessionId: session.id,
        scanMode: "CHECK_IN",
        descriptor: vec,
      });
      const checkInData = await checkInRes.json();
      expect(checkInData.matched).toBe(true);
      const originalCheckInAt = checkInData.attendance.checkInAt;
      expect(originalCheckInAt).toBeTruthy();

      // 2. Immediate duplicate scan in CHECK_IN mode (cooldown protection preserves checkInAt)
      const dupRes = await client.post("/api/face-ai/match", {
        sessionId: session.id,
        scanMode: "CHECK_IN",
        descriptor: vec,
      });
      const dupData = await dupRes.json();
      expect(dupData.matched).toBe(true);
      expect(dupData.attendance.checkInAt).toBe(originalCheckInAt);

      // 3. Scan CHECK_OUT
      const checkOutRes = await client.post("/api/face-ai/match", {
        sessionId: session.id,
        scanMode: "CHECK_OUT",
        descriptor: perturbDescriptor(vec, 0.03, 99),
      });
      const checkOutData = await checkOutRes.json();
      expect(checkOutData.matched).toBe(true);
      expect(checkOutData.attendance.checkInAt).toBe(originalCheckInAt);
      expect(checkOutData.attendance.checkOutAt).toBeTruthy();
    });
  });

  // ===========================================================================
  // GROUP 7: Homework CRUD, Submissions & Grading (F28–F29)
  // ===========================================================================
  test.describe("Group 7: Homework CRUD, Submissions & Grading (F28–F29)", () => {
    test("T1-G07-01 (F28): Create Homework assignment linked to Class, Session, and ExerciseQuestions", async ({
      request,
    }) => {
      const client = await registerAndLoginTeacher(request);
      const cls = await createTestClass(client);
      const sessRes = await client.post("/api/sessions", {
        classId: cls.id,
        sessionDate: "2026-11-19",
        startTime: "18:00",
        endTime: "19:30",
      });
      const session = unwrapItem(await sessRes.json(), "session");

      const qRes = await client.post("/api/questions", {
        type: "MULTIPLE_CHOICE",
        subject: "Toán",
        topic: "Hàm số",
        difficulty: "MEDIUM",
        prompt: "Đồ thị hàm số y = 2x + 1 đi qua điểm nào?",
        optionsJson: [
          { id: "A", text: "(0, 1)" },
          { id: "B", text: "(1, 0)" },
        ],
        correctAnswer: "A",
        points: 10,
      });
      const question = unwrapItem(await qRes.json(), "question");

      const hwRes = await client.post("/api/homeworks", {
        classId: cls.id,
        sessionId: session.id,
        title: "BTVN Buổi 1: Hàm số bậc nhất",
        description: "Làm đầy đủ các bài tập đính kèm",
        dueDate: "2026-11-25T23:59:59.000Z",
        maxScore: 10,
        attachmentsJson: [
          { title: "Đề PDF", url: "https://example.com/de-btvn-1.pdf" },
        ],
        questionIdsJson: [question.id],
      });
      expect(hwRes.status()).toBe(201);
      const hw = unwrapItem(await hwRes.json(), "homework");
      expect(hw.id).toBeTruthy();
      expect(hw.title).toBe("BTVN Buổi 1: Hàm số bậc nhất");
      expect(hw.maxScore).toBe(10);
    });

    test("T1-G07-02 (F28): List, update, and delete Homework assignments + /homeworks UI", async ({
      request,
      page,
    }) => {
      const client = await registerAndLoginTeacher(request);
      const cls = await createTestClass(client);

      const hwRes = await client.post("/api/homeworks", {
        classId: cls.id,
        title: "BTVN Hình học Chương 1",
        dueDate: "2026-11-28T23:59:59.000Z",
        maxScore: 10,
      });
      const hw = unwrapItem(await hwRes.json(), "homework");

      const listRes = await client.get("/api/homeworks", { classId: cls.id });
      expect(listRes.status()).toBe(200);
      const list = unwrapList(await listRes.json(), "homeworks");
      expect(list.some((h: any) => h.id === hw.id)).toBe(true);

      const patchRes = await client.patch(`/api/homeworks/${hw.id}`, {
        title: "BTVN Hình học Chương 1 (Cập nhật)",
        maxScore: 20,
      });
      expect(patchRes.status()).toBe(200);
      expect(unwrapItem(await patchRes.json(), "homework").maxScore).toBe(20);

      await authenticatePageForTeacher(page, client);
      await page.goto(`${BASE_URL}/homeworks`);
      await expect(page.locator("body")).toContainText(
        "BTVN Hình học Chương 1 (Cập nhật)"
      );

      const delRes = await client.delete(`/api/homeworks/${hw.id}`);
      expect(delRes.status()).toBe(200);
    });

    test("T1-G07-03 (F29): Record on-time Student HomeworkSubmission (status = SUBMITTED)", async ({
      request,
    }) => {
      const client = await registerAndLoginTeacher(request);
      const cls = await createTestClass(client);
      const stu = await createTestStudent(client);
      await client.post("/api/enrollments", {
        classId: cls.id,
        studentId: stu.id,
      });

      const hwRes = await client.post("/api/homeworks", {
        classId: cls.id,
        title: "BTVN Đúng Hạn",
        dueDate: "2026-11-25T23:59:59.000Z",
        maxScore: 10,
      });
      const hw = unwrapItem(await hwRes.json(), "homework");

      const subRes = await client.post(`/api/homeworks/${hw.id}/submissions`, {
        submissions: [
          {
            studentId: stu.id,
            status: "SUBMITTED",
            submittedAt: "2026-11-24T10:00:00.000Z",
            submissionNote: "Em nộp bài đúng hạn ạ",
          },
        ],
      });
      expect([200, 201]).toContain(subRes.status());
      const subs = unwrapList(await subRes.json(), "submissions");
      expect(subs[0].status).toBe("SUBMITTED");
    });

    test("T1-G07-04 (F29): Automatically flag LATE HomeworkSubmission when submittedAt > dueDate", async ({
      request,
    }) => {
      const client = await registerAndLoginTeacher(request);
      const cls = await createTestClass(client);
      const stu = await createTestStudent(client);
      await client.post("/api/enrollments", {
        classId: cls.id,
        studentId: stu.id,
      });

      const hwRes = await client.post("/api/homeworks", {
        classId: cls.id,
        title: "BTVN Kiểm Tra Nộp Muộn",
        dueDate: "2026-11-20T12:00:00.000Z",
        maxScore: 10,
      });
      const hw = unwrapItem(await hwRes.json(), "homework");

      const subRes = await client.post(`/api/homeworks/${hw.id}/submissions`, {
        submissions: [
          {
            studentId: stu.id,
            status: "SUBMITTED",
            submittedAt: "2026-11-22T15:00:00.000Z", // 2 days after dueDate
          },
        ],
      });
      expect([200, 201]).toContain(subRes.status());
      const subs = unwrapList(await subRes.json(), "submissions");
      expect(subs[0].status).toBe("LATE");
    });

    test("T1-G07-05 (F29): Bulk & individual Homework grading with score and teacher feedback + /homeworks/[id] UI", async ({
      request,
      page,
    }) => {
      const client = await registerAndLoginTeacher(request);
      const cls = await createTestClass(client);
      const s1 = await createTestStudent(client, { fullName: "HS Chấm Điểm 1" });
      const s2 = await createTestStudent(client, { fullName: "HS Chấm Điểm 2" });
      await client.post("/api/enrollments", {
        classId: cls.id,
        studentIds: [s1.id, s2.id],
      });

      const hwRes = await client.post("/api/homeworks", {
        classId: cls.id,
        title: "BTVN Chấm Điểm Hàng Loạt",
        dueDate: "2026-11-30T23:59:59.000Z",
        maxScore: 10,
      });
      const hw = unwrapItem(await hwRes.json(), "homework");

      const gradeRes = await client.post(`/api/homeworks/${hw.id}/submissions`, {
        submissions: [
          {
            studentId: s1.id,
            status: "GRADED",
            score: 9.5,
            feedback: "Trình bày rất rõ ràng, chính xác",
          },
          {
            studentId: s2.id,
            status: "GRADED",
            score: 8.0,
            feedback: "Cần chú ý điều kiện xác định",
          },
        ],
      });
      expect([200, 201]).toContain(gradeRes.status());
      const graded = unwrapList(await gradeRes.json(), "submissions");
      expect(graded.length).toBe(2);
      expect(graded.find((g: any) => g.studentId === s1.id)?.score).toBe(9.5);

      await authenticatePageForTeacher(page, client);
      await page.goto(`${BASE_URL}/homeworks/${hw.id}`);
      await expect(page.locator("body")).toContainText("HS Chấm Điểm 1");
    });
  });

  // ===========================================================================
  // GROUP 8: Exercise Question Bank CRUD, Filtering & Bulk Import (F30–F31)
  // ===========================================================================
  test.describe("Group 8: Exercise Question Bank CRUD, Filtering & Bulk Import (F30–F31)", () => {
    test("T1-G08-01 (F30): Create ExerciseQuestions across all 4 types (MULTIPLE_CHOICE, FILL_IN_BLANK, SHORT_ANSWER, ESSAY)", async ({
      request,
    }) => {
      const client = await registerAndLoginTeacher(request);

      const mcq = await client.post("/api/questions", {
        type: "MULTIPLE_CHOICE",
        subject: "Toán",
        topic: "Đại số",
        difficulty: "EASY",
        prompt: "Nghiệm của phương trình 2x - 6 = 0 là?",
        optionsJson: [
          { id: "A", text: "x = 2" },
          { id: "B", text: "x = 3" },
          { id: "C", text: "x = -3" },
        ],
        correctAnswer: "B",
        explanation: "2x = 6 => x = 3",
        points: 10,
        tagsJson: ["dai-so", "pt-bac-nhat"],
      });
      expect(mcq.status()).toBe(201);

      const fib = await client.post("/api/questions", {
        type: "FILL_IN_BLANK",
        subject: "Tiếng Anh",
        topic: "Grammar",
        difficulty: "MEDIUM",
        prompt: "She ___ to school every day.",
        correctAnswer: "goes",
        points: 10,
        tagsJson: ["present-simple"],
      });
      expect(fib.status()).toBe(201);

      const sa = await client.post("/api/questions", {
        type: "SHORT_ANSWER",
        subject: "Vật Lý",
        topic: "Động lực học",
        difficulty: "HARD",
        prompt: "Đơn vị đo lực trong hệ SI là gì?",
        correctAnswer: "Newton",
        points: 15,
      });
      expect(sa.status()).toBe(201);

      const essay = await client.post("/api/questions", {
        type: "ESSAY",
        subject: "Ngữ Văn",
        topic: "Nghị luận xã hội",
        difficulty: "HARD",
        prompt: "Viết đoạn văn 200 chữ về tinh thần tự học.",
        correctAnswer: "Đảm bảo cấu trúc đoạn văn, nêu bật ý nghĩa tự học.",
        points: 20,
      });
      expect(essay.status()).toBe(201);
    });

    test("T1-G08-02 (F30): Edit and delete ExerciseQuestion in the question bank", async ({
      request,
    }) => {
      const client = await registerAndLoginTeacher(request);
      const createRes = await client.post("/api/questions", {
        type: "SHORT_ANSWER",
        subject: "Hoá Học",
        topic: "Bảng tuần hoàn",
        difficulty: "EASY",
        prompt: "Ký hiệu hoá học của Sắt là gì?",
        correctAnswer: "Fe",
        points: 10,
      });
      const q = unwrapItem(await createRes.json(), "question");

      const patchRes = await client.patch(`/api/questions/${q.id}`, {
        prompt: "Ký hiệu hoá học của nguyên tố Sắt (Iron) là gì?",
        points: 15,
        difficulty: "MEDIUM",
      });
      expect(patchRes.status()).toBe(200);
      const updated = unwrapItem(await patchRes.json(), "question");
      expect(updated.points).toBe(15);
      expect(updated.difficulty).toBe("MEDIUM");

      const delRes = await client.delete(`/api/questions/${q.id}`);
      expect(delRes.status()).toBe(200);
    });

    test("T1-G08-03 (F31): Filter Question Bank by subject, topic, difficulty, and type", async ({
      request,
    }) => {
      const client = await registerAndLoginTeacher(request);
      await client.post("/api/questions", {
        type: "MULTIPLE_CHOICE",
        subject: "Toán Học",
        topic: "Hình Học",
        difficulty: "HARD",
        prompt: "Tổng 3 góc trong tam giác bằng bao nhiêu độ?",
        optionsJson: [
          { id: "A", text: "90" },
          { id: "B", text: "180" },
        ],
        correctAnswer: "B",
      });
      await client.post("/api/questions", {
        type: "SHORT_ANSWER",
        subject: "Sinh Học",
        topic: "Tế Bào",
        difficulty: "EASY",
        prompt: "Bào quan nào là nhà máy năng lượng của tế bào?",
        correctAnswer: "Ti thể",
      });

      const filterRes = await client.get("/api/questions", {
        subject: "Toán Học",
        difficulty: "HARD",
        type: "MULTIPLE_CHOICE",
      });
      expect(filterRes.status()).toBe(200);
      const filtered = unwrapList(await filterRes.json(), "questions");
      expect(filtered.length).toBe(1);
      expect(filtered[0].topic).toBe("Hình Học");
    });

    test("T1-G08-04 (F31): Filter Question Bank by tag and keyword search query (q)", async ({
      request,
    }) => {
      const client = await registerAndLoginTeacher(request);
      await client.post("/api/questions", {
        type: "SHORT_ANSWER",
        subject: "Vật Lý",
        topic: "Quang học",
        difficulty: "MEDIUM",
        prompt: "Hiện tượng khúc xạ ánh sáng xảy ra tại mặt phân cách hai môi trường",
        correctAnswer: "Khúc xạ",
        tagsJson: ["quang-hoc-9", "khuc-xa"],
      });

      const byTagRes = await client.get("/api/questions", {
        tag: "khuc-xa",
      });
      expect(byTagRes.status()).toBe(200);
      expect(unwrapList(await byTagRes.json(), "questions").length).toBe(1);

      const byQueryRes = await client.get("/api/questions", {
        q: "khúc xạ ánh sáng",
      });
      expect(byQueryRes.status()).toBe(200);
      expect(unwrapList(await byQueryRes.json(), "questions").length).toBe(1);
    });

    test("T1-G08-05 (F31): Transactional bulk import of ExerciseQuestions & /questions UI rendering", async ({
      request,
      page,
    }) => {
      const client = await registerAndLoginTeacher(request);
      const bulkRes = await client.post("/api/questions", {
        bulk: true,
        questions: [
          {
            type: "MULTIPLE_CHOICE",
            subject: "Toán",
            topic: "Căn bậc hai",
            difficulty: "EASY",
            prompt: "Căn bậc hai số học của 16 là?",
            optionsJson: [
              { id: "A", text: "4" },
              { id: "B", text: "-4" },
            ],
            correctAnswer: "A",
            points: 10,
          },
          {
            type: "FILL_IN_BLANK",
            subject: "Toán",
            topic: "Căn bậc hai",
            difficulty: "MEDIUM",
            prompt: "Căn bậc hai số học của 81 là ___",
            correctAnswer: "9",
            points: 10,
          },
        ],
      });
      expect(bulkRes.status()).toBe(201);
      const bulkBody = await bulkRes.json();
      expect(bulkBody.createdCount).toBe(2);

      await authenticatePageForTeacher(page, client);
      await page.goto(`${BASE_URL}/questions`);
      await expect(page.locator("body")).toContainText("Căn bậc hai số học của 16");
    });
  });

  // ===========================================================================
  // GROUP 9: Minigame Bank (5 Archetypes), Live Game Hosting & Results (F32–F34)
  // ===========================================================================
  test.describe("Group 9: Minigame Bank (5 Archetypes), Live Game Hosting & Results (F32–F34)", () => {
    test("T1-G09-01 (F32): Create Minigame templates across all 5 archetypes (SPEED_QUIZ, FLASH_MATCH, WORD_CROSS, TEAM_BUZZER, LUCKY_WHEEL)", async ({
      request,
    }) => {
      const client = await registerAndLoginTeacher(request);
      const qRes = await client.post("/api/questions", {
        type: "MULTIPLE_CHOICE",
        subject: "Toán",
        topic: "Tổng hợp",
        difficulty: "EASY",
        prompt: "5 + 7 = ?",
        optionsJson: [
          { id: "A", text: "11" },
          { id: "B", text: "12" },
        ],
        correctAnswer: "B",
      });
      const q = unwrapItem(await qRes.json(), "question");

      const archetypes = [
        "SPEED_QUIZ",
        "FLASH_MATCH",
        "WORD_CROSS",
        "TEAM_BUZZER",
        "LUCKY_WHEEL",
      ] as const;

      for (const type of archetypes) {
        const mgRes = await client.post("/api/minigames", {
          title: `Minigame ${type}`,
          type,
          description: `Mô tả game ${type}`,
          timeLimit: 30,
          pointsPerQuestion: 100,
          questionIdsJson: [q.id],
          rulesJson: { streakBonus: true, wheelSegments: [50, 100, 200] },
        });
        expect(mgRes.status(), `Failed creating archetype ${type}`).toBe(201);
        const mg = unwrapItem(await mgRes.json(), "minigame");
        expect(mg.type).toBe(type);
      }
    });

    test("T1-G09-02 (F32): List, filter, update, and delete Minigame templates + /minigames UI", async ({
      request,
      page,
    }) => {
      const client = await registerAndLoginTeacher(request);
      const mgRes = await client.post("/api/minigames", {
        title: "Đấu Trường Tốc Độ 9A",
        type: "SPEED_QUIZ",
        timeLimit: 25,
        pointsPerQuestion: 150,
      });
      const mg = unwrapItem(await mgRes.json(), "minigame");

      const listRes = await client.get("/api/minigames", { type: "SPEED_QUIZ" });
      expect(listRes.status()).toBe(200);
      expect(
        unwrapList(await listRes.json(), "minigames").some((m: any) => m.id === mg.id)
      ).toBe(true);

      const patchRes = await client.patch(`/api/minigames/${mg.id}`, {
        title: "Đấu Trường Tốc Độ 9A (Siêu Cấp)",
        pointsPerQuestion: 200,
      });
      expect(patchRes.status()).toBe(200);

      await authenticatePageForTeacher(page, client);
      await page.goto(`${BASE_URL}/minigames`);
      await expect(page.locator("body")).toContainText(
        "Đấu Trường Tốc Độ 9A (Siêu Cấp)"
      );

      const delRes = await client.delete(`/api/minigames/${mg.id}`);
      expect(delRes.status()).toBe(200);
    });

    test("T1-G09-03 (F33): Launch live GameSession in INDIVIDUAL mode snapshots questions and initializes state", async ({
      request,
    }) => {
      const client = await registerAndLoginTeacher(request);
      const cls = await createTestClass(client);
      const s1 = await createTestStudent(client);
      await client.post("/api/enrollments", {
        classId: cls.id,
        studentId: s1.id,
      });

      const qRes = await client.post("/api/questions", {
        type: "MULTIPLE_CHOICE",
        subject: "Toán",
        topic: "Số học",
        difficulty: "EASY",
        prompt: "10 * 10 = ?",
        optionsJson: [
          { id: "A", text: "100" },
          { id: "B", text: "1000" },
        ],
        correctAnswer: "A",
      });
      const q = unwrapItem(await qRes.json(), "question");

      const mgRes = await client.post("/api/minigames", {
        title: "Quiz Nhanh Đầu Giờ",
        type: "SPEED_QUIZ",
        timeLimit: 20,
        pointsPerQuestion: 100,
        questionIdsJson: [q.id],
      });
      const mg = unwrapItem(await mgRes.json(), "minigame");

      const gsRes = await client.post("/api/game-sessions", {
        classId: cls.id,
        minigameId: mg.id,
        title: "Phiên Chơi Cá Nhân 1",
        mode: "INDIVIDUAL",
      });
      expect(gsRes.status()).toBe(201);
      const gs = unwrapItem(await gsRes.json(), "gameSession");
      expect(gs.id).toBeTruthy();
      expect(gs.mode).toBe("INDIVIDUAL");
      expect(Array.isArray(gs.questionsSnapshotJson)).toBe(true);
      expect(gs.questionsSnapshotJson.length).toBe(1);
    });

    test("T1-G09-04 (F33): Interactive Classroom Projector Stage updates stateJson & renders /minigames/play/[gameSessionId]", async ({
      request,
      page,
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
        subject: "Toán",
        topic: "Nhẩm nhanh",
        difficulty: "EASY",
        prompt: "12 x 12 = ?",
        correctAnswer: "144",
      });
      const q = unwrapItem(await qRes.json(), "question");

      const mgRes = await client.post("/api/minigames", {
        title: "Vòng Quay May Mắn Toán",
        type: "LUCKY_WHEEL",
        timeLimit: 30,
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

      const patchStateRes = await client.patch(`/api/game-sessions/${gs.id}`, {
        stateJson: {
          currentQuestionIndex: 0,
          answerRevealed: true,
          liveScores: { [stu.id]: 150 },
        },
      });
      expect(patchStateRes.status()).toBe(200);

      await authenticatePageForTeacher(page, client);
      await page.goto(`${BASE_URL}/minigames/play/${gs.id}`);
      await expect(page.locator("body")).toContainText(/Vòng Quay May Mắn Toán|12 x 12/i);
    });

    test("T1-G09-05 (F34): Finalize INDIVIDUAL GameSession persists GameResult records with competition rank & accuracy", async ({
      request,
    }) => {
      const client = await registerAndLoginTeacher(request);
      const cls = await createTestClass(client);
      const s1 = await createTestStudent(client, { fullName: "Quán Quân Game" });
      const s2 = await createTestStudent(client, { fullName: "Á Quân Game" });
      await client.post("/api/enrollments", {
        classId: cls.id,
        studentIds: [s1.id, s2.id],
      });

      const qRes = await client.post("/api/questions", {
        type: "SHORT_ANSWER",
        subject: "Toán",
        topic: "Đố vui",
        difficulty: "EASY",
        prompt: "Số nguyên tố chẵn duy nhất?",
        correctAnswer: "2",
      });
      const q = unwrapItem(await qRes.json(), "question");

      const mgRes = await client.post("/api/minigames", {
        title: "Game Xếp Hạng Cá Nhân",
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

      const finishRes = await client.patch(`/api/game-sessions/${gs.id}`, {
        status: "COMPLETED",
        results: [
          {
            studentId: s1.id,
            score: 300,
            correctCount: 3,
            totalQuestions: 3,
            accuracy: 100,
            bonusPoints: 50,
          },
          {
            studentId: s2.id,
            score: 200,
            correctCount: 2,
            totalQuestions: 3,
            accuracy: 66.7,
            bonusPoints: 0,
          },
        ],
      });
      expect(finishRes.status()).toBe(200);
      const finishBody = await finishRes.json();
      const results = unwrapList(finishBody, "results");
      expect(results.length).toBe(2);
      const r1 = results.find((r: any) => r.studentId === s1.id);
      const r2 = results.find((r: any) => r.studentId === s2.id);
      expect(r1.rank).toBe(1);
      expect(r2.rank).toBe(2);
    });

    test("T1-G09-06 (F33, F34): Launch & finalize TEAM mode GameSession propagates team scores to all team members", async ({
      request,
    }) => {
      const client = await registerAndLoginTeacher(request);
      const cls = await createTestClass(client);
      const s1 = await createTestStudent(client, { fullName: "Rồng Xanh 1" });
      const s2 = await createTestStudent(client, { fullName: "Rồng Xanh 2" });
      const s3 = await createTestStudent(client, { fullName: "Hổ Trắng 1" });
      await client.post("/api/enrollments", {
        classId: cls.id,
        studentIds: [s1.id, s2.id, s3.id],
      });

      const qRes = await client.post("/api/questions", {
        type: "SHORT_ANSWER",
        subject: "Vật Lý",
        topic: "Cơ học",
        difficulty: "EASY",
        prompt: "Vận tốc ánh sáng trong chân không xấp xỉ bao nhiêu km/s?",
        correctAnswer: "300000",
      });
      const q = unwrapItem(await qRes.json(), "question");

      const mgRes = await client.post("/api/minigames", {
        title: "Ai Nhanh Hơn Theo Đội",
        type: "TEAM_BUZZER",
        timeLimit: 30,
        pointsPerQuestion: 150,
        questionIdsJson: [q.id],
      });
      const mg = unwrapItem(await mgRes.json(), "minigame");

      const gsRes = await client.post("/api/game-sessions", {
        classId: cls.id,
        minigameId: mg.id,
        mode: "TEAM",
        teamsConfigJson: [
          { name: "Đội Rồng Xanh", studentIds: [s1.id, s2.id] },
          { name: "Đội Hổ Trắng", studentIds: [s3.id] },
        ],
      });
      expect(gsRes.status()).toBe(201);
      const gs = unwrapItem(await gsRes.json(), "gameSession");

      const finishRes = await client.patch(`/api/game-sessions/${gs.id}`, {
        status: "COMPLETED",
        teamResults: [
          {
            teamName: "Đội Rồng Xanh",
            studentIds: [s1.id, s2.id],
            score: 450,
            correctCount: 3,
            totalQuestions: 3,
            bonusPoints: 0,
          },
          {
            teamName: "Đội Hổ Trắng",
            studentIds: [s3.id],
            score: 150,
            correctCount: 1,
            totalQuestions: 3,
            bonusPoints: 0,
          },
        ],
        results: [
          {
            studentId: s1.id,
            teamName: "Đội Rồng Xanh",
            score: 450,
            correctCount: 3,
            totalQuestions: 3,
            accuracy: 100,
          },
          {
            studentId: s2.id,
            teamName: "Đội Rồng Xanh",
            score: 450,
            correctCount: 3,
            totalQuestions: 3,
            accuracy: 100,
          },
          {
            studentId: s3.id,
            teamName: "Đội Hổ Trắng",
            score: 150,
            correctCount: 1,
            totalQuestions: 3,
            accuracy: 33.3,
          },
        ],
      });
      expect(finishRes.status()).toBe(200);
      const results = unwrapList(await finishRes.json(), "results");
      expect(results.length).toBe(3);
      const member1 = results.find((r: any) => r.studentId === s1.id);
      const member2 = results.find((r: any) => r.studentId === s2.id);
      expect(member1.score).toBe(450);
      expect(member2.score).toBe(450);
      expect(member1.rank).toBe(1);
      expect(member2.rank).toBe(1);
    });
  });

  // ===========================================================================
  // GROUP 10: Custom Criteria Leaderboard, Bonus Points & Ranking (F35–F37)
  // ===========================================================================
  test.describe("Group 10: Custom Criteria Leaderboard Configs, Bonus Points & Ranking (F35–F37)", () => {
    test("T1-G10-01 (F35): Create, list, update, and delete custom LeaderboardConfig weight presets", async ({
      request,
    }) => {
      const client = await registerAndLoginTeacher(request);
      const cls = await createTestClass(client);

      const createRes = await client.post("/api/leaderboards/configs", {
        name: "Xếp Hạng Chuyên Cần & BTVN Tháng 11",
        classId: cls.id,
        attendanceWeight: 30,
        homeworkWeight: 40,
        gameWeight: 20,
        bonusWeight: 10,
        isDefault: true,
      });
      expect(createRes.status()).toBe(201);
      const cfg = unwrapItem(await createRes.json(), "config");
      expect(cfg.id).toBeTruthy();
      expect(cfg.homeworkWeight).toBe(40);

      const listRes = await client.get("/api/leaderboards/configs");
      expect(listRes.status()).toBe(200);
      const configs = unwrapList(await listRes.json(), "configs");
      expect(configs.some((c: any) => c.id === cfg.id)).toBe(true);

      const patchRes = await client.patch(
        `/api/leaderboards/configs/${cfg.id}`,
        {
          attendanceWeight: 25,
          homeworkWeight: 35,
          gameWeight: 25,
          bonusWeight: 15,
        }
      );
      expect(patchRes.status()).toBe(200);

      const delRes = await client.delete(`/api/leaderboards/configs/${cfg.id}`);
      expect(delRes.status()).toBe(200);
    });

    test("T1-G10-02 (F36): Award manual positive BONUS and negative PENALTY PointTransactions to students", async ({
      request,
    }) => {
      const client = await registerAndLoginTeacher(request);
      const cls = await createTestClass(client);
      const stu = await createTestStudent(client);
      await client.post("/api/enrollments", {
        classId: cls.id,
        studentId: stu.id,
      });

      const bonusRes = await client.post("/api/points", {
        studentIds: [stu.id],
        classId: cls.id,
        points: 20,
        reason: "Phát biểu xây dựng bài xuất sắc",
        category: "BONUS",
      });
      expect(bonusRes.status()).toBe(201);

      const penaltyRes = await client.post("/api/points", {
        studentIds: [stu.id],
        classId: cls.id,
        points: -5,
        reason: "Quên mang sách bài tập",
        category: "PENALTY",
      });
      expect(penaltyRes.status()).toBe(201);

      const listRes = await client.get("/api/points", {
        studentId: stu.id,
      });
      expect(listRes.status()).toBe(200);
      const txList = unwrapList(await listRes.json(), "transactions");
      expect(txList.length).toBe(2);
    });

    test("T1-G10-03 (F37): Dynamic Multi-Criteria Leaderboard computes accurate component & weighted composite scores", async ({
      request,
    }) => {
      const client = await registerAndLoginTeacher(request);
      const cls = await createTestClass(client);
      const sTop = await createTestStudent(client, { fullName: "Nguyễn Nhất Bảng" });
      const sSecond = await createTestStudent(client, { fullName: "Lê Nhì Bảng" });
      await client.post("/api/enrollments", {
        classId: cls.id,
        studentIds: [sTop.id, sSecond.id],
      });

      // 1. Attendance: sTop = PRESENT (100), sSecond = ABSENT_UNEXCUSED (0)
      const sessRes = await client.post("/api/sessions", {
        classId: cls.id,
        sessionDate: "2026-11-10",
        startTime: "18:00",
        endTime: "19:30",
      });
      const session = unwrapItem(await sessRes.json(), "session");
      await client.post(`/api/sessions/${session.id}/attendance`, {
        studentId: sTop.id,
        status: "PRESENT",
      });
      await client.post(`/api/sessions/${session.id}/attendance`, {
        studentId: sSecond.id,
        status: "ABSENT_UNEXCUSED",
      });

      // 2. Homework: sTop = 10/10 (100), sSecond = 5/10 (50)
      const hwRes = await client.post("/api/homeworks", {
        classId: cls.id,
        title: "BTVN Tính Bảng Xếp Hạng",
        dueDate: "2026-11-15T23:59:59.000Z",
        maxScore: 10,
      });
      const hw = unwrapItem(await hwRes.json(), "homework");
      await client.post(`/api/homeworks/${hw.id}/submissions`, {
        submissions: [
          { studentId: sTop.id, status: "GRADED", score: 10 },
          { studentId: sSecond.id, status: "GRADED", score: 5 },
        ],
      });

      // 3. Bonus points: sTop = +50
      await client.post("/api/points", {
        studentIds: [sTop.id],
        classId: cls.id,
        points: 50,
        reason: "Giải bài khó",
      });

      const lbRes = await client.get("/api/leaderboards", {
        classId: cls.id,
        attendanceWeight: 25,
        homeworkWeight: 35,
        gameWeight: 25,
        bonusWeight: 15,
      });
      expect(lbRes.status()).toBe(200);
      const lb = await lbRes.json();
      const rankings = unwrapList(lb, "rankings");
      expect(rankings.length).toBe(2);
      expect(rankings[0].student.id).toBe(sTop.id);
      expect(rankings[0].rank).toBe(1);
      expect(rankings[0].totalScore).toBeGreaterThan(rankings[1].totalScore);
    });

    test("T1-G10-04 (F37): Filter Leaderboard by classId, date range (from/to), and dynamic weight overrides", async ({
      request,
    }) => {
      const client = await registerAndLoginTeacher(request);
      const cls = await createTestClass(client);
      const stu = await createTestStudent(client);
      await client.post("/api/enrollments", {
        classId: cls.id,
        studentId: stu.id,
      });

      const lbRes = await client.get("/api/leaderboards", {
        classId: cls.id,
        from: "2026-11-01",
        to: "2026-11-30",
        attendanceWeight: 50,
        homeworkWeight: 50,
        gameWeight: 0,
        bonusWeight: 0,
      });
      expect(lbRes.status()).toBe(200);
      const lb = await lbRes.json();
      expect(Array.isArray(lb.rankings)).toBe(true);
      expect(lb.rankings.length).toBe(1);
    });

    test("T1-G10-05 (F37): Render /leaderboard UI with Top-3 Podium and ranked breakdown table", async ({
      request,
      page,
    }) => {
      const client = await registerAndLoginTeacher(request);
      const cls = await createTestClass(client);
      const s1 = await createTestStudent(client, { fullName: "Hạng Nhất Podium" });
      const s2 = await createTestStudent(client, { fullName: "Hạng Nhì Podium" });
      const s3 = await createTestStudent(client, { fullName: "Hạng Ba Podium" });
      await client.post("/api/enrollments", {
        classId: cls.id,
        studentIds: [s1.id, s2.id, s3.id],
      });

      await client.post("/api/points", {
        studentIds: [s1.id],
        classId: cls.id,
        points: 80,
        reason: "Top 1",
      });
      await client.post("/api/points", {
        studentIds: [s2.id],
        classId: cls.id,
        points: 50,
        reason: "Top 2",
      });

      await authenticatePageForTeacher(page, client);
      await page.goto(`${BASE_URL}/leaderboard`);
      await expect(page.locator("body")).toContainText("Hạng Nhất Podium");
      await expect(page.locator("body")).toContainText("Hạng Nhì Podium");
      await expect(page.locator("body")).toContainText("Hạng Ba Podium");
    });
  });
});
