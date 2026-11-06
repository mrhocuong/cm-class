import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireWorkspace, handleApiError } from "@/lib/workspace";

export async function GET(req: NextRequest) {
  try {
    const { workspaceId, workspace } = await requireWorkspace(req);
    const { searchParams } = new URL(req.url);
    const requestedMonth = searchParams.get("month")?.trim() || null;

    // 1. Class & Student counts
    const [totalClasses, activeClasses, totalStudents, activeStudents] =
      await Promise.all([
        prisma.class.count({ where: { workspaceId } }),
        prisma.class.count({ where: { workspaceId, status: "ACTIVE" } }),
        prisma.student.count({ where: { workspaceId } }),
        prisma.student.count({ where: { workspaceId, status: "ACTIVE" } }),
      ]);

    // 2. Determine target billingPeriod if not explicitly requested
    const now = new Date();
    const currentYearMonth = `${now.getUTCFullYear()}-${String(
      now.getUTCMonth() + 1
    ).padStart(2, "0")}`;

    let activeBillingPeriod = requestedMonth || currentYearMonth;

    // Invoices query: if requestedMonth is specified, filter strictly by that month;
    // otherwise aggregate across current month (or all non-cancelled workspace invoices if current month has none)
    const invoiceWhere: Record<string, unknown> = {
      workspaceId,
      status: { not: "CANCELLED" },
    };
    if (requestedMonth) {
      invoiceWhere.billingPeriod = requestedMonth;
    } else {
      const countInCurrentMonth = await prisma.invoice.count({
        where: {
          workspaceId,
          billingPeriod: currentYearMonth,
          status: { not: "CANCELLED" },
        },
      });
      if (countInCurrentMonth > 0) {
        invoiceWhere.billingPeriod = currentYearMonth;
      } else {
        // Fallback to latest billingPeriod present in workspace so seeded data is always reflected
        const latestInvoice = await prisma.invoice.findFirst({
          where: { workspaceId, status: { not: "CANCELLED" } },
          orderBy: { billingPeriod: "desc" },
          select: { billingPeriod: true },
        });
        if (latestInvoice) {
          activeBillingPeriod = latestInvoice.billingPeriod;
          invoiceWhere.billingPeriod = latestInvoice.billingPeriod;
        }
      }
    }

    const invoices = await prisma.invoice.findMany({
      where: invoiceWhere,
      select: {
        id: true,
        baseAmount: true,
        discountAmount: true,
        netAmount: true,
        paidAmount: true,
        status: true,
      },
    });

    let monthlyNetTuition = 0;
    let monthlyCollected = 0;
    let monthlyOutstanding = 0;

    for (const inv of invoices) {
      monthlyNetTuition += inv.netAmount;
      monthlyCollected += inv.paidAmount;
      monthlyOutstanding += Math.max(0, inv.netAmount - inv.paidAmount);
    }

    const collectionRate =
      monthlyNetTuition > 0
        ? Math.round((monthlyCollected / monthlyNetTuition) * 1000) / 10
        : 0;

    // 3. Today's Sessions (or nearest upcoming scheduled sessions if today has 0)
    const startOfToday = new Date(
      Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), 0, 0, 0)
    );
    const endOfToday = new Date(
      Date.UTC(
        now.getUTCFullYear(),
        now.getUTCMonth(),
        now.getUTCDate(),
        23,
        59,
        59,
        999
      )
    );

    let todaySessions = await prisma.session.findMany({
      where: {
        workspaceId,
        sessionDate: {
          gte: startOfToday,
          lte: endOfToday,
        },
        status: { not: "CANCELLED" },
      },
      include: {
        class: {
          select: {
            id: true,
            code: true,
            name: true,
            subject: true,
            room: true,
            color: true,
          },
        },
        _count: {
          select: { attendances: true },
        },
      },
      orderBy: [{ startTime: "asc" }],
    });

    // If no session falls on exact UTC today (e.g. VM clock is in a different month than seed),
    // fallback to the nearest 5 scheduled/in-progress sessions in the workspace so the teacher sees their timetable
    if (todaySessions.length === 0) {
      todaySessions = await prisma.session.findMany({
        where: {
          workspaceId,
          status: { in: ["SCHEDULED", "IN_PROGRESS"] },
        },
        include: {
          class: {
            select: {
              id: true,
              code: true,
              name: true,
              subject: true,
              room: true,
              color: true,
            },
          },
          _count: {
            select: { attendances: true },
          },
        },
        orderBy: [{ sessionDate: "asc" }, { startTime: "asc" }],
        take: 6,
      });
    }

    const todaySessionsCount = todaySessions.length;

    // 4. Recent Payments (last 6)
    const recentPayments = await prisma.payment.findMany({
      where: { workspaceId },
      include: {
        invoice: {
          select: {
            id: true,
            invoiceNumber: true,
            title: true,
            billingPeriod: true,
            student: {
              select: { id: true, studentCode: true, fullName: true },
            },
            class: {
              select: { id: true, code: true, name: true },
            },
          },
        },
      },
      orderBy: { paidAt: "desc" },
      take: 6,
    });

    // 5. Overdue / Unpaid Invoices (top 8 needing collection)
    const overdueInvoices = await prisma.invoice.findMany({
      where: {
        workspaceId,
        status: { in: ["UNPAID", "PARTIAL"] },
      },
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
          select: { id: true, code: true, name: true },
        },
      },
      orderBy: [{ dueDate: "asc" }, { createdAt: "desc" }],
      take: 8,
    });

    return NextResponse.json({
      workspace: {
        id: workspace.id,
        name: workspace.name,
        currency: workspace.currency,
        bankConfigured: Boolean(
          workspace.bankBin &&
            workspace.bankAccountNumber &&
            workspace.bankAccountName
        ),
      },
      billingPeriod: activeBillingPeriod,
      kpis: {
        totalClasses,
        activeClasses,
        totalStudents,
        activeStudents,
        todaySessionsCount,
        monthlyNetTuition,
        monthlyCollected,
        monthlyOutstanding,
        collectionRate,
      },
      todaySessions,
      recentPayments,
      overdueInvoices,
    });
  } catch (error) {
    return handleApiError(error);
  }
}
