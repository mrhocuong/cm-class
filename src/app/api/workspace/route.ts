import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireWorkspace, handleApiError } from "@/lib/workspace";
import {
  VIETQR_BANKS,
  buildSampleVietQrPreview,
  sanitizeAsciiUpper,
} from "@/lib/vietqr";

export async function GET(req: NextRequest) {
  try {
    const { user, workspace } = await requireWorkspace(req);
    const vietqrPreview = await buildSampleVietQrPreview(workspace);

    return NextResponse.json({
      workspace,
      user: {
        id: user.id,
        email: user.email,
        fullName: user.fullName,
        phone: user.phone,
        avatarUrl: user.avatarUrl,
      },
      vietqrPreview,
      banks: VIETQR_BANKS,
    });
  } catch (error) {
    return handleApiError(error);
  }
}

async function updateWorkspaceHandler(req: NextRequest) {
  try {
    const { workspaceId, workspace: currentWorkspace } = await requireWorkspace(req);
    const body = await req.json().catch(() => null);
    if (!body || typeof body !== "object") {
      return NextResponse.json(
        { error: "Dữ liệu cập nhật không hợp lệ" },
        { status: 400 }
      );
    }

    const name =
      body.name !== undefined ? String(body.name).trim() : currentWorkspace.name;
    if (!name) {
      return NextResponse.json(
        { error: "Tên Workspace / Trung tâm không được để trống" },
        { status: 400 }
      );
    }

    const logoUrl =
      body.logoUrl !== undefined
        ? body.logoUrl
          ? String(body.logoUrl).trim()
          : null
        : currentWorkspace.logoUrl;
    const phone =
      body.phone !== undefined
        ? body.phone
          ? String(body.phone).trim()
          : null
        : currentWorkspace.phone;
    const address =
      body.address !== undefined
        ? body.address
          ? String(body.address).trim()
          : null
        : currentWorkspace.address;
    const currency =
      body.currency !== undefined && String(body.currency).trim()
        ? String(body.currency).trim().toUpperCase()
        : currentWorkspace.currency;
    const cameraStreamUrl =
      body.cameraStreamUrl !== undefined
        ? body.cameraStreamUrl
          ? String(body.cameraStreamUrl).trim()
          : null
        : currentWorkspace.cameraStreamUrl;

    // Bank fields handling
    const rawBin =
      body.bankBin !== undefined
        ? String(body.bankBin ?? "").trim()
        : currentWorkspace.bankBin ?? "";
    const rawAccountNumber =
      body.bankAccountNumber !== undefined
        ? String(body.bankAccountNumber ?? "").trim()
        : currentWorkspace.bankAccountNumber ?? "";
    const rawAccountName =
      body.bankAccountName !== undefined
        ? String(body.bankAccountName ?? "").trim()
        : currentWorkspace.bankAccountName ?? "";

    const anyBankFieldProvided = Boolean(
      rawBin || rawAccountNumber || rawAccountName
    );
    const allBankFieldsProvided = Boolean(
      rawBin && rawAccountNumber && rawAccountName
    );

    if (anyBankFieldProvided && !allBankFieldsProvided) {
      return NextResponse.json(
        {
          error:
            "Vui lòng nhập đầy đủ Ngân hàng (BIN), Số tài khoản và Tên chủ tài khoản để cấu hình VietQR",
        },
        { status: 400 }
      );
    }

    let bankBin: string | null = null;
    let bankCode: string | null = null;
    let bankName: string | null = null;
    let bankAccountNumber: string | null = null;
    let bankAccountName: string | null = null;

    if (allBankFieldsProvided) {
      if (!/^\d{6}$/.test(rawBin)) {
        return NextResponse.json(
          { error: "Mã BIN ngân hàng không hợp lệ (cần đúng 6 chữ số NAPAS)" },
          { status: 400 }
        );
      }

      if (!/^[A-Za-z0-9]{6,25}$/.test(rawAccountNumber.replace(/\s+/g, ""))) {
        return NextResponse.json(
          { error: "Số tài khoản ngân hàng không hợp lệ (6–25 ký tự chữ/số)" },
          { status: 400 }
        );
      }

      const matchedBank = VIETQR_BANKS.find((b) => b.bin === rawBin);
      bankBin = rawBin;
      bankCode =
        (body.bankCode && String(body.bankCode).trim()) ||
        matchedBank?.code ||
        "BANK";
      bankName =
        (body.bankName && String(body.bankName).trim()) ||
        matchedBank?.shortName ||
        `Ngân hàng (${rawBin})`;
      bankAccountNumber = rawAccountNumber.replace(/\s+/g, "");
      bankAccountName = sanitizeAsciiUpper(rawAccountName);
    }

    const updatedWorkspace = await prisma.workspace.update({
      where: { id: workspaceId },
      data: {
        name,
        logoUrl,
        phone,
        address,
        currency,
        cameraStreamUrl,
        bankBin,
        bankCode,
        bankName,
        bankAccountNumber,
        bankAccountName,
      },
    });

    const vietqrPreview = await buildSampleVietQrPreview(updatedWorkspace);

    return NextResponse.json({
      workspace: updatedWorkspace,
      vietqrPreview,
    });
  } catch (error) {
    return handleApiError(error);
  }
}

export async function PUT(req: NextRequest) {
  return updateWorkspaceHandler(req);
}

export async function PATCH(req: NextRequest) {
  return updateWorkspaceHandler(req);
}
