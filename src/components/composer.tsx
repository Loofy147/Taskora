import { useEffect, useRef, useState } from "react";
import * as Dialog from "@radix-ui/react-dialog";
import { toast } from "sonner";
import { shiftDay } from "@/lib/format";
import { ME, type Priority, type Status } from "@/lib/types";
import { useApp } from "@/lib/store";
import { cn } from "@/lib/utils";
import { STATUS_LABEL } from "@/components/view-config";

export function Composer() {
  const open = useApp((s) => s.composerOpen);
  const preset = useApp((s) => s.composerStatus);
  const projects = useApp((s) => s.projects);
  const members = useApp((s) => s.members);
  const [title, setTitle] = useState("");
  const [summary, setSummary] = useState("");
  const [description, setDescription] = useState("");
  const [priority, setPriority] = useState<Priority>("medium");
  const [status, setStatus] = useState<Status>("todo");
  const [projectId, setProjectId] = useState("ecom");
  const [due, setDue] = useState(shiftDay(3));
  const [assignees, setAssignees] = useState<string[]>([ME]);
  const wasOpen = useRef(false);

  useEffect(() => {
    if (open && !wasOpen.current) {
      setTitle("");
      setSummary("");
      setDescription("");
      setPriority("medium");
      setStatus(preset);
      setProjectId(projects[0]?.id ?? "ecom");
      setDue(shiftDay(3));
      setAssignees([ME]);
    }
    wasOpen.current = open;
  }, [open, preset, projects]);

  return (
    <Dialog.Root open={open} onOpenChange={(next) => !next && useApp.getState().closeComposer()}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-50 bg-fg/40" />
        <Dialog.Content className="fixed inset-x-3 top-16 bottom-3 z-50 mx-auto flex max-w-lg flex-col overflow-hidden rounded-2xl bg-surface shadow-pop">
          <div className="border-b border-line px-5 py-4">
            <Dialog.Title className="text-lg font-bold">New task</Dialog.Title>
            <Dialog.Description className="mt-1 text-sm text-muted">Add it to the board and assign the people who will move it.</Dialog.Description>
          </div>
          <form
            className="min-h-0 flex-1 space-y-3 overflow-y-auto px-5 py-4"
            onSubmit={(e) => {
              e.preventDefault();
              if (!title.trim()) {
                toast.error("Give the task a title.");
                return;
              }
              useApp.getState().addTask({
                title: title.trim(),
                summary: summary.trim(),
                description: description.trim(),
                status,
                priority,
                projectId,
                due,
                assigneeIds: assignees,
              });
              toast.success("Task added to the board");
            }}
          >
            <label className="block text-sm font-medium">
              Title
              <input required maxLength={160} value={title} onChange={(e) => setTitle(e.target.value)} className="mt-1 h-11 w-full rounded-xl border border-line px-3 text-sm outline-none focus:border-primary" placeholder="What needs doing?" />
            </label>
            <label className="block text-sm font-medium">
              Summary
              <input value={summary} onChange={(e) => setSummary(e.target.value)} className="mt-1 h-11 w-full rounded-xl border border-line px-3 text-sm outline-none focus:border-primary" placeholder="One line the card can show" />
            </label>
            <label className="block text-sm font-medium">
              Description
              <textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={3} className="mt-1 w-full rounded-xl border border-line px-3 py-2 text-sm outline-none focus:border-primary" placeholder="Context, constraints, definition of done" />
            </label>
            <div className="grid gap-3 sm:grid-cols-2">
              <label className="block text-sm font-medium">
                Project
                <select value={projectId} onChange={(e) => setProjectId(e.target.value)} className="mt-1 h-11 w-full rounded-xl border border-line bg-surface px-3 text-sm outline-none focus:border-primary">
                  {projects.map((project) => (
                    <option key={project.id} value={project.id}>
                      {project.name}
                    </option>
                  ))}
                </select>
              </label>
              <label className="block text-sm font-medium">
                Due date
                <input required type="date" value={due} onChange={(e) => setDue(e.target.value)} className="mt-1 h-11 w-full rounded-xl border border-line px-3 text-sm outline-none focus:border-primary" />
              </label>
            </div>
            <fieldset>
              <legend className="text-sm font-medium">Status</legend>
              <div className="mt-1 flex flex-wrap gap-2">
                {(["todo", "progress", "done"] as Status[]).map((item) => (
                  <button key={item} type="button" onClick={() => setStatus(item)} className={cn("min-h-10 rounded-full px-3 text-sm font-semibold", status === item ? "bg-primary text-primary-fg" : "bg-chip text-muted")}>
                    {STATUS_LABEL[item]}
                  </button>
                ))}
              </div>
            </fieldset>
            <fieldset>
              <legend className="text-sm font-medium">Priority</legend>
              <div className="mt-1 flex flex-wrap gap-2">
                {(["high", "medium", "low"] as Priority[]).map((item) => (
                  <button key={item} type="button" onClick={() => setPriority(item)} className={cn("min-h-10 rounded-full px-3 text-sm font-semibold capitalize", priority === item ? "bg-primary text-primary-fg" : "bg-chip text-muted")}>
                    {item}
                  </button>
                ))}
              </div>
            </fieldset>
            <fieldset>
              <legend className="text-sm font-medium">Assignees</legend>
              <div className="mt-1 flex flex-wrap gap-2">
                {members.map((member) => {
                  const on = assignees.includes(member.id);
                  return (
                    <button
                      key={member.id}
                      type="button"
                      aria-pressed={on}
                      onClick={() => setAssignees((current) => (on ? current.filter((id) => id !== member.id) : [...current, member.id]))}
                      className={cn("min-h-10 rounded-full px-3 text-sm", on ? "bg-primary-soft font-semibold text-primary-ink" : "bg-chip text-muted")}
                    >
                      {member.name}
                    </button>
                  );
                })}
              </div>
            </fieldset>
            <div className="flex justify-end gap-2 pt-2">
              <button type="button" onClick={() => useApp.getState().closeComposer()} className="min-h-11 rounded-xl px-4 text-sm font-semibold text-muted hover:bg-chip">
                Cancel
              </button>
              <button type="submit" className="min-h-11 rounded-xl bg-primary px-4 text-sm font-semibold text-primary-fg">
                Create task
              </button>
            </div>
          </form>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

export function DeleteDialog() {
  const id = useApp((s) => s.pendingDeleteId);
  const task = useApp((s) => s.tasks.find((item) => item.id === id));
  return (
    <Dialog.Root open={Boolean(id)} onOpenChange={(next) => !next && useApp.getState().askDelete(null)}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-50 bg-fg/40" />
        <Dialog.Content className="fixed top-1/2 left-1/2 z-50 w-full max-w-sm -translate-x-1/2 -translate-y-1/2 rounded-2xl bg-surface p-5 shadow-pop">
          <Dialog.Title className="text-lg font-bold">Delete this task?</Dialog.Title>
          <Dialog.Description className="mt-2 text-sm text-muted">
            {task ? `“${task.title}” will leave the board. This only affects this browser.` : "This task will leave the board."}
          </Dialog.Description>
          <div className="mt-4 flex justify-end gap-2">
            <button type="button" className="min-h-11 rounded-xl px-4 text-sm font-semibold text-muted hover:bg-chip" onClick={() => useApp.getState().askDelete(null)}>
              Keep it
            </button>
            <button
              type="button"
              className="min-h-11 rounded-xl bg-high-ink px-4 text-sm font-semibold text-primary-fg"
              onClick={() => {
                if (id) {
                  useApp.getState().deleteTask(id);
                  toast.success("Task deleted");
                }
              }}
            >
              Delete
            </button>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
