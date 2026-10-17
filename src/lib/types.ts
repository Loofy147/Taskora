export const ME = "hichem";

export type Status = "todo" | "progress" | "done";
export type Priority = "high" | "medium" | "low";
export type ViewId =
  | "board"
  | "list"
  | "projects"
  | "team"
  | "calendar"
  | "files"
  | "reports"
  | "settings";
export type Scope = "all" | "mine" | "assigned" | "created";
export type Quick = "none" | "mine" | "assigned" | "today" | "overdue" | "high";
export type SortKey = "due" | "priority" | "title" | "created";
export type AttachmentKind = "sheet" | "archive" | "image" | "doc" | "pdf";
export type Tone = "blue" | "green" | "amber" | "rose";

export interface Member {
  id: string;
  name: string;
  role: string;
  title: string;
  email: string;
  tone: number;
}

export interface Project {
  id: string;
  name: string;
  description: string;
  status: "active" | "paused" | "done";
}

export interface Subtask {
  id: string;
  title: string;
  done: boolean;
}

export interface Comment {
  id: string;
  authorId: string;
  body: string;
  at: string;
}

export interface Attachment {
  id: string;
  name: string;
  size: string;
  kind: AttachmentKind;
}

export interface Task {
  id: string;
  title: string;
  summary: string;
  description: string;
  status: Status;
  priority: Priority;
  projectId: string;
  due: string;
  assigneeIds: string[];
  createdById: string;
  icon: string;
  tone: Tone;
  subtasks: Subtask[];
  comments: Comment[];
  attachments: Attachment[];
  createdAt: string;
  rank: number;
}

export interface Notice {
  id: string;
  title: string;
  body: string;
  at: string;
  read: boolean;
  taskId?: string;
}

export interface Settings {
  weekStart: "sun" | "mon";
  density: "comfortable" | "compact";
  digest: boolean;
}
