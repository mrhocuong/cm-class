"use client";

import React, { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { GraduationCap, UserPlus, AlertCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

export default function RegisterPage() {
  const router = useRouter();
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [workspaceName, setWorkspaceName] = useState("");
  const [phone, setPhone] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);

    try {
      const res = await fetch("/api/auth/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          fullName,
          email,
          password,
          workspaceName,
          phone,
        }),
      });

      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data.error || "Đăng ký không thành công. Vui lòng kiểm tra lại.");
        return;
      }

      router.push("/dashboard");
      router.refresh();
    } catch {
      setError("Không thể kết nối tới máy chủ. Vui lòng thử lại.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-slate-50 via-blue-50/40 to-indigo-50/60 p-4">
      <div className="w-full max-w-md space-y-6">
        <div className="flex flex-col items-center text-center">
          <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-2xl bg-blue-600 text-white shadow-md">
            <GraduationCap className="h-7 w-7" />
          </div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900">
            Đăng ký Workspace Giáo viên
          </h1>
          <p className="mt-1 text-sm text-slate-600">
            Khởi tạo không gian quản lý lớp học, học phí và học sinh riêng biệt
          </p>
        </div>

        <Card className="border-slate-200/90 shadow-lg">
          <CardHeader>
            <CardTitle className="text-xl">Tạo tài khoản & Workspace</CardTitle>
            <CardDescription>
              Điền thông tin cá nhân và tên trung tâm / lớp học của bạn
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form
              data-testid="register-form"
              onSubmit={handleSubmit}
              className="space-y-4"
            >
              {error && (
                <div
                  data-testid="register-error"
                  role="alert"
                  className="flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700"
                >
                  <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-red-600" />
                  <span>{error}</span>
                </div>
              )}

              <div className="space-y-1.5">
                <Label htmlFor="register-fullname">Họ và tên giáo viên *</Label>
                <Input
                  id="register-fullname"
                  data-testid="register-fullname"
                  required
                  placeholder="Ví dụ: Thầy Nguyễn Văn An"
                  value={fullName}
                  onChange={(e) => setFullName(e.target.value)}
                />
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="register-email">Địa chỉ Email *</Label>
                <Input
                  id="register-email"
                  data-testid="register-email"
                  type="email"
                  required
                  placeholder="giaovien@example.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                />
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="register-password">
                  Mật khẩu (tối thiểu 6 ký tự) *
                </Label>
                <Input
                  id="register-password"
                  data-testid="register-password"
                  type="password"
                  required
                  minLength={6}
                  placeholder="••••••"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                />
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="register-workspace-name">
                  Tên lớp học / Trung tâm (Workspace)
                </Label>
                <Input
                  id="register-workspace-name"
                  data-testid="register-workspace-name"
                  placeholder="Để trống sẽ tự tạo: Lớp học của [Họ tên]"
                  value={workspaceName}
                  onChange={(e) => setWorkspaceName(e.target.value)}
                />
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="register-phone">Số điện thoại liên hệ</Label>
                <Input
                  id="register-phone"
                  data-testid="register-phone"
                  placeholder="0901234567"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                />
              </div>

              <Button
                type="submit"
                data-testid="register-submit"
                disabled={loading}
                className="w-full"
              >
                <UserPlus className="h-4 w-4" />
                <span>
                  {loading
                    ? "Đang khởi tạo Workspace..."
                    : "Tạo Workspace & Bắt đầu"}
                </span>
              </Button>
            </form>

            <div className="mt-5 text-center text-sm text-slate-600">
              Đã có tài khoản?{" "}
              <Link
                href="/login"
                className="font-semibold text-blue-600 hover:underline"
              >
                Đăng nhập ngay
              </Link>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
