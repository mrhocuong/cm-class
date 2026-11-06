"use client";

import React, { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { GraduationCap, LogIn, Sparkles, AlertCircle } from "lucide-react";
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

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);

    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
      });

      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data.error || "Email hoặc mật khẩu không đúng");
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

  function fillTeacherA() {
    setEmail("giaovien@cmclass.vn");
    setPassword("123456");
    setError(null);
  }

  function fillTeacherB() {
    setEmail("giaovien2@cmclass.vn");
    setPassword("123456");
    setError(null);
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-slate-50 via-blue-50/40 to-indigo-50/60 p-4">
      <div className="w-full max-w-md space-y-6">
        <div className="flex flex-col items-center text-center">
          <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-2xl bg-blue-600 text-white shadow-md">
            <GraduationCap className="h-7 w-7" />
          </div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900">
            Hệ thống Quản trị Lớp học CM-Class
          </h1>
          <p className="mt-1 text-sm text-slate-600">
            Mỗi giáo viên một Workspace độc lập — Quản lý lớp, học phí VietQR & Điểm danh FaceAI
          </p>
        </div>

        <Card className="border-slate-200/90 shadow-lg">
          <CardHeader>
            <CardTitle className="text-xl">Đăng nhập Giáo viên</CardTitle>
            <CardDescription>
              Nhập tài khoản giáo viên để truy cập Workspace của bạn
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form
              data-testid="login-form"
              onSubmit={handleSubmit}
              className="space-y-4"
            >
              {error && (
                <div
                  data-testid="login-error"
                  role="alert"
                  className="flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700"
                >
                  <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-red-600" />
                  <span>{error}</span>
                </div>
              )}

              <div className="space-y-1.5">
                <Label htmlFor="login-email">Email giáo viên</Label>
                <Input
                  id="login-email"
                  data-testid="login-email"
                  type="email"
                  required
                  placeholder="giaovien@cmclass.vn"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                />
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="login-password">Mật khẩu</Label>
                <Input
                  id="login-password"
                  data-testid="login-password"
                  type="password"
                  required
                  placeholder="••••••"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                />
              </div>

              <Button
                type="submit"
                data-testid="login-submit"
                disabled={loading}
                className="w-full"
              >
                <LogIn className="h-4 w-4" />
                <span>
                  {loading ? "Đang đăng nhập..." : "Đăng nhập vào Workspace"}
                </span>
              </Button>
            </form>

            {/* Quick Demo Fill Buttons */}
            <div className="mt-5 space-y-2 border-t border-slate-100 pt-4">
              <p className="text-xs font-medium text-slate-500">
                Tài khoản trải nghiệm nhanh (Seeded Demo):
              </p>
              <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                <button
                  type="button"
                  data-testid="demo-login-fill"
                  onClick={fillTeacherA}
                  className="flex items-center justify-center gap-1.5 rounded-lg border border-blue-200 bg-blue-50/70 px-3 py-2 text-xs font-medium text-blue-700 transition hover:bg-blue-100"
                >
                  <Sparkles className="h-3.5 w-3.5" />
                  <span>Thầy Nguyễn Văn An (WS A)</span>
                </button>
                <button
                  type="button"
                  data-testid="demo-login-fill-b"
                  onClick={fillTeacherB}
                  className="flex items-center justify-center gap-1.5 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-xs font-medium text-slate-700 transition hover:bg-slate-100"
                >
                  <Sparkles className="h-3.5 w-3.5" />
                  <span>Cô Trần Thị Bích (WS B)</span>
                </button>
              </div>
            </div>

            <div className="mt-5 text-center text-sm text-slate-600">
              Chưa có tài khoản?{" "}
              <Link
                href="/register"
                className="font-semibold text-blue-600 hover:underline"
              >
                Đăng ký Workspace mới
              </Link>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
