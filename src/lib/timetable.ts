const TIME_REGEX = /^([01]\d|2[0-3]):([0-5]\d)$/;

export function isValidTimeFormat(time: string): boolean {
  return typeof time === "string" && TIME_REGEX.test(time.trim());
}

export function parseTimeMinutes(time: string): number {
  if (!isValidTimeFormat(time)) {
    throw new Error(`Định dạng giờ không hợp lệ (cần HH:mm): "${time}"`);
  }
  const [hh, mm] = time.trim().split(":").map(Number);
  return hh * 60 + mm;
}

export function validateTimeRange(
  startTime: string,
  endTime: string
): { valid: boolean; error?: string } {
  if (!isValidTimeFormat(startTime) || !isValidTimeFormat(endTime)) {
    return {
      valid: false,
      error: "Giờ học phải có định dạng HH:mm (ví dụ: 18:00)",
    };
  }
  const startMin = parseTimeMinutes(startTime);
  const endMin = parseTimeMinutes(endTime);
  if (endMin <= startMin) {
    return {
      valid: false,
      error: "Giờ kết thúc phải sau giờ bắt đầu",
    };
  }
  return { valid: true };
}

export interface ScheduleSlotCandidate {
  id: string;
  classId: string;
  className?: string;
  dayOfWeek: number; // 0 = Sunday .. 6 = Saturday
  startTime: string; // "HH:mm"
  endTime: string;   // "HH:mm"
  room?: string | null;
}

export type ScheduleConflictType =
  | "TEACHER_OVERLAP"
  | "ROOM_COLLISION"
  | "TEACHER_AND_ROOM";

export interface ScheduleConflict {
  slotA: ScheduleSlotCandidate;
  slotB: ScheduleSlotCandidate;
  dayOfWeek: number;
  overlapStart: string;
  overlapEnd: string;
  type: ScheduleConflictType;
  reason: string;
}

function formatMinutesToTime(minutes: number): string {
  const hh = Math.floor(minutes / 60)
    .toString()
    .padStart(2, "0");
  const mm = (minutes % 60).toString().padStart(2, "0");
  return `${hh}:${mm}`;
}

function normalizeRoom(room: string | null | undefined): string {
  if (!room) return "";
  return room.trim().toLowerCase().replace(/\s+/g, " ");
}

export function detectScheduleConflicts(
  slots: ScheduleSlotCandidate[]
): ScheduleConflict[] {
  const conflicts: ScheduleConflict[] = [];

  for (let i = 0; i < slots.length; i++) {
    for (let j = i + 1; j < slots.length; j++) {
      const a = slots[i];
      const b = slots[j];
      if (a.dayOfWeek !== b.dayOfWeek) continue;
      if (
        !isValidTimeFormat(a.startTime) ||
        !isValidTimeFormat(a.endTime) ||
        !isValidTimeFormat(b.startTime) ||
        !isValidTimeFormat(b.endTime)
      ) {
        continue;
      }

      const startA = parseTimeMinutes(a.startTime);
      const endA = parseTimeMinutes(a.endTime);
      const startB = parseTimeMinutes(b.startTime);
      const endB = parseTimeMinutes(b.endTime);

      if (startA < endB && startB < endA) {
        const overlapStart = formatMinutesToTime(Math.max(startA, startB));
        const overlapEnd = formatMinutesToTime(Math.min(endA, endB));
        const roomA = normalizeRoom(a.room);
        const roomB = normalizeRoom(b.room);
        const sameRoom = roomA !== "" && roomA === roomB;

        const type: ScheduleConflictType = sameRoom
          ? "TEACHER_AND_ROOM"
          : "TEACHER_OVERLAP";

        const labelA = a.className || a.classId;
        const labelB = b.className || b.classId;
        const reason = sameRoom
          ? `Trùng lịch dạy và trùng phòng (${a.room}) giữa "${labelA}" (${a.startTime}-${a.endTime}) và "${labelB}" (${b.startTime}-${b.endTime})`
          : `Trùng giờ dạy của giáo viên giữa "${labelA}" (${a.startTime}-${a.endTime}) và "${labelB}" (${b.startTime}-${b.endTime})`;

        conflicts.push({
          slotA: a,
          slotB: b,
          dayOfWeek: a.dayOfWeek,
          overlapStart,
          overlapEnd,
          type,
          reason,
        });
      }
    }
  }

  return conflicts;
}

export interface GenerateSessionSlotInput {
  id?: string;
  classId: string;
  dayOfWeek: number;
  startTime: string;
  endTime: string;
  room?: string | null;
  classStartDate?: Date | string | null;
  classEndDate?: Date | string | null;
}

export interface GeneratedSessionCandidate {
  classId: string;
  scheduleSlotId?: string;
  sessionDate: Date; // Normalized 00:00:00.000Z UTC date
  dateIso: string;   // "YYYY-MM-DD"
  startTime: string;
  endTime: string;
  room: string | null;
  uniqueKey: string; // `${classId}|${dateIso}|${startTime}`
}

export function normalizeUtcDate(input: Date | string): Date {
  if (typeof input === "string") {
    const trimmed = input.trim();
    if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) {
      return new Date(`${trimmed}T00:00:00.000Z`);
    }
    const parsed = new Date(trimmed);
    if (Number.isNaN(parsed.getTime())) {
      throw new Error(`Ngày không hợp lệ: "${input}"`);
    }
    return new Date(
      Date.UTC(
        parsed.getUTCFullYear(),
        parsed.getUTCMonth(),
        parsed.getUTCDate()
      )
    );
  }
  if (Number.isNaN(input.getTime())) {
    throw new Error("Ngày không hợp lệ");
  }
  return new Date(
    Date.UTC(input.getUTCFullYear(), input.getUTCMonth(), input.getUTCDate())
  );
}

export function formatUtcDateIso(date: Date): string {
  return date.toISOString().slice(0, 10);
}

export function buildSessionUniqueKey(
  classId: string,
  sessionDate: Date | string,
  startTime: string
): string {
  const d = normalizeUtcDate(sessionDate);
  return `${classId}|${formatUtcDateIso(d)}|${startTime.trim()}`;
}

export function generateSessionDates(params: {
  slots: GenerateSessionSlotInput[];
  fromDate: Date | string;
  toDate: Date | string;
  existingSessionKeys?: Set<string> | string[];
}): {
  toCreate: GeneratedSessionCandidate[];
  skippedCount: number;
} {
  const from = normalizeUtcDate(params.fromDate);
  const to = normalizeUtcDate(params.toDate);

  if (from.getTime() > to.getTime()) {
    throw new Error("Ngày bắt đầu không được lớn hơn ngày kết thúc");
  }

  const diffDays =
    Math.round((to.getTime() - from.getTime()) / (1000 * 60 * 60 * 24)) + 1;
  if (diffDays > 366) {
    throw new Error("Khoảng thời gian sinh buổi học tối đa là 366 ngày");
  }

  const seenKeys = new Set<string>(
    params.existingSessionKeys
      ? Array.isArray(params.existingSessionKeys)
        ? params.existingSessionKeys
        : Array.from(params.existingSessionKeys)
      : []
  );

  const toCreate: GeneratedSessionCandidate[] = [];
  let skippedCount = 0;

  for (let dayOffset = 0; dayOffset < diffDays; dayOffset++) {
    const currentDate = new Date(from.getTime() + dayOffset * 86400000);
    const dayOfWeek = currentDate.getUTCDay();
    const dateIso = formatUtcDateIso(currentDate);

    for (const slot of params.slots) {
      if (slot.dayOfWeek !== dayOfWeek) continue;

      if (slot.classStartDate) {
        const classStart = normalizeUtcDate(slot.classStartDate);
        if (currentDate.getTime() < classStart.getTime()) continue;
      }
      if (slot.classEndDate) {
        const classEnd = normalizeUtcDate(slot.classEndDate);
        if (currentDate.getTime() > classEnd.getTime()) continue;
      }

      const uniqueKey = buildSessionUniqueKey(
        slot.classId,
        currentDate,
        slot.startTime
      );

      if (seenKeys.has(uniqueKey)) {
        skippedCount++;
        continue;
      }

      seenKeys.add(uniqueKey);
      toCreate.push({
        classId: slot.classId,
        scheduleSlotId: slot.id,
        sessionDate: currentDate,
        dateIso,
        startTime: slot.startTime.trim(),
        endTime: slot.endTime.trim(),
        room: slot.room ?? null,
        uniqueKey,
      });
    }
  }

  return { toCreate, skippedCount };
}
