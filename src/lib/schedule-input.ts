export type ScheduleInterval = {
  startsAt: string;
  endsAt: string;
  timeZone: string;
};

export type ScheduleIntervalResult =
  | { ok: true; schedule: ScheduleInterval | null }
  | { ok: false; message: string };

type LocalDateTimeParts = {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
};

export function browserTimeZone(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
  } catch {
    return "UTC";
  }
}

function parseLocalDateTime(value: string): LocalDateTimeParts | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/.exec(value);
  if (!match) return null;
  const [, yearRaw, monthRaw, dayRaw, hourRaw, minuteRaw] = match;
  const parts = {
    year: Number(yearRaw),
    month: Number(monthRaw),
    day: Number(dayRaw),
    hour: Number(hourRaw),
    minute: Number(minuteRaw),
  };
  if (parts.month < 1 || parts.month > 12 || parts.day < 1 || parts.day > 31 || parts.hour > 23 || parts.minute > 59) return null;

  // setUTCFullYear avoids Date.UTC's special handling of years 0–99.
  const candidate = new Date(0);
  candidate.setUTCFullYear(parts.year, parts.month - 1, parts.day);
  candidate.setUTCHours(parts.hour, parts.minute, 0, 0);
  if (
    candidate.getUTCFullYear() !== parts.year ||
    candidate.getUTCMonth() + 1 !== parts.month ||
    candidate.getUTCDate() !== parts.day ||
    candidate.getUTCHours() !== parts.hour ||
    candidate.getUTCMinutes() !== parts.minute
  ) return null;
  return parts;
}

function wallClockEpoch(parts: LocalDateTimeParts): number {
  const value = new Date(0);
  value.setUTCFullYear(parts.year, parts.month - 1, parts.day);
  value.setUTCHours(parts.hour, parts.minute, 0, 0);
  return value.getTime();
}

function formatterFor(timeZone: string): Intl.DateTimeFormat {
  return new Intl.DateTimeFormat("en-US", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  });
}

function partsForInstant(formatter: Intl.DateTimeFormat, instant: Date): LocalDateTimeParts | null {
  const values: Record<string, number> = {};
  for (const part of formatter.formatToParts(instant)) {
    if (["year", "month", "day", "hour", "minute"].includes(part.type)) values[part.type] = Number(part.value);
  }
  if (!["year", "month", "day", "hour", "minute"].every((key) => Number.isInteger(values[key]))) return null;
  return { year: values.year, month: values.month, day: values.day, hour: values.hour, minute: values.minute };
}

function sameWallClock(left: LocalDateTimeParts | null, right: LocalDateTimeParts): boolean {
  return Boolean(left && left.year === right.year && left.month === right.month && left.day === right.day && left.hour === right.hour && left.minute === right.minute);
}

/**
 * Convert a datetime-local value using its IANA timezone. Times skipped or repeated
 * by a daylight-saving transition are rejected rather than silently guessed.
 */
function resolveLocalDateTime(value: string, timeZone: string): Date | null {
  const parts = parseLocalDateTime(value);
  if (!parts) return null;
  const wallEpoch = wallClockEpoch(parts);
  let formatter: Intl.DateTimeFormat;
  try {
    formatter = formatterFor(timeZone);
  } catch {
    return null;
  }

  // Sample offsets around the target to capture timezone regimes on both sides
  // of an adjacent transition. The candidate check below determines uniqueness.
  const offsets = new Set<number>();
  const sixHours = 6 * 60 * 60 * 1000;
  for (let delta = -36 * 60 * 60 * 1000; delta <= 36 * 60 * 60 * 1000; delta += sixHours) {
    const sample = new Date(wallEpoch + delta);
    const wall = partsForInstant(formatter, sample);
    if (!wall) return null;
    offsets.add(wallClockEpoch(wall) - sample.getTime());
  }

  const matches = new Map<number, Date>();
  for (const offset of offsets) {
    const epoch = wallEpoch - offset;
    const instant = new Date(epoch);
    if (sameWallClock(partsForInstant(formatter, instant), parts)) matches.set(epoch, instant);
  }
  return matches.size === 1 ? [...matches.values()][0] : null;
}

export function buildScheduleInterval(startValue: string, endValue: string, timeZone: string): ScheduleIntervalResult {
  if (!startValue && !endValue) return { ok: true, schedule: null };
  if (!startValue || !endValue) {
    return { ok: false, message: "Enter both a schedule start and end, or leave both empty." };
  }
  try {
    formatterFor(timeZone);
  } catch {
    return { ok: false, message: "The browser timezone is not valid. Refresh and try again." };
  }

  const start = resolveLocalDateTime(startValue, timeZone);
  const end = resolveLocalDateTime(endValue, timeZone);
  if (!start || !end) {
    return { ok: false, message: "Enter valid unambiguous local dates and times; times skipped or repeated by timezone changes cannot be scheduled." };
  }
  if (end.getTime() <= start.getTime()) {
    return { ok: false, message: "Schedule end must be later than its start." };
  }
  return { ok: true, schedule: { startsAt: start.toISOString(), endsAt: end.toISOString(), timeZone } };
}

export function formatScheduledInstant(instant: string, timeZone: string): string {
  try {
    return new Intl.DateTimeFormat(undefined, { dateStyle: "medium", timeStyle: "short", timeZone }).format(new Date(instant));
  } catch {
    return instant;
  }
}
