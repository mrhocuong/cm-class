import { test, expect } from "@playwright/test";
import {
  createTestClass,
  createTestStudent,
  generateNormalizedDescriptor,
  perturbDescriptor,
  registerAndLoginTeacher,
  uniqueSuffix,
  unwrapItem,
  unwrapList,
} from "./helpers";

test.describe("Tier 3 — Cross-Feature Combinations (Multi-Module Pipelines)", () => {
  // ===========================================================================
  // COMBINATION 1: Class + ScheduleSlot -> Auto-Generate Sessions ->
  //                Manual & FaceAI Attendance -> Leaderboard Attendance Score (S_att)
  // ===========================================================================
  test.describe("Combination 1: Timetable -> Session Generation -> Manual & FaceAI Attendance -> Leaderboard S_att", () => {
    test("C1.1: ScheduleSlot creation + idempotent session generation produces exact session dates", async ({
      request,
    }) => {
      const client = await registerAndLoginTeacher(request);
      const cls = await createTestClass(client, {
        code: uniqueSuffix("C1-M").toUpperCase().slice(0, 12),
        name: "Toán Tổ Hợp 1.1",
        subject: "Toán",
        defaultFeeAmount: 1200000,
        billingCycle: "MONTHLY",
      });

      await client.post(`/api/classes/${cls.id}/schedule-slots`, {
        slots: [
          { dayOfWeek: 1, startTime: "18:00", endTime: "19:30", room: "P101" },
          { dayOfWeek: 3, startTime: "18:00", endTime: "19:30", room: "P101" },
        ],
      });

      // 2-week window: 2026-11-02 (Mon) to 2026-11-15 (Sun) -> 2026-11-02, 2026-11-04, 2026-11-09, 2026-11-11 (4 sessions)
      const gen1 = await client.post(
        `/api/classes/${cls.id}/generate-sessions`,
        {
          fromDate: "2026-11-02",
          toDate: "2026-11-15",
        }
      );
      expect([200, 201]).toContain(gen1.status());
      const gen1Body = await gen1.json();
      expect(gen1Body.createdCount).toBe(4);
      expect(gen1Body.skippedCount).toBe(0);

      // Re-run idempotency check
      const gen2 = await client.post(
        `/api/classes/${cls.id}/generate-sessions`,
        {
          fromDate: "2026-11-02",
          toDate: "2026-11-15",
        }
      );
      const gen2Body = await gen2.json();
      expect(gen2Body.createdCount).toBe(0);
      expect(gen2Body.skippedCount).toBe(4);
    });

    test("C1.2: Manual, Bulk, and Browser FaceAI Check-in/Check-out persist accurate attendance states and confidence scores", async ({
      request,
    }) => {
      const client = await registerAndLoginTeacher(request);
      const cls = await createTestClass(client, { name: "Toán Tổ Hợp 1.2" });
      const s1 = await createTestStudent(client, { fullName: "HS Tổ Hợp S1" });
      const s2 = await createTestStudent(client, { fullName: "HS Tổ Hợp S2" });
      await client.post("/api/enrollments", {
        classId: cls.id,
        studentIds: [s1.id, s2.id],
      });

      const vec101 = generateNormalizedDescriptor(101);
      await client.post("/api/face-ai/descriptors", {
        studentId: s1.id,
        descriptor: vec101,
        source: "WEBCAM",
      });

      const sess1Res = await client.post("/api/sessions", {
        classId: cls.id,
        sessionDate: "2026-11-02",
        startTime: "18:00",
        endTime: "19:30",
      });
      const sess1 = unwrapItem(await sess1Res.json(), "session");

      // Bulk MARK_ALL_PRESENT + CHECK_OUT_ALL on Session 1
      const markAll = await client.post(
        `/api/sessions/${sess1.id}/attendance`,
        { action: "MARK_ALL_PRESENT" }
      );
      expect([200, 201]).toContain(markAll.status());

      const checkOutAll = await client.post(
        `/api/sessions/${sess1.id}/attendance`,
        { action: "CHECK_OUT_ALL" }
      );
      expect([200, 201]).toContain(checkOutAll.status());

      // Session 2: FaceAI check-in & check-out for S1, Manual LATE for S2
      const sess2Res = await client.post("/api/sessions", {
        classId: cls.id,
        sessionDate: "2026-11-04",
        startTime: "18:00",
        endTime: "19:30",
      });
      const sess2 = unwrapItem(await sess2Res.json(), "session");

      const faceInRes = await client.post("/api/face-ai/match", {
        sessionId: sess2.id,
        scanMode: "CHECK_IN",
        descriptor: perturbDescriptor(vec101, 0.01),
      });
      expect(faceInRes.status()).toBe(200);
      const faceIn = await faceInRes.json();
      expect(faceIn.matched).toBe(true);
      expect(faceIn.attendance.method).toBe("FACE_AI");
      expect(faceIn.confidenceScore).toBeGreaterThanOrEqual(0.9);

      const faceOutRes = await client.post("/api/face-ai/match", {
        sessionId: sess2.id,
        scanMode: "CHECK_OUT",
        descriptor: perturbDescriptor(vec101, 0.01),
      });
      expect(faceOutRes.status()).toBe(200);
      const faceOut = await faceOutRes.json();
      expect(faceOut.attendance.checkOutAt).toBeTruthy();

      const manualLateRes = await client.post(
        `/api/sessions/${sess2.id}/attendance`,
        {
          studentId: s2.id,
          status: "LATE",
          checkInAt: "2026-11-04T18:25:00.000Z",
          checkOutAt: "2026-11-04T19:30:00.000Z",
        }
      );
      expect([200, 201]).toContain(manualLateRes.status());
    });

    test("C1.3: Attendance records across sessions (excluding CANCELLED) feed exact S_att scores into Leaderboard", async ({
      request,
    }) => {
      const client = await registerAndLoginTeacher(request);
      const cls = await createTestClass(client, { name: "Toán Tổ Hợp 1.3" });
      const s1 = await createTestStudent(client, { fullName: "HS Chuyên Cần 1" });
      const s2 = await createTestStudent(client, { fullName: "HS Chuyên Cần 2" });
      const s3 = await createTestStudent(client, { fullName: "HS Chuyên Cần 3" });
      const s4 = await createTestStudent(client, { fullName: "HS Chuyên Cần 4" });
      await client.post("/api/enrollments", {
        classId: cls.id,
        studentIds: [s1.id, s2.id, s3.id, s4.id],
      });

      await client.post(`/api/classes/${cls.id}/schedule-slots`, {
        slots: [
          { dayOfWeek: 1, startTime: "18:00", endTime: "19:30", room: "P101" },
          { dayOfWeek: 3, startTime: "18:00", endTime: "19:30", room: "P101" },
        ],
      });

      const genRes = await client.post(
        `/api/classes/${cls.id}/generate-sessions`,
        {
          fromDate: "2026-11-02",
          toDate: "2026-11-15",
        }
      );
      const genSessions = unwrapList(await genRes.json(), "sessions");
      expect(genSessions.length).toBe(4);
      const [sess1, sess2, sess3, sess4] = genSessions;

      // Also create 1 CANCELLED session to ensure it is excluded from N_sess
      const cancelledRes = await client.post("/api/sessions", {
        classId: cls.id,
        sessionDate: "2026-11-14",
        startTime: "09:00",
        endTime: "10:30",
      });
      const cancelledSess = unwrapItem(await cancelledRes.json(), "session");
      await client.patch(`/api/sessions/${cancelledSess.id}`, {
        status: "CANCELLED",
      });

      // Session 1: All PRESENT (1.0 each)
      await client.post(`/api/sessions/${sess1.id}/attendance`, {
        action: "MARK_ALL_PRESENT",
      });

      // Session 2: S1 PRESENT (1.0), S2 LATE (0.75), S3 ABSENT_EXCUSED (0.5), S4 ABSENT_UNEXCUSED (0.0)
      await client.post(`/api/sessions/${sess2.id}/attendance`, {
        records: [
          { studentId: s1.id, status: "PRESENT" },
          { studentId: s2.id, status: "LATE" },
          { studentId: s3.id, status: "ABSENT_EXCUSED" },
          { studentId: s4.id, status: "ABSENT_UNEXCUSED" },
        ],
      });

      // Session 3: S1 PRESENT (1.0), S2 PRESENT (1.0), S3 LATE (0.75), S4 ABSENT_EXCUSED (0.5)
      await client.post(`/api/sessions/${sess3.id}/attendance`, {
        records: [
          { studentId: s1.id, status: "PRESENT" },
          { studentId: s2.id, status: "PRESENT" },
          { studentId: s3.id, status: "LATE" },
          { studentId: s4.id, status: "ABSENT_EXCUSED" },
        ],
      });

      // Session 4: S1 PRESENT (1.0), S2 LATE (0.75), S3 ABSENT_UNEXCUSED (0.0), S4 ABSENT_UNEXCUSED (0.0)
      await client.post(`/api/sessions/${sess4.id}/attendance`, {
        records: [
          { studentId: s1.id, status: "PRESENT" },
          { studentId: s2.id, status: "LATE" },
          { studentId: s3.id, status: "ABSENT_UNEXCUSED" },
          { studentId: s4.id, status: "ABSENT_UNEXCUSED" },
        ],
      });

      const lbRes = await client.get("/api/leaderboards", {
        classId: cls.id,
        from: "2026-11-01",
        to: "2026-11-30",
        attendanceWeight: 100,
        homeworkWeight: 0,
        gameWeight: 0,
        bonusWeight: 0,
      });
      expect(lbRes.status()).toBe(200);
      const rankings = unwrapList(await lbRes.json(), "rankings");

      const rS1 = rankings.find((r: any) => r.student.id === s1.id);
      const rS2 = rankings.find((r: any) => r.student.id === s2.id);
      const rS3 = rankings.find((r: any) => r.student.id === s3.id);
      const rS4 = rankings.find((r: any) => r.student.id === s4.id);

      // S1: (1+1+1+1)/4 * 100 = 100
      // S2: (1+0.75+1+0.75)/4 * 100 = 87.5
      // S3: (1+0.5+0.75+0)/4 * 100 = 56.25
      // S4: (1+0+0.5+0)/4 * 100 = 37.5
      expect(rS1.attendanceScore).toBeCloseTo(100, 1);
      expect(rS2.attendanceScore).toBeCloseTo(87.5, 1);
      expect(rS3.attendanceScore).toBeCloseTo(56.25, 1);
      expect(rS4.attendanceScore).toBeCloseTo(37.5, 1);
      expect(rS1.rank).toBe(1);
      expect(rS2.rank).toBe(2);
      expect(rS3.rank).toBe(3);
      expect(rS4.rank).toBe(4);
    });
  });

  // ===========================================================================
  // COMBINATION 2: Student + Guardians + Enrollment Discounts + FeePlans ->
  //                Bulk Invoices -> Partial Payment -> VietQR -> Debt & Dashboard
  // ===========================================================================
  test.describe("Combination 2: Guardians & Enrollment Discounts -> Bulk Invoices -> Partial Payment -> VietQR & Dashboard", () => {
    test("C2.1: Multi-guardian normalization, PERCENTAGE/FIXED/100% enrollment discounts, and MONTHLY + PER_SESSION bulk invoice math", async ({
      request,
    }) => {
      const client = await registerAndLoginTeacher(request);
      const clsM = await createTestClass(client, {
        name: "Lớp Tháng C2",
        defaultFeeAmount: 2000000,
        billingCycle: "MONTHLY",
      });
      const clsS = await createTestClass(client, {
        name: "Lớp Theo Buổi C2",
        defaultFeeAmount: 150000,
        billingCycle: "PER_SESSION",
      });

      const fpMRes = await client.post("/api/fee-plans", {
        classId: clsM.id,
        name: "Học phí tháng",
        billingCycle: "MONTHLY",
        amount: 2000000,
        isDefault: true,
      });
      const fpM = unwrapItem(await fpMRes.json(), "feePlan");

      const fpSRes = await client.post("/api/fee-plans", {
        classId: clsS.id,
        name: "Học phí theo buổi",
        billingCycle: "PER_SESSION",
        amount: 150000,
        isDefault: true,
      });
      const fpS = unwrapItem(await fpSRes.json(), "feePlan");

      const hsA = await createTestStudent(client, {
        studentCode: "HS101",
        fullName: "Nguyễn Văn Ánh",
      });
      await client.post(`/api/students/${hsA.id}/guardians`, {
        fullName: "Nguyễn Văn Bố",
        relationship: "Bố",
        phone: "0901112222",
        isPrimary: true,
      });
      await client.post(`/api/students/${hsA.id}/guardians`, {
        fullName: "Trần Thị Mẹ",
        relationship: "Mẹ",
        phone: "0903334444",
        isPrimary: true,
      });

      const hsADetail = unwrapItem(
        await (await client.get(`/api/students/${hsA.id}`)).json(),
        "student"
      );
      expect(
        (hsADetail.guardians ?? []).filter((g: any) => g.isPrimary).length
      ).toBe(1);

      const hsB = await createTestStudent(client, {
        studentCode: "HS102",
        fullName: "Trần Thị Bích",
      });
      const hsC = await createTestStudent(client, {
        studentCode: "HS103",
        fullName: "Lê Hoàng Cường",
      });

      // Enroll in CLS-M: HS_A (20% off -> 1,600,000), HS_B (500k off -> 1,500,000), HS_C (100% off -> 0 PAID)
      await client.post("/api/enrollments", {
        classId: clsM.id,
        studentId: hsA.id,
        discountType: "PERCENTAGE",
        customFeeDiscount: 20,
      });
      await client.post("/api/enrollments", {
        classId: clsM.id,
        studentId: hsB.id,
        discountType: "FIXED",
        customFeeDiscount: 500000,
      });
      await client.post("/api/enrollments", {
        classId: clsM.id,
        studentId: hsC.id,
        discountType: "PERCENTAGE",
        customFeeDiscount: 100,
      });

      // Enroll HS_A in CLS-S with 100,000 FIXED discount
      await client.post("/api/enrollments", {
        classId: clsS.id,
        studentId: hsA.id,
        discountType: "FIXED",
        customFeeDiscount: 100000,
      });

      const genM = await client.post("/api/invoices/generate", {
        classId: clsM.id,
        feePlanId: fpM.id,
        billingPeriod: "2026-11",
        dueDate: "2026-11-10",
      });
      const invsM = unwrapList(await genM.json(), "invoices");
      expect(invsM.length).toBe(3);

      const invMA = invsM.find((i: any) => i.studentId === hsA.id);
      const invMB = invsM.find((i: any) => i.studentId === hsB.id);
      const invMC = invsM.find((i: any) => i.studentId === hsC.id);

      expect(invMA.netAmount).toBe(1600000);
      expect(invMA.status).toBe("UNPAID");
      expect(invMB.netAmount).toBe(1500000);
      expect(invMB.status).toBe("UNPAID");
      expect(invMC.netAmount).toBe(0);
      expect(invMC.status).toBe("PAID");

      const genS = await client.post("/api/invoices/generate", {
        classId: clsS.id,
        feePlanId: fpS.id,
        billingPeriod: "2026-11",
        sessionCount: 8,
        dueDate: "2026-11-10",
      });
      const invSA = unwrapList(await genS.json(), "invoices")[0];
      expect(invSA.baseAmount).toBe(1200000);
      expect(invSA.discountAmount).toBe(100000);
      expect(invSA.netAmount).toBe(1100000);
    });

    test("C2.2: Partial payment transitions invoice to PARTIAL and dynamically updates VietQR remaining balance and EMVCo payload", async ({
      request,
    }) => {
      const client = await registerAndLoginTeacher(request);
      await client.put("/api/workspace", {
        name: "Trung Tâm Sao Khuê",
        bankBin: "970436",
        bankCode: "VCB",
        bankName: "Vietcombank",
        bankAccountNumber: "0123456789",
        bankAccountName: "NGUYEN VAN A",
      });

      const clsM = await createTestClass(client, { defaultFeeAmount: 2000000 });
      const hsA = await createTestStudent(client, {
        studentCode: "HS101",
        fullName: "Nguyễn Văn Ánh",
      });
      await client.post("/api/enrollments", {
        classId: clsM.id,
        studentId: hsA.id,
        discountType: "PERCENTAGE",
        customFeeDiscount: 20,
      });

      const genRes = await client.post("/api/invoices/generate", {
        classId: clsM.id,
        billingPeriod: "2026-11",
        dueDate: "2026-11-10",
      });
      const invA = unwrapList(await genRes.json(), "invoices")[0];
      expect(invA.netAmount).toBe(1600000);

      // Before payment: VietQR amount = 1,600,000
      const qrBefore = await (
        await client.get(`/api/invoices/${invA.id}/vietqr`)
      ).json();
      expect(qrBefore.amount).toBe(1600000);
      expect(qrBefore.transferContent).toContain("HP HS101");
      expect(qrBefore.qrPayload.startsWith("000201")).toBe(true);

      // Partial payment of 600,000
      const payRes = await client.post(`/api/invoices/${invA.id}/payments`, {
        amount: 600000,
        method: "BANK_TRANSFER",
        collectorName: "Cô Lan",
        referenceCode: "VCB-001",
      });
      expect(payRes.status()).toBe(201);
      const payBody = await payRes.json();
      expect(payBody.invoice.status).toBe("PARTIAL");
      expect(payBody.invoice.paidAmount).toBe(600000);

      // After payment: VietQR remaining balance = 1,000,000
      const qrAfter = await (
        await client.get(`/api/invoices/${invA.id}/vietqr`)
      ).json();
      expect(qrAfter.amount).toBe(1000000);
      expect(qrAfter.vietQrImageUrl).toContain("amount=1000000");
    });

    test("C2.3: Debt Report (/api/fees/report) and Dashboard KPIs (/api/dashboard) synchronize accurately with invoices and payments", async ({
      request,
    }) => {
      const client = await registerAndLoginTeacher(request);
      const clsM = await createTestClass(client, {
        name: "CLS-M",
        defaultFeeAmount: 2000000,
      });
      const clsS = await createTestClass(client, {
        name: "CLS-S",
        defaultFeeAmount: 150000,
        billingCycle: "PER_SESSION",
      });

      const hsA = await createTestStudent(client, { studentCode: "HS101" });
      const hsB = await createTestStudent(client, { studentCode: "HS102" });
      const hsC = await createTestStudent(client, { studentCode: "HS103" });

      await client.post("/api/enrollments", {
        classId: clsM.id,
        studentId: hsA.id,
        discountType: "PERCENTAGE",
        customFeeDiscount: 20, // net 1,600,000
      });
      await client.post("/api/enrollments", {
        classId: clsM.id,
        studentId: hsB.id,
        discountType: "FIXED",
        customFeeDiscount: 500000, // net 1,500,000
      });
      await client.post("/api/enrollments", {
        classId: clsM.id,
        studentId: hsC.id,
        discountType: "PERCENTAGE",
        customFeeDiscount: 100, // net 0
      });
      await client.post("/api/enrollments", {
        classId: clsS.id,
        studentId: hsA.id,
        discountType: "FIXED",
        customFeeDiscount: 100000, // 8 sessions * 150k - 100k = 1,100,000
      });

      const genM = await client.post("/api/invoices/generate", {
        classId: clsM.id,
        billingPeriod: "2026-11",
        dueDate: "2026-11-10",
      });
      const invsM = unwrapList(await genM.json(), "invoices");
      const invA = invsM.find((i: any) => i.studentId === hsA.id);
      const invB = invsM.find((i: any) => i.studentId === hsB.id);

      await client.post("/api/invoices/generate", {
        classId: clsS.id,
        billingPeriod: "2026-11",
        sessionCount: 8,
        dueDate: "2026-11-10",
      });

      // Pay 600,000 on invA and 1,500,000 on invB (totalPaid = 2,100,000; totalNet = 4,200,000; totalOutstanding = 2,100,000)
      await client.post(`/api/invoices/${invA.id}/payments`, {
        amount: 600000,
        method: "BANK_TRANSFER",
      });
      await client.post(`/api/invoices/${invB.id}/payments`, {
        amount: 1500000,
        method: "CASH",
      });

      const reportRes = await client.get("/api/fees/report", {
        billingPeriod: "2026-11",
      });
      expect(reportRes.status()).toBe(200);
      const report = await reportRes.json();
      expect(report.summary.totalNet).toBe(4200000);
      expect(report.summary.totalPaid).toBe(2100000);
      expect(report.summary.totalOutstanding).toBe(2100000);

      const dashRes = await client.get("/api/dashboard", { month: "2026-11" });
      expect(dashRes.status()).toBe(200);
      const dash = await dashRes.json();
      expect(dash.kpis.activeClasses).toBe(2);
      expect(dash.kpis.activeStudents).toBe(3);
      expect(dash.kpis.monthlyCollected).toBe(2100000);
      expect(dash.kpis.monthlyOutstanding).toBe(2100000);
    });
  });

  // ===========================================================================
  // COMBINATION 3: ExerciseQuestion Bank -> Linked to Homework ->
  //                Submissions (On-Time & Late) & Grading -> Leaderboard S_hw
  // ===========================================================================
  test.describe("Combination 3: ExerciseQuestion Bank -> Homework -> Submissions & Grading -> Leaderboard S_hw", () => {
    test("C3.1: Bulk ExerciseQuestion import and linking questionIdsJson to Homework assignments", async ({
      request,
    }) => {
      const client = await registerAndLoginTeacher(request);
      const cls = await createTestClass(client, {
        name: "Tiếng Anh Tổ Hợp 3.1",
        subject: "Tiếng Anh",
      });

      const bulkRes = await client.post("/api/questions", {
        bulk: true,
        questions: [
          {
            type: "MULTIPLE_CHOICE",
            subject: "Tiếng Anh",
            topic: "Grammar",
            difficulty: "EASY",
            prompt: "He ___ a student.",
            optionsJson: [
              { id: "A", text: "is" },
              { id: "B", text: "are" },
            ],
            correctAnswer: "A",
            points: 10,
          },
          {
            type: "FILL_IN_BLANK",
            subject: "Tiếng Anh",
            topic: "Grammar",
            difficulty: "MEDIUM",
            prompt: "They have lived here ___ 2020.",
            correctAnswer: "since",
            points: 10,
          },
          {
            type: "SHORT_ANSWER",
            subject: "Tiếng Anh",
            topic: "Grammar",
            difficulty: "HARD",
            prompt: "Past participle of 'write'?",
            correctAnswer: "written",
            points: 10,
          },
        ],
      });
      expect(bulkRes.status()).toBe(201);

      const qListRes = await client.get("/api/questions", {
        subject: "Tiếng Anh",
        topic: "Grammar",
      });
      const questions = unwrapList(await qListRes.json(), "questions");
      expect(questions.length).toBe(3);

      const hwRes = await client.post("/api/homeworks", {
        classId: cls.id,
        title: "BTVN Tuần 1 Grammar",
        dueDate: "2026-11-05T23:59:59.000Z",
        maxScore: 10,
        questionIdsJson: [questions[0].id, questions[1].id],
      });
      expect(hwRes.status()).toBe(201);
      const hw = unwrapItem(await hwRes.json(), "homework");
      expect(Array.isArray(hw.questionIdsJson)).toBe(true);
      expect(hw.questionIdsJson.length).toBe(2);
    });

    test("C3.2: Homework submission auto-flags LATE when submittedAt > dueDate and persists teacher grading", async ({
      request,
    }) => {
      const client = await registerAndLoginTeacher(request);
      const cls = await createTestClass(client);
      const st1 = await createTestStudent(client, { fullName: "ST1 Đúng Hạn" });
      const st2 = await createTestStudent(client, { fullName: "ST2 Nộp Muộn" });
      await client.post("/api/enrollments", {
        classId: cls.id,
        studentIds: [st1.id, st2.id],
      });

      const hwRes = await client.post("/api/homeworks", {
        classId: cls.id,
        title: "BTVN Kiểm Tra Hạn Nộp",
        dueDate: "2026-11-05T23:59:59.000Z",
        maxScore: 10,
      });
      const hw = unwrapItem(await hwRes.json(), "homework");

      // Submit ST2 after dueDate -> status automatically becomes LATE
      const lateSubRes = await client.post(
        `/api/homeworks/${hw.id}/submissions`,
        {
          submissions: [
            {
              studentId: st2.id,
              status: "SUBMITTED",
              submittedAt: "2026-11-07T10:00:00.000Z",
            },
          ],
        }
      );
      expect([200, 201]).toContain(lateSubRes.status());
      const lateSubs = unwrapList(await lateSubRes.json(), "submissions");
      expect(lateSubs[0].status).toBe("LATE");

      // Teacher grades both ST1 and ST2
      const gradeRes = await client.post(
        `/api/homeworks/${hw.id}/submissions`,
        {
          submissions: [
            {
              studentId: st1.id,
              status: "GRADED",
              score: 9,
              submittedAt: "2026-11-05T18:00:00.000Z",
              feedback: "Tốt",
            },
            {
              studentId: st2.id,
              status: "GRADED",
              score: 7,
              submittedAt: "2026-11-07T10:00:00.000Z",
              feedback: "Nộp muộn 2 ngày",
            },
          ],
        }
      );
      expect([200, 201]).toContain(gradeRes.status());
    });

    test("C3.3: Graded and missing homework submissions across different maxScore scales feed accurately into Leaderboard S_hw", async ({
      request,
    }) => {
      const client = await registerAndLoginTeacher(request);
      const cls = await createTestClass(client, { name: "CLS-HW-MATH" });
      const st1 = await createTestStudent(client, { fullName: "ST1 Hạng 1" });
      const st2 = await createTestStudent(client, { fullName: "ST2 Hạng 2" });
      const st3 = await createTestStudent(client, { fullName: "ST3 Hạng 3" });
      await client.post("/api/enrollments", {
        classId: cls.id,
        studentIds: [st1.id, st2.id, st3.id],
      });

      // HW1 (maxScore = 10): ST1 = 9/10 (90%), ST2 = 7/10 (70%), ST3 = MISSING (0%)
      const hw1Res = await client.post("/api/homeworks", {
        classId: cls.id,
        title: "BTVN Tuần 1",
        dueDate: "2026-11-05T23:59:59.000Z",
        maxScore: 10,
      });
      const hw1 = unwrapItem(await hw1Res.json(), "homework");
      await client.post(`/api/homeworks/${hw1.id}/submissions`, {
        submissions: [
          { studentId: st1.id, status: "GRADED", score: 9 },
          { studentId: st2.id, status: "GRADED", score: 7 },
          { studentId: st3.id, status: "MISSING", score: 0 },
        ],
      });

      // HW2 (maxScore = 20): ST1 = 16/20 (80%), ST2 = 18/20 (90%), ST3 = 10/20 (50%)
      const hw2Res = await client.post("/api/homeworks", {
        classId: cls.id,
        title: "BTVN Tuần 2",
        dueDate: "2026-11-10T23:59:59.000Z",
        maxScore: 20,
      });
      const hw2 = unwrapItem(await hw2Res.json(), "homework");
      await client.post(`/api/homeworks/${hw2.id}/submissions`, {
        submissions: [
          { studentId: st1.id, status: "GRADED", score: 16 },
          { studentId: st2.id, status: "GRADED", score: 18 },
          { studentId: st3.id, status: "GRADED", score: 10 },
        ],
      });

      // Query Leaderboard with 100% homeworkWeight
      // ST1: (90 + 80) / 2 = 85.0
      // ST2: (70 + 90) / 2 = 80.0
      // ST3: (0 + 50) / 2 = 25.0
      const lbRes = await client.get("/api/leaderboards", {
        classId: cls.id,
        from: "2026-11-01",
        to: "2026-11-30",
        attendanceWeight: 0,
        homeworkWeight: 100,
        gameWeight: 0,
        bonusWeight: 0,
      });
      expect(lbRes.status()).toBe(200);
      const rankings = unwrapList(await lbRes.json(), "rankings");

      const r1 = rankings.find((r: any) => r.student.id === st1.id);
      const r2 = rankings.find((r: any) => r.student.id === st2.id);
      const r3 = rankings.find((r: any) => r.student.id === st3.id);

      expect(r1.homeworkScore).toBeCloseTo(85, 1);
      expect(r2.homeworkScore).toBeCloseTo(80, 1);
      expect(r3.homeworkScore).toBeCloseTo(25, 1);
      expect(r1.rank).toBe(1);
      expect(r2.rank).toBe(2);
      expect(r3.rank).toBe(3);
    });
  });

  // ===========================================================================
  // COMBINATION 4: Question Bank -> Minigame -> Live GameSession (TEAM & INDIVIDUAL)
  //                -> PointTransaction Bonus/Penalty -> Full 4-Component Leaderboard
  // ===========================================================================
  test.describe("Combination 4: Question Bank -> Minigame -> TEAM & INDIVIDUAL GameSessions -> Bonus Points -> Composite Leaderboard", () => {
    test("C4.1: Minigame template linked to Question Bank launches TEAM GameSession and propagates team scores & competition ranks to all team members", async ({
      request,
    }) => {
      const client = await registerAndLoginTeacher(request);
      const cls = await createTestClass(client, { name: "CLS-GAME-C4.1" });
      const g1 = await createTestStudent(client, { fullName: "G1 Rồng Xanh" });
      const g2 = await createTestStudent(client, { fullName: "G2 Rồng Xanh" });
      const g3 = await createTestStudent(client, { fullName: "G3 Phượng Hoàng" });
      const g4 = await createTestStudent(client, { fullName: "G4 Phượng Hoàng" });
      await client.post("/api/enrollments", {
        classId: cls.id,
        studentIds: [g1.id, g2.id, g3.id, g4.id],
      });

      const qRes = await client.post("/api/questions", {
        type: "SHORT_ANSWER",
        subject: "Toán",
        topic: "Đố vui",
        prompt: "7 x 8 = ?",
        correctAnswer: "56",
      });
      const q = unwrapItem(await qRes.json(), "question");

      const mgTeamRes = await client.post("/api/minigames", {
        title: "Bấm Chuông Đồng Đội",
        type: "TEAM_BUZZER",
        pointsPerQuestion: 100,
        questionIdsJson: [q.id],
      });
      const mgTeam = unwrapItem(await mgTeamRes.json(), "minigame");

      const gsTeamRes = await client.post("/api/game-sessions", {
        classId: cls.id,
        minigameId: mgTeam.id,
        mode: "TEAM",
        teamsConfigJson: [
          { name: "Đội Rồng Xanh", studentIds: [g1.id, g2.id] },
          { name: "Đội Phượng Hoàng", studentIds: [g3.id, g4.id] },
        ],
      });
      const gsTeam = unwrapItem(await gsTeamRes.json(), "gameSession");

      const finishRes = await client.patch(
        `/api/game-sessions/${gsTeam.id}`,
        {
          status: "COMPLETED",
          results: [
            {
              studentId: g1.id,
              teamName: "Đội Rồng Xanh",
              score: 300,
              correctCount: 3,
              totalQuestions: 4,
              accuracy: 75,
            },
            {
              studentId: g2.id,
              teamName: "Đội Rồng Xanh",
              score: 300,
              correctCount: 3,
              totalQuestions: 4,
              accuracy: 75,
            },
            {
              studentId: g3.id,
              teamName: "Đội Phượng Hoàng",
              score: 100,
              correctCount: 1,
              totalQuestions: 4,
              accuracy: 25,
            },
            {
              studentId: g4.id,
              teamName: "Đội Phượng Hoàng",
              score: 100,
              correctCount: 1,
              totalQuestions: 4,
              accuracy: 25,
            },
          ],
        }
      );
      expect(finishRes.status()).toBe(200);
      const results = unwrapList(await finishRes.json(), "results");
      expect(results.length).toBe(4);

      const rg1 = results.find((r: any) => r.studentId === g1.id);
      const rg2 = results.find((r: any) => r.studentId === g2.id);
      expect(rg1.rank).toBe(1);
      expect(rg2.rank).toBe(1);
      expect(rg1.score).toBe(300);
      expect(rg2.score).toBe(300);
    });

    test("C4.2: INDIVIDUAL GameSession scores combine with TEAM GameSession scores and PointTransaction bonus/penalties", async ({
      request,
    }) => {
      const client = await registerAndLoginTeacher(request);
      const cls = await createTestClass(client, { name: "CLS-GAME-C4.2" });
      const g1 = await createTestStudent(client, { fullName: "G1" });
      const g2 = await createTestStudent(client, { fullName: "G2" });
      const g3 = await createTestStudent(client, { fullName: "G3" });
      const g4 = await createTestStudent(client, { fullName: "G4" });
      await client.post("/api/enrollments", {
        classId: cls.id,
        studentIds: [g1.id, g2.id, g3.id, g4.id],
      });

      const qRes = await client.post("/api/questions", {
        type: "SHORT_ANSWER",
        subject: "Toán",
        topic: "Đố vui",
        prompt: "9 x 9 = ?",
        correctAnswer: "81",
      });
      const q = unwrapItem(await qRes.json(), "question");

      const mgRes = await client.post("/api/minigames", {
        title: "Quiz C4.2",
        type: "SPEED_QUIZ",
        questionIdsJson: [q.id],
      });
      const mg = unwrapItem(await mgRes.json(), "minigame");

      // Game 1 (TEAM): G1=300, G2=300, G3=100, G4=100
      const gs1 = unwrapItem(
        await (
          await client.post("/api/game-sessions", {
            classId: cls.id,
            minigameId: mg.id,
            mode: "TEAM",
          })
        ).json(),
        "gameSession"
      );
      await client.patch(`/api/game-sessions/${gs1.id}`, {
        status: "COMPLETED",
        results: [
          { studentId: g1.id, teamName: "T1", score: 300, correctCount: 3, totalQuestions: 4 },
          { studentId: g2.id, teamName: "T1", score: 300, correctCount: 3, totalQuestions: 4 },
          { studentId: g3.id, teamName: "T2", score: 100, correctCount: 1, totalQuestions: 4 },
          { studentId: g4.id, teamName: "T2", score: 100, correctCount: 1, totalQuestions: 4 },
        ],
      });

      // Game 2 (INDIVIDUAL): G1=200 (sum 500), G2=100 (sum 400), G3=150 (sum 250), G4=0 (sum 100)
      const gs2 = unwrapItem(
        await (
          await client.post("/api/game-sessions", {
            classId: cls.id,
            minigameId: mg.id,
            mode: "INDIVIDUAL",
          })
        ).json(),
        "gameSession"
      );
      await client.patch(`/api/game-sessions/${gs2.id}`, {
        status: "COMPLETED",
        results: [
          { studentId: g1.id, score: 200, correctCount: 2, totalQuestions: 2 },
          { studentId: g2.id, score: 100, correctCount: 1, totalQuestions: 2 },
          { studentId: g3.id, score: 150, correctCount: 1, totalQuestions: 2 },
          { studentId: g4.id, score: 0, correctCount: 0, totalQuestions: 2 },
        ],
      });

      // Bonus/Penalties: G1=+80, G2=+50, G3=+40 & -10 (net +30), G4=-15 (clamped to 0)
      await client.post("/api/points", {
        studentIds: [g1.id],
        classId: cls.id,
        points: 80,
        reason: "Giải nhất",
        category: "BONUS",
      });
      await client.post("/api/points", {
        studentIds: [g2.id],
        classId: cls.id,
        points: 50,
        reason: "Hỗ trợ nhóm",
        category: "BONUS",
      });
      await client.post("/api/points", {
        studentIds: [g3.id],
        classId: cls.id,
        points: 40,
        reason: "Phát biểu",
        category: "BONUS",
      });
      await client.post("/api/points", {
        studentIds: [g3.id],
        classId: cls.id,
        points: -10,
        reason: "Đi muộn",
        category: "PENALTY",
      });
      await client.post("/api/points", {
        studentIds: [g4.id],
        classId: cls.id,
        points: -15,
        reason: "Nói chuyện riêng",
        category: "PENALTY",
      });

      const lbRes = await client.get("/api/leaderboards", {
        classId: cls.id,
        attendanceWeight: 0,
        homeworkWeight: 0,
        gameWeight: 50,
        bonusWeight: 50,
      });
      expect(lbRes.status()).toBe(200);
      const rankings = unwrapList(await lbRes.json(), "rankings");

      const r1 = rankings.find((r: any) => r.student.id === g1.id);
      const r2 = rankings.find((r: any) => r.student.id === g2.id);
      const r3 = rankings.find((r: any) => r.student.id === g3.id);
      const r4 = rankings.find((r: any) => r.student.id === g4.id);

      // S_game: G1=100, G2=80, G3=50, G4=20
      expect(r1.gameScore).toBeCloseTo(100, 1);
      expect(r2.gameScore).toBeCloseTo(80, 1);
      expect(r3.gameScore).toBeCloseTo(50, 1);
      expect(r4.gameScore).toBeCloseTo(20, 1);

      // S_bonus: G1=80, G2=50, G3=30, G4=0
      expect(r1.bonusScore).toBeCloseTo(80, 1);
      expect(r2.bonusScore).toBeCloseTo(50, 1);
      expect(r3.bonusScore).toBeCloseTo(30, 1);
      expect(r4.bonusScore).toBeCloseTo(0, 1);
    });

    test("C4.3: Saved LeaderboardConfig computes exact 4-component composite S_total across Attendance, Homework, Minigames, and Bonus points", async ({
      request,
    }) => {
      const client = await registerAndLoginTeacher(request);
      const cls = await createTestClass(client, { name: "CLS-FULL-C4.3" });
      const g1 = await createTestStudent(client, { fullName: "G1 Toàn Diện" });
      const g2 = await createTestStudent(client, { fullName: "G2 Toàn Diện" });
      const g3 = await createTestStudent(client, { fullName: "G3 Toàn Diện" });
      const g4 = await createTestStudent(client, { fullName: "G4 Toàn Diện" });
      await client.post("/api/enrollments", {
        classId: cls.id,
        studentIds: [g1.id, g2.id, g3.id, g4.id],
      });

      // 1. Attendance: G1=PRESENT(100), G2=PRESENT(100), G3=LATE(75), G4=ABSENT_EXCUSED(50)
      const sess = unwrapItem(
        await (
          await client.post("/api/sessions", {
            classId: cls.id,
            sessionDate: "2026-11-10",
            startTime: "18:00",
            endTime: "19:30",
          })
        ).json(),
        "session"
      );
      await client.post(`/api/sessions/${sess.id}/attendance`, {
        records: [
          { studentId: g1.id, status: "PRESENT" },
          { studentId: g2.id, status: "PRESENT" },
          { studentId: g3.id, status: "LATE" },
          { studentId: g4.id, status: "ABSENT_EXCUSED" },
        ],
      });

      // 2. Homework: G1=9/10(90), G2=8/10(80), G3=6/10(60), G4=4/10(40)
      const hw = unwrapItem(
        await (
          await client.post("/api/homeworks", {
            classId: cls.id,
            title: "BTVN C4.3",
            dueDate: "2026-11-15T23:59:59.000Z",
            maxScore: 10,
          })
        ).json(),
        "homework"
      );
      await client.post(`/api/homeworks/${hw.id}/submissions`, {
        submissions: [
          { studentId: g1.id, status: "GRADED", score: 9 },
          { studentId: g2.id, status: "GRADED", score: 8 },
          { studentId: g3.id, status: "GRADED", score: 6 },
          { studentId: g4.id, status: "GRADED", score: 4 },
        ],
      });

      // 3. Game: G1=500(100), G2=400(80), G3=250(50), G4=100(20)
      const q = unwrapItem(
        await (
          await client.post("/api/questions", {
            type: "SHORT_ANSWER",
            subject: "Toán",
            topic: "C4",
            prompt: "5 + 5 = ?",
            correctAnswer: "10",
          })
        ).json(),
        "question"
      );
      const mg = unwrapItem(
        await (
          await client.post("/api/minigames", {
            title: "Game C4.3",
            type: "SPEED_QUIZ",
            questionIdsJson: [q.id],
          })
        ).json(),
        "minigame"
      );
      const gs = unwrapItem(
        await (
          await client.post("/api/game-sessions", {
            classId: cls.id,
            minigameId: mg.id,
            mode: "INDIVIDUAL",
          })
        ).json(),
        "gameSession"
      );
      await client.patch(`/api/game-sessions/${gs.id}`, {
        status: "COMPLETED",
        results: [
          { studentId: g1.id, score: 500, correctCount: 5, totalQuestions: 5 },
          { studentId: g2.id, score: 400, correctCount: 4, totalQuestions: 5 },
          { studentId: g3.id, score: 250, correctCount: 2, totalQuestions: 5 },
          { studentId: g4.id, score: 100, correctCount: 1, totalQuestions: 5 },
        ],
      });

      // 4. Bonus points: G1=+80(80), G2=+50(50), G3=+30(30), G4=-15(0)
      await client.post("/api/points", {
        studentIds: [g1.id],
        classId: cls.id,
        points: 80,
        reason: "B1",
      });
      await client.post("/api/points", {
        studentIds: [g2.id],
        classId: cls.id,
        points: 50,
        reason: "B2",
      });
      await client.post("/api/points", {
        studentIds: [g3.id],
        classId: cls.id,
        points: 30,
        reason: "B3",
      });
      await client.post("/api/points", {
        studentIds: [g4.id],
        classId: cls.id,
        points: -15,
        reason: "P4",
        category: "PENALTY",
      });

      // 5. Save custom LeaderboardConfig (weights: 20, 30, 30, 20)
      const cfgRes = await client.post("/api/leaderboards/configs", {
        name: "Cấu hình Toàn diện T11",
        classId: cls.id,
        attendanceWeight: 20,
        homeworkWeight: 30,
        gameWeight: 30,
        bonusWeight: 20,
        isDefault: true,
      });
      expect(cfgRes.status()).toBe(201);
      const cfg = unwrapItem(await cfgRes.json(), "config");

      const lbRes = await client.get("/api/leaderboards", {
        configId: cfg.id,
        classId: cls.id,
      });
      expect(lbRes.status()).toBe(200);
      const rankings = unwrapList(await lbRes.json(), "rankings");

      const r1 = rankings.find((r: any) => r.student.id === g1.id);
      const r2 = rankings.find((r: any) => r.student.id === g2.id);
      const r3 = rankings.find((r: any) => r.student.id === g3.id);
      const r4 = rankings.find((r: any) => r.student.id === g4.id);

      // Expected composite totals:
      // G1: 0.2(100) + 0.3(90) + 0.3(100) + 0.2(80) = 20 + 27 + 30 + 16 = 93.0
      // G2: 0.2(100) + 0.3(80) + 0.3(80) + 0.2(50)  = 20 + 24 + 24 + 10 = 78.0
      // G3: 0.2(75)  + 0.3(60) + 0.3(50) + 0.2(30)  = 15 + 18 + 15 + 6  = 54.0
      // G4: 0.2(50)  + 0.3(40) + 0.3(20) + 0.2(0)   = 10 + 12 + 6  + 0  = 28.0
      expect(r1.totalScore).toBeCloseTo(93.0, 1);
      expect(r2.totalScore).toBeCloseTo(78.0, 1);
      expect(r3.totalScore).toBeCloseTo(54.0, 1);
      expect(r4.totalScore).toBeCloseTo(28.0, 1);
      expect(r1.rank).toBe(1);
      expect(r2.rank).toBe(2);
      expect(r3.rank).toBe(3);
      expect(r4.rank).toBe(4);
    });
  });
});
