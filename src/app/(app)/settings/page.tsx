"use client";

import React, { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import {
  Building2,
  CreditCard,
  QrCode,
  Save,
  CheckCircle2,
  AlertCircle,
  Camera,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { VIETQR_BANKS, type VietQrBundle } from "@/lib/vietqr";
import { formatVND } from "@/lib/utils";

export default function WorkspaceSettingsPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saveSuccess, setSaveSuccess] = useState(false);

  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [address, setAddress] = useState("");
  const [logoUrl, setLogoUrl] = useState("");
  const [cameraStreamUrl, setCameraStreamUrl] = useState("");
  const [bankBin, setBankBin] = useState("");
  const [bankAccountNumber, setBankAccountNumber] = useState("");
  const [bankAccountName, setBankAccountName] = useState("");

  const [vietqrPreview, setVietqrPreview] = useState<VietQrBundle | null>(null);

  useEffect(() => {
    async function loadWorkspace() {
      try {
        setLoading(true);
        const res = await fetch("/api/workspace");
        if (!res.ok) {
          throw new Error("Không thể tải cài đặt Workspace");
        }
        const data = await res.json();
        const ws = data.workspace;
        setName(ws.name || "");
        setPhone(ws.phone || "");
        setAddress(ws.address || "");
        setLogoUrl(ws.logoUrl || "");
        setCameraStreamUrl(ws.cameraStreamUrl || "");
        setBankBin(ws.bankBin || "");
        setBankAccountNumber(ws.bankAccountNumber || "");
        setBankAccountName(ws.bankAccountName || "");
        setVietqrPreview(data.vietqrPreview || null);
      } catch (err) {
        setError(
          err instanceof Error ? err.message : "Đã xảy ra lỗi khi tải dữ liệu"
        );
      } finally {
        setLoading(false);
      }
    }
    loadWorkspace();
  }, []);

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSaveSuccess(false);
    setSaving(true);

    try {
      const selectedBank = VIETQR_BANKS.find((b) => b.bin === bankBin);
      const res = await fetch("/api/workspace", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name,
          phone,
          address,
          logoUrl,
          cameraStreamUrl,
          bankBin,
          bankCode: selectedBank?.code || null,
          bankName: selectedBank?.shortName || null,
          bankAccountNumber,
          bankAccountName,
        }),
      });

      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data.error || "Không thể lưu cài đặt Workspace");
        return;
      }

      const ws = data.workspace;
      setName(ws.name || "");
      setPhone(ws.phone || "");
      setAddress(ws.address || "");
      setLogoUrl(ws.logoUrl || "");
      setCameraStreamUrl(ws.cameraStreamUrl || "");
      setBankBin(ws.bankBin || "");
      setBankAccountNumber(ws.bankAccountNumber || "");
      setBankAccountName(ws.bankAccountName || "");
      setVietqrPreview(data.vietqrPreview || null);
      setSaveSuccess(true);
      router.refresh();
    } catch {
      setError("Lỗi kết nối máy chủ khi lưu cài đặt");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <div className="flex flex-col justify-between gap-2 sm:flex-row sm:items-center">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">
            Cài đặt Workspace & Cấu hình Ngân hàng VietQR
          </h1>
          <p className="text-sm text-slate-600">
            Quản lý thông tin trung tâm/lớp học, tài khoản nhận học phí VietQR (NAPAS 247) và luồng Camera điểm danh FaceAI.
          </p>
        </div>
        <Badge variant="default">Tiền tệ mặc định: VND</Badge>
      </div>

      {loading ? (
        <Card>
          <CardContent className="p-8 text-center text-sm text-slate-500">
            Đang tải thông tin cấu hình Workspace...
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
          {/* Left 2 Columns: Form */}
          <div className="lg:col-span-2">
            <form
              data-testid="workspace-settings-form"
              onSubmit={handleSave}
              className="space-y-6"
            >
              {error && (
                <div
                  data-testid="settings-error-alert"
                  role="alert"
                  className="flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700"
                >
                  <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-red-600" />
                  <span>{error}</span>
                </div>
              )}

              {saveSuccess && (
                <div
                  data-testid="settings-save-toast"
                  role="status"
                  className="flex items-center gap-2 rounded-lg border border-emerald-200 bg-emerald-50 p-4 text-sm font-medium text-emerald-800"
                >
                  <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-600" />
                  <span>Đã lưu cài đặt Workspace thành công!</span>
                </div>
              )}

              {/* Card 1: General Workspace Profile */}
              <Card>
                <CardHeader>
                  <div className="flex items-center gap-2">
                    <Building2 className="h-5 w-5 text-blue-600" />
                    <CardTitle>Thông tin Trung tâm / Lớp học</CardTitle>
                  </div>
                  <CardDescription>
                    Hiển thị trên phiếu thu học phí, thông báo phụ huynh và thanh điều hướng
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                    <div className="space-y-1.5">
                      <Label htmlFor="input-workspace-name">
                        Tên Workspace / Trung tâm *
                      </Label>
                      <Input
                        id="input-workspace-name"
                        data-testid="input-workspace-name"
                        required
                        value={name}
                        onChange={(e) => setName(e.target.value)}
                        placeholder="Trung tâm Luyện thi Sao Khuê"
                      />
                    </div>

                    <div className="space-y-1.5">
                      <Label htmlFor="input-workspace-phone">
                        Số điện thoại / Hotline
                      </Label>
                      <Input
                        id="input-workspace-phone"
                        data-testid="input-workspace-phone"
                        value={phone}
                        onChange={(e) => setPhone(e.target.value)}
                        placeholder="0901234567"
                      />
                    </div>
                  </div>

                  <div className="space-y-1.5">
                    <Label htmlFor="input-workspace-address">
                      Địa chỉ lớp học
                    </Label>
                    <Input
                      id="input-workspace-address"
                      data-testid="input-workspace-address"
                      value={address}
                      onChange={(e) => setAddress(e.target.value)}
                      placeholder="Số 15 Trần Đại Nghĩa, Hai Bà Trưng, Hà Nội"
                    />
                  </div>

                  <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                    <div className="space-y-1.5">
                      <Label htmlFor="input-workspace-logo">
                        URL Logo Trung tâm (tuỳ chọn)
                      </Label>
                      <Input
                        id="input-workspace-logo"
                        data-testid="input-workspace-logo"
                        value={logoUrl}
                        onChange={(e) => setLogoUrl(e.target.value)}
                        placeholder="https://example.com/logo.png"
                      />
                    </div>

                    <div className="space-y-1.5">
                      <Label
                        htmlFor="input-camera-stream-url"
                        className="flex items-center gap-1.5"
                      >
                        <Camera className="h-3.5 w-3.5 text-slate-500" />
                        <span>URL Luồng Camera IP Lớp học (FaceAI)</span>
                      </Label>
                      <Input
                        id="input-camera-stream-url"
                        data-testid="input-camera-stream-url"
                        value={cameraStreamUrl}
                        onChange={(e) => setCameraStreamUrl(e.target.value)}
                        placeholder="http://192.168.1.100:8080/shot.jpg"
                      />
                    </div>
                  </div>
                </CardContent>
              </Card>

              {/* Card 2: VietQR Bank Configuration */}
              <Card>
                <CardHeader>
                  <div className="flex items-center gap-2">
                    <CreditCard className="h-5 w-5 text-blue-600" />
                    <CardTitle>Tài khoản Ngân hàng Nhận Học phí (VietQR)</CardTitle>
                  </div>
                  <CardDescription>
                    Dùng để tự động tạo mã QR chuyển khoản NAPAS 247 chính xác theo từng phiếu thu học phí
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="space-y-1.5">
                    <Label htmlFor="select-bank-bin">
                      Ngân hàng thụ hưởng (NAPAS BIN)
                    </Label>
                    <Select
                      id="select-bank-bin"
                      data-testid="select-bank-bin"
                      value={bankBin}
                      onChange={(e) => setBankBin(e.target.value)}
                    >
                      <option value="">-- Chọn ngân hàng --</option>
                      {VIETQR_BANKS.map((bank) => (
                        <option key={bank.bin} value={bank.bin}>
                          {bank.shortName} ({bank.code} - BIN {bank.bin}) —{" "}
                          {bank.name}
                        </option>
                      ))}
                    </Select>
                  </div>

                  <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                    <div className="space-y-1.5">
                      <Label htmlFor="input-bank-account-number">
                        Số tài khoản nhận học phí
                      </Label>
                      <Input
                        id="input-bank-account-number"
                        data-testid="input-bank-account-number"
                        value={bankAccountNumber}
                        onChange={(e) => setBankAccountNumber(e.target.value)}
                        placeholder="0123456789"
                      />
                    </div>

                    <div className="space-y-1.5">
                      <Label htmlFor="input-bank-account-name">
                        Tên chủ tài khoản (Không dấu, in hoa)
                      </Label>
                      <Input
                        id="input-bank-account-name"
                        data-testid="input-bank-account-name"
                        value={bankAccountName}
                        onChange={(e) => setBankAccountName(e.target.value)}
                        placeholder="NGUYEN VAN AN"
                      />
                    </div>
                  </div>
                </CardContent>
              </Card>

              <div className="flex justify-end">
                <Button
                  type="submit"
                  data-testid="save-settings-button"
                  disabled={saving}
                  size="lg"
                >
                  <Save className="h-4 w-4" />
                  <span>
                    {saving ? "Đang lưu cài đặt..." : "Lưu cài đặt Workspace"}
                  </span>
                </Button>
              </div>
            </form>
          </div>

          {/* Right Column: Live VietQR Preview Card */}
          <div className="lg:col-span-1">
            <Card
              data-testid="vietqr-preview"
              className="sticky top-6 border-blue-200 bg-gradient-to-b from-white to-blue-50/30"
            >
              <CardHeader>
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <QrCode className="h-5 w-5 text-blue-600" />
                    <CardTitle className="text-base">
                      Xem trước Mã VietQR Mẫu
                    </CardTitle>
                  </div>
                  <Badge variant={vietqrPreview ? "success" : "warning"}>
                    {vietqrPreview ? "Sẵn sàng" : "Chưa cấu hình"}
                  </Badge>
                </div>
                <CardDescription>
                  Minh hoạ mã QR tự động sinh trên phiếu thu học phí
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                {vietqrPreview ? (
                  <div className="flex flex-col items-center space-y-4">
                    <div className="rounded-xl border border-slate-200 bg-white p-3 shadow-xs">
                      <img
                        data-testid="vietqr-preview-img"
                        src={vietqrPreview.qrDataUrl}
                        alt="VietQR Sample Preview"
                        className="h-52 w-52 object-contain"
                      />
                    </div>

                    <div className="w-full space-y-2 rounded-lg border border-slate-200 bg-white p-3 text-xs">
                      <div className="flex justify-between">
                        <span className="text-slate-500">Ngân hàng:</span>
                        <span className="font-semibold text-slate-900">
                          {vietqrPreview.bankInfo.bankName} (
                          {vietqrPreview.bankInfo.bankBin})
                        </span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-slate-500">Số tài khoản:</span>
                        <span className="font-mono font-semibold text-slate-900">
                          {vietqrPreview.bankInfo.bankAccountNumber}
                        </span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-slate-500">Chủ tài khoản:</span>
                        <span className="font-semibold text-slate-900">
                          {vietqrPreview.bankInfo.bankAccountName}
                        </span>
                      </div>
                      <div className="flex justify-between border-t border-slate-100 pt-2">
                        <span className="text-slate-500">Số tiền mẫu:</span>
                        <span className="font-bold text-blue-600">
                          {formatVND(vietqrPreview.amount)}
                        </span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-slate-500">Nội dung CK:</span>
                        <span className="font-mono font-semibold text-emerald-700">
                          {vietqrPreview.transferContent}
                        </span>
                      </div>
                    </div>

                    <div className="w-full rounded-lg bg-slate-100 p-2.5">
                      <p className="mb-1 text-[11px] font-semibold text-slate-500">
                        Chuỗi EMVCo NAPAS 247 (CRC-16):
                      </p>
                      <p className="break-all font-mono text-[11px] text-slate-700">
                        {vietqrPreview.qrPayload}
                      </p>
                    </div>
                  </div>
                ) : (
                  <div className="rounded-lg border border-dashed border-slate-300 bg-slate-50 p-6 text-center text-sm text-slate-500">
                    Vui lòng chọn ngân hàng, nhập số tài khoản và tên chủ tài
                    khoản rồi nhấn <strong>Lưu cài đặt Workspace</strong> để tạo
                    mã VietQR.
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        </div>
      )}
    </div>
  );
}
