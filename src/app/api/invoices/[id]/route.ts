import { NextRequest, NextResponse } from "next/server";
import type { InvoiceStatus } from "@prisma/client";
import { prisma } from "@/lib/db";
import {
  assertWorkspaceResource,
  handleApiError,
  requireWorkspace,
} from "@/lib/workspace";
import { generateVietQrBundle } from "@/lib/vietqr";

type RouteContext = { params: Promise<{ id: string }> };

export async function GET(req: NextRequest, context: RouteContext) {
  try {
    const { workspaceId, workspace } = await requireWorkspace(req);
    const { id } = await context.params;

    const invoice = assertWorkspaceResource(
      await prisma.invoice.findFirst({
        where: { id, workspaceId },
        include: {
          student: {
            include: {
              guardians: {
                orderBy: [{ isPrimary: "desc" }, { createdAt: "asc" }],
              },
            },
          },
          class: true,
          feePlan: true,
          payments: {
            orderBy: { paidAt: "desc" },
          },
        },
      }),
      workspaceId,
      "Không tìm thấy phiếu thu học phí trong workspace của bạn"
    );

    let vietqr = null;
    const bankBinClean = String(workspace.bankBin ?? "").replace(/\D/g, "");
    const bankAccClean = String(workspace.bankAccountNumber ?? "").trim();
    if (bankBinClean.length === 6 && bankAccClean.length > 0) {
      try {
        const remaining = Math.max(0, invoice.netAmount - invoice.paidAmount);
        vietqr = await generateVietQrBundle({
          bankBin: bankBinClean,
          bankCode: workspace.bankCode,
          bankName: workspace.bankName,
          accountNumber: bankAccClean,
          accountName: workspace.bankAccountName,
          amount: remaining,
          studentCode: invoice.student.studentCode,
          invoiceNumber: invoice.invoiceNumber,
        });
      } catch {
        vietqr = null;
      }
    }

    return NextResponse.json({ invoice, vietqr }, { status: 200 });
  } catch (error) {
    return handleApiError(error);
  }
}

export async function PATCH(req: NextRequest, context: RouteContext) {
  try {
    const { workspaceId } = await requireWorkspace(req);
    const { id } = await context.params;

    const existing = assertWorkspaceResource(
      await prisma.invoice.findFirst({
        where: { id, workspaceId },
      }),
      workspaceId,
      "Không tìm thấy phiếu thu học phí trong workspace của bạn"
    );

    const body = await req.json();

    const VALID_INVOICE_STATUSES: InvoiceStatus[] = [
      "UNPAID",
      "PARTIAL",
      "PAID",
      "CANCELLED",
    ];
    if (body.status !== undefined) {
      const st = String(body.status).trim().toUpperCase();
      if (!VALID_INVOICE_STATUSES.includes(st as InvoiceStatus)) {
        return NextResponse.json(
          { error: "Trạng thái phiếu thu không hợp lệ" },
          { status: 400 }
        );
      }
    }

    if (existing.status === "CANCELLED") {
      if (
        body.baseAmount !== undefined ||
        body.discountAmount !== undefined ||
        (body.status !== undefined &&
          String(body.status).trim().toUpperCase() !== "CANCELLED")
      ) {
        return NextResponse.json(
          { error: "Không thể chỉnh sửa hoặc khôi phục phiếu thu đã huỷ" },
          { status: 400 }
        );
      }
    }

    if (body.status === "CANCELLED") {
      if (existing.paidAmount > 0) {
        return NextResponse.json(
          { error: "Không thể huỷ phiếu thu đã có giao dịch thanh toán" },
          { status: 400 }
        );
      }
    }

    const newBaseAmount =
      body.baseAmount !== undefined
        ? Math.round(Number(body.baseAmount))
        : existing.baseAmount;
    const newDiscountAmount =
      body.discountAmount !== undefined
        ? Math.round(Number(body.discountAmount))
        : existing.discountAmount;

    if (!Number.isFinite(newBaseAmount) || newBaseAmount < 0) {
      return NextResponse.json(
        { error: "Học phí gốc không hợp lệ" },
        { status: 400 }
      );
    }

    if (
      !Number.isFinite(newDiscountAmount) ||
      newDiscountAmount < 0 ||
      newDiscountAmount > newBaseAmount
    ) {
      return NextResponse.json(
        { error: "Số tiền giảm trừ không hợp lệ hoặc vượt quá học phí gốc" },
        { status: 400 }
      );
    }

    const newNetAmount = newBaseAmount - newDiscountAmount;
    if (newNetAmount < existing.paidAmount) {
      return NextResponse.json(
        {
          error:
            "Số tiền phải thu sau giảm trừ không thể nhỏ hơn số tiền đã thanh toán",
        },
        { status: 400 }
      );
    }

    let nextStatus: InvoiceStatus = existing.status;
    if (body.status === "CANCELLED") {
      nextStatus = "CANCELLED";
    } else if (existing.status === "CANCELLED" && body.status === undefined) {
      nextStatus = "CANCELLED";
    } else if (existing.paidAmount >= newNetAmount) {
      nextStatus = "PAID";
    } else if (existing.paidAmount > 0) {
      nextStatus = "PARTIAL";
    } else {
      nextStatus = "UNPAID";
    }

    let nextDueDate = existing.dueDate;
    if (body.dueDate !== undefined) {
      const parsed = new Date(body.dueDate);
      if (Number.isNaN(parsed.getTime())) {
        return NextResponse.json(
          { error: "Hạn đóng học phí không hợp lệ" },
          { status: 400 }
        );
      }
      nextDueDate = parsed;
    }

    const updated = await prisma.invoice.update({
      where: { id: existing.id },
      data: {
        title:
          body.title !== undefined
            ? String(body.title).trim() || existing.title
            : existing.title,
        baseAmount: newBaseAmount,
        discountAmount: newDiscountAmount,
        discountReason:
          body.discountReason !== undefined
            ? body.discountReason
              ? String(body.discountReason).trim()
              : null
            : existing.discountReason,
        netAmount: newNetAmount,
        status: nextStatus,
        dueDate: nextDueDate,
        notes:
          body.notes !== undefined
            ? body.notes
              ? String(body.notes).trim()
              : null
            : existing.notes,
      },
      include: {
        student: { select: { id: true, studentCode: true, fullName: true } },
        class: { select: { id: true, code: true, name: true } },
        feePlan: true,
        payments: { orderBy: { paidAt: "desc" } },
      },
    });

    return NextResponse.json({ invoice: updated }, { status: 200 });
  } catch (error) {
    return handleApiError(error);
  }
}
