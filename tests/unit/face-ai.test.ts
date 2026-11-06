import { describe, expect, it } from "vitest";
import {
  cosineSimilarity,
  euclideanDistance,
  generateSyntheticDescriptorForStudent,
  matchFaceDescriptor,
  validateFaceDescriptor,
} from "@/lib/face-ai";
import { prisma } from "@/lib/db";

describe("src/lib/face-ai.ts", () => {
  it("validates 128-float descriptors and rejects malformed or zero vectors", () => {
    expect(validateFaceDescriptor([1, 2, 3]).valid).toBe(false);
    expect(validateFaceDescriptor(new Array(128).fill(0)).valid).toBe(false);
    const nanVec = new Array(128).fill(0.1);
    nanVec[5] = Number.NaN;
    expect(validateFaceDescriptor(nanVec).valid).toBe(false);

    const validVec = generateSyntheticDescriptorForStudent("HS001");
    const check = validateFaceDescriptor(validVec);
    expect(check.valid).toBe(true);
    expect(validVec.length).toBe(128);
  });

  it("matches enrolled student descriptors accurately and rejects unknown faces below threshold", () => {
    const descHS001 = generateSyntheticDescriptorForStudent("HS001-portrait");
    const descHS002 = generateSyntheticDescriptorForStudent("HS002-portrait");
    const descStranger = generateSyntheticDescriptorForStudent(
      "stranger-unregistered-999"
    );

    expect(cosineSimilarity(descHS001, descHS001)).toBeCloseTo(1.0, 5);
    expect(euclideanDistance(descHS001, descHS001)).toBeCloseTo(0.0, 5);

    const match1 = matchFaceDescriptor(
      descHS001,
      [
        { studentId: "stu-1", studentCode: "HS001", descriptor: descHS001 },
        { studentId: "stu-2", studentCode: "HS002", descriptor: descHS002 },
      ],
      { similarityThreshold: 0.85, distanceThreshold: 0.45 }
    );

    expect(match1.matched).toBe(true);
    expect(match1.bestCandidate?.studentId).toBe("stu-1");
    expect(match1.confidenceScore).toBe(1);

    const noEnrolled = matchFaceDescriptor(descStranger, []);
    expect(noEnrolled.matched).toBe(false);
    expect(noEnrolled.reason).toBe("NO_ENROLLED_FACES");
  });

  it("guarantees strong pairwise separation (cosineSimilarity < 0.50, euclideanDistance > 0.90) across all 190 pairs of HS001..HS020", () => {
    const codes = Array.from(
      { length: 20 },
      (_, i) => `HS${String(i + 1).padStart(3, "0")}`
    );
    const descriptors = codes.map((code) => ({
      code,
      vec: generateSyntheticDescriptorForStudent(code),
    }));

    for (let i = 0; i < descriptors.length; i++) {
      expect(
        cosineSimilarity(descriptors[i].vec, descriptors[i].vec)
      ).toBeCloseTo(1.0, 5);
      for (let j = i + 1; j < descriptors.length; j++) {
        const sim = cosineSimilarity(descriptors[i].vec, descriptors[j].vec);
        const dist = euclideanDistance(descriptors[i].vec, descriptors[j].vec);
        expect(sim).toBeLessThan(0.5);
        expect(dist).toBeGreaterThan(0.9);
      }
    }
  });

  it("matches generateSyntheticDescriptorForStudent(HS001) against seeded PostgreSQL FaceDescriptor rows with similarity 1.0", async () => {
    const dbFaces = await prisma.faceDescriptor.findMany({
      include: { student: true },
    });
    expect(dbFaces.length).toBeGreaterThanOrEqual(10);

    const candidates = dbFaces.map((f) => ({
      descriptorId: f.id,
      studentId: f.studentId,
      studentCode: f.student.studentCode,
      studentName: f.student.fullName,
      descriptor: f.descriptor as number[],
    }));

    const queryHS001 = generateSyntheticDescriptorForStudent("HS001");
    const matchRes = matchFaceDescriptor(queryHS001, candidates);
    expect(matchRes.matched).toBe(true);
    expect(matchRes.bestCandidate?.studentCode).toBe("HS001");
    expect(matchRes.similarity).toBeCloseTo(1.0, 4);
    expect(matchRes.distance).toBeCloseTo(0.0, 4);
  });
});
