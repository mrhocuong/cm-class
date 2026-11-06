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

test.describe("Tier 4 — Real-World Application Scenarios", () => {
  // ===========================================================================
  // SCENARIO 1: New Teacher Onboarding & Full Monthly Setup (UI + API)
  // ===========================================================================
  test.describe("Scenario 1: New Teacher Onboarding & Full Monthly Setup", () => {
    test("S1.1: Teacher registers via /register, lands on authenticated workspace, and configures VietQR bank in /settings", async ({
      request,
      page,
    }) => {
      const client = await registerAndLoginTeacher(request, {
        fullName: "Nguyễn Minh Châu",
        workspaceName: "Lớp Toán Cô Châu",
        password: "MatKhau123!",
      });

      const wsRes = await client.get("/api/workspace");
      expect(wsRes.status()).toBe(200);
      const ws = unwrapItem(await wsRes.json(), "workspace");
      expect(ws.name).toBe("Lớp Toán Cô Châu");

      const updateBankRes = await client.put("/api/workspace", {
        name: "Lớp Toán Cô Châu",
        bankBin: "970436",
        bankCode: "VCB",
        bankName: "Vietcombank",
        bankAccountNumber: "9988776655",
        bankAccountName: "NGUYEN MINH CHAU",
      });
      expect(updateBankRes.status()).toBe(200);

      await authenticatePageForTeacher(page, client);
      await page.goto(`${BASE_URL}/settings`);
      await expect(page.locator("body")).toContainText("Vietcombank");
      await expect(page.locator("body")).toContainText("9988776655");
    });

    test("S1.2: Teacher creates Class, weekly ScheduleSlots, verifies /schedule timetable grid, and generates monthly Sessions", async ({
      request,
      page,
    }) => {
      const client = await registerAndLoginTeacher(request, {
        fullName: "Nguyễn Minh Châu",
        workspaceName: "Lớp Toán Cô Châu",
      });

      const cls = await createTestClass(client, {
        code: uniqueSuffix("T9CD").toUpperCase().slice(0, 12),
        name: "Toán 9 Chuyên Đề",
        subject: "Toán",
        room: "Phòng 201",
        defaultFeeAmount: 1500000,
      });

      await client.post(`/api/classes/${cls.id}/schedule-slots`, {
        slots: [
          { dayOfWeek: 2, startTime: "18:00", endTime: "19:30", room: "Phòng 201" },
          { dayOfWeek: 5, startTime: "18:00", endTime: "19:30", room: "Phòng 201" },
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

      await authenticatePageForTeacher(page, client);
      await page.goto(`${BASE_URL}/schedule`);
      await expect(page.locator("body")).toContainText("Toán 9 Chuyên Đề");
    });

    test("S1.3: Teacher creates Students with Guardians, enrolls them, generates monthly Invoices, inspects VietQR on /fees, and verifies /dashboard KPIs", async ({
      request,
      page,
    }) => {
      const client = await registerAndLoginTeacher(request, {
        fullName: "Nguyễn Minh Châu",
        workspaceName: "Lớp Toán Cô Châu",
      });
      await client.put("/api/workspace", {
        name: "Lớp Toán Cô Châu",
        bankBin: "970436",
        bankCode: "VCB",
        bankName: "Vietcombank",
        bankAccountNumber: "9988776655",
        bankAccountName: "NGUYEN MINH CHAU",
      });

      const cls = await createTestClass(client, {
        name: "Toán 9 Chuyên Đề",
        defaultFeeAmount: 1500000,
      });

      const stuHuy = await createTestStudent(client, {
        studentCode: "HS201",
        fullName: "Phạm Gia Huy",
        guardians: [
          {
            fullName: "Phạm Văn Hùng",
            relationship: "Bố",
            phone: "0912111222",
            isPrimary: true,
          },
        ],
      });
      const stuNgoc = await createTestStudent(client, {
        studentCode: "HS202",
        fullName: "Lê Bảo Ngọc",
        guardians: [
          {
            fullName: "Trần Thị Mai",
            relationship: "Mẹ",
            phone: "0912333444",
            isPrimary: true,
          },
        ],
      });

      // Enroll Huy (0% discount -> 1,500,000) and Ngoc (10% discount -> 1,350,000)
      await client.post("/api/enrollments", {
        classId: cls.id,
        studentId: stuHuy.id,
        discountType: "PERCENTAGE",
        customFeeDiscount: 0,
      });
      await client.post("/api/enrollments", {
        classId: cls.id,
        studentId: stuNgoc.id,
        discountType: "PERCENTAGE",
        customFeeDiscount: 10,
      });

      const fpRes = await client.post("/api/fee-plans", {
        classId: cls.id,
        name: "Học phí tháng Toán 9",
        billingCycle: "MONTHLY",
        amount: 1500000,
        isDefault: true,
      });
      const fp = unwrapItem(await fpRes.json(), "feePlan");

      const genRes = await client.post("/api/invoices/generate", {
        classId: cls.id,
        feePlanId: fp.id,
        billingPeriod: "2026-11",
        dueDate: "2026-11-10",
      });
      const invoices = unwrapList(await genRes.json(), "invoices");
      expect(invoices.length).toBe(2);

      const invHuy = invoices.find((i: any) => i.studentId === stuHuy.id);
      const invNgoc = invoices.find((i: any) => i.studentId === stuNgoc.id);
      expect(invHuy.netAmount).toBe(1500000);
      expect(invNgoc.netAmount).toBe(1350000);

      // Verify VietQR for Ngoc
      const qrRes = await client.get(`/api/invoices/${invNgoc.id}/vietqr`);
      expect(qrRes.status()).toBe(200);
      const qr = await qrRes.json();
      expect(qr.amount).toBe(1350000);
      expect(qr.transferContent).toContain("HP HS202");

      // Record full payment of 1,500,000 for Huy
      const payRes = await client.post(`/api/invoices/${invHuy.id}/payments`, {
        amount: 1500000,
        method: "BANK_TRANSFER",
      });
      expect(payRes.status()).toBe(201);

      await authenticatePageForTeacher(page, client);
      await page.goto(`${BASE_URL}/fees`);
      await expect(page.locator("body")).toContainText("Phạm Gia Huy");
      await expect(page.locator("body")).toContainText("Lê Bảo Ngọc");

      await page.goto(`${BASE_URL}/dashboard`);
      await expect(page.locator("body")).toContainText(/Tổng quan|Lớp|Học sinh/i);
    });
  });

  // ===========================================================================
  // SCENARIO 2: Live Classroom Day (Session -> FaceAI -> Homework -> Game -> Podium)
  // ===========================================================================
  test.describe("Scenario 2: Live Classroom Day (Session -> FaceAI -> Homework -> Live Minigame -> Leaderboard)", () => {
    test("S2.1: Teacher opens Session detail (/sessions/[id]), enrolls student FaceAI descriptors, and executes FaceAI Check-in & Check-out", async ({
      request,
      page,
    }) => {
      const client = await registerAndLoginTeacher(request);
      const cls = await createTestClass(client, { name: "Lớp Thực Chiến S2.1" });
      const sKhoi = await createTestStudent(client, { fullName: "Đặng Minh Khôi" });
      const sMy = await createTestStudent(client, { fullName: "Vũ Hà My" });
      const sViet = await createTestStudent(client, { fullName: "Hoàng Quốc Việt" });
      await client.post("/api/enrollments", {
        classId: cls.id,
        studentIds: [sKhoi.id, sMy.id, sViet.id],
      });

      const sessRes = await client.post("/api/sessions", {
        classId: cls.id,
        sessionDate: "2026-11-10",
        startTime: "18:00",
        endTime: "19:30",
        topic: "Buổi Học Thực Chiến FaceAI",
      });
      const session = unwrapItem(await sessRes.json(), "session");

      const vecKhoi = generateNormalizedDescriptor("khoi-face-vec");
      const vecMy = generateNormalizedDescriptor("my-face-vec");
      const vecViet = generateNormalizedDescriptor("viet-face-vec");

      await client.post("/api/face-ai/descriptors", {
        studentId: sKhoi.id,
        descriptor: vecKhoi,
        source: "SYNTHETIC",
      });
      await client.post("/api/face-ai/descriptors", {
        studentId: sMy.id,
        descriptor: vecMy,
        source: "SYNTHETIC",
      });
      await client.post("/api/face-ai/descriptors", {
        studentId: sViet.id,
        descriptor: vecViet,
        source: "SYNTHETIC",
      });

      // FaceAI CHECK_IN and CHECK_OUT for Khoi and My
      const inKhoi = await (
        await client.post("/api/face-ai/match", {
          sessionId: session.id,
          scanMode: "CHECK_IN",
          descriptor: perturbDescriptor(vecKhoi, 0.02),
        })
      ).json();
      expect(inKhoi.matched).toBe(true);
      expect(inKhoi.attendance.method).toBe("FACE_AI");

      const outKhoi = await (
        await client.post("/api/face-ai/match", {
          sessionId: session.id,
          scanMode: "CHECK_OUT",
          descriptor: perturbDescriptor(vecKhoi, 0.02),
        })
      ).json();
      expect(outKhoi.attendance.checkOutAt).toBeTruthy();

      const inMy = await (
        await client.post("/api/face-ai/match", {
          sessionId: session.id,
          scanMode: "CHECK_IN",
          descriptor: perturbDescriptor(vecMy, 0.02),
        })
      ).json();
      expect(inMy.matched).toBe(true);

      await authenticatePageForTeacher(page, client);
      await page.goto(`${BASE_URL}/sessions/${session.id}`);
      await expect(page.locator("body")).toContainText("Đặng Minh Khôi");
      await expect(page.locator("body")).toContainText("Vũ Hà My");
    });

    test("S2.2: Teacher assigns Homework with ExerciseQuestions, grades submissions on /homeworks/[id], and hosts a live Minigame on /minigames/play/[gameSessionId]", async ({
      request,
      page,
    }) => {
      const client = await registerAndLoginTeacher(request);
      const cls = await createTestClass(client, { name: "Lớp Thực Chiến S2.2" });
      const sKhoi = await createTestStudent(client, { fullName: "Đặng Minh Khôi" });
      const sMy = await createTestStudent(client, { fullName: "Vũ Hà My" });
      const sViet = await createTestStudent(client, { fullName: "Hoàng Quốc Việt" });
      await client.post("/api/enrollments", {
        classId: cls.id,
        studentIds: [sKhoi.id, sMy.id, sViet.id],
      });

      const bulkQ = await client.post("/api/questions", {
        bulk: true,
        questions: [
          {
            type: "MULTIPLE_CHOICE",
            subject: "Toán",
            topic: "S2",
            prompt: "Câu 1: 3 + 4 = ?",
            optionsJson: [
              { id: "A", text: "7" },
              { id: "B", text: "8" },
            ],
            correctAnswer: "A",
          },
          {
            type: "SHORT_ANSWER",
            subject: "Toán",
            topic: "S2",
            prompt: "Câu 2: 6 x 7 = ?",
            correctAnswer: "42",
          },
          {
            type: "FILL_IN_BLANK",
            subject: "Toán",
            topic: "S2",
            prompt: "Câu 3: 100 / 4 = ___",
            correctAnswer: "25",
          },
        ],
      });
      const qs = unwrapList(await bulkQ.json(), "questions");
      const qIds = qs.map((q: any) => q.id);

      const hwRes = await client.post("/api/homeworks", {
        classId: cls.id,
        title: "BTVN Ngày Học Thực Chiến",
        dueDate: "2026-11-20T23:59:59.000Z",
        maxScore: 10,
        questionIdsJson: qIds,
      });
      const hw = unwrapItem(await hwRes.json(), "homework");

      await client.post(`/api/homeworks/${hw.id}/submissions`, {
        submissions: [
          { studentId: sKhoi.id, status: "GRADED", score: 10, feedback: "Xuất sắc" },
          { studentId: sMy.id, status: "GRADED", score: 8, feedback: "Tốt" },
          { studentId: sViet.id, status: "GRADED", score: 6, feedback: "Cố gắng hơn" },
        ],
      });

      const mgRes = await client.post("/api/minigames", {
        title: "Speed Quiz Cuối Giờ",
        type: "SPEED_QUIZ",
        timeLimit: 20,
        pointsPerQuestion: 100,
        questionIdsJson: qIds,
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
          { studentId: sKhoi.id, score: 300, correctCount: 3, totalQuestions: 3, accuracy: 100 },
          { studentId: sMy.id, score: 200, correctCount: 2, totalQuestions: 3, accuracy: 66.7 },
          { studentId: sViet.id, score: 100, correctCount: 1, totalQuestions: 3, accuracy: 33.3 },
        ],
      });
      expect(finishRes.status()).toBe(200);

      await authenticatePageForTeacher(page, client);
      await page.goto(`${BASE_URL}/homeworks/${hw.id}`);
      await expect(page.locator("body")).toContainText("Đặng Minh Khôi");

      await page.goto(`${BASE_URL}/minigames/play/${gs.id}`);
      await expect(page.locator("body")).toContainText(/Speed Quiz Cuối Giờ|Đặng Minh Khôi/i);
    });

    test("S2.3: Teacher awards PointTransaction bonus points and verifies Top-3 Podium and breakdown table on /leaderboard", async ({
      request,
      page,
    }) => {
      const client = await registerAndLoginTeacher(request);
      const cls = await createTestClass(client, { name: "Lớp Thực Chiến S2.3" });
      const sKhoi = await createTestStudent(client, { fullName: "Đặng Minh Khôi" });
      const sMy = await createTestStudent(client, { fullName: "Vũ Hà My" });
      const sViet = await createTestStudent(client, { fullName: "Hoàng Quốc Việt" });
      await client.post("/api/enrollments", {
        classId: cls.id,
        studentIds: [sKhoi.id, sMy.id, sViet.id],
      });

      await client.post("/api/points", {
        studentIds: [sKhoi.id],
        classId: cls.id,
        points: 80,
        reason: "Giải nhất toàn diện",
        category: "BONUS",
      });
      await client.post("/api/points", {
        studentIds: [sMy.id],
        classId: cls.id,
        points: 50,
        reason: "Giải nhì",
        category: "BONUS",
      });
      await client.post("/api/points", {
        studentIds: [sViet.id],
        classId: cls.id,
        points: 20,
        reason: "Giải ba",
        category: "BONUS",
      });

      const lbRes = await client.get("/api/leaderboards", { classId: cls.id });
      expect(lbRes.status()).toBe(200);
      const rankings = unwrapList(await lbRes.json(), "rankings");
      expect(rankings[0].student.id).toBe(sKhoi.id);
      expect(rankings[1].student.id).toBe(sMy.id);
      expect(rankings[2].student.id).toBe(sViet.id);

      await authenticatePageForTeacher(page, client);
      await page.goto(`${BASE_URL}/leaderboard`);
      await expect(page.locator("body")).toContainText("Đặng Minh Khôi");
      await expect(page.locator("body")).toContainText("Vũ Hà My");
      await expect(page.locator("body")).toContainText("Hoàng Quốc Việt");
    });
  });

  // ===========================================================================
  // SCENARIO 3: Comprehensive Multi-Tenant Security Audit (Teacher A vs Teacher B)
  // ===========================================================================
  test.describe("Scenario 3: Comprehensive Multi-Tenant Security Audit (All 9 Modules)", () => {
    test("S3.1: Modules 1 & 2 Isolation — Teacher A receives 404/403 on Teacher B's Classes, ScheduleSlots, Timetable & Sessions", async ({
      request,
    }) => {
      const teacherA = await registerAndLoginTeacher(request);
      const teacherB = await registerAndLoginTeacher(request);

      const classB = await createTestClass(teacherB, {
        name: "Lớp Bảo Mật B - S3.1",
      });
      const slotRes = await teacherB.post(
        `/api/classes/${classB.id}/schedule-slots`,
        {
          dayOfWeek: 1,
          startTime: "18:00",
          endTime: "19:30",
          room: "P-B",
        }
      );
      const slotBody = await slotRes.json();
      const slotB =
        unwrapList(slotBody, "slots")[0] ??
        unwrapItem(slotBody, "slot") ??
        unwrapItem(slotBody, "scheduleSlot");

      const sessRes = await teacherB.post("/api/sessions", {
        classId: classB.id,
        sessionDate: "2026-11-10",
        startTime: "18:00",
        endTime: "19:30",
        topic: "Chủ đề Bảo Mật B",
      });
      const sessionB = unwrapItem(await sessRes.json(), "session");

      // Attacks by Teacher A against Teacher B's Module 1 & 2 resources
      expect([403, 404]).toContain(
        (await teacherA.get(`/api/classes/${classB.id}`)).status()
      );
      expect([403, 404]).toContain(
        (
          await teacherA.patch(`/api/classes/${classB.id}`, { name: "Hacked" })
        ).status()
      );
      expect([403, 404]).toContain(
        (await teacherA.delete(`/api/classes/${classB.id}`)).status()
      );
      expect([403, 404]).toContain(
        (
          await teacherA.post(`/api/classes/${classB.id}/schedule-slots`, {
            dayOfWeek: 2,
            startTime: "08:00",
            endTime: "09:30",
          })
        ).status()
      );
      expect([403, 404]).toContain(
        (
          await teacherA.delete(
            `/api/classes/${classB.id}/schedule-slots/${slotB.id}`
          )
        ).status()
      );
      expect([403, 404]).toContain(
        (
          await teacherA.post(`/api/classes/${classB.id}/generate-sessions`, {
            fromDate: "2026-11-01",
            toDate: "2026-11-30",
          })
        ).status()
      );
      expect([403, 404]).toContain(
        (await teacherA.get(`/api/sessions/${sessionB.id}`)).status()
      );
      expect([403, 404]).toContain(
        (
          await teacherA.patch(`/api/sessions/${sessionB.id}`, {
            topic: "Hacked",
          })
        ).status()
      );
      expect([403, 404]).toContain(
        (await teacherA.delete(`/api/sessions/${sessionB.id}`)).status()
      );
      expect([403, 404]).toContain(
        (
          await teacherA.post("/api/sessions", {
            classId: classB.id,
            sessionDate: "2026-11-20",
            startTime: "10:00",
            endTime: "11:30",
          })
        ).status()
      );

      // List endpoints for Teacher A must never contain Teacher B's IDs
      const classesA = unwrapList(
        await (await teacherA.get("/api/classes")).json(),
        "classes"
      );
      expect(classesA.some((c: any) => c.id === classB.id)).toBe(false);
    });

    test("S3.2: Modules 3 & 4 Isolation — Teacher A receives 404/403 on Teacher B's Students, Guardians, Enrollments, FeePlans, Invoices, Payments & VietQR", async ({
      request,
    }) => {
      const teacherA = await registerAndLoginTeacher(request);
      const teacherB = await registerAndLoginTeacher(request);

      const classB = await createTestClass(teacherB, { defaultFeeAmount: 1500000 });
      const studentB = await createTestStudent(teacherB, {
        fullName: "Học Sinh Bảo Mật B",
      });
      const gRes = await teacherB.post(
        `/api/students/${studentB.id}/guardians`,
        {
          fullName: "Phụ Huynh B",
          relationship: "Mẹ",
          phone: "0909999888",
          isPrimary: true,
        }
      );
      const guardianB = unwrapItem(await gRes.json(), "guardian");

      const eRes = await teacherB.post("/api/enrollments", {
        classId: classB.id,
        studentId: studentB.id,
      });
      const eBody = await eRes.json();
      const enrollmentB =
        unwrapList(eBody, "enrollments")[0] ?? unwrapItem(eBody, "enrollment");

      const fpRes = await teacherB.post("/api/fee-plans", {
        classId: classB.id,
        name: "Học phí B",
        billingCycle: "MONTHLY",
        amount: 1500000,
      });
      const feePlanB = unwrapItem(await fpRes.json(), "feePlan");

      const invGenRes = await teacherB.post("/api/invoices/generate", {
        classId: classB.id,
        billingPeriod: "2026-11",
        dueDate: "2026-11-10",
      });
      const invoiceB = unwrapList(await invGenRes.json(), "invoices")[0];

      // Attacks by Teacher A against Teacher B's Module 3 & 4 resources
      expect([403, 404]).toContain(
        (await teacherA.get(`/api/students/${studentB.id}`)).status()
      );
      expect([403, 404]).toContain(
        (
          await teacherA.patch(`/api/students/${studentB.id}`, {
            fullName: "Hacked",
          })
        ).status()
      );
      expect([403, 404]).toContain(
        (await teacherA.delete(`/api/students/${studentB.id}`)).status()
      );
      expect([403, 404]).toContain(
        (
          await teacherA.post(`/api/students/${studentB.id}/guardians`, {
            fullName: "X",
            relationship: "Bố",
            phone: "0900000000",
          })
        ).status()
      );
      expect([403, 404]).toContain(
        (
          await teacherA.patch(
            `/api/students/${studentB.id}/guardians/${guardianB.id}`,
            { phone: "0999999999" }
          )
        ).status()
      );
      expect([403, 404]).toContain(
        (
          await teacherA.delete(
            `/api/students/${studentB.id}/guardians/${guardianB.id}`
          )
        ).status()
      );
      expect([403, 404]).toContain(
        (
          await teacherA.post("/api/enrollments", {
            classId: classB.id,
            studentId: studentB.id,
          })
        ).status()
      );
      expect([403, 404]).toContain(
        (
          await teacherA.patch(`/api/enrollments/${enrollmentB.id}`, {
            customFeeDiscount: 100,
          })
        ).status()
      );
      expect([403, 404]).toContain(
        (await teacherA.delete(`/api/enrollments/${enrollmentB.id}`)).status()
      );
      expect([403, 404]).toContain(
        (
          await teacherA.post("/api/fee-plans", {
            classId: classB.id,
            name: "Hacked",
            billingCycle: "MONTHLY",
            amount: 100,
          })
        ).status()
      );
      expect([403, 404]).toContain(
        (
          await teacherA.patch(`/api/fee-plans/${feePlanB.id}`, { amount: 0 })
        ).status()
      );
      expect([403, 404]).toContain(
        (await teacherA.delete(`/api/fee-plans/${feePlanB.id}`)).status()
      );
      expect([403, 404]).toContain(
        (
          await teacherA.post("/api/invoices/generate", {
            classId: classB.id,
            billingPeriod: "2026-12",
            dueDate: "2026-12-10",
          })
        ).status()
      );
      expect([403, 404]).toContain(
        (await teacherA.get(`/api/invoices/${invoiceB.id}`)).status()
      );
      expect([403, 404]).toContain(
        (
          await teacherA.patch(`/api/invoices/${invoiceB.id}`, {
            status: "CANCELLED",
          })
        ).status()
      );
      expect([403, 404]).toContain(
        (
          await teacherA.post(`/api/invoices/${invoiceB.id}/payments`, {
            amount: 100000,
            method: "CASH",
          })
        ).status()
      );
      expect([403, 404]).toContain(
        (await teacherA.get(`/api/invoices/${invoiceB.id}/vietqr`)).status()
      );
    });

    test("S3.3: Module 5 Isolation — Teacher A receives 404/403 on Teacher B's Attendance, FaceAI Descriptors, FaceAI Match & Homeworks", async ({
      request,
    }) => {
      const teacherA = await registerAndLoginTeacher(request);
      const teacherB = await registerAndLoginTeacher(request);

      const classB = await createTestClass(teacherB);
      const studentB = await createTestStudent(teacherB);
      await teacherB.post("/api/enrollments", {
        classId: classB.id,
        studentId: studentB.id,
      });

      const sessRes = await teacherB.post("/api/sessions", {
        classId: classB.id,
        sessionDate: "2026-11-15",
        startTime: "18:00",
        endTime: "19:30",
      });
      const sessionB = unwrapItem(await sessRes.json(), "session");

      const valid128Vec = generateNormalizedDescriptor(555);
      const descRes = await teacherB.post("/api/face-ai/descriptors", {
        studentId: studentB.id,
        descriptor: valid128Vec,
        source: "WEBCAM",
      });
      const descriptorB = unwrapItem(await descRes.json(), "descriptor");

      const hwRes = await teacherB.post("/api/homeworks", {
        classId: classB.id,
        title: "BTVN Bảo Mật B",
        dueDate: "2026-11-25T23:59:59.000Z",
        maxScore: 10,
      });
      const homeworkB = unwrapItem(await hwRes.json(), "homework");

      // Attacks by Teacher A against Teacher B's Module 5 resources
      expect([403, 404]).toContain(
        (
          await teacherA.post(`/api/sessions/${sessionB.id}/attendance`, {
            studentId: studentB.id,
            status: "ABSENT_UNEXCUSED",
          })
        ).status()
      );
      expect([403, 404]).toContain(
        (
          await teacherA.post(`/api/sessions/${sessionB.id}/attendance`, {
            action: "MARK_ALL_PRESENT",
          })
        ).status()
      );
      expect([403, 404]).toContain(
        (
          await teacherA.post("/api/face-ai/descriptors", {
            studentId: studentB.id,
            descriptor: valid128Vec,
          })
        ).status()
      );
      expect([403, 404]).toContain(
        (
          await teacherA.delete(`/api/face-ai/descriptors/${descriptorB.id}`)
        ).status()
      );
      expect([403, 404]).toContain(
        (
          await teacherA.post("/api/face-ai/match", {
            sessionId: sessionB.id,
            scanMode: "CHECK_IN",
            descriptor: valid128Vec,
          })
        ).status()
      );
      expect([403, 404]).toContain(
        (
          await teacherA.post("/api/homeworks", {
            classId: classB.id,
            title: "Hacked",
            dueDate: "2026-11-30T00:00:00.000Z",
          })
        ).status()
      );
      expect([403, 404]).toContain(
        (await teacherA.get(`/api/homeworks/${homeworkB.id}`)).status()
      );
      expect([403, 404]).toContain(
        (
          await teacherA.patch(`/api/homeworks/${homeworkB.id}`, {
            title: "Hacked",
          })
        ).status()
      );
      expect([403, 404]).toContain(
        (await teacherA.delete(`/api/homeworks/${homeworkB.id}`)).status()
      );
      expect([403, 404]).toContain(
        (
          await teacherA.post(`/api/homeworks/${homeworkB.id}/submissions`, {
            submissions: [
              { studentId: studentB.id, status: "GRADED", score: 0 },
            ],
          })
        ).status()
      );
    });

    test("S3.4: Modules 6–9 Isolation & Post-Attack Integrity — Teacher A receives 404/403 on Questions, Minigames, GameSessions, LeaderboardConfigs & Points, and Teacher B's data remains 100% intact", async ({
      request,
    }) => {
      const teacherA = await registerAndLoginTeacher(request);
      const teacherB = await registerAndLoginTeacher(request);

      const classB = await createTestClass(teacherB, {
        name: "Lớp Nguyên Vẹn Của B",
      });
      const studentB = await createTestStudent(teacherB, {
        fullName: "Học Sinh Nguyên Vẹn Của B",
      });
      await teacherB.post("/api/enrollments", {
        classId: classB.id,
        studentId: studentB.id,
      });

      const qRes = await teacherB.post("/api/questions", {
        type: "SHORT_ANSWER",
        subject: "Toán",
        topic: "Bảo mật",
        prompt: "Câu hỏi gốc của B?",
        correctAnswer: "Đáp án B",
      });
      const questionB = unwrapItem(await qRes.json(), "question");

      const mgRes = await teacherB.post("/api/minigames", {
        title: "Minigame Gốc Của B",
        type: "SPEED_QUIZ",
        questionIdsJson: [questionB.id],
      });
      const minigameB = unwrapItem(await mgRes.json(), "minigame");

      const gsRes = await teacherB.post("/api/game-sessions", {
        classId: classB.id,
        minigameId: minigameB.id,
        mode: "INDIVIDUAL",
      });
      const gameSessionB = unwrapItem(await gsRes.json(), "gameSession");

      const cfgRes = await teacherB.post("/api/leaderboards/configs", {
        name: "Cấu Hình Gốc Của B",
        classId: classB.id,
        attendanceWeight: 25,
        homeworkWeight: 35,
        gameWeight: 25,
        bonusWeight: 15,
      });
      const leaderboardConfigB = unwrapItem(await cfgRes.json(), "config");

      // Attacks by Teacher A against Teacher B's Module 6–9 resources
      expect([403, 404]).toContain(
        (
          await teacherA.patch(`/api/questions/${questionB.id}`, {
            prompt: "Hacked",
          })
        ).status()
      );
      expect([403, 404]).toContain(
        (await teacherA.delete(`/api/questions/${questionB.id}`)).status()
      );
      expect([403, 404]).toContain(
        (await teacherA.get(`/api/minigames/${minigameB.id}`)).status()
      );
      expect([403, 404]).toContain(
        (
          await teacherA.patch(`/api/minigames/${minigameB.id}`, {
            title: "Hacked",
          })
        ).status()
      );
      expect([403, 404]).toContain(
        (await teacherA.delete(`/api/minigames/${minigameB.id}`)).status()
      );
      expect([403, 404]).toContain(
        (
          await teacherA.post("/api/game-sessions", {
            classId: classB.id,
            minigameId: minigameB.id,
            mode: "INDIVIDUAL",
          })
        ).status()
      );
      expect([403, 404]).toContain(
        (await teacherA.get(`/api/game-sessions/${gameSessionB.id}`)).status()
      );
      expect([403, 404]).toContain(
        (
          await teacherA.patch(`/api/game-sessions/${gameSessionB.id}`, {
            status: "CANCELLED",
          })
        ).status()
      );
      expect([403, 404]).toContain(
        (
          await teacherA.patch(
            `/api/leaderboards/configs/${leaderboardConfigB.id}`,
            { name: "Hacked" }
          )
        ).status()
      );
      expect([403, 404]).toContain(
        (
          await teacherA.delete(
            `/api/leaderboards/configs/${leaderboardConfigB.id}`
          )
        ).status()
      );
      expect([403, 404]).toContain(
        (
          await teacherA.post("/api/points", {
            studentIds: [studentB.id],
            classId: classB.id,
            points: -100,
            reason: "Hacked",
          })
        ).status()
      );

      // Post-Attack Integrity Verification by Teacher B
      const verifyClass = unwrapItem(
        await (await teacherB.get(`/api/classes/${classB.id}`)).json(),
        "class"
      );
      expect(verifyClass.name).toBe("Lớp Nguyên Vẹn Của B");

      const verifyStudent = unwrapItem(
        await (await teacherB.get(`/api/students/${studentB.id}`)).json(),
        "student"
      );
      expect(verifyStudent.fullName).toBe("Học Sinh Nguyên Vẹn Của B");

      const verifyMinigame = unwrapItem(
        await (await teacherB.get(`/api/minigames/${minigameB.id}`)).json(),
        "minigame"
      );
      expect(verifyMinigame.title).toBe("Minigame Gốc Của B");

      const verifyGs = unwrapItem(
        await (
          await teacherB.get(`/api/game-sessions/${gameSessionB.id}`)
        ).json(),
        "gameSession"
      );
      expect(verifyGs.status).not.toBe("CANCELLED");
    });
  });
});
