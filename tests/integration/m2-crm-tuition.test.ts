import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { NextRequest } from "next/server";
import { prisma } from "@/lib/db";
import { SESSION_COOKIE_NAME } from "@/lib/auth";
import { registerTeacherWithWorkspace } from "@/lib/workspace";

import {
  GET as getClasses,
  POST as postClass,
} from "@/app/api/classes/route";
import {
  GET as getClassById,
  PATCH as patchClassById,
  DELETE as deleteClassById,
} from "@/app/api/classes/[id]/route";
import {
  GET as getScheduleSlots,
  POST as postScheduleSlots,
} from "@/app/api/classes/[id]/schedule-slots/route";
import {
  PATCH as patchScheduleSlot,
  DELETE as deleteScheduleSlot,
} from "@/app/api/classes/[id]/schedule-slots/[slotId]/route";
import { POST as generateClassSessions } from "@/app/api/classes/[id]/generate-sessions/route";
import { GET as getSchedule } from "@/app/api/schedule/route";
import { POST as generateWorkspaceSessions } from "@/app/api/schedule/generate-sessions/route";

import {
  GET as getStudents,
  POST as postStudent,
} from "@/app/api/students/route";
import {
  GET as getStudentById,
  PATCH as patchStudentById,
  DELETE as deleteStudentById,
} from "@/app/api/students/[id]/route";
import {
  GET as getGuardians,
  POST as postGuardian,
} from "@/app/api/students/[id]/guardians/route";
import {
  PATCH as patchGuardianById,
  DELETE as deleteGuardianById,
} from "@/app/api/students/[id]/guardians/[guardianId]/route";
import {
  GET as getEnrollments,
  POST as postEnrollment,
} from "@/app/api/enrollments/route";
import {
  PATCH as patchEnrollmentById,
  DELETE as deleteEnrollmentById,
} from "@/app/api/enrollments/[id]/route";

import {
  GET as getFeePlans,
  POST as postFeePlan,
} from "@/app/api/fee-plans/route";
import {
  PATCH as patchFeePlanById,
  DELETE as deleteFeePlanById,
} from "@/app/api/fee-plans/[id]/route";
import { GET as getInvoices } from "@/app/api/invoices/route";
import { POST as generateInvoices } from "@/app/api/invoices/generate/route";
import {
  GET as getInvoiceById,
  PATCH as patchInvoiceById,
} from "@/app/api/invoices/[id]/route";
import { POST as postInvoicePayment } from "@/app/api/invoices/[id]/payments/route";
import { GET as getInvoiceVietQr } from "@/app/api/invoices/[id]/vietqr/route";
import { GET as getFeesReport } from "@/app/api/fees/report/route";
import { PUT as putWorkspace } from "@/app/api/workspace/route";

function makeReq(
  url: string,
  token: string,
  options?: { method?: string; body?: unknown }
): NextRequest {
  const headers: Record<string, string> = {
    cookie: `${SESSION_COOKIE_NAME}=${token}`,
  };
  let bodyStr: string | undefined;
  if (options?.body !== undefined) {
    headers["content-type"] = "application/json";
    bodyStr = JSON.stringify(options.body);
  }
  return new NextRequest(url, {
    method: options?.method ?? "GET",
    headers,
    body: bodyStr,
  });
}

describe("Milestone 2 Integration: Modules 2–4 (Classes, Timetable, Students/Guardians/Enrollments, Tuition & VietQR)", () => {
  let teacher1: Awaited<ReturnType<typeof registerTeacherWithWorkspace>>;
  let teacher2: Awaited<ReturnType<typeof registerTeacherWithWorkspace>>;

  let classAId = "";
  let classBId = "";
  let slotAId = "";
  let student1Id = "";
  let student2Id = "";
  let student3Id = "";
  let guardian1Id = "";
  let guardian2Id = "";
  let enrollment1Id = "";
  let enrollment2Id = "";
  let feePlanMonthlyId = "";
  let invoice1Id = "";
  let invoice2Id = "";

  beforeAll(async () => {
    const suffix = `${Date.now()}-${Math.floor(Math.random() * 10000)}`;
    teacher1 = await registerTeacherWithWorkspace({
      fullName: "Thầy Lê Hoàng M2",
      email: `m2.teacher1.${suffix}@cmclass.vn`,
      password: "Password123!",
      workspaceName: "Workspace M2 Teacher 1",
    });

    teacher2 = await registerTeacherWithWorkspace({
      fullName: "Cô Phạm Thuỷ M2",
      email: `m2.teacher2.${suffix}@cmclass.vn`,
      password: "Password123!",
      workspaceName: "Workspace M2 Teacher 2",
    });
  });

  afterAll(async () => {
    const ids = [teacher1?.user?.id, teacher2?.user?.id].filter(
      Boolean
    ) as string[];
    if (ids.length > 0) {
      await prisma.user.deleteMany({
        where: { id: { in: ids } },
      });
    }
  });

  it("Module 2 (F09–F12): Class CRUD, ScheduleSlot validation, Conflict Detection, and Idempotent Session Generation", async () => {
    // 1. Create Class A with initial schedule slot (Mon 18:00-19:30)
    const createARes = await postClass(
      makeReq("http://localhost:3000/api/classes", teacher1.token, {
        method: "POST",
        body: {
          code: "m2-toan9a",
          name: "Toán 9 Chuyên Đề A",
          subject: "Toán",
          gradeLevel: "Khối 9",
          room: "P.101",
          defaultFeeAmount: 1500000,
          billingCycle: "MONTHLY",
          startDate: "2026-11-01",
          endDate: "2026-12-31",
          scheduleSlots: [
            { dayOfWeek: 1, startTime: "18:00", endTime: "19:30", room: "P.101" },
          ],
        },
      })
    );
    expect(createARes.status).toBe(201);
    const createABody = await createARes.json();
    expect(createABody.class.code).toBe("M2-TOAN9A");
    expect(createABody.class.scheduleSlots.length).toBe(1);
    expect(createABody.class.feePlans.length).toBe(1);
    classAId = createABody.class.id;
    slotAId = createABody.class.scheduleSlots[0].id;

    // 2. Duplicate class code in same workspace -> 409
    const dupRes = await postClass(
      makeReq("http://localhost:3000/api/classes", teacher1.token, {
        method: "POST",
        body: {
          code: "M2-TOAN9A",
          name: "Lớp Trùng Mã",
          subject: "Toán",
        },
      })
    );
    expect(dupRes.status).toBe(409);

    // 3. Invalid startDate > endDate -> 400
    const badDateRes = await postClass(
      makeReq("http://localhost:3000/api/classes", teacher1.token, {
        method: "POST",
        body: {
          name: "Lớp Sai Ngày",
          subject: "Toán",
          startDate: "2026-12-31",
          endDate: "2026-11-01",
        },
      })
    );
    expect(badDateRes.status).toBe(400);

    // 4. Add a second ScheduleSlot (Wed 18:00-19:30) to Class A
    const addSlotRes = await postScheduleSlots(
      makeReq(
        `http://localhost:3000/api/classes/${classAId}/schedule-slots`,
        teacher1.token,
        {
          method: "POST",
          body: {
            dayOfWeek: 3,
            startTime: "18:00",
            endTime: "19:30",
          },
        }
      ),
      { params: Promise.resolve({ id: classAId }) }
    );
    expect(addSlotRes.status).toBe(201);
    const addSlotBody = await addSlotRes.json();
    expect(addSlotBody.slot.room).toBe("P.101"); // Inherited from Class A

    // 5. Reject invalid ScheduleSlot time range (18:00 -> 17:30) with 400
    const badSlotRes = await postScheduleSlots(
      makeReq(
        `http://localhost:3000/api/classes/${classAId}/schedule-slots`,
        teacher1.token,
        {
          method: "POST",
          body: {
            dayOfWeek: 5,
            startTime: "18:00",
            endTime: "17:30",
          },
        }
      ),
      { params: Promise.resolve({ id: classAId }) }
    );
    expect(badSlotRes.status).toBe(400);

    // 6. Create Class B with overlapping Monday slot (18:30-20:00 in P.101) -> detect conflict
    const createBRes = await postClass(
      makeReq("http://localhost:3000/api/classes", teacher1.token, {
        method: "POST",
        body: {
          code: "M2-LY9B",
          name: "Vật Lý 9 Nâng Cao B",
          subject: "Vật Lý",
          room: "P.101",
          defaultFeeAmount: 200000,
          billingCycle: "PER_SESSION",
          scheduleSlots: [
            { dayOfWeek: 1, startTime: "18:30", endTime: "20:00", room: "P.101" },
          ],
        },
      })
    );
    expect(createBRes.status).toBe(201);
    const createBBody = await createBRes.json();
    classBId = createBBody.class.id;
    expect(createBBody.conflicts.length).toBeGreaterThanOrEqual(1);
    expect(createBBody.conflicts[0].type).toBe("TEACHER_AND_ROOM");

    // 7. Verify GET /api/schedule returns slots and conflicts
    const schedRes = await getSchedule(
      makeReq(
        "http://localhost:3000/api/schedule?weekStart=2026-11-02",
        teacher1.token
      )
    );
    expect(schedRes.status).toBe(200);
    const schedBody = await schedRes.json();
    expect(schedBody.slots.length).toBe(3);
    expect(schedBody.conflicts.length).toBeGreaterThanOrEqual(1);

    // 8. Idempotent Session Generation for Class A over 2026-11-01..2026-11-30 (Mon+Wed = 9 sessions)
    const gen1Res = await generateClassSessions(
      makeReq(
        `http://localhost:3000/api/classes/${classAId}/generate-sessions`,
        teacher1.token,
        {
          method: "POST",
          body: {
            fromDate: "2026-11-01",
            toDate: "2026-11-30",
          },
        }
      ),
      { params: Promise.resolve({ id: classAId }) }
    );
    expect(gen1Res.status).toBe(200);
    const gen1Body = await gen1Res.json();
    expect(gen1Body.createdCount).toBe(9);
    expect(gen1Body.skippedCount).toBe(0);
    expect(gen1Body.sessions.length).toBe(9);

    // Second run with identical range -> createdCount: 0, skippedCount: 9
    const gen2Res = await generateClassSessions(
      makeReq(
        `http://localhost:3000/api/classes/${classAId}/generate-sessions`,
        teacher1.token,
        {
          method: "POST",
          body: {
            fromDate: "2026-11-01",
            toDate: "2026-11-30",
          },
        }
      ),
      { params: Promise.resolve({ id: classAId }) }
    );
    expect(gen2Res.status).toBe(200);
    const gen2Body = await gen2Res.json();
    expect(gen2Body.createdCount).toBe(0);
    expect(gen2Body.skippedCount).toBe(9);

    // Workspace-wide session generation via POST /api/schedule/generate-sessions
    const wsGenRes = await generateWorkspaceSessions(
      makeReq(
        "http://localhost:3000/api/schedule/generate-sessions",
        teacher1.token,
        {
          method: "POST",
          body: {
            fromDate: "2026-11-01",
            toDate: "2026-11-30",
            classIds: [classAId, classBId],
          },
        }
      )
    );
    expect(wsGenRes.status).toBe(200);
    const wsGenBody = await wsGenRes.json();
    // Class A's 9 sessions are skipped; Class B (Mon only in Nov 2026 = 5 Mondays) creates 5 sessions
    expect(wsGenBody.createdCount).toBe(5);
    expect(wsGenBody.skippedCount).toBe(9);

    // Verify GET / PATCH Class A
    const patchRes = await patchClassById(
      makeReq(
        `http://localhost:3000/api/classes/${classAId}`,
        teacher1.token,
        {
          method: "PATCH",
          body: { room: "P.102" },
        }
      ),
      { params: Promise.resolve({ id: classAId }) }
    );
    expect(patchRes.status).toBe(200);
    const patchBody = await patchRes.json();
    expect(patchBody.class.room).toBe("P.102");
  });

  it("Module 3 (F14–F16): Sequential studentCode, Multi-Guardian single-primary normalization, and Enrollment lifecycle", async () => {
    // 1. Create Student 1 without studentCode -> auto-generates HS001
    const stu1Res = await postStudent(
      makeReq("http://localhost:3000/api/students", teacher1.token, {
        method: "POST",
        body: {
          fullName: "Nguyễn Minh Anh",
          school: "THCS Cầu Giấy",
          phone: "0911000001",
        },
      })
    );
    expect(stu1Res.status).toBe(201);
    const stu1Body = await stu1Res.json();
    expect(stu1Body.student.studentCode).toBe("HS001");
    student1Id = stu1Body.student.id;

    // 2. Create Student 2 without studentCode -> auto-generates HS002
    const stu2Res = await postStudent(
      makeReq("http://localhost:3000/api/students", teacher1.token, {
        method: "POST",
        body: {
          fullName: "Trần Quốc Bảo",
          school: "THCS Amsterdam",
          phone: "0911000002",
        },
      })
    );
    expect(stu2Res.status).toBe(201);
    const stu2Body = await stu2Res.json();
    expect(stu2Body.student.studentCode).toBe("HS002");
    student2Id = stu2Body.student.id;

    // 3. Duplicate studentCode in same workspace -> 409
    const dupStuRes = await postStudent(
      makeReq("http://localhost:3000/api/students", teacher1.token, {
        method: "POST",
        body: {
          studentCode: "HS001",
          fullName: "Học Sinh Trùng Mã",
        },
      })
    );
    expect(dupStuRes.status).toBe(409);

    // 4. Create Student 3 (for 100% scholarship test) -> HS003
    const stu3Res = await postStudent(
      makeReq("http://localhost:3000/api/students", teacher1.token, {
        method: "POST",
        body: {
          fullName: "Lê Hoàng Châu",
        },
      })
    );
    expect(stu3Res.status).toBe(201);
    const stu3Body = await stu3Res.json();
    expect(stu3Body.student.studentCode).toBe("HS003");
    student3Id = stu3Body.student.id;

    // 5. Add Guardian 1 (isPrimary: true) and Guardian 2 (isPrimary: true) to Student 1
    const g1Res = await postGuardian(
      makeReq(
        `http://localhost:3000/api/students/${student1Id}/guardians`,
        teacher1.token,
        {
          method: "POST",
          body: {
            fullName: "Bố Nguyễn Văn An",
            relationship: "Bố",
            phone: "0988111222",
            isPrimary: true,
          },
        }
      ),
      { params: Promise.resolve({ id: student1Id }) }
    );
    expect(g1Res.status).toBe(201);
    guardian1Id = (await g1Res.json()).guardian.id;

    const g2Res = await postGuardian(
      makeReq(
        `http://localhost:3000/api/students/${student1Id}/guardians`,
        teacher1.token,
        {
          method: "POST",
          body: {
            fullName: "Mẹ Trần Thu Hà",
            relationship: "Mẹ",
            phone: "0988333444",
            isPrimary: true,
          },
        }
      ),
      { params: Promise.resolve({ id: student1Id }) }
    );
    expect(g2Res.status).toBe(201);
    guardian2Id = (await g2Res.json()).guardian.id;

    // Verify single-primary normalization: only Guardian 2 is primary
    const listGRes = await getGuardians(
      makeReq(
        `http://localhost:3000/api/students/${student1Id}/guardians`,
        teacher1.token
      ),
      { params: Promise.resolve({ id: student1Id }) }
    );
    const listGBody = await listGRes.json();
    expect(listGBody.guardians.length).toBe(2);
    const primaries = listGBody.guardians.filter(
      (g: { isPrimary: boolean }) => g.isPrimary
    );
    expect(primaries.length).toBe(1);
    expect(primaries[0].id).toBe(guardian2Id);

    // Patch Guardian 1 back to isPrimary: true -> Guardian 2 becomes false
    const patchG1Res = await patchGuardianById(
      makeReq(
        `http://localhost:3000/api/students/${student1Id}/guardians/${guardian1Id}`,
        teacher1.token,
        {
          method: "PATCH",
          body: { isPrimary: true },
        }
      ),
      { params: Promise.resolve({ id: student1Id, guardianId: guardian1Id }) }
    );
    expect(patchG1Res.status).toBe(200);

    // Delete Guardian 1 (who is primary) -> Guardian 2 is promoted to primary
    const delG1Res = await deleteGuardianById(
      makeReq(
        `http://localhost:3000/api/students/${student1Id}/guardians/${guardian1Id}`,
        teacher1.token,
        { method: "DELETE" }
      ),
      { params: Promise.resolve({ id: student1Id, guardianId: guardian1Id }) }
    );
    expect(delG1Res.status).toBe(200);

    const afterDelGRes = await getGuardians(
      makeReq(
        `http://localhost:3000/api/students/${student1Id}/guardians`,
        teacher1.token
      ),
      { params: Promise.resolve({ id: student1Id }) }
    );
    const afterDelGBody = await afterDelGRes.json();
    expect(afterDelGBody.guardians.length).toBe(1);
    expect(afterDelGBody.guardians[0].id).toBe(guardian2Id);
    expect(afterDelGBody.guardians[0].isPrimary).toBe(true);

    // 6. Enroll Student 1 (PERCENTAGE 20%) and Student 2 (FIXED 300,000) into Class A
    const enr1Res = await postEnrollment(
      makeReq("http://localhost:3000/api/enrollments", teacher1.token, {
        method: "POST",
        body: {
          classId: classAId,
          studentId: student1Id,
          discountType: "PERCENTAGE",
          customFeeDiscount: 20,
          discountNote: "Giảm 20% học sinh giỏi",
        },
      })
    );
    expect(enr1Res.status).toBe(201);
    enrollment1Id = (await enr1Res.json()).enrollment.id;

    // Duplicate ACTIVE enrollment for Student 1 in Class A -> 409
    const dupEnrRes = await postEnrollment(
      makeReq("http://localhost:3000/api/enrollments", teacher1.token, {
        method: "POST",
        body: {
          classId: classAId,
          studentId: student1Id,
        },
      })
    );
    expect(dupEnrRes.status).toBe(409);

    const enr2Res = await postEnrollment(
      makeReq("http://localhost:3000/api/enrollments", teacher1.token, {
        method: "POST",
        body: {
          classId: classAId,
          studentId: student2Id,
          discountType: "FIXED",
          customFeeDiscount: 300000,
          discountNote: "Giảm 300k",
        },
      })
    );
    expect(enr2Res.status).toBe(201);
    enrollment2Id = (await enr2Res.json()).enrollment.id;

    // Mark Enrollment 2 as DROPPED, then re-enroll -> reactivates to ACTIVE with leftAt: null
    const dropRes = await patchEnrollmentById(
      makeReq(
        `http://localhost:3000/api/enrollments/${enrollment2Id}`,
        teacher1.token,
        {
          method: "PATCH",
          body: { status: "DROPPED" },
        }
      ),
      { params: Promise.resolve({ id: enrollment2Id }) }
    );
    expect(dropRes.status).toBe(200);
    expect((await dropRes.json()).enrollment.leftAt).not.toBeNull();

    const reactivateRes = await postEnrollment(
      makeReq("http://localhost:3000/api/enrollments", teacher1.token, {
        method: "POST",
        body: {
          classId: classAId,
          studentId: student2Id,
          discountType: "FIXED",
          customFeeDiscount: 300000,
        },
      })
    );
    expect(reactivateRes.status).toBe(201);
    const reactivateBody = await reactivateRes.json();
    expect(reactivateBody.enrollment.status).toBe("ACTIVE");
    expect(reactivateBody.enrollment.leftAt).toBeNull();
  });

  it("Module 4 (F17–F21): FeePlans, Bulk Invoices with Discounts & 100% Waiver, Manual Payments, VietQR, and Debt Report", async () => {
    // 1. Reject negative FeePlan amount -> 400
    const negPlanRes = await postFeePlan(
      makeReq("http://localhost:3000/api/fee-plans", teacher1.token, {
        method: "POST",
        body: {
          classId: classAId,
          name: "Biểu phí âm",
          billingCycle: "MONTHLY",
          amount: -100000,
        },
      })
    );
    expect(negPlanRes.status).toBe(400);

    // 2. Create default MONTHLY FeePlan (1,500,000 VND) for Class A
    const planRes = await postFeePlan(
      makeReq("http://localhost:3000/api/fee-plans", teacher1.token, {
        method: "POST",
        body: {
          classId: classAId,
          name: "Học phí chuẩn tháng 11",
          billingCycle: "MONTHLY",
          amount: 1500000,
          isDefault: true,
        },
      })
    );
    expect(planRes.status).toBe(201);
    feePlanMonthlyId = (await planRes.json()).feePlan.id;

    // 3. Generate bulk invoices for Class A (period 2026-11) -> 2 students (Student 1 & Student 2)
    const gen1Res = await generateInvoices(
      makeReq("http://localhost:3000/api/invoices/generate", teacher1.token, {
        method: "POST",
        body: {
          classId: classAId,
          feePlanId: feePlanMonthlyId,
          billingPeriod: "2026-11",
          dueDate: "2026-11-15",
        },
      })
    );
    expect(gen1Res.status).toBe(201);
    const gen1Body = await gen1Res.json();
    expect(gen1Body.createdCount).toBe(2);
    expect(gen1Body.skippedCount).toBe(0);

    const invStu1 = gen1Body.invoices.find(
      (i: { studentId: string }) => i.studentId === student1Id
    );
    const invStu2 = gen1Body.invoices.find(
      (i: { studentId: string }) => i.studentId === student2Id
    );
    expect(invStu1.baseAmount).toBe(1500000);
    expect(invStu1.discountAmount).toBe(300000); // 20% of 1,500,000
    expect(invStu1.netAmount).toBe(1200000);
    expect(invStu1.status).toBe("UNPAID");
    invoice1Id = invStu1.id;

    expect(invStu2.baseAmount).toBe(1500000);
    expect(invStu2.discountAmount).toBe(300000); // FIXED 300,000
    expect(invStu2.netAmount).toBe(1200000);
    invoice2Id = invStu2.id;

    // 4. Enroll Student 3 with 100% scholarship (PERCENTAGE: 100) and re-run bulk invoice generation
    const enr3Res = await postEnrollment(
      makeReq("http://localhost:3000/api/enrollments", teacher1.token, {
        method: "POST",
        body: {
          classId: classAId,
          studentId: student3Id,
          discountType: "PERCENTAGE",
          customFeeDiscount: 100,
          discountNote: "Học bổng 100%",
        },
      })
    );
    expect(enr3Res.status).toBe(201);

    const gen2Res = await generateInvoices(
      makeReq("http://localhost:3000/api/invoices/generate", teacher1.token, {
        method: "POST",
        body: {
          classId: classAId,
          feePlanId: feePlanMonthlyId,
          billingPeriod: "2026-11",
          dueDate: "2026-11-15",
        },
      })
    );
    expect(gen2Res.status).toBe(201);
    const gen2Body = await gen2Res.json();
    expect(gen2Body.createdCount).toBe(1);
    expect(gen2Body.skippedCount).toBe(2); // Student 1 and Student 2 skipped!
    expect(gen2Body.invoices[0].studentId).toBe(student3Id);
    expect(gen2Body.invoices[0].netAmount).toBe(0);
    expect(gen2Body.invoices[0].status).toBe("PAID"); // 100% waiver auto-marked PAID

    // 5. Reject PATCH invoice with discountAmount > baseAmount -> 400
    const badDiscRes = await patchInvoiceById(
      makeReq(
        `http://localhost:3000/api/invoices/${invoice1Id}`,
        teacher1.token,
        {
          method: "PATCH",
          body: { discountAmount: 2000000 },
        }
      ),
      { params: Promise.resolve({ id: invoice1Id }) }
    );
    expect(badDiscRes.status).toBe(400);

    // 6. VietQR before bank configuration -> 200 with bankConfigured: false
    const qrUnconfigRes = await getInvoiceVietQr(
      makeReq(
        `http://localhost:3000/api/invoices/${invoice1Id}/vietqr`,
        teacher1.token
      ),
      { params: Promise.resolve({ id: invoice1Id }) }
    );
    expect(qrUnconfigRes.status).toBe(200);
    const qrUnconfigBody = await qrUnconfigRes.json();
    expect(qrUnconfigBody.bankConfigured).toBe(false);
    expect(qrUnconfigBody.amount).toBe(1200000);

    // Configure Workspace 1 bank details
    const cfgBankRes = await putWorkspace(
      makeReq("http://localhost:3000/api/workspace", teacher1.token, {
        method: "PUT",
        body: {
          name: "Workspace M2 Teacher 1",
          bankBin: "970436",
          bankCode: "VCB",
          bankName: "Vietcombank",
          bankAccountNumber: "0011001234567",
          bankAccountName: "LE HOANG",
        },
      })
    );
    expect(cfgBankRes.status).toBe(200);

    // 7. Record partial payment (500,000 CASH) on Invoice 1 -> status PARTIAL
    const pay1Res = await postInvoicePayment(
      makeReq(
        `http://localhost:3000/api/invoices/${invoice1Id}/payments`,
        teacher1.token,
        {
          method: "POST",
          body: {
            amount: 500000,
            method: "CASH",
            receiptNote: "Đóng đợt 1",
          },
        }
      ),
      { params: Promise.resolve({ id: invoice1Id }) }
    );
    expect(pay1Res.status).toBe(201);
    const pay1Body = await pay1Res.json();
    expect(pay1Body.invoice.paidAmount).toBe(500000);
    expect(pay1Body.invoice.status).toBe("PARTIAL");

    // 8. Check VietQR after partial payment -> remaining amount is 700,000
    const qrConfigRes = await getInvoiceVietQr(
      makeReq(
        `http://localhost:3000/api/invoices/${invoice1Id}/vietqr`,
        teacher1.token
      ),
      { params: Promise.resolve({ id: invoice1Id }) }
    );
    expect(qrConfigRes.status).toBe(200);
    const qrConfigBody = await qrConfigRes.json();
    expect(qrConfigBody.bankConfigured).toBe(true);
    expect(qrConfigBody.amount).toBe(700000);
    expect(qrConfigBody.qrPayload.startsWith("000201")).toBe(true);
    expect(qrConfigBody.transferContent).toContain("HP HS001");

    // 9. Reject zero, negative, and overpayment amounts -> 400
    const zeroPayRes = await postInvoicePayment(
      makeReq(
        `http://localhost:3000/api/invoices/${invoice1Id}/payments`,
        teacher1.token,
        {
          method: "POST",
          body: { amount: 0, method: "CASH" },
        }
      ),
      { params: Promise.resolve({ id: invoice1Id }) }
    );
    expect(zeroPayRes.status).toBe(400);

    const overPayRes = await postInvoicePayment(
      makeReq(
        `http://localhost:3000/api/invoices/${invoice1Id}/payments`,
        teacher1.token,
        {
          method: "POST",
          body: { amount: 700001, method: "BANK_TRANSFER" },
        }
      ),
      { params: Promise.resolve({ id: invoice1Id }) }
    );
    expect(overPayRes.status).toBe(400);

    // 10. Pay remaining 700,000 -> status transitions to PAID
    const pay2Res = await postInvoicePayment(
      makeReq(
        `http://localhost:3000/api/invoices/${invoice1Id}/payments`,
        teacher1.token,
        {
          method: "POST",
          body: { amount: 700000, method: "BANK_TRANSFER" },
        }
      ),
      { params: Promise.resolve({ id: invoice1Id }) }
    );
    expect(pay2Res.status).toBe(201);
    expect((await pay2Res.json()).invoice.status).toBe("PAID");

    // 11. Cancel unpaid Invoice 2 (paidAmount === 0) and verify excluded from debt report
    const cancelRes = await patchInvoiceById(
      makeReq(
        `http://localhost:3000/api/invoices/${invoice2Id}`,
        teacher1.token,
        {
          method: "PATCH",
          body: { status: "CANCELLED" },
        }
      ),
      { params: Promise.resolve({ id: invoice2Id }) }
    );
    expect(cancelRes.status).toBe(200);
    expect((await cancelRes.json()).invoice.status).toBe("CANCELLED");

    // Paying a cancelled invoice must fail with 400
    const payCancelledRes = await postInvoicePayment(
      makeReq(
        `http://localhost:3000/api/invoices/${invoice2Id}/payments`,
        teacher1.token,
        {
          method: "POST",
          body: { amount: 100000, method: "CASH" },
        }
      ),
      { params: Promise.resolve({ id: invoice2Id }) }
    );
    expect(payCancelledRes.status).toBe(400);

    // Verify GET /api/fees/report excludes CANCELLED Invoice 2
    const reportRes = await getFeesReport(
      makeReq("http://localhost:3000/api/fees/report", teacher1.token)
    );
    expect(reportRes.status).toBe(200);
    const reportBody = await reportRes.json();
    expect(reportBody.summary.totalNet).toBe(1200000);
    expect(reportBody.summary.totalPaid).toBe(1200000);
    expect(reportBody.summary.totalOutstanding).toBe(0);
  });

  it("Multi-Tenant Isolation across Modules 2–4: Teacher 2 receives 404 on Teacher 1 resources", async () => {
    // Class by ID
    const clsRes = await getClassById(
      makeReq(
        `http://localhost:3000/api/classes/${classAId}`,
        teacher2.token
      ),
      { params: Promise.resolve({ id: classAId }) }
    );
    expect(clsRes.status).toBe(404);

    // ScheduleSlot PATCH & DELETE
    const slotRes = await patchScheduleSlot(
      makeReq(
        `http://localhost:3000/api/classes/${classAId}/schedule-slots/${slotAId}`,
        teacher2.token,
        { method: "PATCH", body: { room: "HACK" } }
      ),
      { params: Promise.resolve({ id: classAId, slotId: slotAId }) }
    );
    expect(slotRes.status).toBe(404);

    const delSlotRes = await deleteScheduleSlot(
      makeReq(
        `http://localhost:3000/api/classes/${classAId}/schedule-slots/${slotAId}`,
        teacher2.token,
        { method: "DELETE" }
      ),
      { params: Promise.resolve({ id: classAId, slotId: slotAId }) }
    );
    expect(delSlotRes.status).toBe(404);

    // Student by ID
    const stuRes = await getStudentById(
      makeReq(
        `http://localhost:3000/api/students/${student1Id}`,
        teacher2.token
      ),
      { params: Promise.resolve({ id: student1Id }) }
    );
    expect(stuRes.status).toBe(404);

    const patchStuRes = await patchStudentById(
      makeReq(
        `http://localhost:3000/api/students/${student1Id}`,
        teacher2.token,
        { method: "PATCH", body: { fullName: "Hacked" } }
      ),
      { params: Promise.resolve({ id: student1Id }) }
    );
    expect(patchStuRes.status).toBe(404);

    const delStuRes = await deleteStudentById(
      makeReq(
        `http://localhost:3000/api/students/${student1Id}`,
        teacher2.token,
        { method: "DELETE" }
      ),
      { params: Promise.resolve({ id: student1Id }) }
    );
    expect(delStuRes.status).toBe(404);

    // Cross-workspace enrollment attempt -> 404
    const crossEnrollRes = await postEnrollment(
      makeReq("http://localhost:3000/api/enrollments", teacher2.token, {
        method: "POST",
        body: { classId: classAId, studentId: student1Id },
      })
    );
    expect(crossEnrollRes.status).toBe(404);

    const delEnrollRes = await deleteEnrollmentById(
      makeReq(
        `http://localhost:3000/api/enrollments/${enrollment1Id}`,
        teacher2.token,
        { method: "DELETE" }
      ),
      { params: Promise.resolve({ id: enrollment1Id }) }
    );
    expect(delEnrollRes.status).toBe(404);

    // FeePlan PATCH & DELETE
    const fpPatchRes = await patchFeePlanById(
      makeReq(
        `http://localhost:3000/api/fee-plans/${feePlanMonthlyId}`,
        teacher2.token,
        { method: "PATCH", body: { amount: 0 } }
      ),
      { params: Promise.resolve({ id: feePlanMonthlyId }) }
    );
    expect(fpPatchRes.status).toBe(404);

    const fpDelRes = await deleteFeePlanById(
      makeReq(
        `http://localhost:3000/api/fee-plans/${feePlanMonthlyId}`,
        teacher2.token,
        { method: "DELETE" }
      ),
      { params: Promise.resolve({ id: feePlanMonthlyId }) }
    );
    expect(fpDelRes.status).toBe(404);

    // Invoice GET, Payment, and VietQR
    const invGetRes = await getInvoiceById(
      makeReq(
        `http://localhost:3000/api/invoices/${invoice1Id}`,
        teacher2.token
      ),
      { params: Promise.resolve({ id: invoice1Id }) }
    );
    expect(invGetRes.status).toBe(404);

    const invQrRes = await getInvoiceVietQr(
      makeReq(
        `http://localhost:3000/api/invoices/${invoice1Id}/vietqr`,
        teacher2.token
      ),
      { params: Promise.resolve({ id: invoice1Id }) }
    );
    expect(invQrRes.status).toBe(404);

    // Teacher 2 list endpoints return empty arrays
    const t2Classes = await (
      await getClasses(makeReq("http://localhost:3000/api/classes", teacher2.token))
    ).json();
    expect(t2Classes.classes.length).toBe(0);

    const t2Students = await (
      await getStudents(makeReq("http://localhost:3000/api/students", teacher2.token))
    ).json();
    expect(t2Students.students.length).toBe(0);

    const t2Enrollments = await (
      await getEnrollments(
        makeReq("http://localhost:3000/api/enrollments", teacher2.token)
      )
    ).json();
    expect(t2Enrollments.enrollments.length).toBe(0);

    const t2FeePlans = await (
      await getFeePlans(makeReq("http://localhost:3000/api/fee-plans", teacher2.token))
    ).json();
    expect(t2FeePlans.feePlans.length).toBe(0);

    const t2Invoices = await (
      await getInvoices(makeReq("http://localhost:3000/api/invoices", teacher2.token))
    ).json();
    expect(t2Invoices.invoices.length).toBe(0);

    const delClsB = await deleteClassById(
      makeReq(
        `http://localhost:3000/api/classes/${classBId}`,
        teacher2.token,
        { method: "DELETE" }
      ),
      { params: Promise.resolve({ id: classBId }) }
    );
    expect(delClsB.status).toBe(404);

    const listSlotsRes = await getScheduleSlots(
      makeReq(
        `http://localhost:3000/api/classes/${classAId}/schedule-slots`,
        teacher2.token
      ),
      { params: Promise.resolve({ id: classAId }) }
    );
    expect(listSlotsRes.status).toBe(404);
  });
});
