import { useRef, useState, type ReactNode } from "react";
import { ArrowLeft, Calendar, CheckCircle2, Folder, MoreHorizontal, Plus, Send, Trash2, UserRound, X } from "lucide-react";
import * as DropdownMenu from "@radix-ui/react-dropdown-menu";
import { toast } from "sonner";
import { Avatar, AvatarStack, FileGlyph, Meter, PriorityPill, STATUS_LABEL, TaskGlyph } from "@/components/bits";
import { formatStamp } from "@/lib/format";
import { ME, type Priority, type Status } from "@/lib/types";
import { useApp } from "@/lib/store";
import { cn } from "@/lib/utils";

export function DetailsPanel() {
  const open = useApp((s) => s.detailsOpen);
  const task = useApp((s) => s.tasks.find((item) => item.id === s.selectedId));
  if (!open || !task) return null;
  return (
    <>
      <button type="button" className="fixed inset-0 z-30 bg-fg/30 lg:hidden" aria-label="Close task details" onClick={() => useApp.getState().setDetailsOpen(false)} />
      <aside className="fixed inset-0 z-40 flex w-full flex-col bg-surface lg:static lg:z-auto lg:w-96 lg:shrink-0 lg:border-l lg:border-line">
        <DetailsBody />
      </aside>
    </>
  );
}

function DetailsBody() {
  const task = useApp((s) => s.tasks.find((item) => item.id === s.selectedId));
  const projects = useApp((s) => s.projects);
  const members = useApp((s) => s.members);
  const fileRef = useRef<HTMLInputElement>(null);
  const [sub, setSub] = useState("");
  const [comment, setComment] = useState("");
  if (!task) return null;
  const project = projects.find((item) => item.id === task.projectId);
  const creator = members.find((item) => item.id === task.createdById);
  const done = task.subtasks.filter((item) => item.done).length;

  return (
    <>
      <header className="flex items-center gap-2 border-b border-line px-3 py-2">
        <button type="button" className="grid size-11 place-items-center rounded-xl text-muted hover:bg-chip" aria-label="Close details" onClick={() => useApp.getState().setDetailsOpen(false)}>
          <ArrowLeft className="size-5" />
        </button>
        <h2 className="flex-1 text-sm font-semibold">Task Details</h2>
        <DropdownMenu.Root>
          <DropdownMenu.Trigger className="grid size-11 place-items-center rounded-xl text-muted hover:bg-chip" aria-label="Task actions">
            <MoreHorizontal className="size-5" />
          </DropdownMenu.Trigger>
          <DropdownMenu.Portal>
            <DropdownMenu.Content align="end" className="z-50 min-w-40 rounded-xl border border-line bg-surface p-1 shadow-pop">
              <DropdownMenu.Item onSelect={() => useApp.getState().duplicateTask(task.id)} className="cursor-pointer rounded-lg px-3 py-2 text-sm outline-none data-highlighted:bg-chip">
                Duplicate
              </DropdownMenu.Item>
              <DropdownMenu.Item onSelect={() => useApp.getState().askDelete(task.id)} className="cursor-pointer rounded-lg px-3 py-2 text-sm text-high-ink outline-none data-highlighted:bg-high">
                Delete task
              </DropdownMenu.Item>
            </DropdownMenu.Content>
          </DropdownMenu.Portal>
        </DropdownMenu.Root>
      </header>

      <div className="min-h-0 flex-1 overflow-y-auto px-4 py-4">
        <div className="flex items-start gap-3">
          <TaskGlyph task={task} />
          <div className="min-w-0 flex-1">
            <div className="flex items-start justify-between gap-2">
              <input
                value={task.title}
                aria-label="Task title"
                onChange={(e) => useApp.getState().updateTask(task.id, { title: e.target.value })}
                className="w-full bg-transparent text-base font-bold outline-none"
              />
              <PriorityPill priority={task.priority} />
            </div>
            <textarea
              value={task.summary}
              aria-label="Summary"
              rows={2}
              onChange={(e) => useApp.getState().updateTask(task.id, { summary: e.target.value })}
              className="mt-1 w-full resize-none bg-transparent text-sm text-muted outline-none"
            />
          </div>
        </div>

        <dl className="mt-4 divide-y divide-line border-y border-line">
          <Row icon={<Folder className="size-4" />} label="Project">
            <select
              aria-label="Project"
              value={task.projectId}
              onChange={(e) => useApp.getState().updateTask(task.id, { projectId: e.target.value })}
              className="max-w-44 bg-transparent text-right text-sm font-medium text-primary outline-none"
            >
              {projects.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.name}
                </option>
              ))}
            </select>
          </Row>
          <Row icon={<Calendar className="size-4" />} label="Due Date">
            <input
              type="date"
              aria-label="Due date"
              value={task.due}
              onChange={(e) => e.target.value && useApp.getState().updateTask(task.id, { due: e.target.value })}
              className="bg-transparent text-right text-sm font-medium outline-none"
            />
          </Row>
          <Row icon={<UserRound className="size-4" />} label="Assigned To">
            <AvatarStack ids={task.assigneeIds} members={members} />
          </Row>
          <Row icon={<UserRound className="size-4" />} label="Created By">
            <span className="inline-flex items-center gap-2 text-sm font-medium">
              <Avatar member={creator} />
              {creator?.name}
            </span>
          </Row>
          <Row icon={<CheckIcon />} label="Status">
            <select
              aria-label="Status"
              value={task.status}
              onChange={(e) => useApp.getState().moveTask(task.id, e.target.value as Status)}
              className="bg-transparent text-right text-sm font-semibold outline-none"
            >
              {(Object.keys(STATUS_LABEL) as Status[]).map((status) => (
                <option key={status} value={status}>
                  {STATUS_LABEL[status]}
                </option>
              ))}
            </select>
          </Row>
        </dl>

        <div className="mt-4">
          <p className="text-sm font-semibold">Assign</p>
          <div className="mt-2 flex flex-wrap gap-2">
            {members.map((member) => {
              const on = task.assigneeIds.includes(member.id);
              return (
                <button
                  key={member.id}
                  type="button"
                  aria-pressed={on}
                  onClick={() => {
                    const assigneeIds = on ? task.assigneeIds.filter((id) => id !== member.id) : [...task.assigneeIds, member.id];
                    useApp.getState().updateTask(task.id, { assigneeIds });
                  }}
                  className={cn(
                    "inline-flex min-h-10 items-center gap-2 rounded-full px-2 pr-3 text-sm",
                    on ? "bg-primary-soft font-semibold text-primary-ink" : "bg-chip text-muted",
                  )}
                >
                  <Avatar member={member} />
                  {member.name.split(" ")[0]}
                </button>
              );
            })}
          </div>
        </div>

        <div className="mt-4">
          <p className="text-sm font-semibold">Priority</p>
          <div className="mt-2 flex flex-wrap gap-2">
            {(["high", "medium", "low"] as Priority[]).map((priority) => (
              <button
                key={priority}
                type="button"
                onClick={() => useApp.getState().updateTask(task.id, { priority })}
                className={cn("min-h-10 rounded-full px-1", task.priority === priority ? "ring-2 ring-primary ring-offset-2 ring-offset-surface" : "opacity-80")}
              >
                <PriorityPill priority={priority} />
              </button>
            ))}
          </div>
        </div>

        <div className="mt-5">
          <p className="text-sm font-semibold">Description</p>
          <textarea
            value={task.description}
            aria-label="Description"
            rows={4}
            onChange={(e) => useApp.getState().updateTask(task.id, { description: e.target.value })}
            className="mt-2 w-full resize-none rounded-xl border border-line bg-chip px-3 py-2 text-sm leading-relaxed outline-none focus:border-primary focus:bg-surface"
          />
        </div>

        <div className="mt-5">
          <div className="flex items-center justify-between">
            <p className="text-sm font-semibold">Subtasks</p>
            <span className="text-xs font-semibold text-muted">
              {done}/{task.subtasks.length}
            </span>
          </div>
          <div className="mt-2">
            <Meter value={done} max={task.subtasks.length} />
          </div>
          <ul className="mt-3 space-y-1">
            {task.subtasks.map((item) => (
              <li key={item.id} className="flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={item.done}
                  onChange={() => useApp.getState().toggleSubtask(task.id, item.id)}
                  className="size-4 accent-primary"
                  aria-label={item.title}
                />
                <span className={cn("flex-1 text-sm", item.done && "text-faint line-through")}>{item.title}</span>
                <button type="button" aria-label={`Remove ${item.title}`} className="grid size-8 place-items-center text-faint hover:text-high-ink" onClick={() => useApp.getState().removeSubtask(task.id, item.id)}>
                  <X className="size-3.5" />
                </button>
              </li>
            ))}
          </ul>
          <form
            className="mt-2 flex gap-2"
            onSubmit={(e) => {
              e.preventDefault();
              useApp.getState().addSubtask(task.id, sub);
              setSub("");
            }}
          >
            <input
              value={sub}
              onChange={(e) => setSub(e.target.value)}
              placeholder="Add a subtask"
              className="h-11 min-w-0 flex-1 rounded-xl border border-line bg-surface px-3 text-sm outline-none focus:border-primary"
            />
            <button type="submit" className="grid size-11 place-items-center rounded-xl bg-chip text-fg" aria-label="Add subtask">
              <Plus className="size-4" />
            </button>
          </form>
        </div>

        <div className="mt-5">
          <div className="flex items-center justify-between">
            <p className="text-sm font-semibold">File references</p>
            <button type="button" className="text-xs font-semibold text-primary" onClick={() => fileRef.current?.click()}>
              Add file
            </button>
            <input
              ref={fileRef}
              type="file"
              className="hidden"
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (!file) return;
                useApp.getState().addAttachment(task.id, file);
                toast.success(`Added a local reference for ${file.name}`);
                e.target.value = "";
              }}
            />
          </div>
          <p className="mt-2 text-xs text-muted">Prototype limitation: only file names and sizes are stored. File contents are not uploaded or shared.</p>
          {task.attachments.length === 0 && <p className="mt-2 text-xs text-faint">No file references yet.</p>}
          <ul className="mt-2 flex flex-wrap gap-2">
            {task.attachments.map((file) => (
              <li key={file.id} className="flex items-center gap-2 rounded-xl border border-line bg-chip px-2 py-2">
                <FileGlyph kind={file.kind} />
                <span>
                  <span className="block max-w-36 truncate text-xs font-semibold">{file.name}</span>
                  <span className="block text-xs text-faint">{file.size}</span>
                </span>
                <button type="button" aria-label={`Remove ${file.name}`} className="grid size-8 place-items-center text-faint hover:text-high-ink" onClick={() => useApp.getState().removeAttachment(task.id, file.id)}>
                  <Trash2 className="size-3.5" />
                </button>
              </li>
            ))}
          </ul>
        </div>

        <div className="mt-5">
          <p className="text-sm font-semibold">Comments</p>
          <ul className="mt-3 space-y-3">
            {task.comments.length === 0 && <li className="text-xs text-faint">Start the thread.</li>}
            {task.comments.map((item) => {
              const author = members.find((member) => member.id === item.authorId);
              return (
                <li key={item.id} className="flex gap-2">
                  <Avatar member={author} size="md" />
                  <div>
                    <p className="text-sm">
                      <span className="font-semibold">{author?.name}</span>{" "}
                      <span className="text-xs text-faint">{formatStamp(item.at)}</span>
                    </p>
                    <p className="mt-0.5 text-sm text-muted">{item.body}</p>
                  </div>
                </li>
              );
            })}
          </ul>
        </div>
      </div>

      <form
        className="flex items-center gap-2 border-t border-line p-3"
        onSubmit={(e) => {
          e.preventDefault();
          useApp.getState().addComment(task.id, comment);
          setComment("");
        }}
      >
        <Avatar member={members.find((member) => member.id === ME)} />
        <input
          value={comment}
          onChange={(e) => setComment(e.target.value)}
          placeholder="Write a comment..."
          className="h-11 min-w-0 flex-1 rounded-xl border border-line bg-chip px-3 text-sm outline-none focus:border-primary focus:bg-surface"
        />
        <button type="submit" className="grid size-11 place-items-center rounded-xl bg-primary text-primary-fg" aria-label="Send comment">
          <Send className="size-4" />
        </button>
      </form>
    </>
  );
}

function Row({ icon, label, children }: { icon: ReactNode; label: string; children: ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-3 py-2.5">
      <dt className="flex items-center gap-2 text-sm text-muted">
        {icon}
        {label}
      </dt>
      <dd className="min-w-0">{children}</dd>
    </div>
  );
}

function CheckIcon() {
  return <CheckCircle2 className="size-4" />;
}
