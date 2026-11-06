import { NextRequest, NextResponse } from "next/server";
import type { InvoiceStatus, Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { handleApiError, requireWorkspace } from "@/lib/workspace";

const VALID_INVOICE_STATUSES: InvoiceStatus[] = [
  "UNPAID",
  "PARTIAL",
  "PAID",
  "CANCELLED",
];

export async function GET(req: NextRequest) {
  try {
    const { workspaceId } = await requireWorkspace(req);
    const { searchParams } = new URL(req.url);
    const classId = (searchParams.get("classId") || "").trim();
    const studentId = (searchParams.get("studentId") || "").trim();
    const billingPeriod = (searchParams.get("billingPeriod") || "").trim();
    const statusParam = (searchParams.get("status") || "").trim().toUpperCase();
    const search = (searchParams.get("search") || "").trim();

    const where: Prisma.InvoiceWhereInput = { workspaceId };

    if (classId) {
      where.classId = classId;
    }
    if (studentId) {
      where.studentId = studentId;
    }
    if (billingPeriod) {
      where.billingPeriod = billingPeriod;
    }
    if (
      statusParam &&
      statusParam !== "ALL" &&
      VALID_INVOICE_STATUSES.includes(statusParam as InvoiceStatus)
    ) {
      where.status = statusParam as InvoiceStatus;
    }

    if (search) {
      where.OR = [
        { invoiceNumber: { contains: search, mode: "insensitive" } },
        { title: { contains: search, mode: "insensitive" } },
        { student: { fullName: { contains: search, mode: "insensitive" } } },
        { student: { studentCode: { contains: search, mode: "insensitive" } } },
        { class: { name: { contains: search, mode: "insensitive" } } },
      ];
    }

    const invoices = await prisma.invoice.findMany({
      where,
      include: {
        student: {
          select: {
            id: true,
            studentCode: true,
            fullName: true,
            phone: true,
            guardians: {
              where: { isPrimary: true },
              take: 1,
            },
          },
        },
        class: {
          select: {
            id: true,
            code: true,
            name: true,
            subject: true,
            billingCycle: true,
          },
        },
        feePlan: {
          select: {
            id: true,
            name: true,
            billingCycle: true,
            amount: true,
          },
        },
        payments: {
          orderBy: { paidAt: "desc" },
        },
      },
      orderBy: [{ billingPeriod: "desc" }, { createdAt: "desc" }],
    });

    let totalBase = 0;
    let totalDiscount = 0;
    let totalNet = 0;
    let totalPaid = 0;
    let totalOutstanding = 0;

    for (const inv of invoices) {
      if (inv.status === "CANCELLED") continue;
      totalBase += inv.baseAmount;
      totalDiscount += inv.discountAmount;
      totalNet += inv.netAmount;
      totalPaid += inv.paidAmount;
      totalOutstanding += Math.max(0, inv.netAmount - inv.paidAmount);
    }

    const collectionRate =
      totalNet > 0 ? Math.round((totalPaid / totalNet) * 1000) / 10 : 0;

    return NextResponse.json(
      {
        invoices,
        summary: {
          totalBase,
          totalDiscount,
          totalNet,
          totalPaid,
          totalOutstanding,
          collectionRate,
        },
      },
      { status: 200 }
    );
  } catch (error) {
    return handleApiError(error);
  }
}
