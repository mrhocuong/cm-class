import { describe, expect, it } from "vitest";
import {
  cosineSimilarity,
  euclideanDistance,
  extractDeterministicDescriptorFromPixels,
  generateSyntheticDescriptorForStudent,
  generateSyntheticPortraitPixels,
  matchFaceDescriptor,
  normalizeDescriptor,
  validateFaceDescriptor,
} from "@/lib/face-ai";

describe("Milestone 3 Unit: Browser FaceAI Engine & M3 Domain Rules", () => {
  it("normalizes descriptors to unit L2 length and validates 128-float invariants (T2-22)", () => {
    const raw = Array.from({ length: 128 }, (_, i) => (i % 7) - 3);
    const norm = normalizeDescriptor(raw);
    expect(norm.length).toBe(128);
    const l2 = Math.sqrt(norm.reduce((acc, v) => acc + v * v, 0));
    expect(l2).toBeCloseTo(1.0, 4);

    expect(validateFaceDescriptor([]).valid).toBe(false);
    expect(validateFaceDescriptor(new Array(64).fill(0.2)).valid).toBe(false);
    expect(validateFaceDescriptor(new Array(128).fill(0)).valid).toBe(false);
    expect(
      validateFaceDescriptor([undefined, ...new Array(127).fill(0.1)]).valid
    ).toBe(false);
    expect(
      validateFaceDescriptor([Number.NaN, ...new Array(127).fill(0.1)]).valid
    ).toBe(false);
    expect(
      validateFaceDescriptor([
        Number.POSITIVE_INFINITY,
        ...new Array(127).fill(0.1),
      ]).valid
    ).toBe(false);
  });

  it("extracts deterministic 128-float descriptors from synthetic 64x64 RGBA portraits", () => {
    const pixelsA1 = generateSyntheticPortraitPixels("student-alpha", 64, 64);
    const pixelsA2 = generateSyntheticPortraitPixels("student-alpha", 64, 64);
    const pixelsB = generateSyntheticPortraitPixels("student-beta", 64, 64);

    const descA1 = extractDeterministicDescriptorFromPixels(pixelsA1, 64, 64);
    const descA2 = extractDeterministicDescriptorFromPixels(pixelsA2, 64, 64);
    const descB = extractDeterministicDescriptorFromPixels(pixelsB, 64, 64);

    expect(descA1).toEqual(descA2);
    expect(cosineSimilarity(descA1, descA2)).toBeCloseTo(1.0, 5);
    expect(euclideanDistance(descA1, descA2)).toBeCloseTo(0.0, 5);
    expect(cosineSimilarity(descA1, descB)).toBeLessThan(0.5);
  });

  it("enforces aligned Cosine Similarity and Euclidean Distance thresholds on matchFaceDescriptor (T2-23, T2-24)", () => {
    const vec1 = generateSyntheticDescriptorForStudent("M3-STU-01");
    const vec2 = generateSyntheticDescriptorForStudent("M3-STU-02");

    const emptyRes = matchFaceDescriptor(vec1, []);
    expect(emptyRes.matched).toBe(false);
    expect(emptyRes.reason).toBe("NO_ENROLLED_FACES");

    const simThreshold = 0.85;
    const distThreshold = Math.sqrt(Math.max(0, 2 * (1 - simThreshold)));
    const belowRes = matchFaceDescriptor(
      vec2,
      [{ studentId: "s1", descriptor: vec1 }],
      { similarityThreshold: simThreshold, distanceThreshold: distThreshold }
    );
    expect(belowRes.matched).toBe(false);
    expect(belowRes.reason).toBe("BELOW_THRESHOLD");
  });
});
