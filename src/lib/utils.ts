import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function initials(name: string) {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0].slice(0, 1).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

export function formatBytes(n: number) {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / (1024 * 1024)).toFixed(1)} MB`;
}

export function kindFromName(name: string): "sheet" | "archive" | "image" | "doc" | "pdf" {
  const ext = name.split(".").pop()?.toLowerCase() ?? "";
  if (ext === "xls" || ext === "xlsx" || ext === "csv") return "sheet";
  if (ext === "zip" || ext === "rar" || ext === "7z") return "archive";
  if (["png", "jpg", "jpeg", "gif", "webp", "svg"].includes(ext)) return "image";
  if (ext === "pdf") return "pdf";
  return "doc";
}
