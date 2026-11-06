import { describe, expect, it } from "vitest";
import {
  detectScheduleConflicts,
  generateSessionDates,
  parseTimeMinutes,
  validateTimeRange,
} from "@/lib/timetable";

describe("src/lib/timetable.ts", () => {
  it("validates HH:mm time strings and rejects endTime <= startTime", () => {
    expect(parseTimeMinutes("18:30")).toBe(1110);
    expect(validateTimeRange("18:00", "19:30").valid).toBe(true);
    expect(validateTimeRange("18:00", "18:00").valid).toBe(false);
    expect(validateTimeRange("19:00", "18:00").valid).toBe(false);
    expect(validateTimeRange("25:00", "26:00").valid).toBe(false);
  });

  it("detects both teacher time overlaps and room collisions on the same dayOfWeek", () => {
    const conflicts = detectScheduleConflicts([
      {
        id: "slot-1",
        classId: "class-a",
        className: "Toán 9A",
        dayOfWeek: 1,
        startTime: "18:00",
        endTime: "19:30",
        room: "Phòng 101",
      },
      {
        id: "slot-2",
        classId: "class-b",
        className: "Toán 9B",
        dayOfWeek: 1,
        startTime: "19:00",
        endTime: "20:30",
        room: "Phòng 102",
      },
      {
        id: "slot-3",
        classId: "class-c",
        className: "Lý 9C",
        dayOfWeek: 1,
        startTime: "18:30",
        endTime: "20:00",
        room: "phòng 101",
      },
    ]);

    expect(conflicts.length).toBe(3);
    expect(conflicts[0].type).toBe("TEACHER_OVERLAP");
    expect(conflicts[0].overlapStart).toBe("19:00");
    expect(conflicts[0].overlapEnd).toBe("19:30");
    expect(conflicts[1].type).toBe("TEACHER_AND_ROOM");
  });

  it("generates session dates idempotently and skips existing (classId, sessionDate, startTime)", () => {
    const slots = [
      {
        id: "slot-mon",
        classId: "class-a",
        dayOfWeek: 1, // Monday
        startTime: "18:00",
        endTime: "19:30",
        room: "P101",
      },
    ];

    // November 2026 has 5 Mondays: Nov 2, 9, 16, 23, 30
    const firstRun = generateSessionDates({
      slots,
      fromDate: "2026-11-01",
      toDate: "2026-11-30",
    });

    expect(firstRun.toCreate.length).toBe(5);
    expect(firstRun.skippedCount).toBe(0);
    expect(firstRun.toCreate.map((s) => s.dateIso)).toEqual([
      "2026-11-02",
      "2026-11-09",
      "2026-11-16",
      "2026-11-23",
      "2026-11-30",
    ]);

    // Second run with existing keys skips all 5
    const secondRun = generateSessionDates({
      slots,
      fromDate: "2026-11-01",
      toDate: "2026-11-30",
      existingSessionKeys: firstRun.toCreate.map((s) => s.uniqueKey),
    });

    expect(secondRun.toCreate.length).toBe(0);
    expect(secondRun.skippedCount).toBe(5);
  });
});
