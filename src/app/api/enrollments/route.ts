import { NextRequest, NextResponse } from "next/server";
import type { DiscountType, EnrollmentStatus, Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import {
  assertWorkspaceResource,
  handleApiError,
  requireWorkspace,
  WorkspaceAuthError,
} from "@/lib/workspace";

const VALID_ENROLLMENT_STATUSES: EnrollmentStatus[] = [
  "ACTIVE",
  "PAUSED",
  "DROPPED",
  "COMPLETED",
];

const VALID_DISCOUNT_TYPES: DiscountType[] = ["FIXED", "PERCENTAGE"];

export async function GET(req: NextRequest) {
  try {
    const { workspaceId } = await requireWorkspace(req);
    const { searchParams } = new URL(req.url);
    const classId = (searchParams.get("classId") || "").trim();
    const studentId = (searchParams.get("studentId") || "").trim();
    const statusParam = (searchParams.get("status") || "").trim().toUpperCase();

    const where: Prisma.EnrollmentWhereInput = { workspaceId };

    if (classId) {
      where.classId = classId;
    }
    if (studentId) {
      where.studentId = studentId;
    }
    if (
      statusParam &&
      statusParam !== "ALL" &&
      VALID_ENROLLMENT_STATUSES.includes(statusParam as EnrollmentStatus)
    ) {
      where.status = statusParam as EnrollmentStatus;
    }

    const enrollments = await prisma.enrollment.findMany({
      where,
      include: {
        student: {
          include: {
            guardians: {
              orderBy: [{ isPrimary: "desc" }, { createdAt: "asc" }],
            },
          },
        },
        class: true,
      },
      orderBy: { enrolledAt: "desc" },
    });

    return NextResponse.json({ enrollments }, { status: 200 });
  } catch (error) {
    return handleApiError(error);
  }
}

export async function POST(req: NextRequest) {
  try {
    const { workspaceId } = await requireWorkspace(req);
    const body = await req.json();

    const classId = String(body.classId ?? "").trim();
    const rawStudentIds: string[] = Array.isArray(body.studentIds)
      ? body.studentIds.map(String)
      : body.studentId
      ? [String(body.studentId)]
      : [];
    const targetStudentIds = Array.from(
      new Set(rawStudentIds.map((s) => s.trim()).filter(Boolean))
    );

    if (!classId || targetStudentIds.length === 0) {
      return NextResponse.json(
        { error: "Vui lòng chọn lớp học và ít nhất một học sinh" },
        { status: 400 }
      );
    }

    const cls = await prisma.class.findFirst({
      where: { id: classId, workspaceId },
    });
    assertWorkspaceResource(
      cls,
      workspaceId,
      "Không tìm thấy lớp học trong workspace của bạn"
    );

    const validStudents = await prisma.student.findMany({
      where: { id: { in: targetStudentIds }, workspaceId },
      select: { id: true },
    });
    if (validStudents.length !== targetStudentIds.length) {
      throw new WorkspaceAuthError(
        404,
        "Không tìm thấy học sinh trong workspace của bạn"
      );
    }

    const discountTypeRaw = body.discountType
      ? String(body.discountType).trim().toUpperCase()
      : "FIXED";
    if (!VALID_DISCOUNT_TYPES.includes(discountTypeRaw as DiscountType)) {
      return NextResponse.json(
        { error: "Loại giảm trừ học phí không hợp lệ" },
        { status: 400 }
      );
    }
    const discountType = discountTypeRaw as DiscountType;

    const customFeeDiscountRaw =
      body.customFeeDiscount !== undefined ? Number(body.customFeeDiscount) : 0;
    if (!Number.isFinite(customFeeDiscountRaw) || customFeeDiscountRaw < 0) {
      return NextResponse.json(
        { error: "Mức giảm học phí không được nhỏ hơn 0" },
        { status: 400 }
      );
    }
    if (discountType === "PERCENTAGE" && customFeeDiscountRaw > 100) {
      return NextResponse.json(
        { error: "Mức giảm học phí theo phần trăm không được vượt quá 100%" },
        { status: 400 }
      );
    }
    const customFeeDiscount = Math.round(customFeeDiscountRaw);

    const discountNote = body.discountNote
      ? String(body.discountNote).trim()
      : null;

    const enrolledAt = body.enrolledAt
      ? new Date(body.enrolledAt)
      : new Date();
    if (Number.isNaN(enrolledAt.getTime())) {
      return NextResponse.json(
        { error: "Ngày ghi danh không hợp lệ" },
        { status: 400 }
      );
    }

    const existingEnrollments = await prisma.enrollment.findMany({
      where: {
        workspaceId,
        classId,
        studentId: { in: targetStudentIds },
      },
    });
    const existingByStudentId = new Map(
      existingEnrollments.map((e) => [e.studentId, e])
    );

    for (const stuId of targetStudentIds) {
      const existing = existingByStudentId.get(stuId);
      if (existing && existing.status === "ACTIVE") {
        return NextResponse.json(
          { error: "Học sinh đã đang theo học (ACTIVE) trong lớp này" },
          { status: 409 }
        );
      }
    }

    const results = await prisma.$transaction(async (tx) => {
      const list = [];
      for (const stuId of targetStudentIds) {
        const existing = existingByStudentId.get(stuId);
        if (existing) {
          const reactivated = await tx.enrollment.update({
            where: { id: existing.id },
            data: {
              status: "ACTIVE",
              leftAt: null,
              enrolledAt: body.enrolledAt ? enrolledAt : existing.enrolledAt,
              discountType,
              customFeeDiscount,
              discountNote:
                body.discountNote !== undefined
                  ? discountNote
                  : existing.discountNote,
            },
            include: {
              student: {
                include: {
                  guardians: {
                    orderBy: [{ isPrimary: "desc" }, { createdAt: "asc" }],
                  },
                },
              },
              class: true,
            },
          });
          list.push(reactivated);
        } else {
          const created = await tx.enrollment.create({
            data: {
              workspaceId,
              classId,
              studentId: stuId,
              enrolledAt,
              leftAt: null,
              status: "ACTIVE",
              discountType,
              customFeeDiscount,
              discountNote,
            },
            include: {
              student: {
                include: {
                  guardians: {
                    orderBy: [{ isPrimary: "desc" }, { createdAt: "asc" }],
                  },
                },
              },
              class: true,
            },
          });
          list.push(created);
        }
      }
      return list;
    });

    return NextResponse.json(
      {
        enrollment: results[0] ?? null,
        enrollments: results,
      },
      { status: 201 }
    );
  } catch (error) {
    return handleApiError(error);
  }
}
