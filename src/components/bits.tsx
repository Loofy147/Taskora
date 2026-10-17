import {
  BarChart3,
  CalendarDays,
  CheckCircle2,
  ClipboardCheck,
  Code,
  Database,
  FileArchive,
  FileSpreadsheet,
  FileText,
  Files,
  Headphones,
  Heart,
  Image,
  Megaphone,
  Package,
  PenLine,
  Share2,
  ShoppingCart,
  Users,
  Wallet,
  type LucideIcon,
} from "lucide-react";
import type { AttachmentKind, Member, Priority, Status, Task, Tone } from "@/lib/types";
import { STATUS_LABEL } from "@/components/view-config";
import { cn, initials } from "@/lib/utils";

const tones = ["bg-primary", "bg-done-ink", "bg-progress-ink", "bg-high-ink"];

export function Logo({ compact = false }: { compact?: boolean }) {
  return (
    <div className="flex items-center gap-2.5">
      <span className="grid size-9 shrink-0 place-items-center rounded-xl bg-primary text-primary-fg shadow-card">
        <ClipboardCheck className="size-5" />
      </span>
      <span className={cn("min-w-0", compact && "sr-only sm:not-sr-only sm:block")}>
        <span className="block text-sm font-extrabold leading-none tracking-tight">Taskora</span>
        <span className="mt-1 hidden text-xs text-faint sm:block">Plan · Collaborate · Get It Done</span>
      </span>
    </div>
  );
}

export function Avatar({ member, size = "sm" }: { member?: Member; size?: "sm" | "md" | "lg" }) {
  const box = size === "lg" ? "size-10 text-sm" : size === "md" ? "size-8 text-xs" : "size-6 text-xs";
  return (
    <span
      title={member?.name ?? "Unassigned"}
      className={cn(
        "grid shrink-0 place-items-center rounded-full font-semibold text-primary-fg ring-2 ring-surface",
        box,
        tones[(member?.tone ?? 0) % tones.length],
      )}
    >
      {initials(member?.name || "?")}
    </span>
  );
}

export function AvatarStack({ ids, members }: { ids: string[]; members: Member[] }) {
  const shown = ids.slice(0, 3);
  const extra = ids.length - shown.length;
  if (shown.length === 0) return <span className="text-xs text-faint">Unassigned</span>;
  return (
    <span className="flex items-center">
      <span className="flex -space-x-1.5">
        {shown.map((id) => (
          <Avatar key={id} member={members.find((m) => m.id === id)} />
        ))}
      </span>
      {extra > 0 && (
        <span className="ml-1 grid size-6 place-items-center rounded-full bg-chip text-xs font-semibold text-muted ring-2 ring-surface">
          +{extra}
        </span>
      )}
    </span>
  );
}

const priorityStyle: Record<Priority, string> = {
  high: "bg-high text-high-ink",
  medium: "bg-medium text-medium-ink",
  low: "bg-low text-low-ink",
};

export function PriorityPill({ priority }: { priority: Priority }) {
  return (
    <span className={cn("inline-flex rounded-full px-2 py-0.5 text-xs font-semibold capitalize", priorityStyle[priority])}>
      {priority}
    </span>
  );
}

const statusStyle: Record<Status, string> = {
  todo: "bg-todo text-todo-ink",
  progress: "bg-progress text-progress-ink",
  done: "bg-done text-done-ink",
};

export function StatusPill({ status }: { status: Status }) {
  return (
    <span className={cn("inline-flex rounded-full px-2.5 py-1 text-xs font-semibold", statusStyle[status])}>
      {STATUS_LABEL[status]}
    </span>
  );
}

const iconMap: Record<string, LucideIcon> = {
  cart: ShoppingCart,
  chart: BarChart3,
  users: Users,
  image: Image,
  package: Package,
  heart: Heart,
  code: Code,
  megaphone: Megaphone,
  headset: Headphones,
  wallet: Wallet,
  check: CheckCircle2,
  pen: PenLine,
  share: Share2,
  database: Database,
  calendar: CalendarDays,
  clipboard: ClipboardCheck,
};

const toneClass: Record<Tone, string> = {
  blue: "bg-primary-soft text-primary",
  green: "bg-done text-done-ink",
  amber: "bg-medium text-medium-ink",
  rose: "bg-high text-high-ink",
};

export function TaskGlyph({ task }: { task: Task }) {
  if (task.status === "done") {
    return (
      <span className="grid size-8 shrink-0 place-items-center rounded-lg bg-done text-done-ink">
        <CheckCircle2 className="size-4" />
      </span>
    );
  }
  const Icon = iconMap[task.icon] ?? ClipboardCheck;
  return (
    <span className={cn("grid size-8 shrink-0 place-items-center rounded-lg", toneClass[task.tone])}>
      <Icon className="size-4" />
    </span>
  );
}

const fileTone: Record<AttachmentKind, string> = {
  sheet: "bg-done text-done-ink",
  archive: "bg-primary-soft text-primary",
  image: "bg-high text-high-ink",
  pdf: "bg-medium text-medium-ink",
  doc: "bg-progress text-progress-ink",
};

export function FileGlyph({ kind }: { kind: AttachmentKind }) {
  const Icon = kind === "sheet" ? FileSpreadsheet : kind === "archive" ? FileArchive : kind === "image" ? Image : FileText;
  return (
    <span className={cn("grid size-8 shrink-0 place-items-center rounded-lg", fileTone[kind])}>
      <Icon className="size-4" />
    </span>
  );
}

export function Meter({ value, max }: { value: number; max: number }) {
  const pct = max === 0 ? 0 : Math.round((value / max) * 100);
  return (
    <div className="h-1.5 overflow-hidden rounded-full bg-chip" aria-hidden>
      <div className="h-full rounded-full bg-primary" style={{ width: `${pct}%` }} />
    </div>
  );
}

