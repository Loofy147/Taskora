import {
  AlertCircle,
  BarChart3,
  Calendar,
  Files,
  FolderKanban,
  LayoutDashboard,
  ListTodo,
  Settings,
  Star,
  UserRound,
  Users,
  type LucideIcon,
} from "lucide-react";
import type { Status, ViewId } from "@/lib/types";

/** Shared view labels and navigation data stay outside component modules. */
export const STATUS_LABEL: Record<Status, string> = {
  todo: "To Do",
  progress: "In Progress",
  done: "Done",
};

export const NAV: { id: ViewId; label: string; icon: LucideIcon }[] = [
  { id: "board", label: "Dashboard", icon: LayoutDashboard },
  { id: "list", label: "Tasks", icon: ListTodo },
  { id: "projects", label: "Projects", icon: FolderKanban },
  { id: "team", label: "Team", icon: Users },
  { id: "calendar", label: "Calendar", icon: Calendar },
  { id: "files", label: "Files", icon: Files },
  { id: "reports", label: "Reports", icon: BarChart3 },
  { id: "settings", label: "Settings", icon: Settings },
];

export const QUICKS: { id: "mine" | "assigned" | "today" | "overdue" | "high"; label: string; icon: LucideIcon; countClass: string }[] = [
  { id: "mine", label: "My Tasks", icon: UserRound, countClass: "text-primary" },
  { id: "assigned", label: "Assigned to Me", icon: Users, countClass: "text-primary-ink" },
  { id: "today", label: "Today", icon: Calendar, countClass: "text-done-ink" },
  { id: "overdue", label: "Overdue", icon: AlertCircle, countClass: "text-high-ink" },
  { id: "high", label: "High Priority", icon: Star, countClass: "text-medium-ink" },
];
