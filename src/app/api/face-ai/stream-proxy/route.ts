import { NextRequest, NextResponse } from "next/server";
import { handleApiError, requireWorkspace } from "@/lib/workspace";

const BLOCKED_HOSTS = new Set([
  "169.254.169.254",
  "metadata.google.internal",
  "100.100.100.200",
  "localhost",
  "127.0.0.1",
  "0.0.0.0",
  "[::1]",
  "::1",
]);

function isBlockedHost(hostname: string): boolean {
  const lower = hostname.toLowerCase();
  if (BLOCKED_HOSTS.has(lower)) return true;
  if (
    lower.startsWith("127.") ||
    lower.startsWith("169.254.") ||
    lower.endsWith(".localhost") ||
    lower === "[::]" ||
    lower === "::" ||
    lower.startsWith("[::ffff:127.") ||
    lower.startsWith("[fe80:")
  ) {
    return true;
  }
  return false;
}

function buildSyntheticCameraSvg(studentCode: string, label: string): string {
  const safeCode =
    studentCode.replace(/[^a-zA-Z0-9_-]/g, "").slice(0, 16) || "HS001";
  const safeLabel =
    label.replace(/[<>&"']/g, "").slice(0, 40) || "Camera Lớp Học";
  return `<svg xmlns="http://www.w3.org/2000/svg" width="320" height="240" viewBox="0 0 320 240">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="#0f172a" />
      <stop offset="100%" stop-color="#1e293b" />
    </linearGradient>
  </defs>
  <rect width="320" height="240" fill="url(#bg)" />
  <rect x="70" y="30" width="180" height="180" rx="16" fill="none" stroke="#22c55e" stroke-width="2" stroke-dasharray="8 4" />
  <circle cx="160" cy="100" r="34" fill="#38bdf8" opacity="0.85" />
  <path d="M110 175 C110 142 210 142 210 175 Z" fill="#38bdf8" opacity="0.75" />
  <text x="16" y="22" fill="#4ade80" font-family="sans-serif" font-size="11" font-weight="bold">LIVE • ${safeLabel}</text>
  <text x="160" y="200" text-anchor="middle" fill="#f8fafc" font-family="monospace" font-size="12">${safeCode}</text>
</svg>`;
}

export async function GET(req: NextRequest) {
  try {
    const { workspace } = await requireWorkspace(req);
    const { searchParams } = new URL(req.url);
    const rawUrl = searchParams.get("url")?.trim() || "";
    const studentCode = searchParams.get("studentCode")?.trim() || "HS001";

    if (rawUrl && !rawUrl.startsWith("synthetic://") && rawUrl !== "demo") {
      let parsed: URL;
      try {
        parsed = new URL(rawUrl);
      } catch {
        return NextResponse.json(
          { error: "Địa chỉ URL camera không hợp lệ" },
          { status: 400 }
        );
      }

      if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
        return NextResponse.json(
          { error: "Chỉ hỗ trợ giao thức http hoặc https cho luồng camera" },
          { status: 400 }
        );
      }

      if (isBlockedHost(parsed.hostname)) {
        return NextResponse.json(
          { error: "Địa chỉ máy chủ camera bị từ chối vì lý do bảo mật" },
          { status: 400 }
        );
      }
    }

    const svg = buildSyntheticCameraSvg(
      studentCode,
      workspace.name || "Camera Lớp Học"
    );

    return new NextResponse(svg, {
      status: 200,
      headers: {
        "Content-Type": "image/svg+xml; charset=utf-8",
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": "GET, OPTIONS",
        "Cache-Control": "no-store, max-age=0",
      },
    });
  } catch (error) {
    return handleApiError(error);
  }
}
