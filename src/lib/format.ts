import { format, parse } from "date-fns";
import type { Status } from "@/lib/types";

export function shiftDay(offset: number) {
  const d = new Date();
  d.setHours(12, 0, 0, 0);
  d.setDate(d.getDate() + offset);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

export function todayKey() {
  return shiftDay(0);
}

export function stamp(dayOffset: number, hours = 9, minutes = 0) {
  const d = new Date();
  d.setHours(12, 0, 0, 0);
  d.setDate(d.getDate() + dayOffset);
  d.setHours(hours, minutes, 0, 0);
  return d.toISOString();
}

export function isDateKey(value: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const parsed = new Date(`${value}T00:00:00.000Z`);
  return Number.isFinite(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
}

export function formatDay(iso: string, pattern = "MMM d, yyyy") {
  if (!isDateKey(iso)) return "No due date";
  return format(parse(iso, "yyyy-MM-dd", new Date()), pattern);
}

export function formatStamp(iso: string) {
  const date = new Date(iso);
  if (!Number.isFinite(date.getTime())) return "Unknown date";
  return format(date, "MMM d, yyyy HH:mm");
}

export function isOverdue(due: string, status: Status) {
  return isDateKey(due) && status !== "done" && due < todayKey();
}

export function isDueToday(due: string) {
  return due === todayKey();
}
