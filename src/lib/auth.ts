import crypto from "node:crypto";
import bcrypt from "bcryptjs";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";

export const SESSION_COOKIE_NAME = "cm_session";
const LEGACY_SESSION_COOKIE_NAME = "cm_class_session";
const DEFAULT_TOKEN_TTL_SECONDS = 60 * 60 * 24 * 7; // 7 days

export interface SessionTokenPayload {
  userId: string;
  workspaceId: string;
  email: string;
  fullName: string;
  iat: number;
  exp: number;
}

function getAuthSecret(): string {
  return (
    process.env.AUTH_SECRET ||
    process.env.NEXTAUTH_SECRET ||
    "cm-class-super-secret-jwt-key-2026-production-ready"
  );
}

export function normalizeEmail(email: string): string {
  return String(email || "").trim().toLowerCase();
}

export async function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, 10);
}

export async function verifyPassword(
  password: string,
  passwordHash: string
): Promise<boolean> {
  if (!password || !passwordHash) return false;
  return bcrypt.compare(password, passwordHash);
}

function base64UrlEncode(input: string | Buffer): string {
  const buf = typeof input === "string" ? Buffer.from(input, "utf8") : input;
  return buf
    .toString("base64")
    .replace(/=/g, "")
    .replace(/\+/g, "-")
    .replace(/\//g, "_");
}

function base64UrlDecode(input: string): string {
  let str = input.replace(/-/g, "+").replace(/_/g, "/");
  while (str.length % 4 !== 0) {
    str += "=";
  }
  return Buffer.from(str, "base64").toString("utf8");
}

export function signSessionToken(
  payload: Omit<SessionTokenPayload, "iat" | "exp">,
  ttlSeconds: number = DEFAULT_TOKEN_TTL_SECONDS
): string {
  const now = Math.floor(Date.now() / 1000);
  const fullPayload: SessionTokenPayload = {
    ...payload,
    email: normalizeEmail(payload.email),
    iat: now,
    exp: now + ttlSeconds,
  };
  const headerSegment = base64UrlEncode(
    JSON.stringify({ alg: "HS256", typ: "JWT" })
  );
  const payloadSegment = base64UrlEncode(JSON.stringify(fullPayload));
  const signingInput = `${headerSegment}.${payloadSegment}`;
  const signature = crypto
    .createHmac("sha256", getAuthSecret())
    .update(signingInput)
    .digest();
  const signatureSegment = base64UrlEncode(signature);
  return `${signingInput}.${signatureSegment}`;
}

export const createSessionToken = signSessionToken;

export function verifySessionToken(token: string): SessionTokenPayload | null {
  try {
    if (!token || typeof token !== "string") return null;
    const parts = token.trim().split(".");
    if (parts.length !== 3) return null;
    const [headerSegment, payloadSegment, signatureSegment] = parts;
    const signingInput = `${headerSegment}.${payloadSegment}`;
    const expectedSig = base64UrlEncode(
      crypto
        .createHmac("sha256", getAuthSecret())
        .update(signingInput)
        .digest()
    );

    const sigBuf = Buffer.from(signatureSegment, "utf8");
    const expectedBuf = Buffer.from(expectedSig, "utf8");
    if (
      sigBuf.length !== expectedBuf.length ||
      !crypto.timingSafeEqual(sigBuf, expectedBuf)
    ) {
      return null;
    }

    const decoded = JSON.parse(
      base64UrlDecode(payloadSegment)
    ) as SessionTokenPayload;
    const now = Math.floor(Date.now() / 1000);
    if (!decoded.exp || decoded.exp < now) {
      return null;
    }
    if (!decoded.userId || !decoded.workspaceId || !decoded.email) {
      return null;
    }
    return decoded;
  } catch {
    return null;
  }
}

export function parseCookieHeader(
  cookieHeader: string | null | undefined
): Record<string, string> {
  const result: Record<string, string> = {};
  if (!cookieHeader) return result;
  const pairs = cookieHeader.split(";");
  for (const pair of pairs) {
    const idx = pair.indexOf("=");
    if (idx === -1) continue;
    const key = pair.slice(0, idx).trim();
    const rawVal = pair.slice(idx + 1).trim();
    try {
      result[key] = decodeURIComponent(rawVal);
    } catch {
      result[key] = rawVal;
    }
  }
  return result;
}

export function extractTokenFromRequest(req?: Request): string | null {
  if (!req) return null;
  const authHeader = req.headers.get("authorization");
  if (authHeader && authHeader.toLowerCase().startsWith("bearer ")) {
    const token = authHeader.slice(7).trim();
    if (token) return token;
  }
  const cookieHeader = req.headers.get("cookie");
  if (cookieHeader) {
    const parsed = parseCookieHeader(cookieHeader);
    if (parsed[SESSION_COOKIE_NAME]) {
      return parsed[SESSION_COOKIE_NAME];
    }
    if (parsed[LEGACY_SESSION_COOKIE_NAME]) {
      return parsed[LEGACY_SESSION_COOKIE_NAME];
    }
  }
  return null;
}

export async function getSessionUser(
  req?: Request
): Promise<SessionTokenPayload | null> {
  const reqToken = extractTokenFromRequest(req);
  if (reqToken) {
    const verified = verifySessionToken(reqToken);
    if (verified) return verified;
  }

  try {
    const cookieStore = await cookies();
    const cookieVal =
      cookieStore.get(SESSION_COOKIE_NAME)?.value ||
      cookieStore.get(LEGACY_SESSION_COOKIE_NAME)?.value;
    if (cookieVal) {
      return verifySessionToken(cookieVal);
    }
  } catch {
    // cookies() may throw when called outside a Next.js request context (e.g. direct Vitest call)
  }

  return null;
}

export const getSessionFromRequest = getSessionUser;

export function setSessionCookieOnResponse(
  res: NextResponse,
  token: string,
  maxAgeSeconds: number = DEFAULT_TOKEN_TTL_SECONDS
): NextResponse {
  res.cookies.set(SESSION_COOKIE_NAME, token, {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    secure:
      process.env.NODE_ENV === "production" &&
      Boolean(process.env.NEXTAUTH_URL?.startsWith("https://")),
    maxAge: maxAgeSeconds,
  });
  return res;
}

export const attachSessionCookie = setSessionCookieOnResponse;

export function clearSessionCookieOnResponse(res: NextResponse): NextResponse {
  res.cookies.set(SESSION_COOKIE_NAME, "", {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    maxAge: 0,
  });
  return res;
}

export const clearSessionCookie = clearSessionCookieOnResponse;
