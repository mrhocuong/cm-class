import { NextRequest, NextResponse } from "next/server";
import type { InvoiceStatus, Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { handleApiError, requireWorkspace } from "@/lib/workspace";

export async function GET(req: NextRequest) {
  try {
    const { workspaceId } = await requireWorkspace(req);
    const { searchParams } = new URL(req.url);
    const billingPeriod = (searchParams.get("billingPeriod") || "").trim();
    const classId = (searchParams.get("classId") || "").trim();
    const statusParam = (searchParams.get("status") || "").trim().toUpperCase();

    const where: Prisma.InvoiceWhereInput = {
      workspaceId,
      status: { not: "CANCELLED" },
    };

    if (billingPeriod) {
      where.billingPeriod = billingPeriod;
    }
    if (classId) {
      where.classId = classId;
    }
    if (
      statusParam &&
      statusParam !== "ALL" &&
      statusParam !== "CANCELLED" &&
      ["UNPAID", "PARTIAL", "PAID"].includes(statusParam)
    ) {
      where.status = statusParam as InvoiceStatus;
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
          },
        },
        payments: {
          orderBy: { paidAt: "desc" },
        },
      },
      orderBy: [{ dueDate: "asc" }, { createdAt: "desc" }],
    });

    let totalBase = 0;
    let totalDiscount = 0;
    let totalNet = 0;
    let totalPaid = 0;
    let totalOutstanding = 0;
    let paidCount = 0;
    let partialCount = 0;
    let unpaidCount = 0;

    const byClassMap = new Map<
      string,
      {
        classId: string;
        classCode: string;
        className: string;
        invoiceCount: number;
        totalBase: number;
        totalDiscount: number;
        totalNet: number;
        totalPaid: number;
        totalOutstanding: number;
        collectionRate: number;
      }
    >();

    const byMonthMap = new Map<
      string,
      {
        billingPeriod: string;
        invoiceCount: number;
        totalNet: number;
        totalPaid: number;
        totalOutstanding: number;
        collectionRate: number;
      }
    >();

    const overdueInvoices = [];
    const nowMs = Date.now();

    for (const inv of invoices) {
      const remaining = Math.max(0, inv.netAmount - inv.paidAmount);
      totalBase += inv.baseAmount;
      totalDiscount += inv.discountAmount;
      totalNet += inv.netAmount;
      totalPaid += inv.paidAmount;
      totalOutstanding += remaining;

      if (inv.status === "PAID") paidCount++;
      else if (inv.status === "PARTIAL") partialCount++;
      else if (inv.status === "UNPAID") unpaidCount++;

      // Class aggregation
      let clsBucket = byClassMap.get(inv.classId);
      if (!clsBucket) {
        clsBucket = {
          classId: inv.classId,
          classCode: inv.class.code,
          className: inv.class.name,
          invoiceCount: 0,
          totalBase: 0,
          totalDiscount: 0,
          totalNet: 0,
          totalPaid: 0,
          totalOutstanding: 0,
          collectionRate: 0,
        };
        byClassMap.set(inv.classId, clsBucket);
      }
      clsBucket.invoiceCount += 1;
      clsBucket.totalBase += inv.baseAmount;
      clsBucket.totalDiscount += inv.discountAmount;
      clsBucket.totalNet += inv.netAmount;
      clsBucket.totalPaid += inv.paidAmount;
      clsBucket.totalOutstanding += remaining;

      // Month aggregation
      let monthBucket = byMonthMap.get(inv.billingPeriod);
      if (!monthBucket) {
        monthBucket = {
          billingPeriod: inv.billingPeriod,
          invoiceCount: 0,
          totalNet: 0,
          totalPaid: 0,
          totalOutstanding: 0,
          collectionRate: 0,
        };
        byMonthMap.set(inv.billingPeriod, monthBucket);
      }
      monthBucket.invoiceCount += 1;
      monthBucket.totalNet += inv.netAmount;
      monthBucket.totalPaid += inv.paidAmount;
      monthBucket.totalOutstanding += remaining;

      if (inv.status === "UNPAID" || inv.status === "PARTIAL") {
        overdueInvoices.push({
          ...inv,
          remainingAmount: remaining,
          isPastDue: new Date(inv.dueDate).getTime() < nowMs,
        });
      }
    }

    const byClass = Array.from(byClassMap.values()).map((c) => ({
      ...c,
      collectionRate:
        c.totalNet > 0 ? Math.round((c.totalPaid / c.totalNet) * 1000) / 10 : 0,
    }));

    const byMonth = Array.from(byMonthMap.values())
      .map((m) => ({
        ...m,
        collectionRate:
          m.totalNet > 0
            ? Math.round((m.totalPaid / m.totalNet) * 1000) / 10
            : 0,
      }))
      .sort((a, b) => b.billingPeriod.localeCompare(a.billingPeriod));

    const collectionRate =
      totalNet > 0 ? Math.round((totalPaid / totalNet) * 1000) / 10 : 0;

    return NextResponse.json(
      {
        summary: {
          invoiceCount: invoices.length,
          paidCount,
          partialCount,
          unpaidCount,
          totalBase,
          totalDiscount,
          totalNet,
          totalPaid,
          totalOutstanding,
          collectionRate,
        },
        byClass,
        byMonth,
        overdueInvoices,
        invoices,
      },
      { status: 200 }
    );
  } catch (error) {
    return handleApiError(error);
  }
}
