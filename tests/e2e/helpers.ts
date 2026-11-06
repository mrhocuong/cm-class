import { APIRequestContext, APIResponse, Page, expect } from "@playwright/test";

export const BASE_URL =
  process.env.PLAYWRIGHT_BASE_URL || "http://localhost:3000";

let uniqueCounter = 0;

/**
 * Generates a unique, collision-free suffix for emails, class codes, and student codes across parallel workers.
 */
export function uniqueSuffix(prefix = "e2e"): string {
  uniqueCounter += 1;
  const rand = Math.random().toString(36).substring(2, 7);
  return `${prefix}-${Date.now()}-${uniqueCounter}-${rand}`;
}

/**
 * Flexible response unwrapper: handles either `{ [key]: T }` or direct `T` response shapes.
 */
export function unwrapItem<T = any>(body: any, key: string): T {
  if (body && typeof body === "object" && key in body && body[key] !== undefined) {
    return body[key] as T;
  }
  return body as T;
}

/**
 * Flexible list unwrapper: handles either `{ [key]: T[] }` or direct `T[]` array responses.
 */
export function unwrapList<T = any>(body: any, key: string): T[] {
  if (Array.isArray(body)) {
    return body as T[];
  }
  if (body && typeof body === "object" && Array.isArray(body[key])) {
    return body[key] as T[];
  }
  if (body && typeof body === "object" && Array.isArray(body.data)) {
    return body.data as T[];
  }
  if (body && typeof body === "object" && Array.isArray(body.items)) {
    return body.items as T[];
  }
  return [];
}

export interface RegisteredTeacher {
  userId: string;
  workspaceId: string;
  email: string;
  password: string;
  fullName: string;
  workspaceName: string;
  cookieHeader: string;
}

/**
 * Opaque-Box Teacher API Client that authenticates via both:
 * 1. Session cookies obtained from `/api/auth/register` or `/api/auth/login`
 * 2. `x-test-user-email` fallback header supported by `requireWorkspace()`
 */
export class TeacherApiClient {
  public readonly request: APIRequestContext;
  public readonly teacher: RegisteredTeacher;

  constructor(request: APIRequestContext, teacher: RegisteredTeacher) {
    this.request = request;
    this.teacher = teacher;
  }

  public headers(extra?: Record<string, string>): Record<string, string> {
    const h: Record<string, string> = {
      "Content-Type": "application/json",
      "x-test-user-email": this.teacher.email,
      ...(extra || {}),
    };
    if (this.teacher.cookieHeader) {
      h["Cookie"] = this.teacher.cookieHeader;
    }
    return h;
  }

  public async get(
    path: string,
    params?: Record<string, string | number | boolean | undefined>
  ): Promise<APIResponse> {
    const url = new URL(path, BASE_URL);
    if (params) {
      for (const [k, v] of Object.entries(params)) {
        if (v !== undefined) {
          url.searchParams.set(k, String(v));
        }
      }
    }
    return this.request.get(url.toString(), {
      headers: this.headers(),
    });
  }

  public async post(path: string, data?: any): Promise<APIResponse> {
    const url = new URL(path, BASE_URL).toString();
    return this.request.post(url, {
      headers: this.headers(),
      data: data ?? {},
    });
  }

  public async put(path: string, data?: any): Promise<APIResponse> {
    const url = new URL(path, BASE_URL).toString();
    return this.request.put(url, {
      headers: this.headers(),
      data: data ?? {},
    });
  }

  public async patch(path: string, data?: any): Promise<APIResponse> {
    const url = new URL(path, BASE_URL).toString();
    return this.request.patch(url, {
      headers: this.headers(),
      data: data ?? {},
    });
  }

  public async delete(path: string): Promise<APIResponse> {
    const url = new URL(path, BASE_URL).toString();
    return this.request.delete(url, {
      headers: this.headers(),
    });
  }
}

/**
 * Extracts Set-Cookie headers from an APIResponse into a single `Cookie` request header string.
 */
export function extractCookies(response: APIResponse): string {
  const headersArray = response.headersArray();
  const cookies: string[] = [];
  for (const h of headersArray) {
    if (h.name.toLowerCase() === "set-cookie") {
      const pair = h.value.split(";")[0]?.trim();
      if (pair) cookies.push(pair);
    }
  }
  return cookies.join("; ");
}

/**
 * Registers a fresh teacher + 1-to-1 workspace via `POST /api/auth/register`
 * and logs in via `POST /api/auth/login` to return a ready-to-use `TeacherApiClient`.
 */
export async function registerAndLoginTeacher(
  request: APIRequestContext,
  overrides?: Partial<{
    fullName: string;
    email: string;
    password: string;
    workspaceName: string;
    phone: string;
  }>
): Promise<TeacherApiClient> {
  const tag = uniqueSuffix("teacher");
  const rawEmail = overrides?.email ?? `${tag}@cmclass.test`;
  const password = overrides?.password ?? "Password123!";
  const fullName = overrides?.fullName ?? `Giáo Viên ${tag}`;
  const workspaceName = overrides?.workspaceName ?? `Trung Tâm ${tag}`;
  const phone = overrides?.phone ?? "0901234567";

  const regRes = await request.post(`${BASE_URL}/api/auth/register`, {
    data: {
      fullName,
      email: rawEmail,
      password,
      workspaceName,
      phone,
    },
  });
  expect(regRes.status(), `Register failed for ${rawEmail}`).toBe(201);
  const regBody = await regRes.json();
  let cookieHeader = extractCookies(regRes);

  const userObj = regBody.user ?? regBody;
  const workspaceObj = regBody.workspace ?? regBody.user?.workspace ?? {};
  const normalizedEmail = (userObj.email ?? rawEmail).trim().toLowerCase();

  // Attempt explicit login via /api/auth/login to ensure session cookie is set
  const loginRes = await request.post(`${BASE_URL}/api/auth/login`, {
    data: { email: normalizedEmail, password },
  });
  if (loginRes.ok()) {
    const loginCookies = extractCookies(loginRes);
    if (loginCookies) {
      cookieHeader = cookieHeader
        ? `${cookieHeader}; ${loginCookies}`
        : loginCookies;
    }
  }

  return new TeacherApiClient(request, {
    userId: userObj.id,
    workspaceId: workspaceObj.id,
    email: normalizedEmail,
    password,
    fullName,
    workspaceName,
    cookieHeader,
  });
}

/**
 * Configures a Playwright `Page` with the authenticated teacher's session and test header.
 */
export async function authenticatePageForTeacher(
  page: Page,
  client: TeacherApiClient
): Promise<void> {
  await page.setExtraHTTPHeaders({
    "x-test-user-email": client.teacher.email,
  });

  if (client.teacher.cookieHeader) {
    const baseUrlObj = new URL(BASE_URL);
    const cookiePairs = client.teacher.cookieHeader
      .split(";")
      .map((c) => c.trim())
      .filter(Boolean);
    const cookiesToSet = cookiePairs.map((pair) => {
      const eqIdx = pair.indexOf("=");
      const name = pair.slice(0, eqIdx).trim();
      const value = pair.slice(eqIdx + 1).trim();
      return {
        name,
        value,
        domain: baseUrlObj.hostname,
        path: "/",
      };
    });
    if (cookiesToSet.length > 0) {
      await page.context().addCookies(cookiesToSet);
    }
  }
}

/**
 * Generates a deterministic 128-float L2-normalized face descriptor (`length === 128`, L2 norm === 1.0)
 * from an integer or string seed. Different seeds produce low cosine similarity; identical seeds produce 1.0.
 */
export function generateNormalizedDescriptor(seed: number | string): number[] {
  const numericSeed =
    typeof seed === "number"
      ? seed
      : Array.from(seed).reduce(
          (acc, ch, idx) => acc + ch.charCodeAt(0) * (idx + 17),
          101
        );

  const raw: number[] = [];
  let state = (numericSeed * 2654435761) >>> 0;
  if (state === 0) state = 123456789;

  for (let i = 0; i < 128; i++) {
    // xorshift32 PRNG mapped to [-1, 1]
    state ^= state << 13;
    state ^= state >>> 17;
    state ^= state << 5;
    let u = ((state >>> 0) / 4294967296) * 2 - 1;
    if (Math.abs(u) < 1e-4) {
      u = u >= 0 ? 0.05 : -0.05;
    }
    raw.push(u);
  }

  return l2Normalize(raw);
}

/**
 * Alias for `generateNormalizedDescriptor` used in boundary and combination specs.
 */
export const createDeterministicDescriptor = generateNormalizedDescriptor;

/**
 * Perturbs a 128-float base descriptor with deterministic small noise and re-normalizes to unit length.
 * With `noiseLevel = 0.05`, cosine similarity with `base` is ~0.985 (well above 0.80 threshold).
 */
export function perturbDescriptor(
  base: number[],
  noiseLevel = 0.05,
  noiseSeed = 42
): number[] {
  expect(base.length).toBe(128);
  let state = (noiseSeed * 1664525 + 1013904223) >>> 0;
  const perturbed = base.map((val, idx) => {
    state = (state * 1664525 + 1013904223 + idx) >>> 0;
    const delta = (((state >>> 0) / 4294967296) * 2 - 1) * noiseLevel;
    return val + delta;
  });
  return l2Normalize(perturbed);
}

/**
 * L2-normalizes a vector so `sum(v_i^2) === 1.0`.
 */
export function l2Normalize(vec: number[]): number[] {
  const norm = Math.sqrt(vec.reduce((acc, v) => acc + v * v, 0));
  if (norm === 0) return vec.map(() => 0);
  return vec.map((v) => Number((v / norm).toFixed(6)));
}

/**
 * Computes cosine similarity between two 128-float descriptors for test assertions.
 */
export function cosineSimilarity(a: number[], b: number[]): number {
  let dot = 0;
  let normA = 0;
  let normB = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }
  if (normA === 0 || normB === 0) return 0;
  return dot / (Math.sqrt(normA) * Math.sqrt(normB));
}

/**
 * Quick domain factory: creates a Class in the teacher's workspace and returns the unwrapped Class object.
 */
export async function createTestClass(
  client: TeacherApiClient,
  overrides?: Partial<{
    code: string;
    name: string;
    subject: string;
    gradeLevel: string;
    room: string;
    defaultFeeAmount: number;
    billingCycle: "MONTHLY" | "PER_COURSE" | "PER_SESSION";
    startDate: string;
    endDate: string;
    status: "ACTIVE" | "UPCOMING" | "COMPLETED" | "ARCHIVED";
  }>
) {
  const tag = uniqueSuffix("CLS").toUpperCase().slice(0, 14);
  const res = await client.post("/api/classes", {
    code: overrides?.code ?? tag,
    name: overrides?.name ?? `Lớp Toán ${tag}`,
    subject: overrides?.subject ?? "Toán",
    gradeLevel: overrides?.gradeLevel ?? "Khối 9",
    room: overrides?.room ?? "Phòng 101",
    defaultFeeAmount: overrides?.defaultFeeAmount ?? 1500000,
    billingCycle: overrides?.billingCycle ?? "MONTHLY",
    startDate: overrides?.startDate ?? "2026-11-01",
    endDate: overrides?.endDate ?? "2026-12-31",
    status: overrides?.status ?? "ACTIVE",
  });
  expect(res.status()).toBe(201);
  const body = await res.json();
  return unwrapItem(body, "class");
}

/**
 * Quick domain factory: creates a Student in the teacher's workspace and returns the unwrapped Student object.
 */
export async function createTestStudent(
  client: TeacherApiClient,
  overrides?: Partial<{
    studentCode: string;
    fullName: string;
    gender: "MALE" | "FEMALE" | "OTHER";
    school: string;
    phone: string;
    status: "ACTIVE" | "INACTIVE" | "GRADUATED";
    guardians: Array<{
      fullName: string;
      relationship: string;
      phone: string;
      email?: string;
      zalo?: string;
      address?: string;
      isPrimary?: boolean;
    }>;
  }>
) {
  const tag = uniqueSuffix("HS");
  const res = await client.post("/api/students", {
    ...(overrides?.studentCode ? { studentCode: overrides.studentCode } : {}),
    fullName: overrides?.fullName ?? `Học Sinh ${tag}`,
    gender: overrides?.gender ?? "FEMALE",
    school: overrides?.school ?? "THCS Chu Văn An",
    phone: overrides?.phone ?? "0912345678",
    status: overrides?.status ?? "ACTIVE",
    ...(overrides?.guardians ? { guardians: overrides.guardians } : {}),
  });
  expect(res.status()).toBe(201);
  const body = await res.json();
  return unwrapItem(body, "student");
}
