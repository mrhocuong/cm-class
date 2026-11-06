import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import {
  WorkspaceAuthError,
  handleApiError,
  requireWorkspace,
} from "@/lib/workspace";
import { validateFaceDescriptor } from "@/lib/face-ai";

const ALLOWED_SOURCES = new Set(["WEBCAM", "UPLOAD", "SYNTHETIC", "IP_CAMERA"]);

export async function GET(req: NextRequest) {
  try {
    const { workspaceId } = await requireWorkspace(req);
    const { searchParams } = new URL(req.url);
    const studentId = searchParams.get("studentId")?.trim() || undefined;
    const classId = searchParams.get("classId")?.trim() || undefined;

    const descriptors = await prisma.faceDescriptor.findMany({
      where: {
        workspaceId,
        ...(studentId ? { studentId } : {}),
        ...(classId
          ? {
              student: {
                enrollments: {
                  some: {
                    classId,
                    workspaceId,
                  },
                },
              },
            }
          : {}),
      },
      include: {
        student: {
          select: {
            id: true,
            studentCode: true,
            fullName: true,
            avatarUrl: true,
            status: true,
          },
        },
      },
      orderBy: { createdAt: "desc" },
    });

    return NextResponse.json({ descriptors });
  } catch (error) {
    return handleApiError(error);
  }
}

export async function POST(req: NextRequest) {
  try {
    const { workspaceId } = await requireWorkspace(req);

    let body: Record<string, unknown>;
    try {
      body = await req.json();
    } catch {
      return NextResponse.json(
        { error: "Dữ liệu JSON không hợp lệ" },
        { status: 400 }
      );
    }

    const studentId =
      typeof body.studentId === "string" ? body.studentId.trim() : "";
    if (!studentId) {
      return NextResponse.json(
        { error: "Thiếu mã học sinh (studentId)" },
        { status: 400 }
      );
    }

    const student = await prisma.student.findFirst({
      where: { id: studentId, workspaceId },
    });
    if (!student) {
      throw new WorkspaceAuthError(
        404,
        "Không tìm thấy học sinh trong workspace của bạn"
      );
    }

    const hasStrictNumbers =
      Array.isArray(body.descriptor) &&
      body.descriptor.length === 128 &&
      body.descriptor.every((x) => typeof x === "number" && Number.isFinite(x));
    const validation = hasStrictNumbers
      ? validateFaceDescriptor(body.descriptor)
      : {
          valid: false,
          error:
            "Vector nhận diện khuôn mặt không hợp lệ (cần đúng 128 số thực khác 0)",
        };
    if (!validation.valid || !validation.normalized) {
      return NextResponse.json(
        {
          error:
            validation.error ||
            "Vector nhận diện khuôn mặt không hợp lệ (cần đúng 128 số thực khác 0)",
        },
        { status: 400 }
      );
    }

    const rawSource =
      typeof body.source === "string"
        ? body.source.trim().toUpperCase()
        : "UPLOAD";
    const source = ALLOWED_SOURCES.has(rawSource) ? rawSource : "UPLOAD";

    const label =
      typeof body.label === "string" && body.label.trim().length > 0
        ? body.label.trim()
        : `Mẫu khuôn mặt ${student.fullName}`;

    const sampleImageUrl =
      typeof body.sampleImageUrl === "string" &&
      body.sampleImageUrl.trim().length > 0
        ? body.sampleImageUrl.trim()
        : null;

    const descriptor = await prisma.faceDescriptor.create({
      data: {
        workspaceId,
        studentId: student.id,
        descriptor: validation.normalized,
        label,
        sampleImageUrl,
        source,
      },
      include: {
        student: {
          select: {
            id: true,
            studentCode: true,
            fullName: true,
            avatarUrl: true,
          },
        },
      },
    });

    return NextResponse.json({ descriptor }, { status: 201 });
  } catch (error) {
    return handleApiError(error);
  }
}
