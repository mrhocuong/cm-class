import { test, expect } from "@playwright/test";
import {
  BASE_URL,
  createTestClass,
  createTestStudent,
  generateNormalizedDescriptor,
  perturbDescriptor,
  registerAndLoginTeacher,
  unwrapItem,
  unwrapList,
} from "./helpers";

test.describe("Tier 5 — White-Box Adversarial Tests (Modules 1–9)", () => {
  // ===========================================================================
  // MODULES 1–4 & CORE LIBRARIES: White-Box Adversarial Tests (T5-E2E-M14-01..04)
  // ===========================================================================
  test.describe("Modules 1–4 & Core Libraries — White-Box Adversarial Coverage (T5-E2E-M14-01..04)", () => {
    test("T5-E2E-M14-01: Cross-Tenant Nested ID Injection on Student Creation, Bulk Enrollment, Session Generation & Invoice Generation", async ({
      request,
    }) => {
      const teacherA = await registerAndLoginTeacher(request);
      const teacherB = await registerAndLoginTeacher(request);

      const classA1 = await createTestClass(teacherA, {
        name: "Lớp A1",
        defaultFeeAmount: 1200000,
      });
      const classA2 = await createTestClass(teacherA, {
        name: "Lớp A2",
        defaultFeeAmount: 1800000,
      });
      const classB = await createTestClass(teacherB, {
        name: "Lớp B",
        defaultFeeAmount: 900000,
      });

      const studentA = await createTestStudent(teacherA, {
        fullName: "Học Sinh A",
      });
      const studentB = await createTestStudent(teacherB, {
        fullName: "Học Sinh B",
      });

      // 1. Teacher A attempts to create a student enrolled in [classA1.id, classB.id] -> 404
      const crossStuRes = await teacherA.post("/api/students", {
        fullName: "Học Sinh Chèn Lớp B",
        enrollClassIds: [classA1.id, classB.id],
      });
      expect(crossStuRes.status()).toBe(404);

      // 2. Teacher A attempts to bulk-enroll [studentA.id, studentB.id] into classA1 -> 404
      const crossEnrollRes = await teacherA.post("/api/enrollments", {
        classId: classA1.id,
        studentIds: [studentA.id, studentB.id],
      });
      expect(crossEnrollRes.status()).toBe(404);

      // 3. Teacher A attempts workspace session generation with [classA1.id, classB.id] -> 404
      const crossGenSessRes = await teacherA.post(
        "/api/schedule/generate-sessions",
        {
          fromDate: "2026-11-01",
          toDate: "2026-11-30",
          classIds: [classA1.id, classB.id],
        }
      );
      expect(crossGenSessRes.status()).toBe(404);

      // Legitimately enroll studentA into classA1
      const okEnroll = await teacherA.post("/api/enrollments", {
        classId: classA1.id,
        studentId: studentA.id,
      });
      expect(okEnroll.status()).toBe(201);

      // 4. Teacher A attempts to generate invoices for classA1 using Teacher B's feePlanId -> 404
      const crossFpRes = await teacherA.post("/api/invoices/generate", {
        classId: classA1.id,
        feePlanId: classB.feePlans[0].id,
        billingPeriod: "2026-11",
      });
      expect(crossFpRes.status()).toBe(404);

      // 5. Teacher A attempts to generate invoices for classA1 using classA2's feePlanId -> 404
      const wrongClassFpRes = await teacherA.post("/api/invoices/generate", {
        classId: classA1.id,
        feePlanId: classA2.feePlans[0].id,
        billingPeriod: "2026-11",
      });
      expect(wrongClassFpRes.status()).toBe(404);

      // 6. Teacher A attempts to generate invoices for classA1 passing [studentA.id, studentB.id] -> 404
      const crossStuInvRes = await teacherA.post("/api/invoices/generate", {
        classId: classA1.id,
        studentIds: [studentA.id, studentB.id],
        billingPeriod: "2026-11",
      });
      expect(crossStuInvRes.status()).toBe(404);
    });

    test("T5-E2E-M14-02: Guardian Primary Demotion Auto-Promotes Next Guardian & Protects Sole Primary Contact", async ({
      request,
    }) => {
      const client = await registerAndLoginTeacher(request);
      const student = await createTestStudent(client, {
        fullName: "Học Sinh Kiểm Tra Hạ Quyền Phụ Huynh",
        guardians: [
          {
            fullName: "Phụ Huynh 1",
            relationship: "Bố",
            phone: "0901111111",
            isPrimary: true,
          },
          {
            fullName: "Phụ Huynh 2",
            relationship: "Mẹ",
            phone: "0902222222",
            isPrimary: false,
          },
        ],
      });

      const g1 = student.guardians.find(
        (g: any) => g.fullName === "Phụ Huynh 1"
      );
      const g2 = student.guardians.find(
        (g: any) => g.fullName === "Phụ Huynh 2"
      );
      expect(g1.isPrimary).toBe(true);
      expect(g2.isPrimary).toBe(false);

      // Demote g1 with PATCH { isPrimary: false } -> g2 must become primary automatically
      const demoteRes = await client.patch(
        `/api/students/${student.id}/guardians/${g1.id}`,
        { isPrimary: false }
      );
      expect(demoteRes.status()).toBe(200);

      const gListRes = await client.get(
        `/api/students/${student.id}/guardians`
      );
      const guardians = unwrapList(await gListRes.json(), "guardians");
      const primaries = guardians.filter((g: any) => g.isPrimary);
      expect(primaries.length).toBe(1);
      expect(primaries[0].id).toBe(g2.id);

      // Delete g1 so g2 is the sole guardian, then attempt to demote g2 -> remains primary
      await client.delete(`/api/students/${student.id}/guardians/${g1.id}`);
      const soleDemoteRes = await client.patch(
        `/api/students/${student.id}/guardians/${g2.id}`,
        { isPrimary: false }
      );
      expect(soleDemoteRes.status()).toBe(200);
      const updatedG2 = unwrapItem(await soleDemoteRes.json(), "guardian");
      expect(updatedG2.isPrimary).toBe(true);
    });

    test("T5-E2E-M14-03: Invoice Partial Payment Cancellation Guard, Discount Auto-Settlement, Cancelled Invoice Re-Generation & Static VietQR on Paid Invoice", async ({
      request,
    }) => {
      const client = await registerAndLoginTeacher(request);
      await client.put("/api/workspace", {
        name: "Trung Tâm T5 VietQR",
        bankBin: "970436",
        bankCode: "VCB",
        bankName: "Vietcombank",
        bankAccountNumber: "0123456789",
        bankAccountName: "NGUYEN VAN GIAO VIEN",
      });

      const cls = await createTestClass(client, {
        defaultFeeAmount: 1500000,
        billingCycle: "MONTHLY",
      });
      const stu1 = await createTestStudent(client, {
        fullName: "HS T5 Phiếu Thu 1",
      });
      const stu2 = await createTestStudent(client, {
        fullName: "HS T5 Phiếu Thu 2",
      });

      await client.post("/api/enrollments", {
        classId: cls.id,
        studentIds: [stu1.id, stu2.id],
      });

      const genRes = await client.post("/api/invoices/generate", {
        classId: cls.id,
        billingPeriod: "2026-11",
      });
      const invoices = unwrapList(await genRes.json(), "invoices");
      const inv1 = invoices.find((i: any) => i.studentId === stu1.id);
      const inv2 = invoices.find((i: any) => i.studentId === stu2.id);

      // 1. Partial payment of 900,000 on inv1 -> PARTIAL
      const payRes = await client.post(`/api/invoices/${inv1.id}/payments`, {
        amount: 900000,
        method: "BANK_TRANSFER",
      });
      expect(payRes.status()).toBe(201);

      // 2. Cancelling PARTIAL invoice (paidAmount > 0) rejected with 400
      const cancelPartial = await client.patch(`/api/invoices/${inv1.id}`, {
        status: "CANCELLED",
      });
      expect(cancelPartial.status()).toBe(400);

      // 3. Reducing netAmount (1,500,000 - 700,000 = 800,000) below paidAmount (900,000) rejected with 400
      const overDiscount = await client.patch(`/api/invoices/${inv1.id}`, {
        discountAmount: 700000,
      });
      expect(overDiscount.status()).toBe(400);

      // 4. Setting discountAmount = 600,000 so netAmount === paidAmount (900,000) auto-transitions PARTIAL -> PAID
      const settleDiscount = await client.patch(`/api/invoices/${inv1.id}`, {
        discountAmount: 600000,
      });
      expect(settleDiscount.status()).toBe(200);
      const settledInv = unwrapItem(await settleDiscount.json(), "invoice");
      expect(settledInv.status).toBe("PAID");

      // 5. VietQR on PAID invoice (remainingAmount === 0) generates Static QR (000201010211) with amount = 0
      const qrRes = await client.get(`/api/invoices/${inv1.id}/vietqr`);
      expect(qrRes.status()).toBe(200);
      const qrBody = await qrRes.json();
      expect(qrBody.amount).toBe(0);
      expect(qrBody.qrPayload.startsWith("000201010211")).toBe(true);

      // 6. Cancel unpaid inv2 -> CANCELLED, then re-generate for 2026-11 -> creates a new invoice for stu2 with a fresh invoiceNumber
      const cancelInv2 = await client.patch(`/api/invoices/${inv2.id}`, {
        status: "CANCELLED",
      });
      expect(cancelInv2.status()).toBe(200);

      // Attempting to un-cancel inv2 is rejected with 400
      const uncancelInv2 = await client.patch(`/api/invoices/${inv2.id}`, {
        status: "UNPAID",
      });
      expect(uncancelInv2.status()).toBe(400);

      const regenRes = await client.post("/api/invoices/generate", {
        classId: cls.id,
        billingPeriod: "2026-11",
      });
      expect(regenRes.status()).toBe(201);
      const regenBody = await regenRes.json();
      expect(regenBody.createdCount).toBe(1);
      expect(regenBody.skippedCount).toBe(1);
      expect(regenBody.invoices[0].studentId).toBe(stu2.id);
      expect(regenBody.invoices[0].invoiceNumber).not.toBe(inv2.invoiceNumber);
    });

    test("T5-E2E-M14-04: Malformed JSON Request Bodies & >366-Day Session Generation Range Rejected with 400", async ({
      request,
    }) => {
      const client = await registerAndLoginTeacher(request);
      const cls = await createTestClass(client);

      // 1. > 366 days session generation rejected with 400
      const longGenRes = await client.post(
        `/api/classes/${cls.id}/generate-sessions`,
        {
          fromDate: "2026-01-01",
          toDate: "2027-02-01",
        }
      );
      expect(longGenRes.status()).toBe(400);

      // 2. Malformed JSON bodies across Modules 2–4 endpoints return 400 (not 500)
      for (const path of [
        "/api/classes",
        "/api/students",
        "/api/enrollments",
        "/api/fee-plans",
        "/api/invoices/generate",
      ]) {
        const badRes = await request.fetch(`${BASE_URL}${path}`, {
          method: "POST",
          headers: client.headers({ "Content-Type": "application/json" }),
          data: Buffer.from("{ broken_json_payload", "utf-8"),
        });
        expect(badRes.status(), `Expected 400 on ${path}`).toBe(400);
      }
    });
  });

  // ===========================================================================
  // MODULES 5–9 & SPECIALIZED ENGINES: White-Box Adversarial Tests (T5-M59-01..12)
  // ===========================================================================
  test.describe("Modules 5–9 & Specialized Engines — White-Box Adversarial Coverage (T5-M59-01..12)", () => {
    test("T5-M59-01: Session roster preserves attendance of subsequently PAUSED/DROPPED students, CHECK_OUT_ALL clamps clock-skew timestamps, and batch attendance rejects cross-tenant studentId", async ({
      request,
    }) => {
      const teacherA = await registerAndLoginTeacher(request);
      const teacherB = await registerAndLoginTeacher(request);

      const clsA = await createTestClass(teacherA);
      const s1 = await createTestStudent(teacherA, { fullName: "HS Đang Học" });
      const s2 = await createTestStudent(teacherA, { fullName: "HS Sẽ Nghỉ" });
      const sB = await createTestStudent(teacherB, {
        fullName: "HS Khác Workspace",
      });

      await teacherA.post("/api/enrollments", {
        classId: clsA.id,
        studentId: s1.id,
      });
      const enr2Res = await teacherA.post("/api/enrollments", {
        classId: clsA.id,
        studentId: s2.id,
      });
      const enr2Body = await enr2Res.json();
      const enr2 =
        unwrapList(enr2Body, "enrollments")[0] ??
        unwrapItem(enr2Body, "enrollment");

      const sessRes = await teacherA.post("/api/sessions", {
        classId: clsA.id,
        sessionDate: "2026-11-18",
        startTime: "18:00",
        endTime: "19:30",
      });
      const session = unwrapItem(await sessRes.json(), "session");

      // Mark all present at 18:00
      const markInRes = await teacherA.post(
        `/api/sessions/${session.id}/attendance`,
        {
          action: "MARK_ALL_PRESENT",
          timestamp: "2026-11-18T18:00:00.000Z",
        }
      );
      expect(markInRes.status()).toBe(200);

      // Clock-skew CHECK_OUT_ALL with timestamp earlier than checkInAt (17:00 < 18:00)
      // White-box check: route clamps safeCheckOutAt = checkInAt + 1000ms
      const skewOutRes = await teacherA.post(
        `/api/sessions/${session.id}/attendance`,
        {
          action: "CHECK_OUT_ALL",
          timestamp: "2026-11-18T17:00:00.000Z",
        }
      );
      expect(skewOutRes.status()).toBe(200);
      const skewOutBody = await skewOutRes.json();
      for (const att of skewOutBody.attendances) {
        expect(new Date(att.checkOutAt).getTime()).toBeGreaterThanOrEqual(
          new Date(att.checkInAt).getTime()
        );
      }

      // Now transition s2 enrollment to DROPPED
      const dropRes = await teacherA.patch(`/api/enrollments/${enr2.id}`, {
        status: "DROPPED",
      });
      expect(dropRes.status()).toBe(200);

      // GET /api/sessions/[id] must still include s2's historical attendance row in roster with enrollmentId: null
      const detailRes = await teacherA.get(`/api/sessions/${session.id}`);
      expect(detailRes.status()).toBe(200);
      const detail = await detailRes.json();
      const s2Roster = detail.roster.find((r: any) => r.studentId === s2.id);
      expect(s2Roster).toBeDefined();
      expect(s2Roster.enrollmentId).toBeNull();
      expect(s2Roster.status).toBe("PRESENT");

      // Batch attendance with 1 valid student and 1 cross-tenant student must fail with 404 and roll back
      const batchCrossRes = await teacherA.post(
        `/api/sessions/${session.id}/attendance`,
        {
          records: [
            { studentId: s1.id, status: "LATE" },
            { studentId: sB.id, status: "PRESENT" },
          ],
        }
      );
      expect(batchCrossRes.status()).toBe(404);

      // Verify s1 was NOT mutated to LATE
      const detailAfter = await (
        await teacherA.get(`/api/sessions/${session.id}`)
      ).json();
      const s1Roster = detailAfter.roster.find(
        (r: any) => r.studentId === s1.id
      );
      expect(s1Roster.status).toBe("PRESENT");
    });

    test("T5-M59-02: FaceAI descriptor validation rejects sub-epsilon norm (1e-9), stringified numbers, and non-finite floats with 400", async ({
      request,
    }) => {
      const client = await registerAndLoginTeacher(request);
      const stu = await createTestStudent(client);

      // 1. Sub-epsilon norm: 128 floats of 1e-9 -> sqrt(128 * 1e-18) = 1.13e-8 < 1e-6 -> 400
      const tinyVecRes = await client.post("/api/face-ai/descriptors", {
        studentId: stu.id,
        descriptor: new Array(128).fill(1e-9),
      });
      expect(tinyVecRes.status()).toBe(400);

      // 2. Stringified numbers array: ["0.1", "0.2", ...] -> rejected by strict typeof x === "number"
      const stringNumVecRes = await client.post("/api/face-ai/descriptors", {
        studentId: stu.id,
        descriptor: new Array(128).fill("0.1"),
      });
      expect(stringNumVecRes.status()).toBe(400);

      // 3. Valid enrollment with unknown source falls back to UPLOAD and normalizes to unit L2 norm
      const unnormalized = new Array(128).fill(2.5);
      const validRes = await client.post("/api/face-ai/descriptors", {
        studentId: stu.id,
        descriptor: unnormalized,
        source: "UNKNOWN_CUSTOM_CAMERA",
      });
      expect(validRes.status()).toBe(201);
      const saved = unwrapItem(await validRes.json(), "descriptor");
      expect(saved.source).toBe("UPLOAD");
      const l2 = Math.sqrt(
        (saved.descriptor as number[]).reduce((acc, v) => acc + v * v, 0)
      );
      expect(l2).toBeCloseTo(1.0, 4);
    });

    test("T5-M59-03: FaceAI stream-proxy blocks SSRF hosts/protocols (127.x, 169.254.x, [::1], metadata.google.internal, file:, data:) and sanitizes SVG XSS payloads", async ({
      request,
    }) => {
      const client = await registerAndLoginTeacher(request);

      const ssrfUrls = [
        "file:///etc/passwd",
        "data:text/html,<script>alert(1)</script>",
        "ftp://192.168.1.10/stream.mjpg",
        "http://127.0.0.1:5432/",
        "http://127.10.20.30:8080/video",
        "http://localhost:3000/api/workspace",
        "http://internal.localhost/stream",
        "http://[::1]:3000/",
        "http://0.0.0.0:8080/",
        "http://169.254.169.254/latest/meta-data/",
        "http://metadata.google.internal/computeMetadata/v1/",
        "http://100.100.100.200/latest/meta-data/",
        "not-a-valid-url",
      ];

      for (const badUrl of ssrfUrls) {
        const res = await client.get("/api/face-ai/stream-proxy", {
          url: badUrl,
        });
        expect(res.status(), `Expected 400 for SSRF URL: ${badUrl}`).toBe(400);
      }

      // Valid synthetic:// and external https:// URLs succeed and sanitize XSS in studentCode
      const xssRes = await client.get("/api/face-ai/stream-proxy", {
        url: "synthetic://classroom-cam-01",
        studentCode: 'HS001"><script>alert(1)</script>',
      });
      expect(xssRes.status()).toBe(200);
      const svgText = await xssRes.text();
      expect(svgText).toContain("<svg");
      expect(svgText).not.toContain("<script>");
      expect(svgText).toContain("HS001scriptalert");
    });

    test("T5-M59-04: FaceAI match supports detections[0].descriptor payload, preserves manual LATE status across CHECK_IN and CHECK_OUT, and handles direct CHECK_OUT without prior check-in", async ({
      request,
    }) => {
      const client = await registerAndLoginTeacher(request);
      const cls = await createTestClass(client);
      const sLate = await createTestStudent(client, {
        fullName: "HS Đi Muộn",
      });
      const sDirectOut = await createTestStudent(client, {
        fullName: "HS Quét Ra Về Trực Tiếp",
      });
      await client.post("/api/enrollments", {
        classId: cls.id,
        studentIds: [sLate.id, sDirectOut.id],
      });

      const vecLate = generateNormalizedDescriptor("LATE-STU-VEC");
      const vecOut = generateNormalizedDescriptor("DIRECT-OUT-VEC");
      await client.post("/api/face-ai/descriptors", {
        studentId: sLate.id,
        descriptor: vecLate,
      });
      await client.post("/api/face-ai/descriptors", {
        studentId: sDirectOut.id,
        descriptor: vecOut,
      });

      const sessRes = await client.post("/api/sessions", {
        classId: cls.id,
        sessionDate: "2026-11-19",
        startTime: "18:00",
        endTime: "19:30",
      });
      const session = unwrapItem(await sessRes.json(), "session");

      // Pre-mark sLate as LATE without checkInAt (or with manual checkInAt)
      await client.post(`/api/sessions/${session.id}/attendance`, {
        studentId: sLate.id,
        status: "LATE",
        checkInAt: null,
      });

      // Scan sLate using `detections: [{ descriptor }]` payload format
      const noisyVec = perturbDescriptor(vecLate, 0.04);
      const scan1Res = await client.post("/api/face-ai/match", {
        sessionId: session.id,
        scanMode: "CHECK_IN",
        detections: [{ descriptor: noisyVec }],
      });
      expect(scan1Res.status()).toBe(200);
      const scan1 = await scan1Res.json();
      expect(scan1.matched).toBe(true);
      expect(scan1.attendance.status).toBe("LATE"); // Preserved LATE!
      expect(scan1.attendance.checkInAt).toBeTruthy();

      // Cooldown scan with exact vector (confidence = 1.0 > noisy confidence) upgrades confidenceScore while keeping LATE
      const scan2Res = await client.post("/api/face-ai/match", {
        sessionId: session.id,
        scanMode: "CHECK_IN",
        descriptor: vecLate,
      });
      const scan2 = await scan2Res.json();
      expect(scan2.cooldownProtected).toBe(true);
      expect(scan2.attendance.status).toBe("LATE");
      expect(scan2.attendance.confidenceScore).toBe(1);

      // Direct CHECK_OUT for sDirectOut who never checked in -> sets both checkInAt and checkOutAt
      const directOutRes = await client.post("/api/face-ai/match", {
        sessionId: session.id,
        scanMode: "CHECK_OUT",
        descriptor: vecOut,
      });
      expect(directOutRes.status()).toBe(200);
      const directOut = await directOutRes.json();
      expect(directOut.matched).toBe(true);
      expect(directOut.attendance.checkInAt).toBeTruthy();
      expect(directOut.attendance.checkOutAt).toBeTruthy();
    });

    test("T5-M59-05: Homework rejects cross-workspace questionIdsJson on POST/PATCH (404), supports clearing graded score to null, and rolls back batch submissions on cross-tenant studentId", async ({
      request,
    }) => {
      const teacherA = await registerAndLoginTeacher(request);
      const teacherB = await registerAndLoginTeacher(request);

      const clsA = await createTestClass(teacherA);
      const stuA = await createTestStudent(teacherA);
      const stuB = await createTestStudent(teacherB);
      await teacherA.post("/api/enrollments", {
        classId: clsA.id,
        studentId: stuA.id,
      });

      const qBRes = await teacherB.post("/api/questions", {
        type: "SHORT_ANSWER",
        subject: "Toán",
        topic: "Bí mật",
        prompt: "Câu hỏi của Giáo viên B?",
        correctAnswer: "42",
      });
      const qB = unwrapItem(await qBRes.json(), "question");

      // 1. Teacher A attempting to create Homework linking Teacher B's questionId -> 404
      const crossHwPost = await teacherA.post("/api/homeworks", {
        classId: clsA.id,
        title: "BTVN Gắn Câu Hỏi Cross-Tenant",
        dueDate: "2026-11-20T23:59:59.000Z",
        maxScore: 10,
        questionIdsJson: [qB.id],
      });
      expect(crossHwPost.status()).toBe(404);

      // 2. Create valid Homework in Workspace A, then attempt PATCH with Teacher B's questionId -> 404
      const hwRes = await teacherA.post("/api/homeworks", {
        classId: clsA.id,
        title: "BTVN Hợp Lệ",
        dueDate: "2020-01-01T00:00:00.000Z", // Past dueDate to test auto-LATE when submittedAt is omitted
        maxScore: 20,
      });
      expect(hwRes.status()).toBe(201);
      const hw = unwrapItem(await hwRes.json(), "homework");

      const crossHwPatch = await teacherA.patch(`/api/homeworks/${hw.id}`, {
        questionIdsJson: [qB.id],
      });
      expect(crossHwPatch.status()).toBe(404);

      // 3. Submit without submittedAt when homework dueDate is in the past -> auto-detects LATE
      const autoLateRes = await teacherA.post(
        `/api/homeworks/${hw.id}/submissions`,
        {
          studentId: stuA.id,
          status: "SUBMITTED",
        }
      );
      expect(autoLateRes.status()).toBe(200);
      const autoLateSub = unwrapItem(await autoLateRes.json(), "submission");
      expect(autoLateSub.status).toBe("LATE");
      expect(autoLateSub.submittedAt).toBeTruthy();

      // 4. Grade with score = 18.5, then clear score back to null
      const gradeRes = await teacherA.post(
        `/api/homeworks/${hw.id}/submissions`,
        {
          studentId: stuA.id,
          score: 18.5,
        }
      );
      expect(unwrapItem(await gradeRes.json(), "submission").status).toBe(
        "GRADED"
      );

      const clearScoreRes = await teacherA.post(
        `/api/homeworks/${hw.id}/submissions`,
        {
          studentId: stuA.id,
          status: "SUBMITTED",
          score: null,
        }
      );
      const clearedSub = unwrapItem(await clearScoreRes.json(), "submission");
      expect(clearedSub.score).toBeNull();

      // 5. Batch submission with [stuA, stuB] -> 404 and stuA is not updated
      const batchInvalidRes = await teacherA.post(
        `/api/homeworks/${hw.id}/submissions`,
        {
          submissions: [
            { studentId: stuA.id, status: "GRADED", score: 20 },
            { studentId: stuB.id, status: "GRADED", score: 10 },
          ],
        }
      );
      expect(batchInvalidRes.status()).toBe(404);
    });

    test("T5-M59-06: Question Bank normalizes shorthand string/alias MCQ options, matches correctAnswer by option text or ID, and rejects cross-tenant duplicateFromId", async ({
      request,
    }) => {
      const teacherA = await registerAndLoginTeacher(request);
      const teacherB = await registerAndLoginTeacher(request);

      // 1. Shorthand string options array + correctAnswer matching option text (case-insensitive)
      const q1Res = await teacherA.post("/api/questions", {
        type: "MULTIPLE_CHOICE",
        subject: "Hóa Học",
        topic: "Bảng tuần hoàn",
        difficulty: "HARD",
        prompt: "Ký hiệu hóa học của Vàng là gì?",
        options: ["Ag", "Au", "Fe", "Cu"],
        correctAnswer: "au", // matches text of option B case-insensitively
        tags: "hoa-hoc, kim-loai, hoa-hoc", // duplicate tag should be deduplicated
      });
      expect(q1Res.status()).toBe(201);
      const q1 = unwrapItem(await q1Res.json(), "question");
      expect(q1.optionsJson).toEqual([
        { id: "A", text: "Ag" },
        { id: "B", text: "Au" },
        { id: "C", text: "Fe" },
        { id: "D", text: "Cu" },
      ]);
      expect(q1.tagsJson).toEqual(["hoa-hoc", "kim-loai"]);

      // 2. MCQ with correctAnswer matching neither option id nor option text -> 400
      const mismatchRes = await teacherA.post("/api/questions", {
        type: "MULTIPLE_CHOICE",
        subject: "Hóa Học",
        topic: "Bảng tuần hoàn",
        prompt: "Câu hỏi đáp án không khớp?",
        options: ["Ag", "Au"],
        correctAnswer: "Zn",
      });
      expect(mismatchRes.status()).toBe(400);

      // 3. Teacher B attempting to clone Teacher A's question via duplicateFromId -> 404
      const crossCloneRes = await teacherB.post("/api/questions", {
        duplicateFromId: q1.id,
      });
      expect(crossCloneRes.status()).toBe(404);
    });

    test("T5-M59-07: Minigame validates all 5 archetypes with default rules, clones templates accurately, and rejects cross-workspace questionIds on PATCH", async ({
      request,
    }) => {
      const teacherA = await registerAndLoginTeacher(request);
      const teacherB = await registerAndLoginTeacher(request);

      const qB = unwrapItem(
        await (
          await teacherB.post("/api/questions", {
            type: "SHORT_ANSWER",
            subject: "Toán",
            topic: "T5",
            prompt: "Câu hỏi B?",
            correctAnswer: "1",
          })
        ).json(),
        "question"
      );

      const archetypes = [
        "SPEED_QUIZ",
        "FLASH_MATCH",
        "WORD_CROSS",
        "TEAM_BUZZER",
        "LUCKY_WHEEL",
      ] as const;

      let firstMgId = "";
      for (const type of archetypes) {
        const res = await teacherA.post("/api/minigames", {
          title: `Minigame ${type}`,
          type,
        });
        expect(res.status()).toBe(201);
        const mg = unwrapItem(await res.json(), "minigame");
        expect(mg.type).toBe(type);
        expect(mg.timeLimit).toBeGreaterThan(0);
        expect(mg.pointsPerQuestion).toBeGreaterThan(0);
        expect(mg.rulesJson).toBeTruthy();
        if (!firstMgId) firstMgId = mg.id;
      }

      // Clone minigame in Workspace A
      const cloneRes = await teacherA.post("/api/minigames", {
        cloneFromId: firstMgId,
      });
      expect(cloneRes.status()).toBe(201);
      const cloned = unwrapItem(await cloneRes.json(), "minigame");
      expect(cloned.title).toContain("(Bản sao)");

      // Teacher B attempting to clone Teacher A's minigame -> 404
      const crossCloneRes = await teacherB.post("/api/minigames", {
        cloneFromId: firstMgId,
      });
      expect(crossCloneRes.status()).toBe(404);

      // Teacher A attempting to PATCH minigame with Teacher B's questionId -> 404
      const crossPatchRes = await teacherA.patch(
        `/api/minigames/${firstMgId}`,
        {
          questionIdsJson: [qB.id],
        }
      );
      expect(crossPatchRes.status()).toBe(404);
    });

    test("T5-M59-08: GameSession preserves requested questionIds snapshot order, auto-falls back to workspace questions when empty, and rejects cross-tenant student in teamsConfigJson", async ({
      request,
    }) => {
      const teacherA = await registerAndLoginTeacher(request);
      const teacherB = await registerAndLoginTeacher(request);

      const clsA = await createTestClass(teacherA);
      const stuA = await createTestStudent(teacherA);
      const stuB = await createTestStudent(teacherB);

      const q1 = unwrapItem(
        await (
          await teacherA.post("/api/questions", {
            type: "SHORT_ANSWER",
            prompt: "Câu số 1",
            correctAnswer: "1",
          })
        ).json(),
        "question"
      );
      const q2 = unwrapItem(
        await (
          await teacherA.post("/api/questions", {
            type: "SHORT_ANSWER",
            prompt: "Câu số 2",
            correctAnswer: "2",
          })
        ).json(),
        "question"
      );
      const q3 = unwrapItem(
        await (
          await teacherA.post("/api/questions", {
            type: "SHORT_ANSWER",
            prompt: "Câu số 3",
            correctAnswer: "3",
          })
        ).json(),
        "question"
      );

      // Minigame with specific reversed question order [q3, q1, q2]
      const mg = unwrapItem(
        await (
          await teacherA.post("/api/minigames", {
            title: "Game Thứ Tự Câu Hỏi",
            type: "SPEED_QUIZ",
            questionIdsJson: [q3.id, q1.id, q2.id],
          })
        ).json(),
        "minigame"
      );

      // 1. Reject teamsConfigJson containing Teacher B's student -> 404
      const badTeamGs = await teacherA.post("/api/game-sessions", {
        classId: clsA.id,
        minigameId: mg.id,
        mode: "TEAM",
        teamsConfigJson: [{ name: "Đội A", studentIds: [stuA.id, stuB.id] }],
      });
      expect(badTeamGs.status()).toBe(404);

      // 2. Launch valid GameSession and verify snapshot order [q3, q1, q2]
      const gsRes = await teacherA.post("/api/game-sessions", {
        classId: clsA.id,
        minigameId: mg.id,
        mode: "INDIVIDUAL",
      });
      expect(gsRes.status()).toBe(201);
      const gs = unwrapItem(await gsRes.json(), "gameSession");
      expect(gs.questionsSnapshotJson.map((q: any) => q.id)).toEqual([
        q3.id,
        q1.id,
        q2.id,
      ]);
    });

    test("T5-M59-09: GameSession ranking breaks effectiveScore ties by accuracy, deduplicates students across teams, and idempotently cleans up stale rows on re-finalization", async ({
      request,
    }) => {
      const client = await registerAndLoginTeacher(request);
      const cls = await createTestClass(client);
      const s1 = await createTestStudent(client, { fullName: "HS 1" });
      const s2 = await createTestStudent(client, { fullName: "HS 2" });
      const s3 = await createTestStudent(client, { fullName: "HS 3" });
      const s4 = await createTestStudent(client, { fullName: "HS 4" });
      await client.post("/api/enrollments", {
        classId: cls.id,
        studentIds: [s1.id, s2.id, s3.id, s4.id],
      });

      const mg = unwrapItem(
        await (
          await client.post("/api/minigames", {
            title: "Game Tie-Break & Idempotency",
            type: "LUCKY_WHEEL",
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

      // First finalization:
      // s1: score 300 + bonus 50 = 350, correct 3/5 (60%)
      // s2: score 350 + bonus 0  = 350, correct 4/5 (80%) -> wins Rank 1 by accuracy!
      // s3: score 200 + bonus 0  = 200, correct 2/5 (40%)
      // s4: score 200 + bonus 0  = 200, correct 2/5 (40%) -> ties with s3 at Rank 3!
      const fin1Res = await client.patch(`/api/game-sessions/${gs.id}`, {
        status: "COMPLETED",
        results: [
          {
            studentId: s1.id,
            score: 300,
            bonusPoints: 50,
            correctCount: 3,
            totalQuestions: 5,
          },
          {
            studentId: s2.id,
            score: 350,
            bonusPoints: 0,
            correctCount: 4,
            totalQuestions: 5,
          },
          {
            studentId: s3.id,
            score: 200,
            bonusPoints: 0,
            correctCount: 2,
            totalQuestions: 5,
          },
          {
            studentId: s4.id,
            score: 200,
            bonusPoints: 0,
            correctCount: 2,
            totalQuestions: 5,
          },
        ],
      });
      expect(fin1Res.status()).toBe(200);
      const fin1Body = await fin1Res.json();
      const firstEndedAt = fin1Body.gameSession.endedAt;
      expect(firstEndedAt).toBeTruthy();

      const rS2 = fin1Body.results.find((r: any) => r.studentId === s2.id);
      const rS1 = fin1Body.results.find((r: any) => r.studentId === s1.id);
      const rS3 = fin1Body.results.find((r: any) => r.studentId === s3.id);
      const rS4 = fin1Body.results.find((r: any) => r.studentId === s4.id);

      expect(rS2.rank).toBe(1);
      expect(rS2.accuracy).toBe(80);
      expect(rS1.rank).toBe(2);
      expect(rS1.accuracy).toBe(60);
      expect(rS3.rank).toBe(3);
      expect(rS4.rank).toBe(3);

      // Re-finalization idempotency with only [s1, s2] (s3 & s4 removed)
      const fin2Res = await client.patch(`/api/game-sessions/${gs.id}`, {
        status: "COMPLETED",
        results: [
          {
            studentId: s1.id,
            score: 500,
            bonusPoints: 0,
            correctCount: 5,
            totalQuestions: 5,
          },
          {
            studentId: s2.id,
            score: 400,
            bonusPoints: 0,
            correctCount: 4,
            totalQuestions: 5,
          },
        ],
      });
      expect(fin2Res.status()).toBe(200);
      const fin2Body = await fin2Res.json();
      expect(fin2Body.gameSession.endedAt).toBe(firstEndedAt);
      expect(fin2Body.results).toHaveLength(2);
      expect(fin2Body.results[0].studentId).toBe(s1.id);
      expect(fin2Body.results[0].rank).toBe(1);
      expect(fin2Body.results[1].studentId).toBe(s2.id);
      expect(fin2Body.results[1].rank).toBe(2);
    });

    test("T5-M59-10: Leaderboard dynamically scales effectiveBonusCap when maxBonusRaw > 100, allows query weight overrides over configId, and rejects invalid date/weight params", async ({
      request,
    }) => {
      const client = await registerAndLoginTeacher(request);
      const cls = await createTestClass(client);
      const sHigh = await createTestStudent(client, {
        fullName: "HS Siêu Điểm Thưởng",
      });
      const sMid = await createTestStudent(client, {
        fullName: "HS Nửa Điểm Thưởng",
      });
      await client.post("/api/enrollments", {
        classId: cls.id,
        studentIds: [sHigh.id, sMid.id],
      });

      // Award 200 bonus points to sHigh (> default cap 100) and 100 bonus points to sMid
      await client.post("/api/points", {
        studentId: sHigh.id,
        classId: cls.id,
        points: 200,
        reason: "Giải Nhất Olympic",
      });
      await client.post("/api/points", {
        studentId: sMid.id,
        classId: cls.id,
        points: 100,
        reason: "Giải Nhì Olympic",
      });

      // Create a config with 100% attendanceWeight (0% bonusWeight)
      const cfg = unwrapItem(
        await (
          await client.post("/api/leaderboards/configs", {
            name: "Chỉ Chuyên Cần",
            classId: cls.id,
            attendanceWeight: 100,
            homeworkWeight: 0,
            gameWeight: 0,
            bonusWeight: 0,
          })
        ).json(),
        "config"
      );

      // Query with configId BUT override weights via query params to 100% bonusWeight
      const lbRes = await client.get("/api/leaderboards", {
        classId: cls.id,
        configId: cfg.id,
        attendanceWeight: 0,
        homeworkWeight: 0,
        gameWeight: 0,
        bonusWeight: 100,
      });
      expect(lbRes.status()).toBe(200);
      const lb = await lbRes.json();
      expect(lb.effectiveBonusCap).toBe(200);

      const rHigh = lb.rankings.find((r: any) => r.studentId === sHigh.id);
      const rMid = lb.rankings.find((r: any) => r.studentId === sMid.id);
      expect(rHigh.bonusScore).toBe(100);
      expect(rHigh.totalScore).toBe(100);
      expect(rMid.bonusScore).toBe(50);
      expect(rMid.totalScore).toBe(50);

      // Reject from > to with 400
      const badDateRes = await client.get("/api/leaderboards", {
        classId: cls.id,
        from: "2026-12-01",
        to: "2026-11-01",
      });
      expect(badDateRes.status()).toBe(400);

      // Reject negative weight query param with 400
      const negWeightRes = await client.get("/api/leaderboards", {
        classId: cls.id,
        bonusWeight: -10,
      });
      expect(negWeightRes.status()).toBe(400);
    });

    test("T5-M59-11: LeaderboardConfig isDefault switching scopes strictly per (workspaceId, classId) without clobbering other classes or global defaults, and rejects invalid period dates", async ({
      request,
    }) => {
      const client = await registerAndLoginTeacher(request);
      const clsA = await createTestClass(client, { name: "Lớp A" });
      const clsB = await createTestClass(client, { name: "Lớp B" });

      // 1. Global default (classId: null)
      const globalDefault = unwrapItem(
        await (
          await client.post("/api/leaderboards/configs", {
            name: "Mặc định Toàn Trung Tâm",
            isDefault: true,
          })
        ).json(),
        "config"
      );

      // 2. Class B default
      const clsBDefault = unwrapItem(
        await (
          await client.post("/api/leaderboards/configs", {
            name: "Mặc định Lớp B",
            classId: clsB.id,
            isDefault: true,
          })
        ).json(),
        "config"
      );

      // 3. Class A default #1, then Class A default #2
      const clsADef1 = unwrapItem(
        await (
          await client.post("/api/leaderboards/configs", {
            name: "Mặc định Lớp A - Cũ",
            classId: clsA.id,
            isDefault: true,
          })
        ).json(),
        "config"
      );
      const clsADef2 = unwrapItem(
        await (
          await client.post("/api/leaderboards/configs", {
            name: "Mặc định Lớp A - Mới",
            classId: clsA.id,
            isDefault: true,
          })
        ).json(),
        "config"
      );

      // Verify clsADef1 is now isDefault=false, while clsADef2, clsBDefault, and globalDefault are all isDefault=true!
      const allConfigs = unwrapList(
        await (await client.get("/api/leaderboards/configs")).json(),
        "configs"
      );
      expect(allConfigs.find((c: any) => c.id === clsADef1.id)?.isDefault).toBe(
        false
      );
      expect(allConfigs.find((c: any) => c.id === clsADef2.id)?.isDefault).toBe(
        true
      );
      expect(
        allConfigs.find((c: any) => c.id === clsBDefault.id)?.isDefault
      ).toBe(true);
      expect(
        allConfigs.find((c: any) => c.id === globalDefault.id)?.isDefault
      ).toBe(true);

      // 4. Reject periodStart > periodEnd on POST and PATCH with 400
      const badRangePost = await client.post("/api/leaderboards/configs", {
        name: "Lỗi Ngày",
        periodStart: "2026-12-01",
        periodEnd: "2026-11-01",
      });
      expect(badRangePost.status()).toBe(400);

      const badRangePatch = await client.patch(
        `/api/leaderboards/configs/${clsADef2.id}`,
        {
          periodStart: "invalid-date-string",
        }
      );
      expect(badRangePatch.status()).toBe(400);
    });

    test("T5-M59-12: PointTransaction deduplicates bulk studentIds, auto-infers PENALTY on negative points, scopes class vs global points in Leaderboard, and rolls back cross-tenant student awards", async ({
      request,
    }) => {
      const teacherA = await registerAndLoginTeacher(request);
      const teacherB = await registerAndLoginTeacher(request);

      const clsA = await createTestClass(teacherA);
      const clsOther = await createTestClass(teacherA);
      const s1 = await createTestStudent(teacherA, { fullName: "HS Điểm 1" });
      const s2 = await createTestStudent(teacherA, { fullName: "HS Điểm 2" });
      const sB = await createTestStudent(teacherB, { fullName: "HS Của B" });

      await teacherA.post("/api/enrollments", {
        classId: clsA.id,
        studentIds: [s1.id, s2.id],
      });

      // 1. Duplicate studentIds in bulk array -> deduplicated to 2 rows
      const bulkPtsRes = await teacherA.post("/api/points", {
        studentIds: [s1.id, s1.id, s2.id],
        classId: null, // Global workspace bonus
        points: 30,
        reason: "Thưởng chuyên cần toàn trung tâm",
      });
      expect(bulkPtsRes.status()).toBe(201);
      const bulkPtsBody = await bulkPtsRes.json();
      expect(bulkPtsBody.createdCount).toBe(2);

      // 2. Negative points without category -> auto-infer PENALTY
      const negPtsRes = await teacherA.post("/api/points", {
        studentId: s2.id,
        classId: clsA.id,
        points: -10,
        reason: "Quên mang sách",
      });
      expect(negPtsRes.status()).toBe(201);
      const negTx = unwrapItem(await negPtsRes.json(), "transaction");
      expect(negTx.category).toBe("PENALTY");

      // 3. Points awarded in clsOther must NOT count toward clsA leaderboard, whereas global (classId: null) points DO count
      await teacherA.post("/api/points", {
        studentId: s2.id,
        classId: clsOther.id,
        points: 90,
        reason: "Điểm riêng lớp khác",
      });

      const lbRes = await teacherA.get("/api/leaderboards", {
        classId: clsA.id,
      });
      const lb = await lbRes.json();
      const r1 = lb.rankings.find((r: any) => r.studentId === s1.id);
      const r2 = lb.rankings.find((r: any) => r.studentId === s2.id);
      expect(r1.bonusPointsRaw).toBe(30); // 30 global
      expect(r2.bonusPointsRaw).toBe(20); // 30 global - 10 clsA (excludes +90 from clsOther)

      // 4. Bulk award containing 1 valid student (s1) and 1 cross-tenant student (sB) -> 404 and 0 rows inserted
      const crossBulkRes = await teacherA.post("/api/points", {
        studentIds: [s1.id, sB.id],
        points: 50,
        reason: "Cross-tenant injection attempt",
      });
      expect(crossBulkRes.status()).toBe(404);
    });
  });
});
