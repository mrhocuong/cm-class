import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import {
  assertWorkspaceResource,
  handleApiError,
  requireWorkspace,
} from "@/lib/workspace";
import { formatTransferMemo, generateVietQrBundle } from "@/lib/vietqr";

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
            select: { id: true, studentCode: true, fullName: true },
          },
          class: {
            select: { id: true, code: true, name: true },
          },
        },
      }),
      workspaceId,
      "Không tìm thấy phiếu thu học phí trong workspace của bạn"
    );

    const remainingAmount = Math.max(0, invoice.netAmount - invoice.paidAmount);
    const transferContent = formatTransferMemo(
      invoice.student.studentCode,
      invoice.invoiceNumber
    );

    const bankBinClean = String(workspace.bankBin ?? "").replace(/\D/g, "");
    const bankAccClean = String(workspace.bankAccountNumber ?? "").trim();
    const bankConfigured =
      bankBinClean.length === 6 && bankAccClean.length > 0;

    if (!bankConfigured) {
      return NextResponse.json(
        {
          bankConfigured: false,
          amount: remainingAmount,
          transferContent,
          qrPayload: "",
          qrSvg: "",
          qrDataUrl: "",
          vietQrImageUrl: null,
          bankInfo: null,
          invoice: {
            id: invoice.id,
            invoiceNumber: invoice.invoiceNumber,
            title: invoice.title,
            billingPeriod: invoice.billingPeriod,
            netAmount: invoice.netAmount,
            paidAmount: invoice.paidAmount,
            remainingAmount,
            status: invoice.status,
            student: invoice.student,
            class: invoice.class,
          },
        },
        { status: 200 }
      );
    }

    const bundle = await generateVietQrBundle({
      bankBin: bankBinClean,
      bankCode: workspace.bankCode,
      bankName: workspace.bankName,
      accountNumber: bankAccClean,
      accountName: workspace.bankAccountName,
      amount: remainingAmount,
      studentCode: invoice.student.studentCode,
      invoiceNumber: invoice.invoiceNumber,
    });

    return NextResponse.json(
      {
        ...bundle,
        bankConfigured: true,
        invoice: {
          id: invoice.id,
          invoiceNumber: invoice.invoiceNumber,
          title: invoice.title,
          billingPeriod: invoice.billingPeriod,
          netAmount: invoice.netAmount,
          paidAmount: invoice.paidAmount,
          remainingAmount,
          status: invoice.status,
          student: invoice.student,
          class: invoice.class,
        },
      },
      { status: 200 }
    );
  } catch (error) {
    return handleApiError(error);
  }
}
