import { NextRequest, NextResponse } from "next/server";
import type { Gender, StudentStatus } from "@prisma/client";
import { prisma } from "@/lib/db";
import {
  assertWorkspaceResource,
  handleApiError,
  requireWorkspace,
} from "@/lib/workspace";

type RouteContext = { params: Promise<{ id: string }> };

const VALID_STUDENT_STATUSES: StudentStatus[] = [
  "ACTIVE",
  "INACTIVE",
  "GRADUATED",
];

const VALID_GENDERS: Gender[] = ["MALE", "FEMALE", "OTHER"];

export async function GET(req: NextRequest, context: RouteContext) {
  try {
    const { workspaceId } = await requireWorkspace(req);
    const { id } = await context.params;

    const student = await prisma.student.findFirst({
      where: { id, workspaceId },
      include: {
        guardians: {
          orderBy: [{ isPrimary: "desc" }, { createdAt: "asc" }],
        },
        enrollments: {
          include: {
            class: true,
          },
          orderBy: { enrolledAt: "desc" },
        },
        invoices: {
          include: {
            class: { select: { id: true, code: true, name: true } },
            feePlan: { select: { id: true, name: true, billingCycle: true } },
            payments: { orderBy: { paidAt: "desc" } },
          },
          orderBy: { createdAt: "desc" },
        },
        faceDescriptors: {
          orderBy: { createdAt: "desc" },
        },
      },
    });

    assertWorkspaceResource(
      student,
      workspaceId,
      "Không tìm thấy học sinh trong workspace của bạn"
    );

    return NextResponse.json({ student }, { status: 200 });
  } catch (error) {
    return handleApiError(error);
  }
}

export async function PATCH(req: NextRequest, context: RouteContext) {
  try {
    const { workspaceId } = await requireWorkspace(req);
    const { id } = await context.params;

    const existing = assertWorkspaceResource(
      await prisma.student.findFirst({
        where: { id, workspaceId },
      }),
      workspaceId,
      "Không tìm thấy học sinh trong workspace của bạn"
    );

    const body = await req.json();

    let nextFullName = existing.fullName;
    if (body.fullName !== undefined) {
      nextFullName = String(body.fullName ?? "").trim();
      if (!nextFullName) {
        return NextResponse.json(
          { error: "Họ tên học sinh không được để trống" },
          { status: 400 }
        );
      }
    }

    let nextStudentCode = existing.studentCode;
    if (body.studentCode !== undefined) {
      nextStudentCode = String(body.studentCode ?? "")
        .trim()
        .toUpperCase();
      if (!nextStudentCode) {
        return NextResponse.json(
          { error: "Mã học sinh không được để trống" },
          { status: 400 }
        );
      }
      if (nextStudentCode !== existing.studentCode) {
        const collision = await prisma.student.findUnique({
          where: {
            workspaceId_studentCode: {
              workspaceId,
              studentCode: nextStudentCode,
            },
          },
        });
        if (collision) {
          return NextResponse.json(
            { error: "Mã học sinh đã tồn tại trong workspace" },
            { status: 409 }
          );
        }
      }
    }

    let nextDob = existing.dateOfBirth;
    if (body.dateOfBirth !== undefined) {
      if (!body.dateOfBirth) {
        nextDob = null;
      } else {
        const d = new Date(body.dateOfBirth);
        if (Number.isNaN(d.getTime())) {
          return NextResponse.json(
            { error: "Ngày sinh không hợp lệ" },
            { status: 400 }
          );
        }
        nextDob = d;
      }
    }

    let nextGender = existing.gender;
    if (body.gender !== undefined) {
      if (!body.gender) {
        nextGender = null;
      } else {
        const g = String(body.gender).trim().toUpperCase();
        if (!VALID_GENDERS.includes(g as Gender)) {
          return NextResponse.json(
            { error: "Giới tính không hợp lệ" },
            { status: 400 }
          );
        }
        nextGender = g as Gender;
      }
    }

    let nextStatus = existing.status;
    if (body.status !== undefined) {
      const st = String(body.status).trim().toUpperCase();
      if (!VALID_STUDENT_STATUSES.includes(st as StudentStatus)) {
        return NextResponse.json(
          { error: "Trạng thái học sinh không hợp lệ" },
          { status: 400 }
        );
      }
      nextStatus = st as StudentStatus;
    }

    const updated = await prisma.student.update({
      where: { id: existing.id },
      data: {
        fullName: nextFullName,
        studentCode: nextStudentCode,
        dateOfBirth: nextDob,
        gender: nextGender,
        school:
          body.school !== undefined
            ? body.school
              ? String(body.school).trim()
              : null
            : existing.school,
        phone:
          body.phone !== undefined
            ? body.phone
              ? String(body.phone).trim()
              : null
            : existing.phone,
        avatarUrl:
          body.avatarUrl !== undefined
            ? body.avatarUrl
              ? String(body.avatarUrl).trim()
              : null
            : existing.avatarUrl,
        notes:
          body.notes !== undefined
            ? body.notes
              ? String(body.notes).trim()
              : null
            : existing.notes,
        status: nextStatus,
      },
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

    return NextResponse.json({ student: updated }, { status: 200 });
  } catch (error) {
    return handleApiError(error);
  }
}

export async function DELETE(req: NextRequest, context: RouteContext) {
  try {
    const { workspaceId } = await requireWorkspace(req);
    const { id } = await context.params;

    const existing = assertWorkspaceResource(
      await prisma.student.findFirst({
        where: { id, workspaceId },
      }),
      workspaceId,
      "Không tìm thấy học sinh trong workspace của bạn"
    );

    await prisma.student.delete({
      where: { id: existing.id },
    });

    return NextResponse.json({ deleted: true }, { status: 200 });
  } catch (error) {
    return handleApiError(error);
  }
}
