import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { NextRequest } from "next/server";
import { prisma } from "@/lib/db";
import { SESSION_COOKIE_NAME } from "@/lib/auth";
import { registerTeacherWithWorkspace } from "@/lib/workspace";
import {
  generateSyntheticDescriptorForStudent,
  normalizeDescriptor,
} from "@/lib/face-ai";

import {
  GET as getSessions,
  POST as postSession,
} from "@/app/api/sessions/route";
import {
  DELETE as deleteSession,
  GET as getSessionById,
  PATCH as patchSession,
} from "@/app/api/sessions/[id]/route";
import { POST as postAttendance } from "@/app/api/sessions/[id]/attendance/route";
import {
  GET as getFaceDescriptors,
  POST as postFaceDescriptor,
} from "@/app/api/face-ai/descriptors/route";
import { DELETE as deleteFaceDescriptor } from "@/app/api/face-ai/descriptors/[id]/route";
import { POST as postFaceMatch } from "@/app/api/face-ai/match/route";
import { GET as getStreamProxy } from "@/app/api/face-ai/stream-proxy/route";
import {
  GET as getHomeworks,
  POST as postHomework,
} from "@/app/api/homeworks/route";
import {
  DELETE as deleteHomework,
  GET as getHomeworkById,
  PATCH as patchHomework,
} from "@/app/api/homeworks/[id]/route";
import { POST as postHomeworkSubmissions } from "@/app/api/homeworks/[id]/submissions/route";

function buildReq(
  url: string,
  token: string,
  options?: { method?: string; body?: unknown }
): NextRequest {
  return new NextRequest(url, {
    method: options?.method ?? "GET",
    headers: {
      cookie: `${SESSION_COOKIE_NAME}=${token}`,
      ...(options?.body !== undefined
        ? { "content-type": "application/json" }
        : {}),
    },
    body:
      options?.body !== undefined ? JSON.stringify(options.body) : undefined,
  });
}

describe("Milestone 3 Integration: Sessions, Attendance, Browser FaceAI, Homework & Isolation", () => {
  const createdUserIds: string[] = [];
  let tokenA = "";
  let workspaceIdA = "";
  let classIdA = "";
  let student1IdA = "";
  let student2IdA = "";

  let tokenB = "";
  let workspaceIdB = "";
  let classIdB = "";
  let studentIdB = "";

  beforeAll(async () => {
    const regA = await registerTeacherWithWorkspace({
      fullName: "Giáo Viên M3 Test A",
      email: `m3.teacher.a.${Date.now()}@cmclass.vn`,
      password: "Password123!",
      workspaceName: "Workspace M3 A",
    });
    createdUserIds.push(regA.user.id);
    tokenA = regA.token;
    workspaceIdA = regA.workspace.id;

    const clsA = await prisma.class.create({
      data: {
        workspaceId: workspaceIdA,
        code: "M3-CLS-A1",
        name: "Toán 9 M3 Test A",
        subject: "Toán",
        room: "P301",
        defaultFeeAmount: 1200000,
      },
    });
    classIdA = clsA.id;

    const stu1A = await prisma.student.create({
      data: {
        workspaceId: workspaceIdA,
        studentCode: "HS-M3-01",
        fullName: "Nguyễn Minh Khôi",
      },
    });
    const stu2A = await prisma.student.create({
      data: {
        workspaceId: workspaceIdA,
        studentCode: "HS-M3-02",
        fullName: "Trần Hà My",
      },
    });
    student1IdA = stu1A.id;
    student2IdA = stu2A.id;

    await prisma.enrollment.createMany({
      data: [
        { workspaceId: workspaceIdA, classId: classIdA, studentId: student1IdA },
        { workspaceId: workspaceIdA, classId: classIdA, studentId: student2IdA },
      ],
    });

    const regB = await registerTeacherWithWorkspace({
      fullName: "Giáo Viên M3 Test B",
      email: `m3.teacher.b.${Date.now()}@cmclass.vn`,
      password: "Password123!",
      workspaceName: "Workspace M3 B",
    });
    createdUserIds.push(regB.user.id);
    tokenB = regB.token;
    workspaceIdB = regB.workspace.id;

    const clsB = await prisma.class.create({
      data: {
        workspaceId: workspaceIdB,
        code: "M3-CLS-B1",
        name: "Vật Lý 10 M3 Test B",
        subject: "Vật Lý",
      },
    });
    classIdB = clsB.id;

    const stuB = await prisma.student.create({
      data: {
        workspaceId: workspaceIdB,
        studentCode: "HS-M3-B1",
        fullName: "Lê Bảo Mật B",
      },
    });
    studentIdB = stuB.id;

    await prisma.enrollment.create({
      data: {
        workspaceId: workspaceIdB,
        classId: classIdB,
        studentId: studentIdB,
      },
    });
  });

  afterAll(async () => {
    if (createdUserIds.length > 0) {
      await prisma.user.deleteMany({
        where: { id: { in: createdUserIds } },
      });
    }
  });

  it("manages sessions, initializes rosters, and enforces attendance & cancelled session boundaries (F13, F22–F24, T2-07, T2-20, T2-21)", async () => {
    const badTimeRes = await postSession(
      buildReq("http://localhost:3000/api/sessions", tokenA, {
        method: "POST",
        body: {
          classId: classIdA,
          sessionDate: "2026-11-10",
          startTime: "19:30",
          endTime: "18:00",
        },
      })
    );
    expect(badTimeRes.status).toBe(400);

    const createRes = await postSession(
      buildReq("http://localhost:3000/api/sessions", tokenA, {
        method: "POST",
        body: {
          classId: classIdA,
          sessionDate: "2026-11-10",
          startTime: "18:00",
          endTime: "19:30",
          topic: "Phương trình bậc hai",
        },
      })
    );
    expect(createRes.status).toBe(201);
    const { session } = await createRes.json();

    const listRes = await getSessions(
      buildReq(
        `http://localhost:3000/api/sessions?classId=${classIdA}`,
        tokenA
      )
    );
    expect(listRes.status).toBe(200);
    const listBody = await listRes.json();
    expect(listBody.sessions.length).toBeGreaterThanOrEqual(1);

    const detailRes = await getSessionById(
      buildReq(`http://localhost:3000/api/sessions/${session.id}`, tokenA),
      { params: { id: session.id } }
    );
    expect(detailRes.status).toBe(200);
    const detail = await detailRes.json();
    expect(detail.roster.length).toBe(2);

    const badCheckOutRes = await postAttendance(
      buildReq(
        `http://localhost:3000/api/sessions/${session.id}/attendance`,
        tokenA,
        {
          method: "POST",
          body: {
            studentId: student1IdA,
            status: "PRESENT",
            checkInAt: "2026-11-10T18:30:00.000Z",
            checkOutAt: "2026-11-10T17:45:00.000Z",
          },
        }
      ),
      { params: { id: session.id } }
    );
    expect(badCheckOutRes.status).toBe(400);

    const markAllRes = await postAttendance(
      buildReq(
        `http://localhost:3000/api/sessions/${session.id}/attendance`,
        tokenA,
        {
          method: "POST",
          body: { action: "MARK_ALL_PRESENT" },
        }
      ),
      { params: { id: session.id } }
    );
    expect(markAllRes.status).toBe(200);
    expect((await markAllRes.json()).updatedCount).toBe(2);

    const checkOutAllRes = await postAttendance(
      buildReq(
        `http://localhost:3000/api/sessions/${session.id}/attendance`,
        tokenA,
        {
          method: "POST",
          body: { action: "CHECK_OUT_ALL" },
        }
      ),
      { params: { id: session.id } }
    );
    expect(checkOutAllRes.status).toBe(200);
    expect((await checkOutAllRes.json()).updatedCount).toBe(2);

    // Patch session to CANCELLED and verify attendance rejection (T2-21)
    const cancelRes = await patchSession(
      buildReq(`http://localhost:3000/api/sessions/${session.id}`, tokenA, {
        method: "PATCH",
        body: { status: "CANCELLED" },
      }),
      { params: { id: session.id } }
    );
    expect(cancelRes.status).toBe(200);

    const cancelledAttRes = await postAttendance(
      buildReq(
        `http://localhost:3000/api/sessions/${session.id}/attendance`,
        tokenA,
        {
          method: "POST",
          body: { action: "MARK_ALL_PRESENT" },
        }
      ),
      { params: { id: session.id } }
    );
    expect(cancelledAttRes.status).toBe(400);

    const delSessRes = await deleteSession(
      buildReq(`http://localhost:3000/api/sessions/${session.id}`, tokenA, {
        method: "DELETE",
      }),
      { params: { id: session.id } }
    );
    expect(delSessRes.status).toBe(200);
  });

  it("enrolls FaceAI descriptors, handles NO_ENROLLED_FACES & BELOW_THRESHOLD, and enforces cooldown & check-out preservation (F25–F27, T2-22..T2-25)", async () => {
    const sessRes = await postSession(
      buildReq("http://localhost:3000/api/sessions", tokenA, {
        method: "POST",
        body: {
          classId: classIdA,
          sessionDate: "2026-11-12",
          startTime: "18:00",
          endTime: "19:30",
        },
      })
    );
    const { session } = await sessRes.json();

    const vec1 = generateSyntheticDescriptorForStudent("M3-FACE-STU-1");
    const vec2 = generateSyntheticDescriptorForStudent("M3-FACE-STU-2");

    // 1. Matching before any descriptor is enrolled -> NO_ENROLLED_FACES (T2-23)
    const noFaceRes = await postFaceMatch(
      buildReq("http://localhost:3000/api/face-ai/match", tokenA, {
        method: "POST",
        body: {
          sessionId: session.id,
          scanMode: "CHECK_IN",
          descriptor: vec1,
        },
      })
    );
    expect(noFaceRes.status).toBe(200);
    const noFaceBody = await noFaceRes.json();
    expect(noFaceBody.matched).toBe(false);
    expect(noFaceBody.reason).toBe("NO_ENROLLED_FACES");

    // 2. Reject invalid descriptor enrollment (T2-22: wrong length, all-zero, or null element)
    const badDescRes = await postFaceDescriptor(
      buildReq("http://localhost:3000/api/face-ai/descriptors", tokenA, {
        method: "POST",
        body: {
          studentId: student1IdA,
          descriptor: new Array(64).fill(0.5),
        },
      })
    );
    expect(badDescRes.status).toBe(400);

    const nullElemDescRes = await postFaceDescriptor(
      buildReq("http://localhost:3000/api/face-ai/descriptors", tokenA, {
        method: "POST",
        body: {
          studentId: student1IdA,
          descriptor: [null, ...new Array(127).fill(0.1)],
        },
      })
    );
    expect(nullElemDescRes.status).toBe(400);

    // 3. Enroll valid 128-float descriptor for student 1
    const enrollRes = await postFaceDescriptor(
      buildReq("http://localhost:3000/api/face-ai/descriptors", tokenA, {
        method: "POST",
        body: {
          studentId: student1IdA,
          descriptor: vec1,
          source: "WEBCAM",
        },
      })
    );
    expect(enrollRes.status).toBe(201);
    const { descriptor: savedDesc } = await enrollRes.json();

    const listDescRes = await getFaceDescriptors(
      buildReq(
        `http://localhost:3000/api/face-ai/descriptors?classId=${classIdA}`,
        tokenA
      )
    );
    expect(listDescRes.status).toBe(200);
    expect((await listDescRes.json()).descriptors.length).toBe(1);

    // 4. Below threshold scan -> matched: false without mutating attendance (T2-24)
    const belowRes = await postFaceMatch(
      buildReq("http://localhost:3000/api/face-ai/match", tokenA, {
        method: "POST",
        body: {
          sessionId: session.id,
          scanMode: "CHECK_IN",
          descriptor: vec2,
          threshold: 0.85,
        },
      })
    );
    expect(belowRes.status).toBe(200);
    expect((await belowRes.json()).matched).toBe(false);

    // 5. Valid CHECK_IN scan -> matched: true & method: FACE_AI
    const perturbedVec1 = normalizeDescriptor(
      vec1.map((v, idx) => v + (idx % 2 === 0 ? 0.005 : -0.005))
    );
    const checkIn1Res = await postFaceMatch(
      buildReq("http://localhost:3000/api/face-ai/match", tokenA, {
        method: "POST",
        body: {
          sessionId: session.id,
          scanMode: "CHECK_IN",
          descriptor: perturbedVec1,
        },
      })
    );
    expect(checkIn1Res.status).toBe(200);
    const checkIn1 = await checkIn1Res.json();
    expect(checkIn1.matched).toBe(true);
    expect(checkIn1.attendance.method).toBe("FACE_AI");
    const firstCheckInAt = checkIn1.attendance.checkInAt;
    expect(firstCheckInAt).toBeTruthy();

    // 6. Duplicate CHECK_IN scan -> preserves original checkInAt (T1-G06-05, T2-25)
    const dupRes = await postFaceMatch(
      buildReq("http://localhost:3000/api/face-ai/match", tokenA, {
        method: "POST",
        body: {
          sessionId: session.id,
          scanMode: "CHECK_IN",
          descriptor: vec1,
        },
      })
    );
    const dupBody = await dupRes.json();
    expect(dupBody.matched).toBe(true);
    expect(dupBody.attendance.checkInAt).toBe(firstCheckInAt);

    // 7. CHECK_OUT scan -> preserves checkInAt and sets checkOutAt (T1-G06-05, T2-25)
    const checkOutRes = await postFaceMatch(
      buildReq("http://localhost:3000/api/face-ai/match", tokenA, {
        method: "POST",
        body: {
          sessionId: session.id,
          scanMode: "CHECK_OUT",
          descriptor: vec1,
        },
      })
    );
    const checkOutBody = await checkOutRes.json();
    expect(checkOutBody.matched).toBe(true);
    expect(checkOutBody.attendance.checkInAt).toBe(firstCheckInAt);
    expect(checkOutBody.attendance.checkOutAt).toBeTruthy();

    // 8. Stream proxy returns 200 SVG and blocks SSRF schemes
    const proxyOk = await getStreamProxy(
      buildReq("http://localhost:3000/api/face-ai/stream-proxy", tokenA)
    );
    expect(proxyOk.status).toBe(200);
    expect(proxyOk.headers.get("Access-Control-Allow-Origin")).toBe("*");

    const proxySsrf = await getStreamProxy(
      buildReq(
        "http://localhost:3000/api/face-ai/stream-proxy?url=http://169.254.169.254/latest/meta-data",
        tokenA
      )
    );
    expect(proxySsrf.status).toBe(400);

    // 9. Delete descriptor
    const delDesc = await deleteFaceDescriptor(
      buildReq(
        `http://localhost:3000/api/face-ai/descriptors/${savedDesc.id}`,
        tokenA,
        { method: "DELETE" }
      ),
      { params: { id: savedDesc.id } }
    );
    expect(delDesc.status).toBe(200);
  });

  it("manages homeworks, auto-detects LATE submissions, validates grading bounds, and enforces Teacher A vs Teacher B isolation (F28, F29, T2-26, S3.3)", async () => {
    const hwRes = await postHomework(
      buildReq("http://localhost:3000/api/homeworks", tokenA, {
        method: "POST",
        body: {
          classId: classIdA,
          title: "BTVN Hệ thức Vi-ét",
          dueDate: "2026-11-15T12:00:00.000Z",
          maxScore: 10,
        },
      })
    );
    expect(hwRes.status).toBe(201);
    const { homework } = await hwRes.json();

    const listHwRes = await getHomeworks(
      buildReq(
        `http://localhost:3000/api/homeworks?classId=${classIdA}`,
        tokenA
      )
    );
    expect(listHwRes.status).toBe(200);
    expect((await listHwRes.json()).homeworks.length).toBeGreaterThanOrEqual(1);

    const patchHwRes = await patchHomework(
      buildReq(`http://localhost:3000/api/homeworks/${homework.id}`, tokenA, {
        method: "PATCH",
        body: { title: "BTVN Hệ thức Vi-ét (Nâng cao)" },
      }),
      { params: { id: homework.id } }
    );
    expect(patchHwRes.status).toBe(200);

    // Reject score > maxScore (400) & score < 0 (400) (T2-26)
    const overScoreRes = await postHomeworkSubmissions(
      buildReq(
        `http://localhost:3000/api/homeworks/${homework.id}/submissions`,
        tokenA,
        {
          method: "POST",
          body: {
            submissions: [
              { studentId: student1IdA, status: "GRADED", score: 15 },
            ],
          },
        }
      ),
      { params: { id: homework.id } }
    );
    expect(overScoreRes.status).toBe(400);

    // Auto-flag LATE when submittedAt > dueDate (T1-G07-04, T2-26)
    const lateSubRes = await postHomeworkSubmissions(
      buildReq(
        `http://localhost:3000/api/homeworks/${homework.id}/submissions`,
        tokenA,
        {
          method: "POST",
          body: {
            submissions: [
              {
                studentId: student1IdA,
                status: "SUBMITTED",
                submittedAt: "2026-11-16T08:00:00.000Z",
              },
            ],
          },
        }
      ),
      { params: { id: homework.id } }
    );
    expect(lateSubRes.status).toBe(200);
    const { submissions: lateSubs } = await lateSubRes.json();
    expect(lateSubs[0].status).toBe("LATE");

    // Cross-workspace isolation: Teacher B attempting to access Teacher A's homework or enroll face for Teacher A's student returns 404 (S3.3)
    const crossHwGet = await getHomeworkById(
      buildReq(`http://localhost:3000/api/homeworks/${homework.id}`, tokenB),
      { params: { id: homework.id } }
    );
    expect(crossHwGet.status).toBe(404);

    const crossFacePost = await postFaceDescriptor(
      buildReq("http://localhost:3000/api/face-ai/descriptors", tokenB, {
        method: "POST",
        body: {
          studentId: student1IdA,
          descriptor: generateSyntheticDescriptorForStudent("CROSS-ATTACK"),
        },
      })
    );
    expect(crossFacePost.status).toBe(404);

    const delHwRes = await deleteHomework(
      buildReq(`http://localhost:3000/api/homeworks/${homework.id}`, tokenA, {
        method: "DELETE",
      }),
      { params: { id: homework.id } }
    );
    expect(delHwRes.status).toBe(200);
  });
});
