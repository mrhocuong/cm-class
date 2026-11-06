import { NextRequest, NextResponse } from "next/server";
import type { PaymentMethod } from "@prisma/client";
import { prisma } from "@/lib/db";
import {
  assertWorkspaceResource,
  handleApiError,
  requireWorkspace,
} from "@/lib/workspace";

type RouteContext = { params: Promise<{ id: string }> };

const VALID_PAYMENT_METHODS: PaymentMethod[] = ["CASH", "BANK_TRANSFER"];

export async function POST(req: NextRequest, context: RouteContext) {
  try {
    const { workspaceId, user } = await requireWorkspace(req);
    const { id: invoiceId } = await context.params;

    const invoice = assertWorkspaceResource(
      await prisma.invoice.findFirst({
        where: { id: invoiceId, workspaceId },
      }),
      workspaceId,
      "Không tìm thấy phiếu thu học phí trong workspace của bạn"
    );

    if (invoice.status === "CANCELLED") {
      return NextResponse.json(
        { error: "Không thể ghi nhận thanh toán cho phiếu thu đã huỷ" },
        { status: 400 }
      );
    }

    const body = await req.json();
    const amount = Math.round(Number(body.amount));
    if (!Number.isFinite(amount) || amount <= 0) {
      return NextResponse.json(
        { error: "Số tiền thanh toán phải lớn hơn 0" },
        { status: 400 }
      );
    }

    const remaining = invoice.netAmount - invoice.paidAmount;
    if (remaining <= 0 || amount > remaining) {
      return NextResponse.json(
        { error: "Số tiền thu vượt quá số tiền còn nợ của phiếu thu" },
        { status: 400 }
      );
    }

    const methodRaw = body.method
      ? String(body.method).trim().toUpperCase()
      : "BANK_TRANSFER";
    if (!VALID_PAYMENT_METHODS.includes(methodRaw as PaymentMethod)) {
      return NextResponse.json(
        { error: "Phương thức thanh toán không hợp lệ" },
        { status: 400 }
      );
    }
    const method = methodRaw as PaymentMethod;

    const paidAt = body.paidAt ? new Date(body.paidAt) : new Date();
    if (Number.isNaN(paidAt.getTime())) {
      return NextResponse.json(
        { error: "Thời gian thanh toán không hợp lệ" },
        { status: 400 }
      );
    }

    const result = await prisma.$transaction(async (tx) => {
      const paymentCount = await tx.payment.count({ where: { workspaceId } });
      const receiptNumber =
        body.receiptNumber && String(body.receiptNumber).trim()
          ? String(body.receiptNumber).trim()
          : `PT-${invoice.billingPeriod.replace("-", "")}-${String(
              paymentCount + 1
            ).padStart(4, "0")}-${Date.now().toString().slice(-4)}`;

      const payment = await tx.payment.create({
        data: {
          workspaceId,
          invoiceId: invoice.id,
          receiptNumber,
          amount,
          method,
          paidAt,
          collectorName: body.collectorName
            ? String(body.collectorName).trim()
            : user.fullName,
          referenceCode: body.referenceCode
            ? String(body.referenceCode).trim()
            : null,
          receiptNote: body.receiptNote
            ? String(body.receiptNote).trim()
            : null,
        },
      });

      const newPaidAmount = invoice.paidAmount + amount;
      const newStatus = newPaidAmount >= invoice.netAmount ? "PAID" : "PARTIAL";

      const updatedInvoice = await tx.invoice.update({
        where: { id: invoice.id },
        data: {
          paidAmount: newPaidAmount,
          status: newStatus,
        },
        include: {
          student: { select: { id: true, studentCode: true, fullName: true } },
          class: { select: { id: true, code: true, name: true } },
          payments: { orderBy: { paidAt: "desc" } },
        },
      });

      return { payment, invoice: updatedInvoice };
    });

    return NextResponse.json(
      {
        payment: result.payment,
        invoice: result.invoice,
      },
      { status: 201 }
    );
  } catch (error) {
    return handleApiError(error);
  }
}
