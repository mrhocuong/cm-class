import { NextRequest, NextResponse } from "next/server";
import type { Gender, Prisma, StudentStatus } from "@prisma/client";
import { prisma } from "@/lib/db";
import {
  handleApiError,
  requireWorkspace,
  WorkspaceAuthError,
} from "@/lib/workspace";

const VALID_STUDENT_STATUSES: StudentStatus[] = [
  "ACTIVE",
  "INACTIVE",
  "GRADUATED",
];

const VALID_GENDERS: Gender[] = ["MALE", "FEMALE", "OTHER"];

async function generateNextStudentCode(workspaceId: string): Promise<string> {
  const existing = await prisma.student.findMany({
    where: { workspaceId },
    select: { studentCode: true },
  });
  let maxNum = 0;
  for (const row of existing) {
    const match = /^HS(\d+)$/i.exec(row.studentCode.trim());
    if (match) {
      const num = parseInt(match[1], 10);
      if (Number.isFinite(num) && num > maxNum) {
        maxNum = num;
      }
    }
  }
  const nextNum = maxNum + 1;
  return `HS${String(nextNum).padStart(3, "0")}`;
}

export async function GET(req: NextRequest) {
  try {
    const { workspaceId } = await requireWorkspace(req);
    const { searchParams } = new URL(req.url);
    const search = (searchParams.get("search") || "").trim();
    const classId = (searchParams.get("classId") || "").trim();
    const statusParam = (searchParams.get("status") || "").trim().toUpperCase();

    const where: Prisma.StudentWhereInput = { workspaceId };

    if (
      statusParam &&
      statusParam !== "ALL" &&
      VALID_STUDENT_STATUSES.includes(statusParam as StudentStatus)
    ) {
      where.status = statusParam as StudentStatus;
    }

    if (classId) {
      where.enrollments = {
        some: { classId },
      };
    }

    if (search) {
      where.OR = [
        { fullName: { contains: search, mode: "insensitive" } },
        { studentCode: { contains: search, mode: "insensitive" } },
        { phone: { contains: search, mode: "insensitive" } },
        { school: { contains: search, mode: "insensitive" } },
        {
          guardians: {
            some: {
              OR: [
                { fullName: { contains: search, mode: "insensitive" } },
                { phone: { contains: search, mode: "insensitive" } },
              ],
            },
          },
        },
      ];
    }

    const students = await prisma.student.findMany({
      where,
      include: {
        guardians: {
          orderBy: [{ isPrimary: "desc" }, { createdAt: "asc" }],
        },
        enrollments: {
          include: {
            class: {
              select: {
                id: true,
                code: true,
                name: true,
                subject: true,
                status: true,
                defaultFeeAmount: true,
                billingCycle: true,
              },
            },
          },
          orderBy: { enrolledAt: "desc" },
        },
        invoices: {
          where: { status: { in: ["UNPAID", "PARTIAL"] } },
          select: {
            id: true,
            invoiceNumber: true,
            billingPeriod: true,
            netAmount: true,
            paidAmount: true,
            status: true,
            dueDate: true,
          },
        },
        _count: {
          select: {
            guardians: true,
            enrollments: true,
            invoices: true,
            faceDescriptors: true,
          },
        },
      },
      orderBy: [{ studentCode: "asc" }, { createdAt: "desc" }],
    });

    return NextResponse.json({ students }, { status: 200 });
  } catch (error) {
    return handleApiError(error);
  }
}

export async function POST(req: NextRequest) {
  try {
    const { workspaceId } = await requireWorkspace(req);
    const body = await req.json();

    const fullName = String(body.fullName ?? "").trim();
    if (!fullName) {
      return NextResponse.json(
        { error: "Vui lòng nhập họ tên học sinh" },
        { status: 400 }
      );
    }

    let studentCode = String(body.studentCode ?? "")
      .trim()
      .toUpperCase();
    if (studentCode) {
      const existing = await prisma.student.findUnique({
        where: {
          workspaceId_studentCode: {
            workspaceId,
            studentCode,
          },
        },
      });
      if (existing) {
        return NextResponse.json(
          { error: "Mã học sinh đã tồn tại trong workspace" },
          { status: 409 }
        );
      }
    } else {
      studentCode = await generateNextStudentCode(workspaceId);
    }

    let dateOfBirth: Date | null = null;
    if (body.dateOfBirth) {
      const parsedDob = new Date(body.dateOfBirth);
      if (!Number.isNaN(parsedDob.getTime())) {
        dateOfBirth = parsedDob;
      }
    }

    const genderRaw = body.gender
      ? String(body.gender).trim().toUpperCase()
      : null;
    const gender: Gender | null =
      genderRaw && VALID_GENDERS.includes(genderRaw as Gender)
        ? (genderRaw as Gender)
        : null;

    const statusRaw = body.status
      ? String(body.status).trim().toUpperCase()
      : "ACTIVE";
    const status: StudentStatus = VALID_STUDENT_STATUSES.includes(
      statusRaw as StudentStatus
    )
      ? (statusRaw as StudentStatus)
      : "ACTIVE";

    const school = body.school ? String(body.school).trim() : null;
    const phone = body.phone ? String(body.phone).trim() : null;
    const avatarUrl = body.avatarUrl ? String(body.avatarUrl).trim() : null;
    const notes = body.notes ? String(body.notes).trim() : null;

    const rawGuardians: Array<{
      fullName?: unknown;
      relationship?: unknown;
      phone?: unknown;
      email?: unknown;
      zalo?: unknown;
      address?: unknown;
      isPrimary?: unknown;
    }> = Array.isArray(body.guardians) ? body.guardians : [];

    const validGuardians = rawGuardians
      .map((g) => ({
        fullName: String(g?.fullName ?? "").trim(),
        relationship:
          String(g?.relationship ?? "Phụ huynh").trim() || "Phụ huynh",
        phone: String(g?.phone ?? "").trim(),
        email: g?.email ? String(g.email).trim() : null,
        zalo: g?.zalo ? String(g.zalo).trim() : null,
        address: g?.address ? String(g.address).trim() : null,
        isPrimary: Boolean(g?.isPrimary),
      }))
      .filter((g) => g.fullName.length > 0 && g.phone.length > 0);

    let primaryIdx = 0;
    for (let i = 0; i < validGuardians.length; i++) {
      if (validGuardians[i].isPrimary) {
        primaryIdx = i;
      }
    }

    const normalizedGuardians = validGuardians.map((g, idx) => ({
      ...g,
      isPrimary: idx === primaryIdx,
    }));

    const rawClassIds: string[] = Array.isArray(body.enrollClassIds)
      ? body.enrollClassIds.map(String)
      : body.classId
      ? [String(body.classId)]
      : [];
    const uniqueClassIds = Array.from(
      new Set(rawClassIds.map((c) => c.trim()).filter(Boolean))
    );

    if (uniqueClassIds.length > 0) {
      const validClasses = await prisma.class.findMany({
        where: { id: { in: uniqueClassIds }, workspaceId },
        select: { id: true },
      });
      if (validClasses.length !== uniqueClassIds.length) {
        throw new WorkspaceAuthError(
          404,
          "Không tìm thấy lớp học trong workspace của bạn"
        );
      }
    }

    const student = await prisma.$transaction(async (tx) => {
      const created = await tx.student.create({
        data: {
          workspaceId,
          studentCode,
          fullName,
          dateOfBirth,
          gender,
          school,
          phone,
          avatarUrl,
          notes,
          status,
        },
      });

      if (normalizedGuardians.length > 0) {
        await tx.guardian.createMany({
          data: normalizedGuardians.map((g) => ({
            workspaceId,
            studentId: created.id,
            fullName: g.fullName,
            relationship: g.relationship,
            phone: g.phone,
            email: g.email,
            zalo: g.zalo,
            address: g.address,
            isPrimary: g.isPrimary,
          })),
        });
      }

      if (uniqueClassIds.length > 0) {
        await tx.enrollment.createMany({
          data: uniqueClassIds.map((cId) => ({
            workspaceId,
            classId: cId,
            studentId: created.id,
            status: "ACTIVE",
            discountType: "FIXED",
            customFeeDiscount: 0,
          })),
          skipDuplicates: true,
        });
      }

      const fullStudent = await tx.student.findUnique({
        where: { id: created.id },
        include: {
          guardians: {
            orderBy: [{ isPrimary: "desc" }, { createdAt: "asc" }],
          },
          enrollments: {
            include: { class: true },
            orderBy: { enrolledAt: "desc" },
          },
        },
      });
      if (!fullStudent) {
        throw new WorkspaceAuthError(500, "Không thể tải học sinh vừa tạo");
      }
      return fullStudent;
    });

    return NextResponse.json({ student }, { status: 201 });
  } catch (error) {
    return handleApiError(error);
  }
}
