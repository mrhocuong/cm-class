import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "CM-Class | Hệ thống Quản trị Lớp học Dành cho Giáo viên",
  description:
    "Quản lý workspace giáo viên, lớp học, thời khoá biểu, học sinh, phụ huynh, học phí VietQR, điểm danh FaceAI, kho bài tập, minigame và bảng xếp hạng.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="vi">
      <body className="min-h-screen bg-slate-50 text-slate-900 antialiased">
        {children}
      </body>
    </html>
  );
}
