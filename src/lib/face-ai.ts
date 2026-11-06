export const FACE_DESCRIPTOR_LENGTH = 128;
export const DEFAULT_SIMILARITY_THRESHOLD = 0.8;
export const DEFAULT_DISTANCE_THRESHOLD = 0.6;

export interface FaceDescriptorValidationResult {
  valid: boolean;
  error?: string;
  normalized?: number[];
}

export function normalizeDescriptor(
  vec: ReadonlyArray<number>,
  zeroMean: boolean = false
): number[] {
  let working = Array.from(vec, (x) => Number(x));
  if (zeroMean && working.length > 0) {
    const mean = working.reduce((acc, v) => acc + v, 0) / working.length;
    working = working.map((v) => v - mean);
  }
  let sumSq = 0;
  for (let i = 0; i < working.length; i++) {
    sumSq += working[i] * working[i];
  }
  const norm = Math.sqrt(sumSq);
  if (norm < 1e-8) {
    return working.map(() => 0);
  }
  return working.map((v) => Number((v / norm).toFixed(6)));
}

export function validateFaceDescriptor(
  descriptor: unknown
): FaceDescriptorValidationResult {
  if (
    !Array.isArray(descriptor) ||
    descriptor.length !== FACE_DESCRIPTOR_LENGTH
  ) {
    return {
      valid: false,
      error:
        "Vector nhận diện khuôn mặt không hợp lệ (cần đúng 128 số thực khác 0)",
    };
  }

  let sumSq = 0;
  const nums: number[] = [];
  for (let i = 0; i < FACE_DESCRIPTOR_LENGTH; i++) {
    const val = Number(descriptor[i]);
    if (!Number.isFinite(val)) {
      return {
        valid: false,
        error:
          "Vector nhận diện khuôn mặt không hợp lệ (cần đúng 128 số thực khác 0)",
      };
    }
    nums.push(val);
    sumSq += val * val;
  }

  if (Math.sqrt(sumSq) < 1e-6) {
    return {
      valid: false,
      error:
        "Vector nhận diện khuôn mặt không hợp lệ (cần đúng 128 số thực khác 0)",
    };
  }

  return {
    valid: true,
    normalized: normalizeDescriptor(nums, false),
  };
}

export function cosineSimilarity(
  a: ReadonlyArray<number>,
  b: ReadonlyArray<number>
): number {
  if (a.length !== b.length || a.length === 0) {
    throw new Error("Hai vector phải có cùng số chiều > 0");
  }
  let dot = 0;
  let normA = 0;
  let normB = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }
  const denom = Math.sqrt(normA) * Math.sqrt(normB);
  if (denom < 1e-8) return 0;
  const sim = dot / denom;
  return Math.max(-1, Math.min(1, sim));
}

export function euclideanDistance(
  a: ReadonlyArray<number>,
  b: ReadonlyArray<number>
): number {
  if (a.length !== b.length || a.length === 0) {
    throw new Error("Hai vector phải có cùng số chiều > 0");
  }
  let sumSq = 0;
  for (let i = 0; i < a.length; i++) {
    const diff = a[i] - b[i];
    sumSq += diff * diff;
  }
  return Math.sqrt(sumSq);
}

export interface EnrolledFaceCandidate {
  descriptorId?: string;
  studentId: string;
  studentName?: string;
  studentCode?: string;
  descriptor: number[];
}

export interface FaceMatchResult {
  matched: boolean;
  reason?: "NO_ENROLLED_FACES" | "BELOW_THRESHOLD" | "MATCHED";
  bestCandidate: EnrolledFaceCandidate | null;
  similarity: number;
  distance: number;
  confidenceScore: number;
}

export function matchFaceDescriptor(
  queryDescriptor: ReadonlyArray<number>,
  candidates: EnrolledFaceCandidate[],
  options?: {
    similarityThreshold?: number;
    distanceThreshold?: number;
  }
): FaceMatchResult {
  const validQuery = validateFaceDescriptor(queryDescriptor);
  if (!validQuery.valid || !validQuery.normalized) {
    throw new Error(validQuery.error || "Vector truy vấn không hợp lệ");
  }

  const validCandidates = candidates.filter(
    (c) => validateFaceDescriptor(c.descriptor).valid
  );

  if (validCandidates.length === 0) {
    return {
      matched: false,
      reason: "NO_ENROLLED_FACES",
      bestCandidate: null,
      similarity: 0,
      distance: Infinity,
      confidenceScore: 0,
    };
  }

  const simThreshold =
    options?.similarityThreshold ?? DEFAULT_SIMILARITY_THRESHOLD;
  const distThreshold =
    options?.distanceThreshold ?? DEFAULT_DISTANCE_THRESHOLD;

  const qNorm = validQuery.normalized;
  let bestCandidate: EnrolledFaceCandidate | null = null;
  let bestSim = -Infinity;
  let bestDist = Infinity;

  for (const candidate of validCandidates) {
    const cNorm = normalizeDescriptor(candidate.descriptor, false);
    const sim = cosineSimilarity(qNorm, cNorm);
    const dist = euclideanDistance(qNorm, cNorm);

    if (sim > bestSim) {
      bestSim = sim;
      bestDist = dist;
      bestCandidate = candidate;
    }
  }

  const isMatched =
    bestCandidate !== null &&
    (bestSim >= simThreshold || bestDist <= distThreshold);
  const confidenceScore = Math.max(
    0,
    Math.min(1, Math.round(bestSim * 1000) / 1000)
  );

  return {
    matched: isMatched,
    reason: isMatched ? "MATCHED" : "BELOW_THRESHOLD",
    bestCandidate: isMatched ? bestCandidate : bestCandidate,
    similarity: Number(bestSim.toFixed(4)),
    distance: Number(bestDist.toFixed(4)),
    confidenceScore,
  };
}

/**
 * Extracts a deterministic 128-float L2-normalized facial descriptor from RGBA pixel data.
 * Uses an 8 (rows) x 4 (cols) = 32 spatial grid with 4 features per cell:
 *   1. Mean luminance Y = 0.299R + 0.587G + 0.114B
 *   2. Red-Green chrominance contrast (R - G)
 *   3. Signed horizontal Sobel/central gradient Gx
 *   4. Signed vertical Sobel/central gradient Gy
 * Each of the 4 feature channels is independently z-score standardized (zero-mean,
 * unit-variance across the 32 spatial cells) before interleaving into 128 floats
 * and L2 unit-normalizing.
 */
export function extractDeterministicDescriptorFromPixels(
  rgbaData: Uint8ClampedArray | Uint8Array | number[],
  width: number,
  height: number
): number[] {
  if (width <= 0 || height <= 0 || rgbaData.length < width * height * 4) {
    throw new Error("Dữ liệu khung hình ảnh không hợp lệ");
  }

  const gridRows = 8;
  const gridCols = 4;
  const numCells = gridRows * gridCols;
  const chY: number[] = new Array(numCells).fill(0);
  const chRG: number[] = new Array(numCells).fill(0);
  const chGx: number[] = new Array(numCells).fill(0);
  const chGy: number[] = new Array(numCells).fill(0);

  const getLum = (x: number, y: number): number => {
    const cx = Math.max(0, Math.min(width - 1, x));
    const cy = Math.max(0, Math.min(height - 1, y));
    const idx = (cy * width + cx) * 4;
    const r = rgbaData[idx] / 255;
    const g = rgbaData[idx + 1] / 255;
    const b = rgbaData[idx + 2] / 255;
    return 0.299 * r + 0.587 * g + 0.114 * b;
  };

  for (let row = 0; row < gridRows; row++) {
    const yStart = Math.floor((row * height) / gridRows);
    const yEnd = Math.max(
      yStart + 1,
      Math.floor(((row + 1) * height) / gridRows)
    );

    for (let col = 0; col < gridCols; col++) {
      const xStart = Math.floor((col * width) / gridCols);
      const xEnd = Math.max(
        xStart + 1,
        Math.floor(((col + 1) * width) / gridCols)
      );

      let sumY = 0;
      let sumRG = 0;
      let sumGx = 0;
      let sumGy = 0;
      let count = 0;

      for (let y = yStart; y < yEnd; y++) {
        for (let x = xStart; x < xEnd; x++) {
          const idx = (y * width + x) * 4;
          const r = rgbaData[idx] / 255;
          const g = rgbaData[idx + 1] / 255;
          const b = rgbaData[idx + 2] / 255;

          const lum = 0.299 * r + 0.587 * g + 0.114 * b;
          const rg = r - g;
          const gx = getLum(x + 1, y) - getLum(x - 1, y);
          const gy = getLum(x, y + 1) - getLum(x, y - 1);

          sumY += lum;
          sumRG += rg;
          sumGx += gx;
          sumGy += gy;
          count++;
        }
      }

      const cellIdx = row * gridCols + col;
      const inv = count > 0 ? 1 / count : 1;
      chY[cellIdx] = sumY * inv;
      chRG[cellIdx] = sumRG * inv;
      chGx[cellIdx] = sumGx * inv;
      chGy[cellIdx] = sumGy * inv;
    }
  }

  const standardizeChannel = (arr: number[]): number[] => {
    const mean = arr.reduce((a, b) => a + b, 0) / arr.length;
    const centered = arr.map((v) => v - mean);
    const variance =
      centered.reduce((a, v) => a + v * v, 0) / arr.length;
    const std = Math.sqrt(variance);
    if (std < 1e-8) return centered;
    return centered.map((v) => v / std);
  };

  const sY = standardizeChannel(chY);
  const sRG = standardizeChannel(chRG);
  const sGx = standardizeChannel(chGx);
  const sGy = standardizeChannel(chGy);

  const rawFeatures: number[] = [];
  for (let i = 0; i < numCells; i++) {
    rawFeatures.push(sY[i], sRG[i], sGx[i], sGy[i]);
  }

  return normalizeDescriptor(rawFeatures, false);
}

function mix32(h: number): number {
  h ^= h >>> 16;
  h = Math.imul(h, 0x85ebca6b) >>> 0;
  h ^= h >>> 13;
  h = Math.imul(h, 0xc2b2ae35) >>> 0;
  h ^= h >>> 16;
  return h >>> 0;
}

function createSeededPrng(seed: string): () => number {
  const str = String(seed || "default-student");
  let s0 = 0x9e3779b9 >>> 0;
  let s1 = 0x243f6a88 >>> 0;
  let s2 = 0xb7e15162 >>> 0;
  let s3 = 0xdeadbeef >>> 0;
  for (let i = 0; i < str.length; i++) {
    const ch = str.charCodeAt(i);
    s0 = mix32(s0 ^ Math.imul(ch + i + 1, 0x9e3779b1));
    s1 = mix32(s1 ^ Math.imul(ch + (i << 4), 0x85ebca77));
    s2 = mix32(s2 ^ Math.imul(ch ^ (i * 131), 0xc2b2ae3d));
    s3 = mix32(s3 ^ Math.imul(ch + i * 8191, 0x27d4eb2f));
  }
  return (): number => {
    const t = (s0 + s1 + s3) >>> 0;
    s3 = (s3 + 1) >>> 0;
    s0 = s1 ^ (s1 >>> 9);
    s1 = (s2 + (s2 << 3)) >>> 0;
    s2 = ((s2 << 21) | (s2 >>> 11)) >>> 0;
    s2 = (s2 + t) >>> 0;
    return (mix32(t) >>> 0) / 4294967296;
  };
}

/**
 * Generates a deterministic 64x64 RGBA synthetic student portrait buffer for a given student seed,
 * with distinct per-cell spatial frequencies, gradients, and chrominance across the 8x4 facial grid
 * so both canvas rendering and server-side seed generation produce identical, well-separated 128-float vectors.
 */
export function generateSyntheticPortraitPixels(
  seedKey: string,
  width: number = 64,
  height: number = 64
): Uint8ClampedArray {
  const buf = new Uint8ClampedArray(width * height * 4);
  const rand = createSeededPrng(seedKey);
  const gridRows = 8;
  const gridCols = 4;

  const cellParams: Array<{
    baseR: number;
    baseG: number;
    baseB: number;
    gradX: number;
    gradY: number;
    freqX: number;
    freqY: number;
    phase: number;
  }> = [];

  for (let r = 0; r < gridRows; r++) {
    for (let c = 0; c < gridCols; c++) {
      cellParams.push({
        baseR: 30 + rand() * 195,
        baseG: 30 + rand() * 195,
        baseB: 30 + rand() * 195,
        gradX: (rand() * 2 - 1) * 90,
        gradY: (rand() * 2 - 1) * 90,
        freqX: 1 + Math.floor(rand() * 4),
        freqY: 1 + Math.floor(rand() * 4),
        phase: rand() * Math.PI * 2,
      });
    }
  }

  for (let y = 0; y < height; y++) {
    const row = Math.min(gridRows - 1, Math.floor((y * gridRows) / height));
    const yStart = Math.floor((row * height) / gridRows);
    const yEnd = Math.max(
      yStart + 1,
      Math.floor(((row + 1) * height) / gridRows)
    );
    const ly = (y - yStart) / (yEnd - yStart) - 0.5;

    for (let x = 0; x < width; x++) {
      const col = Math.min(gridCols - 1, Math.floor((x * gridCols) / width));
      const xStart = Math.floor((col * width) / gridCols);
      const xEnd = Math.max(
        xStart + 1,
        Math.floor(((col + 1) * width) / gridCols)
      );
      const lx = (x - xStart) / (xEnd - xStart) - 0.5;

      const p = cellParams[row * gridCols + col];
      const wave = Math.sin(
        (lx * p.freqX + ly * p.freqY) * Math.PI * 2 + p.phase
      );
      const delta = p.gradX * lx + p.gradY * ly + 25 * wave;

      const r = Math.max(0, Math.min(255, Math.round(p.baseR + delta)));
      const g = Math.max(
        0,
        Math.min(255, Math.round(p.baseG - delta * 0.6 + 20 * wave))
      );
      const b = Math.max(
        0,
        Math.min(255, Math.round(p.baseB + p.gradX * ly - p.gradY * lx))
      );

      const idx = (y * width + x) * 4;
      buf[idx] = r;
      buf[idx + 1] = g;
      buf[idx + 2] = b;
      buf[idx + 3] = 255;
    }
  }

  return buf;
}

export function generateSyntheticDescriptorForStudent(
  seedKey: string
): number[] {
  const pixels = generateSyntheticPortraitPixels(seedKey, 64, 64);
  return extractDeterministicDescriptorFromPixels(pixels, 64, 64);
}
