"use client";

import React, { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import {
  Phone,
  Plus,
  Search,
  Users,
  ArrowRight,
  GraduationCap,
} from "lucide-react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { formatVND } from "@/lib/utils";

interface GuardianItem {
  id: string;
  fullName: string;
  relationship: string;
  phone: string;
  zalo: string | null;
  email: string | null;
  isPrimary: boolean;
}

interface EnrollmentItem {
  id: string;
  classId: string;
  status: string;
  discountType: "FIXED" | "PERCENTAGE";
  customFeeDiscount: number;
  class: {
    id: string;
    code: string;
    name: string;
  };
}

interface StudentItem {
  id: string;
  studentCode: string;
  fullName: string;
  school: string | null;
  phone: string | null;
  gender: string | null;
  status: "ACTIVE" | "INACTIVE" | "GRADUATED";
  guardians: GuardianItem[];
  enrollments: EnrollmentItem[];
  invoices: Array<{
    id: string;
    netAmount: number;
    paidAmount: number;
    status: string;
  }>;
}

interface ClassOption {
  id: string;
  code: string;
  name: string;
}

const STUDENT_STATUS_LABELS: Record<string, string> = {
  ACTIVE: "Đang học",
  INACTIVE: "Tạm nghỉ",
  GRADUATED: "Đã tốt nghiệp",
};

export default function StudentsPage() {
  const [students, setStudents] = useState<StudentItem[]>([]);
  const [classes, setClasses] = useState<ClassOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [classFilter, setClassFilter] = useState("");
  const [statusFilter, setStatusFilter] = useState("ALL");

  // Create Student Dialog
  const [openCreate, setOpenCreate] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const [fullName, setFullName] = useState("");
  const [studentCode, setStudentCode] = useState("");
  const [school, setSchool] = useState("");
  const [phone, setPhone] = useState("");
  const [gender, setGender] = useState("FEMALE");
  const [dateOfBirth, setDateOfBirth] = useState("");
  const [guardianFullName, setGuardianFullName] = useState("");
  const [guardianRelationship, setGuardianRelationship] = useState("Mẹ");
  const [guardianPhone, setGuardianPhone] = useState("");
  const [guardianZalo, setGuardianZalo] = useState("");
  const [selectedClassId, setSelectedClassId] = useState("");

  const loadStudents = useCallback(async () => {
    try {
      setLoading(true);
      const params = new URLSearchParams();
      if (search.trim()) params.set("search", search.trim());
      if (classFilter) params.set("classId", classFilter);
      if (statusFilter && statusFilter !== "ALL") {
        params.set("status", statusFilter);
      }

      const [stuRes, clsRes] = await Promise.all([
        fetch(`/api/students?${params.toString()}`),
        fetch("/api/classes"),
      ]);

      if (stuRes.ok) {
        const data = await stuRes.json();
        setStudents(data.students || []);
      }
      if (clsRes.ok) {
        const clsData = await clsRes.json();
        setClasses(clsData.classes || []);
      }
    } finally {
      setLoading(false);
    }
  }, [search, classFilter, statusFilter]);

  useEffect(() => {
    loadStudents();
  }, [loadStudents]);

  async function handleCreateStudent(e: React.FormEvent) {
    e.preventDefault();
    setFormError(null);
    setSubmitting(true);

    try {
      const guardians =
        guardianFullName.trim() && guardianPhone.trim()
          ? [
              {
                fullName: guardianFullName.trim(),
                relationship: guardianRelationship,
                phone: guardianPhone.trim(),
                zalo: guardianZalo.trim() || guardianPhone.trim(),
                isPrimary: true,
              },
            ]
          : [];

      const res = await fetch("/api/students", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          fullName,
          studentCode: studentCode.trim() || undefined,
          school: school.trim() || undefined,
          phone: phone.trim() || undefined,
          gender,
          dateOfBirth: dateOfBirth || undefined,
          guardians,
          enrollClassIds: selectedClassId ? [selectedClassId] : [],
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        setFormError(data.error || "Không thể thêm học sinh");
        return;
      }

      setOpenCreate(false);
      setFullName("");
      setStudentCode("");
      setSchool("");
      setPhone("");
      setGuardianFullName("");
      setGuardianPhone("");
      setGuardianZalo("");
      setSelectedClassId("");
      await loadStudents();
    } catch {
      setFormError("Lỗi kết nối máy chủ");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div data-testid="students-page" className="mx-auto max-w-7xl space-y-6">
      {/* Header */}
      <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-center">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold text-slate-900">
            Quản lý Học sinh & Phụ huynh
          </h1>
          <p className="text-xs sm:text-sm text-slate-600">
            Hồ sơ học sinh, thông tin liên hệ phụ huynh (Zalo/SĐT), lớp theo học
            và ưu đãi học phí
          </p>
        </div>

        <Button
          data-testid="open-create-student-dialog"
          className="w-full sm:w-auto"
          onClick={() => {
            setFormError(null);
            setOpenCreate(true);
          }}
        >
          <Plus className="h-4 w-4" />
          <span>+ Thêm học sinh</span>
        </Button>
      </div>

      {/* Filter Bar */}
      <Card>
        <CardContent className="grid grid-cols-1 gap-3 p-4 sm:grid-cols-2 lg:grid-cols-4">
          <div className="relative sm:col-span-2">
            <Search className="absolute left-3 top-3 h-4 w-4 text-slate-400" />
            <Input
              data-testid="student-search-input"
              placeholder="Tìm theo tên, mã HS (HS001), SĐT học sinh hoặc phụ huynh..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-9"
            />
          </div>

          <Select
            data-testid="student-class-filter"
            value={classFilter}
            onChange={(e) => setClassFilter(e.target.value)}
          >
            <option value="">Tất cả lớp học</option>
            {classes.map((c) => (
              <option key={c.id} value={c.id}>
                {c.code} — {c.name}
              </option>
            ))}
          </Select>

          <Select
            data-testid="student-status-filter"
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
          >
            <option value="ALL">Tất cả trạng thái</option>
            <option value="ACTIVE">Đang học (ACTIVE)</option>
            <option value="INACTIVE">Tạm nghỉ (INACTIVE)</option>
            <option value="GRADUATED">Đã tốt nghiệp (GRADUATED)</option>
          </Select>
        </CardContent>
      </Card>

      {/* Students Table */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Users className="h-5 w-5 text-blue-600" />
            <span>Danh sách học sinh ({students.length})</span>
          </CardTitle>
          <CardDescription>
            Nhấn vào tên học sinh để xem chi tiết hồ sơ, quản lý nhiều phụ huynh
            và lịch sử học phí
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Table data-testid="students-table">
            <TableHeader>
              <TableRow>
                <TableHead>Mã HS & Họ tên</TableHead>
                <TableHead>Phụ huynh chính</TableHead>
                <TableHead>Lớp đang học</TableHead>
                <TableHead>Công nợ</TableHead>
                <TableHead>Trạng thái</TableHead>
                <TableHead className="text-right">Thao tác</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading ? (
                <TableRow>
                  <TableCell
                    colSpan={6}
                    className="py-8 text-center text-slate-400"
                  >
                    Đang tải danh sách học sinh...
                  </TableCell>
                </TableRow>
              ) : students.length === 0 ? (
                <TableRow>
                  <TableCell
                    colSpan={6}
                    className="py-8 text-center text-slate-500"
                  >
                    Chưa có hồ sơ học sinh nào khớp bộ lọc.
                  </TableCell>
                </TableRow>
              ) : (
                students.map((stu) => {
                  const primaryG =
                    stu.guardians.find((g) => g.isPrimary) || stu.guardians[0];
                  const activeEnrolls = stu.enrollments.filter(
                    (e) => e.status === "ACTIVE"
                  );
                  const totalDebt = stu.invoices.reduce(
                    (acc, inv) =>
                      acc + Math.max(0, inv.netAmount - inv.paidAmount),
                    0
                  );

                  return (
                    <TableRow
                      key={stu.id}
                      data-testid={`student-row-${stu.studentCode}`}
                    >
                      <TableCell>
                        <div className="flex items-center gap-2">
                          <Badge variant="outline" className="font-mono">
                            {stu.studentCode}
                          </Badge>
                          <Link
                            href={`/students/${stu.id}`}
                            prefetch={false}
                            className="font-semibold text-slate-900 hover:text-blue-600 hover:underline"
                          >
                            {stu.fullName}
                          </Link>
                        </div>
                        <p className="mt-0.5 text-xs text-slate-500">
                          {stu.school || "Chưa cập nhật trường"}
                          {stu.phone ? ` • SĐT: ${stu.phone}` : ""}
                        </p>
                      </TableCell>

                      <TableCell>
                        {primaryG ? (
                          <div className="space-y-0.5 text-xs">
                            <p className="font-medium text-slate-800">
                              {primaryG.fullName} ({primaryG.relationship})
                            </p>
                            <p className="inline-flex items-center gap-1 text-slate-600">
                              <Phone className="h-3 w-3 text-blue-600" />
                              <span>{primaryG.phone}</span>
                              {primaryG.zalo && (
                                <Badge variant="secondary">
                                  Zalo: {primaryG.zalo}
                                </Badge>
                              )}
                            </p>
                          </div>
                        ) : (
                          <span className="text-xs italic text-slate-400">
                            Chưa có phụ huynh
                          </span>
                        )}
                      </TableCell>

                      <TableCell>
                        {activeEnrolls.length === 0 ? (
                          <span className="text-xs text-slate-400">
                            Chưa xếp lớp
                          </span>
                        ) : (
                          <div className="flex flex-wrap gap-1">
                            {activeEnrolls.map((enr) => (
                              <Badge key={enr.id} variant="default">
                                <GraduationCap className="mr-1 h-3 w-3" />
                                {enr.class.code}
                              </Badge>
                            ))}
                          </div>
                        )}
                      </TableCell>

                      <TableCell>
                        {totalDebt > 0 ? (
                          <span className="font-semibold text-red-600">
                            Nợ {formatVND(totalDebt)}
                          </span>
                        ) : (
                          <Badge variant="success">Đã hoàn thành</Badge>
                        )}
                      </TableCell>

                      <TableCell>
                        <Badge
                          variant={
                            stu.status === "ACTIVE"
                              ? "success"
                              : stu.status === "INACTIVE"
                              ? "warning"
                              : "secondary"
                          }
                        >
                          {STUDENT_STATUS_LABELS[stu.status] || stu.status}
                        </Badge>
                      </TableCell>

                      <TableCell className="text-right">
                        <Link href={`/students/${stu.id}`} prefetch={false}>
                          <Button variant="outline" size="sm">
                            <span>Chi tiết</span>
                            <ArrowRight className="h-3.5 w-3.5" />
                          </Button>
                        </Link>
                      </TableCell>
                    </TableRow>
                  );
                })
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* Create Student Dialog */}
      <Dialog open={openCreate} onOpenChange={setOpenCreate}>
        <DialogContent
          data-testid="create-student-dialog"
          className="max-w-2xl"
        >
          <DialogHeader>
            <DialogTitle>Thêm hồ sơ học sinh mới</DialogTitle>
            <DialogDescription>
              Mã học sinh sẽ được tự động sinh tuần tự (HS001, HS002...) nếu để
              trống
            </DialogDescription>
          </DialogHeader>

          <form onSubmit={handleCreateStudent} className="space-y-4">
            {formError && (
              <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">
                {formError}
              </div>
            )}

            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="stu-name">Họ và tên học sinh *</Label>
                <Input
                  id="stu-name"
                  data-testid="input-student-name"
                  placeholder="VD: Nguyễn Minh Anh"
                  value={fullName}
                  onChange={(e) => setFullName(e.target.value)}
                  required
                />
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="stu-code">Mã học sinh (tuỳ chọn)</Label>
                <Input
                  id="stu-code"
                  data-testid="input-student-code"
                  placeholder="Tự động sinh (VD: HS001)"
                  value={studentCode}
                  onChange={(e) => setStudentCode(e.target.value)}
                />
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="stu-school">Trường đang học</Label>
                <Input
                  id="stu-school"
                  placeholder="VD: THCS Cầu Giấy"
                  value={school}
                  onChange={(e) => setSchool(e.target.value)}
                />
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="stu-phone">SĐT học sinh</Label>
                <Input
                  id="stu-phone"
                  placeholder="VD: 0912345678"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                />
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="stu-gender">Giới tính</Label>
                <Select
                  id="stu-gender"
                  value={gender}
                  onChange={(e) => setGender(e.target.value)}
                >
                  <option value="FEMALE">Nữ</option>
                  <option value="MALE">Nam</option>
                  <option value="OTHER">Khác</option>
                </Select>
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="stu-dob">Ngày sinh</Label>
                <Input
                  id="stu-dob"
                  type="date"
                  value={dateOfBirth}
                  onChange={(e) => setDateOfBirth(e.target.value)}
                />
              </div>
            </div>

            {/* Inline Guardian */}
            <div className="space-y-3 rounded-xl border border-slate-200 bg-slate-50 p-4">
              <p className="text-sm font-semibold text-slate-800">
                Thông tin Phụ huynh liên hệ chính
              </p>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <div className="space-y-1">
                  <Label>Họ tên phụ huynh</Label>
                  <Input
                    data-testid="input-guardian-name"
                    placeholder="VD: Chị Trần Thu Hà"
                    value={guardianFullName}
                    onChange={(e) => setGuardianFullName(e.target.value)}
                  />
                </div>
                <div className="space-y-1">
                  <Label>Mối quan hệ</Label>
                  <Select
                    value={guardianRelationship}
                    onChange={(e) => setGuardianRelationship(e.target.value)}
                  >
                    <option value="Mẹ">Mẹ</option>
                    <option value="Bố">Bố</option>
                    <option value="Ông/Bà">Ông/Bà</option>
                    <option value="Người giám hộ">Người giám hộ</option>
                  </Select>
                </div>
                <div className="space-y-1">
                  <Label>Số điện thoại liên hệ</Label>
                  <Input
                    data-testid="input-guardian-phone"
                    placeholder="VD: 0987654321"
                    value={guardianPhone}
                    onChange={(e) => setGuardianPhone(e.target.value)}
                  />
                </div>
                <div className="space-y-1">
                  <Label>Số Zalo</Label>
                  <Input
                    placeholder="Mặc định dùng SĐT liên hệ"
                    value={guardianZalo}
                    onChange={(e) => setGuardianZalo(e.target.value)}
                  />
                </div>
              </div>
            </div>

            {/* Optional Quick Class Enrollment */}
            <div className="space-y-1.5">
              <Label>Ghi danh ngay vào lớp học (tuỳ chọn)</Label>
              <Select
                value={selectedClassId}
                onChange={(e) => setSelectedClassId(e.target.value)}
              >
                <option value="">-- Chưa chọn lớp --</option>
                {classes.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.code} — {c.name}
                  </option>
                ))}
              </Select>
            </div>

            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                onClick={() => setOpenCreate(false)}
              >
                Huỷ
              </Button>
              <Button
                type="submit"
                data-testid="submit-create-student"
                disabled={submitting}
              >
                {submitting ? "Đang lưu..." : "Lưu hồ sơ học sinh"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
