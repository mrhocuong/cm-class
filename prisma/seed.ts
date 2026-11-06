import {
  PrismaClient,
  BillingCycle,
  ClassStatus,
  DiscountType,
  EnrollmentStatus,
  Gender,
  InvoiceStatus,
  PaymentMethod,
  SessionStatus,
  StudentStatus,
  AttendanceStatus,
  AttendanceMethod,
  HomeworkSubmissionStatus,
  QuestionType,
  QuestionDifficulty,
  MinigameType,
  GamePlayMode,
  GameSessionStatus,
} from "@prisma/client";
import bcrypt from "bcryptjs";
import { generateSyntheticDescriptorForStudent } from "../src/lib/face-ai";

const prisma = new PrismaClient();

export function makeL2Descriptor(seedIndex: number): number[] {
  return generateSyntheticDescriptorForStudent(
    `HS${String(seedIndex).padStart(3, "0")}`
  );
}

function toUtcMidnight(date: Date): Date {
  return new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
}

function addDaysUtc(baseUtc: Date, days: number): Date {
  const d = new Date(baseUtc.getTime());
  d.setUTCDate(d.getUTCDate() + days);
  return d;
}

function getBillingPeriod(date: Date): string {
  const y = date.getUTCFullYear();
  const m = String(date.getUTCMonth() + 1).padStart(2, "0");
  return `${y}-${m}`;
}

async function main() {
  console.log("[seed] Cleaning existing database records...");
  await prisma.pointTransaction.deleteMany();
  await prisma.leaderboardConfig.deleteMany();
  await prisma.gameResult.deleteMany();
  await prisma.gameSession.deleteMany();
  await prisma.minigame.deleteMany();
  await prisma.exerciseQuestion.deleteMany();
  await prisma.homeworkSubmission.deleteMany();
  await prisma.homework.deleteMany();
  await prisma.faceDescriptor.deleteMany();
  await prisma.attendance.deleteMany();
  await prisma.payment.deleteMany();
  await prisma.invoice.deleteMany();
  await prisma.feePlan.deleteMany();
  await prisma.enrollment.deleteMany();
  await prisma.guardian.deleteMany();
  await prisma.student.deleteMany();
  await prisma.session.deleteMany();
  await prisma.scheduleSlot.deleteMany();
  await prisma.class.deleteMany();
  await prisma.workspace.deleteMany();
  await prisma.user.deleteMany();

  const passwordHash = await bcrypt.hash("123456", 10);
  const now = new Date();
  const todayUtc = toUtcMidnight(now);
  const currentMonth = getBillingPeriod(todayUtc);
  const todayDayOfWeek = todayUtc.getUTCDay(); // 0..6

  // ==========================================================================
  // 1. TEACHER A & WORKSPACE A
  // ==========================================================================
  console.log("[seed] Creating Teacher A (giaovien@cmclass.vn)...");
  const teacherA = await prisma.user.create({
    data: {
      email: "giaovien@cmclass.vn",
      passwordHash,
      fullName: "Thầy Nguyễn Văn An",
      phone: "0901234567",
      workspace: {
        create: {
          name: "Trung tâm Luyện thi Sao Khuê",
          phone: "0901234567",
          address: "Số 15 Trần Đại Nghĩa, Hai Bà Trưng, Hà Nội",
          currency: "VND",
          bankBin: "970436",
          bankCode: "VCB",
          bankName: "Vietcombank",
          bankAccountNumber: "0123456789",
          bankAccountName: "NGUYEN VAN AN",
          cameraStreamUrl: "http://localhost:3000/api/face-ai/sample-frame",
        },
      },
    },
    include: { workspace: true },
  });
  const wsA = teacherA.workspace!;

  // ==========================================================================
  // 2. CLASSES FOR TEACHER A (3 Classes: TOAN9-A1, ANH10-B1, LY12-C1)
  // ==========================================================================
  console.log("[seed] Creating 3 classes for Teacher A...");
  const classToan = await prisma.class.create({
    data: {
      workspaceId: wsA.id,
      code: "TOAN9-A1",
      name: "Toán 9 Luyện thi vào 10 - Ca A1",
      subject: "Toán",
      gradeLevel: "Lớp 9",
      room: "Phòng 101",
      defaultFeeAmount: 1200000,
      billingCycle: BillingCycle.MONTHLY,
      startDate: addDaysUtc(todayUtc, -60),
      endDate: addDaysUtc(todayUtc, 120),
      description: "Lớp mũi nhọn luyện thi vào lớp 10 THPT công lập và chuyên.",
      color: "#2563eb",
      status: ClassStatus.ACTIVE,
    },
  });

  const classAnh = await prisma.class.create({
    data: {
      workspaceId: wsA.id,
      code: "ANH10-B1",
      name: "Tiếng Anh 10 IELTS Foundation - Ca B1",
      subject: "Tiếng Anh",
      gradeLevel: "Lớp 10",
      room: "Phòng 202",
      defaultFeeAmount: 1500000,
      billingCycle: BillingCycle.MONTHLY,
      startDate: addDaysUtc(todayUtc, -45),
      endDate: addDaysUtc(todayUtc, 150),
      description: "Lớp Tiếng Anh học thuật và nền tảng IELTS 5.5+.",
      color: "#16a34a",
      status: ClassStatus.ACTIVE,
    },
  });

  const classLy = await prisma.class.create({
    data: {
      workspaceId: wsA.id,
      code: "LY12-C1",
      name: "Vật Lý 12 Luyện thi THPT Quốc Gia",
      subject: "Vật Lý",
      gradeLevel: "Lớp 12",
      room: "Phòng 301",
      defaultFeeAmount: 200000,
      billingCycle: BillingCycle.PER_SESSION,
      startDate: addDaysUtc(todayUtc, -30),
      endDate: addDaysUtc(todayUtc, 180),
      description: "Lớp luyện đề Vật Lý 12 thu học phí theo buổi.",
      color: "#9333ea",
      status: ClassStatus.ACTIVE,
    },
  });

  // ==========================================================================
  // 3. SCHEDULE SLOTS & SESSIONS (Explicitly including TODAY's sessions)
  // ==========================================================================
  console.log("[seed] Creating ScheduleSlots and Sessions (including today)...");
  const toanDays = Array.from(new Set([1, 3, 5, todayDayOfWeek]));
  const toanSlots = [];
  for (const d of toanDays) {
    const slot = await prisma.scheduleSlot.create({
      data: {
        workspaceId: wsA.id,
        classId: classToan.id,
        dayOfWeek: d,
        startTime: "18:00",
        endTime: "19:30",
        room: "Phòng 101",
      },
    });
    toanSlots.push(slot);
  }

  const anhSlots = [];
  for (const d of [2, 4, 6]) {
    const slot = await prisma.scheduleSlot.create({
      data: {
        workspaceId: wsA.id,
        classId: classAnh.id,
        dayOfWeek: d,
        startTime: "19:45",
        endTime: "21:15",
        room: "Phòng 202",
      },
    });
    anhSlots.push(slot);
  }

  const lySlot = await prisma.scheduleSlot.create({
    data: {
      workspaceId: wsA.id,
      classId: classLy.id,
      dayOfWeek: 0,
      startTime: "08:30",
      endTime: "10:30",
      room: "Phòng 301",
    },
  });

  // Create past completed session, TODAY's scheduled sessions, and upcoming sessions
  const pastSessionToan = await prisma.session.create({
    data: {
      workspaceId: wsA.id,
      classId: classToan.id,
      scheduleSlotId: toanSlots[0].id,
      sessionDate: addDaysUtc(todayUtc, -2),
      startTime: "18:00",
      endTime: "19:30",
      room: "Phòng 101",
      topic: "Chuyên đề 1: Hệ thức lượng trong tam giác vuông & Rút gọn căn thức",
      notes: "Cả lớp làm bài tốt, đã tổ chức minigame cuối giờ.",
      status: SessionStatus.COMPLETED,
    },
  });

  const todaySessionToan = await prisma.session.create({
    data: {
      workspaceId: wsA.id,
      classId: classToan.id,
      scheduleSlotId: toanSlots[0].id,
      sessionDate: todayUtc,
      startTime: "18:00",
      endTime: "19:30",
      room: "Phòng 101",
      topic: "Chuyên đề 2: Hàm số bậc nhất và đồ thị y = ax + b",
      notes: "Kiểm tra 15 phút đầu giờ và điểm danh FaceAI.",
      status: SessionStatus.SCHEDULED,
    },
  });

  const todaySessionAnh = await prisma.session.create({
    data: {
      workspaceId: wsA.id,
      classId: classAnh.id,
      scheduleSlotId: anhSlots[0].id,
      sessionDate: todayUtc,
      startTime: "19:45",
      endTime: "21:15",
      room: "Phòng 202",
      topic: "Unit 3: Academic Reading & Paraphrasing Techniques",
      notes: "Chuẩn bị bài tập từ vựng IELTS.",
      status: SessionStatus.SCHEDULED,
    },
  });

  await prisma.session.create({
    data: {
      workspaceId: wsA.id,
      classId: classToan.id,
      scheduleSlotId: toanSlots[0].id,
      sessionDate: addDaysUtc(todayUtc, 2),
      startTime: "18:00",
      endTime: "19:30",
      room: "Phòng 101",
      topic: "Chuyên đề 3: Hệ phương trình bậc nhất hai ẩn",
      status: SessionStatus.SCHEDULED,
    },
  });

  await prisma.session.create({
    data: {
      workspaceId: wsA.id,
      classId: classLy.id,
      scheduleSlotId: lySlot.id,
      sessionDate: addDaysUtc(todayUtc, 3),
      startTime: "08:30",
      endTime: "10:30",
      room: "Phòng 301",
      topic: "Dao động điều hoà và con lắc lò xo",
      status: SessionStatus.SCHEDULED,
    },
  });

  // ==========================================================================
  // 4. 20 VIETNAMESE STUDENTS + GUARDIANS + ENROLLMENTS + FACE DESCRIPTORS
  // ==========================================================================
  console.log("[seed] Creating 20 students, guardians, enrollments & FaceAI descriptors...");
  const studentProfiles = [
    { code: "HS001", name: "Nguyễn Minh Quân", gender: Gender.MALE, dob: "2011-03-14", school: "THCS Giảng Võ", father: "Nguyễn Văn Hùng", mother: "Lê Thu Hà" },
    { code: "HS002", name: "Trần Bảo Ngọc", gender: Gender.FEMALE, dob: "2011-07-22", school: "THCS Cầu Giấy", father: "Trần Đức Mạnh", mother: "Phạm Thanh Tâm" },
    { code: "HS003", name: "Lê Hoàng Nam", gender: Gender.MALE, dob: "2011-11-05", school: "THCS Ngô Sĩ Liên", father: "Lê Quang Hải", mother: "Vũ Mai Hương" },
    { code: "HS004", name: "Phạm Phương Anh", gender: Gender.FEMALE, dob: "2011-01-19", school: "THCS Trưng Vương", father: "Phạm Văn Tuấn", mother: "Đặng Hồng Nhung" },
    { code: "HS005", name: "Hoàng Đức Duy", gender: Gender.MALE, dob: "2011-05-30", school: "THCS Chu Văn An", father: "Hoàng Minh Thắng", mother: "Ngô Bích Ngọc" },
    { code: "HS006", name: "Vũ Khánh Linh", gender: Gender.FEMALE, dob: "2011-09-12", school: "THCS Giảng Võ", father: "Vũ Đình Trọng", mother: "Bùi Tuyết Mai" },
    { code: "HS007", name: "Đặng Gia Bảo", gender: Gender.MALE, dob: "2011-04-08", school: "THCS Thăng Long", father: "Đặng Quốc Khánh", mother: "Trịnh Lan Anh" },
    { code: "HS008", name: "Bùi Ngọc Ánh", gender: Gender.FEMALE, dob: "2011-12-25", school: "THCS Cầu Giấy", father: "Bùi Xuân Trường", mother: "Lý Thanh Huyền" },
    { code: "HS009", name: "Đỗ Tuấn Kiệt", gender: Gender.MALE, dob: "2011-06-17", school: "THCS Thành Công", father: "Đỗ Văn Long", mother: "Phan Thu Thủy" },
    { code: "HS010", name: "Ngô Thanh Trúc", gender: Gender.FEMALE, dob: "2011-08-03", school: "THCS Ngô Sĩ Liên", father: "Ngô Gia Huy", mother: "Hoàng Kim Liên" },
    { code: "HS011", name: "Dương Hải Đăng", gender: Gender.MALE, dob: "2010-02-11", school: "THPT Chu Văn An", father: "Dương Văn Sơn", mother: "Nguyễn Thu Trang" },
    { code: "HS012", name: "Lý Thảo Vy", gender: Gender.FEMALE, dob: "2010-10-09", school: "THPT Kim Liên", father: "Lý Minh Hoàng", mother: "Trần Ngọc Bích" },
    { code: "HS013", name: "Trịnh Quốc Anh", gender: Gender.MALE, dob: "2010-04-27", school: "THPT Thăng Long", father: "Trịnh Văn Hòa", mother: "Lê Minh Ánh" },
    { code: "HS014", name: "Phan Minh Châu", gender: Gender.FEMALE, dob: "2010-07-15", school: "THPT Việt Đức", father: "Phan Thanh Bình", mother: "Vũ Hồng Hạnh" },
    { code: "HS015", name: "Đinh Thiên Phúc", gender: Gender.MALE, dob: "2010-11-28", school: "THPT Yên Hòa", father: "Đinh Quang Vinh", mother: "Phạm Thu Thảo" },
    { code: "HS016", name: "Mai Hương Giang", gender: Gender.FEMALE, dob: "2010-03-06", school: "THPT Kim Liên", father: "Mai Xuân Phúc", mother: "Đỗ Bích Phương" },
    { code: "HS017", name: "Tạ Minh Khôi", gender: Gender.MALE, dob: "2008-09-21", school: "THPT Chuyên Hà Nội - Amsterdam", father: "Tạ Văn Kiên", mother: "Nguyễn Thanh Mai" },
    { code: "HS018", name: "Lương Diệu Linh", gender: Gender.FEMALE, dob: "2008-01-14", school: "THPT Chu Văn An", father: "Lương Thế Vinh", mother: "Trần Thu Hằng" },
    { code: "HS019", name: "Cao Nhật Minh", gender: Gender.MALE, dob: "2008-05-02", school: "THPT Phan Đình Phùng", father: "Cao Bá Quát", mother: "Lê Bích Diệp" },
    { code: "HS020", name: "Hà Quỳnh Hương", gender: Gender.FEMALE, dob: "2008-12-10", school: "THPT Việt Đức", father: "Hà Văn Tiến", mother: "Phạm Ngọc Lan" },
  ];

  const createdStudents = [];
  for (let i = 0; i < studentProfiles.length; i++) {
    const p = studentProfiles[i];
    const phoneSuffix = String(100 + i).padStart(3, "0");
    const student = await prisma.student.create({
      data: {
        workspaceId: wsA.id,
        studentCode: p.code,
        fullName: p.name,
        dateOfBirth: new Date(`${p.dob}T00:00:00.000Z`),
        gender: p.gender,
        school: p.school,
        phone: `0912345${phoneSuffix}`,
        status: StudentStatus.ACTIVE,
        notes: i === 0 ? "Lớp trưởng, học lực giỏi" : undefined,
      },
    });
    createdStudents.push(student);

    // Primary guardian (Mẹ)
    await prisma.guardian.create({
      data: {
        workspaceId: wsA.id,
        studentId: student.id,
        fullName: p.mother,
        relationship: "Mẹ",
        phone: `0987654${phoneSuffix}`,
        zalo: `0987654${phoneSuffix}`,
        email: `phuhuynh.${p.code.toLowerCase()}@gmail.com`,
        address: "Quận Đống Đa, Hà Nội",
        isPrimary: true,
      },
    });

    // Secondary guardian (Bố) for first 5 students to verify multi-guardian feature
    if (i < 5) {
      await prisma.guardian.create({
        data: {
          workspaceId: wsA.id,
          studentId: student.id,
          fullName: p.father,
          relationship: "Bố",
          phone: `0977111${phoneSuffix}`,
          zalo: `0977111${phoneSuffix}`,
          address: "Quận Đống Đa, Hà Nội",
          isPrimary: false,
        },
      });
    }
  }

  // Enroll HS001..HS010 into TOAN9-A1 (with discounts on HS002 and HS003)
  for (let i = 0; i < 10; i++) {
    const st = createdStudents[i];
    await prisma.enrollment.create({
      data: {
        workspaceId: wsA.id,
        classId: classToan.id,
        studentId: st.id,
        enrolledAt: addDaysUtc(todayUtc, -45),
        status: EnrollmentStatus.ACTIVE,
        discountType: i === 1 ? DiscountType.PERCENTAGE : DiscountType.FIXED,
        customFeeDiscount: i === 1 ? 10 : i === 2 ? 200000 : 0,
        discountNote:
          i === 1
            ? "Học bổng học sinh giỏi 10%"
            : i === 2
            ? "Giảm 200.000đ gia đình chính sách"
            : null,
      },
    });

    // Enroll FaceAI 128-float L2-normalized descriptor for HS001..HS010
    await prisma.faceDescriptor.create({
      data: {
        workspaceId: wsA.id,
        studentId: st.id,
        descriptor: generateSyntheticDescriptorForStudent(st.studentCode),
        label: `Ảnh chân dung chuẩn ${st.studentCode}`,
        source: "SYNTHETIC",
      },
    });
  }

  // Enroll HS011..HS016 (plus HS001, HS002) into ANH10-B1
  const anhStudentIndices = [0, 1, 10, 11, 12, 13, 14, 15];
  for (const idx of anhStudentIndices) {
    await prisma.enrollment.create({
      data: {
        workspaceId: wsA.id,
        classId: classAnh.id,
        studentId: createdStudents[idx].id,
        enrolledAt: addDaysUtc(todayUtc, -30),
        status: EnrollmentStatus.ACTIVE,
        discountType: DiscountType.FIXED,
        customFeeDiscount: 0,
      },
    });
  }

  // Enroll HS017..HS020 into LY12-C1
  for (let i = 16; i < 20; i++) {
    await prisma.enrollment.create({
      data: {
        workspaceId: wsA.id,
        classId: classLy.id,
        studentId: createdStudents[i].id,
        enrolledAt: addDaysUtc(todayUtc, -25),
        status: EnrollmentStatus.ACTIVE,
        discountType: DiscountType.FIXED,
        customFeeDiscount: 0,
      },
    });
  }

  // ==========================================================================
  // 5. FEE PLANS, INVOICES & PAYMENTS (PAID, PARTIAL, UNPAID)
  // ==========================================================================
  console.log("[seed] Creating FeePlans, Invoices & Payments...");
  const feePlanToan = await prisma.feePlan.create({
    data: {
      workspaceId: wsA.id,
      classId: classToan.id,
      name: "Học phí Toán 9 tiêu chuẩn theo tháng",
      billingCycle: BillingCycle.MONTHLY,
      amount: 1200000,
      currency: "VND",
      description: "Thu vào đầu tháng (12 buổi/tháng)",
      isDefault: true,
    },
  });

  const feePlanAnh = await prisma.feePlan.create({
    data: {
      workspaceId: wsA.id,
      classId: classAnh.id,
      name: "Học phí IELTS Foundation theo tháng",
      billingCycle: BillingCycle.MONTHLY,
      amount: 1500000,
      currency: "VND",
      isDefault: true,
    },
  });

  const feePlanLy = await prisma.feePlan.create({
    data: {
      workspaceId: wsA.id,
      classId: classLy.id,
      name: "Học phí Vật Lý 12 theo buổi",
      billingCycle: BillingCycle.PER_SESSION,
      amount: 200000,
      currency: "VND",
      isDefault: true,
    },
  });

  // Create 10 Invoices for TOAN9-A1 in currentMonth:
  // i = 0..4 => PAID, i = 5..6 => PARTIAL, i = 7..9 => UNPAID
  for (let i = 0; i < 10; i++) {
    const st = createdStudents[i];
    const baseAmount = 1200000;
    const discountAmount = i === 1 ? 120000 : i === 2 ? 200000 : 0;
    const netAmount = baseAmount - discountAmount;
    const status =
      i < 5
        ? InvoiceStatus.PAID
        : i < 7
        ? InvoiceStatus.PARTIAL
        : InvoiceStatus.UNPAID;
    const paidAmount =
      status === InvoiceStatus.PAID
        ? netAmount
        : status === InvoiceStatus.PARTIAL
        ? 500000
        : 0;

    const invNumber = `INV-${currentMonth.replace("-", "")}-${String(i + 1).padStart(4, "0")}`;
    const invoice = await prisma.invoice.create({
      data: {
        workspaceId: wsA.id,
        classId: classToan.id,
        studentId: st.id,
        feePlanId: feePlanToan.id,
        invoiceNumber: invNumber,
        title: `Học phí kỳ ${currentMonth} - Lớp ${classToan.code}`,
        billingPeriod: currentMonth,
        baseAmount,
        discountAmount,
        discountReason:
          i === 1 ? "Học bổng 10%" : i === 2 ? "Giảm trừ gia đình chính sách" : null,
        netAmount,
        paidAmount,
        status,
        dueDate: addDaysUtc(todayUtc, i >= 8 ? -3 : 7), // HS009 & HS010 overdue
      },
    });

    if (paidAmount > 0) {
      await prisma.payment.create({
        data: {
          workspaceId: wsA.id,
          invoiceId: invoice.id,
          receiptNumber: `PT-${currentMonth.replace("-", "")}-${String(i + 1).padStart(4, "0")}`,
          amount: paidAmount,
          method: i % 2 === 0 ? PaymentMethod.BANK_TRANSFER : PaymentMethod.CASH,
          paidAt: addDaysUtc(todayUtc, -1),
          collectorName: teacherA.fullName,
          referenceCode: i % 2 === 0 ? `VCB${100000 + i}` : null,
          receiptNote: `Thu học phí ${st.fullName} kỳ ${currentMonth}`,
        },
      });
    }
  }

  // Create 2 Invoices for ANH10-B1 & LY12-C1
  const invAnh = await prisma.invoice.create({
    data: {
      workspaceId: wsA.id,
      classId: classAnh.id,
      studentId: createdStudents[10].id,
      feePlanId: feePlanAnh.id,
      invoiceNumber: `INV-${currentMonth.replace("-", "")}-0011`,
      title: `Học phí kỳ ${currentMonth} - Lớp ${classAnh.code}`,
      billingPeriod: currentMonth,
      baseAmount: 1500000,
      discountAmount: 0,
      netAmount: 1500000,
      paidAmount: 1500000,
      status: InvoiceStatus.PAID,
      dueDate: addDaysUtc(todayUtc, 10),
    },
  });
  await prisma.payment.create({
    data: {
      workspaceId: wsA.id,
      invoiceId: invAnh.id,
      receiptNumber: `PT-${currentMonth.replace("-", "")}-0011`,
      amount: 1500000,
      method: PaymentMethod.BANK_TRANSFER,
      paidAt: todayUtc,
      collectorName: teacherA.fullName,
      referenceCode: "VCB998877",
    },
  });

  await prisma.invoice.create({
    data: {
      workspaceId: wsA.id,
      classId: classLy.id,
      studentId: createdStudents[16].id,
      feePlanId: feePlanLy.id,
      invoiceNumber: `INV-${currentMonth.replace("-", "")}-0012`,
      title: `Học phí kỳ ${currentMonth} (8 buổi) - Lớp ${classLy.code}`,
      billingPeriod: currentMonth,
      sessionCount: 8,
      baseAmount: 1600000,
      discountAmount: 0,
      netAmount: 1600000,
      paidAmount: 0,
      status: InvoiceStatus.UNPAID,
      dueDate: addDaysUtc(todayUtc, 5),
    },
  });

  // ==========================================================================
  // 6. MODULE 5: ATTENDANCE & HOMEWORK
  // ==========================================================================
  console.log("[seed] Creating Attendance, Homeworks & Submissions...");
  for (let i = 0; i < 10; i++) {
    const st = createdStudents[i];
    const isLate = i === 8;
    const isAbsent = i === 9;
    await prisma.attendance.create({
      data: {
        workspaceId: wsA.id,
        sessionId: pastSessionToan.id,
        studentId: st.id,
        status: isAbsent
          ? AttendanceStatus.ABSENT_EXCUSED
          : isLate
          ? AttendanceStatus.LATE
          : AttendanceStatus.PRESENT,
        checkInAt: isAbsent
          ? null
          : new Date(pastSessionToan.sessionDate.getTime() + (isLate ? 18 * 3600000 + 20 * 60000 : 17 * 3600000 + 55 * 60000)),
        checkOutAt: isAbsent
          ? null
          : new Date(pastSessionToan.sessionDate.getTime() + 19 * 3600000 + 30 * 60000),
        method: i < 5 ? AttendanceMethod.FACE_AI : AttendanceMethod.MANUAL,
        confidenceScore: i < 5 ? 0.96 : null,
        notes: isAbsent ? "Phụ huynh xin nghỉ ốm" : isLate ? "Đi muộn 20 phút" : null,
      },
    });
  }

  // 16 Exercise Questions across Toán, Tiếng Anh, Vật Lý
  console.log("[seed] Creating 16 ExerciseQuestion items...");
  const questionsData = [
    {
      type: QuestionType.MULTIPLE_CHOICE,
      subject: "Toán",
      topic: "Căn bậc hai",
      difficulty: QuestionDifficulty.EASY,
      prompt: "Điều kiện xác định của biểu thức √(2x - 6) là gì?",
      optionsJson: [
        { id: "A", text: "x ≥ 3" },
        { id: "B", text: "x > 3" },
        { id: "C", text: "x ≤ 3" },
        { id: "D", text: "x ≥ -3" },
      ],
      correctAnswer: "A",
      explanation: "Biểu thức √(2x - 6) xác định khi 2x - 6 ≥ 0 ⇔ x ≥ 3.",
      points: 10,
      tagsJson: ["toan9", "can-bac-hai", "dai-so"],
    },
    {
      type: QuestionType.MULTIPLE_CHOICE,
      subject: "Toán",
      topic: "Hàm số bậc nhất",
      difficulty: QuestionDifficulty.EASY,
      prompt: "Hàm số y = (m - 2)x + 5 đồng biến trên R khi nào?",
      optionsJson: [
        { id: "A", text: "m > 2" },
        { id: "B", text: "m < 2" },
        { id: "C", text: "m = 2" },
        { id: "D", text: "m ≥ 2" },
      ],
      correctAnswer: "A",
      explanation: "Hàm số bậc nhất y = ax + b đồng biến trên R khi hệ số a = m - 2 > 0 ⇔ m > 2.",
      points: 10,
      tagsJson: ["toan9", "ham-so"],
    },
    {
      type: QuestionType.MULTIPLE_CHOICE,
      subject: "Toán",
      topic: "Hệ thức lượng",
      difficulty: QuestionDifficulty.MEDIUM,
      prompt: "Cho tam giác ABC vuông tại A, đường cao AH. Biết BH = 4cm, CH = 9cm. Độ dài đường cao AH bằng:",
      optionsJson: [
        { id: "A", text: "6 cm" },
        { id: "B", text: "5 cm" },
        { id: "C", text: "13 cm" },
        { id: "D", text: "36 cm" },
      ],
      correctAnswer: "A",
      explanation: "Theo hệ thức lượng trong tam giác vuông: AH² = BH · CH = 4 · 9 = 36 ⇒ AH = 6 cm.",
      points: 10,
      tagsJson: ["toan9", "hinh-hoc", "he-thuc-luong"],
    },
    {
      type: QuestionType.MULTIPLE_CHOICE,
      subject: "Toán",
      topic: "Phương trình bậc hai",
      difficulty: QuestionDifficulty.MEDIUM,
      prompt: "Tổng hai nghiệm của phương trình x² - 7x + 10 = 0 là:",
      optionsJson: [
        { id: "A", text: "7" },
        { id: "B", text: "-7" },
        { id: "C", text: "10" },
        { id: "D", text: "3" },
      ],
      correctAnswer: "A",
      explanation: "Theo định lý Vi-ét với Δ = 49 - 40 = 9 > 0, tổng hai nghiệm x₁ + x₂ = -b/a = 7.",
      points: 10,
      tagsJson: ["toan9", "vi-et", "phuong-trinh"],
    },
    {
      type: QuestionType.MULTIPLE_CHOICE,
      subject: "Toán",
      topic: "Đường tròn",
      difficulty: QuestionDifficulty.HARD,
      prompt: "Cho đường tròn (O; 5cm) và dây cung AB = 8cm. Khoảng cách từ tâm O đến dây AB bằng:",
      optionsJson: [
        { id: "A", text: "3 cm" },
        { id: "B", text: "4 cm" },
        { id: "C", text: "2 cm" },
        { id: "D", text: "6 cm" },
      ],
      correctAnswer: "A",
      explanation: "Kẻ OH ⊥ AB tại H ⇒ AH = AB/2 = 4cm. Theo Pytago: OH = √(OA² - AH²) = √(25 - 16) = 3cm.",
      points: 15,
      tagsJson: ["toan9", "duong-tron", "hinh-hoc"],
    },
    {
      type: QuestionType.FILL_IN_BLANK,
      subject: "Toán",
      topic: "Căn bậc hai",
      difficulty: QuestionDifficulty.EASY,
      prompt: "Giá trị rút gọn của biểu thức √(81) - √(25) là ___",
      correctAnswer: "4",
      explanation: "√81 - √25 = 9 - 5 = 4.",
      points: 10,
      tagsJson: ["toan9", "can-bac-hai"],
    },
    {
      type: QuestionType.SHORT_ANSWER,
      subject: "Toán",
      topic: "Hệ phương trình",
      difficulty: QuestionDifficulty.MEDIUM,
      prompt: "Tìm nghiệm (x; y) của hệ phương trình: x + y = 5 và x - y = 1.",
      correctAnswer: "(3; 2)",
      explanation: "Cộng vế với vế được 2x = 6 ⇒ x = 3, suy ra y = 2.",
      points: 15,
      tagsJson: ["toan9", "he-phuong-trinh"],
    },
    {
      type: QuestionType.ESSAY,
      subject: "Toán",
      topic: "Bất đẳng thức",
      difficulty: QuestionDifficulty.HARD,
      prompt: "Cho a, b > 0 thoả mãn a + b = 2. Chứng minh rằng a² + b² ≥ 2.",
      correctAnswer: "Áp dụng BĐT Bunyakovsky hoặc (a-b)² ≥ 0 suy ra 2(a²+b²) ≥ (a+b)² = 4 ⇒ a²+b² ≥ 2.",
      explanation: "Dấu bằng xảy ra khi và chỉ khi a = b = 1.",
      points: 20,
      tagsJson: ["toan9", "bat-dang-thuc", "chuyen-toan"],
    },
    {
      type: QuestionType.MULTIPLE_CHOICE,
      subject: "Tiếng Anh",
      topic: "Tenses",
      difficulty: QuestionDifficulty.EASY,
      prompt: "She ___ in Hanoi for ten years before moving to Ho Chi Minh City.",
      optionsJson: [
        { id: "A", text: "had lived" },
        { id: "B", text: "has lived" },
        { id: "C", text: "lives" },
        { id: "D", text: "is living" },
      ],
      correctAnswer: "A",
      explanation: "Dùng thì quá khứ hoàn thành (Past Perfect) cho hành động xảy ra trước một mốc trong quá khứ.",
      points: 10,
      tagsJson: ["ielts", "grammar", "tenses"],
    },
    {
      type: QuestionType.MULTIPLE_CHOICE,
      subject: "Tiếng Anh",
      topic: "Conditionals",
      difficulty: QuestionDifficulty.MEDIUM,
      prompt: "If I ___ you, I would spend more time practicing IELTS Speaking.",
      optionsJson: [
        { id: "A", text: "were" },
        { id: "B", text: "am" },
        { id: "C", text: "will be" },
        { id: "D", text: "have been" },
      ],
      correctAnswer: "A",
      explanation: "Câu điều kiện loại 2 dùng 'If I were you'.",
      points: 10,
      tagsJson: ["ielts", "grammar", "conditionals"],
    },
    {
      type: QuestionType.FILL_IN_BLANK,
      subject: "Tiếng Anh",
      topic: "Vocabulary",
      difficulty: QuestionDifficulty.MEDIUM,
      prompt: "Climatic changes have had a profound ___ on global agriculture (effect / affect).",
      correctAnswer: "effect",
      explanation: "Sau tính từ 'profound' cần một danh từ: 'have an effect on'.",
      points: 10,
      tagsJson: ["ielts", "vocabulary"],
    },
    {
      type: QuestionType.SHORT_ANSWER,
      subject: "Tiếng Anh",
      topic: "Passive Voice",
      difficulty: QuestionDifficulty.MEDIUM,
      prompt: "Rewrite in passive voice: 'Scientists discovered a new exoplanet in 2025.'",
      correctAnswer: "A new exoplanet was discovered by scientists in 2025.",
      explanation: "Chuyển tân ngữ 'A new exoplanet' lên làm chủ ngữ với 'was discovered'.",
      points: 15,
      tagsJson: ["ielts", "passive-voice"],
    },
    {
      type: QuestionType.MULTIPLE_CHOICE,
      subject: "Vật Lý",
      topic: "Dao động điều hoà",
      difficulty: QuestionDifficulty.EASY,
      prompt: "Một vật dao động điều hoà theo phương trình x = 5cos(4πt) (cm). Biên độ dao động của vật là:",
      optionsJson: [
        { id: "A", text: "5 cm" },
        { id: "B", text: "4π cm" },
        { id: "C", text: "2 Hz" },
        { id: "D", text: "10 cm" },
      ],
      correctAnswer: "A",
      explanation: "Phương trình x = Acos(ωt + φ) có biên độ A = 5 cm.",
      points: 10,
      tagsJson: ["ly12", "dao-dong"],
    },
    {
      type: QuestionType.MULTIPLE_CHOICE,
      subject: "Vật Lý",
      topic: "Con lắc lò xo",
      difficulty: QuestionDifficulty.MEDIUM,
      prompt: "Chu kỳ dao động của con lắc lò xo gồm vật nặng khối lượng m và lò xo độ cứng k là:",
      optionsJson: [
        { id: "A", text: "T = 2π√(m/k)" },
        { id: "B", text: "T = 2π√(k/m)" },
        { id: "C", text: "T = 1/(2π)√(m/k)" },
        { id: "D", text: "T = √(m/k)" },
      ],
      correctAnswer: "A",
      explanation: "Công thức chu kỳ dao động riêng của con lắc lò xo là T = 2π√(m/k).",
      points: 10,
      tagsJson: ["ly12", "con-lac-lo-xo"],
    },
    {
      type: QuestionType.FILL_IN_BLANK,
      subject: "Vật Lý",
      topic: "Sóng cơ",
      difficulty: QuestionDifficulty.MEDIUM,
      prompt: "Sóng dọc là sóng có phương dao động của các phần tử môi trường ___ với phương truyền sóng.",
      correctAnswer: "trùng",
      explanation: "Sóng dọc có phương dao động trùng với phương truyền sóng.",
      points: 10,
      tagsJson: ["ly12", "song-co"],
    },
    {
      type: QuestionType.ESSAY,
      subject: "Vật Lý",
      topic: "Điện xoay chiều",
      difficulty: QuestionDifficulty.HARD,
      prompt: "Nêu điều kiện xảy ra hiện tượng cộng hưởng điện trong mạch RLC mắc nối tiếp và hệ quả.",
      correctAnswer: "Cộng hưởng điện xảy ra khi ZL = ZC hay ω = 1/√(LC). Khi đó tổng trở Z = R đạt cực tiểu, cường độ dòng điện hiệu dụng I = U/R đạt cực đại.",
      explanation: "Điện áp hai đầu đoạn mạch cùng pha với dòng điện (cosφ = 1).",
      points: 20,
      tagsJson: ["ly12", "dien-xoay-chieu"],
    },
  ];

  const createdQuestions = [];
  for (const q of questionsData) {
    const created = await prisma.exerciseQuestion.create({
      data: {
        workspaceId: wsA.id,
        ...q,
      },
    });
    createdQuestions.push(created);
  }

  // Create Homework & Submissions for TOAN9-A1
  const hw1 = await prisma.homework.create({
    data: {
      workspaceId: wsA.id,
      classId: classToan.id,
      sessionId: pastSessionToan.id,
      title: "BTVN Buổi 1: Rút gọn biểu thức chứa căn & Hệ thức lượng",
      description: "Hoàn thành 5 bài tập tự luận và trắc nghiệm ôn tập chuyên đề 1.",
      dueDate: todayUtc,
      maxScore: 10,
      attachmentsJson: [
        { title: "Đề bài PDF Chuyên đề 1", url: "https://cmclass.vn/docs/toan9-cd1.pdf" },
      ],
      questionIdsJson: createdQuestions.slice(0, 5).map((q) => q.id),
    },
  });

  for (let i = 0; i < 10; i++) {
    const st = createdStudents[i];
    const score = [9.5, 9.0, 8.5, 8.0, 8.5, 7.5, 7.0, 8.0, 6.5, null][i];
    await prisma.homeworkSubmission.create({
      data: {
        workspaceId: wsA.id,
        homeworkId: hw1.id,
        studentId: st.id,
        status:
          score === null
            ? HomeworkSubmissionStatus.MISSING
            : i === 8
            ? HomeworkSubmissionStatus.LATE
            : HomeworkSubmissionStatus.GRADED,
        score,
        feedback:
          score !== null
            ? score >= 9
              ? "Bài làm xuất sắc, trình bày rõ ràng!"
              : "Cần chú ý điều kiện xác định của căn thức."
            : "Chưa nộp bài tập về nhà.",
        submissionNote: score !== null ? "Em nộp bài giải chi tiết ạ." : null,
        submittedAt: score !== null ? addDaysUtc(todayUtc, -1) : null,
        gradedAt: score !== null ? todayUtc : null,
      },
    });
  }

  await prisma.homework.create({
    data: {
      workspaceId: wsA.id,
      classId: classToan.id,
      sessionId: todaySessionToan.id,
      title: "BTVN Buổi 2: Khảo sát và vẽ đồ thị hàm số bậc nhất",
      description: "Làm các câu hỏi trắc nghiệm và bài tập nâng cao.",
      dueDate: addDaysUtc(todayUtc, 5),
      maxScore: 10,
      questionIdsJson: createdQuestions.slice(1, 7).map((q) => q.id),
    },
  });

  await prisma.homework.create({
    data: {
      workspaceId: wsA.id,
      classId: classAnh.id,
      sessionId: todaySessionAnh.id,
      title: "Homework Unit 3: Past Perfect & Conditional Sentences",
      description: "Complete grammar exercises and write 5 conditional sentences.",
      dueDate: addDaysUtc(todayUtc, 4),
      maxScore: 10,
      questionIdsJson: createdQuestions.slice(8, 12).map((q) => q.id),
    },
  });

  // ==========================================================================
  // 7. MODULE 6 & 8: 5 MINIGAMES (ALL 5 ARCHETYPES) + COMPLETED GAME SESSION
  // ==========================================================================
  console.log("[seed] Creating 5 Minigame templates (all 5 archetypes) & GameSession...");
  const toanQuestionIds = createdQuestions.slice(0, 6).map((q) => q.id);
  const anhQuestionIds = createdQuestions.slice(8, 12).map((q) => q.id);
  const lyQuestionIds = createdQuestions.slice(12, 16).map((q) => q.id);

  const mgSpeedQuiz = await prisma.minigame.create({
    data: {
      workspaceId: wsA.id,
      title: "Đấu trường Tốc độ Toán 9: Căn thức & Hình học",
      type: MinigameType.SPEED_QUIZ,
      description: "Trắc nghiệm phản xạ nhanh tính điểm theo thời gian và chuỗi trả lời đúng.",
      timeLimit: 25,
      pointsPerQuestion: 100,
      rulesJson: { streakBonus: true, speedBonus: true },
      questionIdsJson: toanQuestionIds,
      tagsJson: ["toan9", "speed-quiz"],
    },
  });

  await prisma.minigame.create({
    data: {
      workspaceId: wsA.id,
      title: "Ghép cặp Nhanh Công thức Toán - Lý",
      type: MinigameType.FLASH_MATCH,
      description: "Lật thẻ ghép cặp câu hỏi và đáp án tương ứng trong thời gian ngắn nhất.",
      timeLimit: 45,
      pointsPerQuestion: 120,
      rulesJson: { maxAttempts: 10 },
      questionIdsJson: [...toanQuestionIds.slice(0, 3), ...lyQuestionIds.slice(0, 2)],
      tagsJson: ["flash-match", "cong-thuc"],
    },
  });

  await prisma.minigame.create({
    data: {
      workspaceId: wsA.id,
      title: "Giải Ô chữ Từ khoá Tiếng Anh IELTS",
      type: MinigameType.WORD_CROSS,
      description: "Giải các hàng ngang ngữ pháp và từ vựng để tìm ra từ khoá chủ đề.",
      timeLimit: 40,
      pointsPerQuestion: 150,
      rulesJson: { keyword: "EDUCATION", hintPenalty: 20 },
      questionIdsJson: anhQuestionIds,
      tagsJson: ["ielts", "word-cross"],
    },
  });

  await prisma.minigame.create({
    data: {
      workspaceId: wsA.id,
      title: "Ai Nhanh Hơn: Rung Chuông Vàng Đội Nhóm",
      type: MinigameType.TEAM_BUZZER,
      description: "Các đội bấm chuông giành quyền trả lời nhanh câu hỏi trên màn chiếu.",
      timeLimit: 30,
      pointsPerQuestion: 200,
      rulesJson: { teamCount: 2, wrongAnswerPenalty: 50 },
      questionIdsJson: toanQuestionIds,
      tagsJson: ["team-buzzer", "thi-dau-doi"],
    },
  });

  await prisma.minigame.create({
    data: {
      workspaceId: wsA.id,
      title: "Vòng quay May mắn Vật Lý 12",
      type: MinigameType.LUCKY_WHEEL,
      description: "Quay vòng quay chọn học sinh và mức điểm thưởng ngẫu nhiên cho câu hỏi.",
      timeLimit: 35,
      pointsPerQuestion: 100,
      rulesJson: { wheelSegments: [50, 100, 150, 200, 300, 500] },
      questionIdsJson: lyQuestionIds,
      tagsJson: ["lucky-wheel", "ly12"],
    },
  });

  // Completed GameSession & GameResults for TOAN9-A1
  const snapshotQuestions = createdQuestions.slice(0, 5).map((q) => ({
    id: q.id,
    type: q.type,
    prompt: q.prompt,
    optionsJson: q.optionsJson,
    correctAnswer: q.correctAnswer,
    points: q.points,
  }));

  const gameSession1 = await prisma.gameSession.create({
    data: {
      workspaceId: wsA.id,
      classId: classToan.id,
      sessionId: pastSessionToan.id,
      minigameId: mgSpeedQuiz.id,
      title: "Đấu trường Tốc độ Cuối buổi 1 - Lớp Toán 9A1",
      mode: GamePlayMode.INDIVIDUAL,
      status: GameSessionStatus.COMPLETED,
      questionsSnapshotJson: snapshotQuestions,
      stateJson: { currentQuestionIndex: 4, revealed: true },
      startedAt: addDaysUtc(todayUtc, -2),
      endedAt: addDaysUtc(todayUtc, -2),
    },
  });

  const gameScores = [500, 450, 420, 380, 350, 320, 300, 280, 200, 150];
  const gameCorrects = [5, 5, 4, 4, 4, 3, 3, 3, 2, 2];
  for (let i = 0; i < 10; i++) {
    await prisma.gameResult.create({
      data: {
        workspaceId: wsA.id,
        gameSessionId: gameSession1.id,
        studentId: createdStudents[i].id,
        score: gameScores[i],
        correctCount: gameCorrects[i],
        totalQuestions: 5,
        accuracy: (gameCorrects[i] / 5) * 100,
        rank: i + 1,
        bonusPoints: i === 0 ? 30 : i === 1 ? 20 : i === 2 ? 10 : 0,
      },
    });
  }

  // ==========================================================================
  // 8. MODULE 9: LEADERBOARD CONFIG & POINT TRANSACTIONS
  // ==========================================================================
  console.log("[seed] Creating LeaderboardConfig & PointTransactions...");
  await prisma.leaderboardConfig.create({
    data: {
      workspaceId: wsA.id,
      name: "Bảng xếp hạng Tổng hợp Toàn diện (Mặc định)",
      attendanceWeight: 25,
      homeworkWeight: 35,
      gameWeight: 25,
      bonusWeight: 15,
      rulesJson: { lateWeight: 0.5, excusedWeight: 0.5 },
      isDefault: true,
    },
  });

  await prisma.leaderboardConfig.create({
    data: {
      workspaceId: wsA.id,
      classId: classToan.id,
      name: "Đua Top Chuyên cần & Bài tập Toán 9A1",
      attendanceWeight: 35,
      homeworkWeight: 45,
      gameWeight: 10,
      bonusWeight: 10,
      isDefault: false,
    },
  });

  const bonusEntries = [
    { idx: 0, points: 25, reason: "Giải đúng bài toán bất đẳng thức nâng cao trên bảng", category: "ACHIEVEMENT" },
    { idx: 1, points: 20, reason: "Phát biểu xây dựng bài sôi nổi", category: "BONUS" },
    { idx: 2, points: 15, reason: "Hỗ trợ bạn cùng bàn sửa bài tập hình học", category: "BONUS" },
    { idx: 3, points: 10, reason: "Hoàn thành bài kiểm tra 15 phút sớm nhất", category: "BONUS" },
    { idx: 4, points: 10, reason: "Xung phong chữa bài tập về nhà", category: "BONUS" },
    { idx: 8, points: -5, reason: "Đi học muộn chưa báo trước", category: "PENALTY" },
  ];

  for (const b of bonusEntries) {
    await prisma.pointTransaction.create({
      data: {
        workspaceId: wsA.id,
        classId: classToan.id,
        sessionId: pastSessionToan.id,
        studentId: createdStudents[b.idx].id,
        points: b.points,
        reason: b.reason,
        category: b.category,
        awardedAt: addDaysUtc(todayUtc, -2),
      },
    });
  }

  // ==========================================================================
  // 9. TEACHER B & WORKSPACE B (FOR MULTI-TENANT ISOLATION TESTING)
  // ==========================================================================
  console.log("[seed] Creating Teacher B (giaovien2@cmclass.vn) for isolation testing...");
  const teacherB = await prisma.user.create({
    data: {
      email: "giaovien2@cmclass.vn",
      passwordHash,
      fullName: "Cô Trần Thị Bích",
      phone: "0909888777",
      workspace: {
        create: {
          name: "Lớp học Cô Trần Thị Bích",
          phone: "0909888777",
          address: "Số 88 Nguyễn Trãi, Thanh Xuân, Hà Nội",
          currency: "VND",
          bankBin: "970422",
          bankCode: "MB",
          bankName: "MBBank",
          bankAccountNumber: "9876543210",
          bankAccountName: "TRAN THI BICH",
        },
      },
    },
    include: { workspace: true },
  });
  const wsB = teacherB.workspace!;

  const classB = await prisma.class.create({
    data: {
      workspaceId: wsB.id,
      code: "HOA11-B1",
      name: "Hoá học 11 Chuyên đề Hữu cơ",
      subject: "Hoá Học",
      gradeLevel: "Lớp 11",
      room: "Phòng B1",
      defaultFeeAmount: 1000000,
      billingCycle: BillingCycle.MONTHLY,
      status: ClassStatus.ACTIVE,
    },
  });

  const studentB1 = await prisma.student.create({
    data: {
      workspaceId: wsB.id,
      studentCode: "HS001",
      fullName: "Phạm Quốc Bảo (Workspace B)",
      gender: Gender.MALE,
      school: "THPT Nhân Chính",
      status: StudentStatus.ACTIVE,
    },
  });

  const studentB2 = await prisma.student.create({
    data: {
      workspaceId: wsB.id,
      studentCode: "HS002",
      fullName: "Nguyễn Thuỳ Dương (Workspace B)",
      gender: Gender.FEMALE,
      school: "THPT Nhân Chính",
      status: StudentStatus.ACTIVE,
    },
  });

  await prisma.guardian.create({
    data: {
      workspaceId: wsB.id,
      studentId: studentB1.id,
      fullName: "Phạm Văn Bình",
      relationship: "Bố",
      phone: "0933444555",
      isPrimary: true,
    },
  });

  await prisma.enrollment.create({
    data: {
      workspaceId: wsB.id,
      classId: classB.id,
      studentId: studentB1.id,
      status: EnrollmentStatus.ACTIVE,
    },
  });

  await prisma.enrollment.create({
    data: {
      workspaceId: wsB.id,
      classId: classB.id,
      studentId: studentB2.id,
      status: EnrollmentStatus.ACTIVE,
    },
  });

  const feePlanB = await prisma.feePlan.create({
    data: {
      workspaceId: wsB.id,
      classId: classB.id,
      name: "Học phí Hoá 11 theo tháng",
      billingCycle: BillingCycle.MONTHLY,
      amount: 1000000,
      isDefault: true,
    },
  });

  await prisma.invoice.create({
    data: {
      workspaceId: wsB.id,
      classId: classB.id,
      studentId: studentB1.id,
      feePlanId: feePlanB.id,
      invoiceNumber: "INV-B-0001",
      title: `Học phí kỳ ${currentMonth} - Lớp Hoá 11`,
      billingPeriod: currentMonth,
      baseAmount: 1000000,
      discountAmount: 0,
      netAmount: 1000000,
      paidAmount: 0,
      status: InvoiceStatus.UNPAID,
      dueDate: addDaysUtc(todayUtc, 7),
    },
  });

  console.log("[seed] Seed completed successfully!");
  console.log(`  - Teacher A: giaovien@cmclass.vn / 123456 (Workspace: ${wsA.name})`);
  console.log(`  - Teacher B: giaovien2@cmclass.vn / 123456 (Workspace: ${wsB.name})`);
}

main()
  .catch((e) => {
    console.error("[seed] Fatal error during seeding:", e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
