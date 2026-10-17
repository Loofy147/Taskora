import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { Bar, BarChart, CartesianGrid, Cell, Pie, PieChart, Tooltip, XAxis, YAxis } from "recharts";
import { formatStamp, isOverdue, shiftDay, todayKey } from "@/lib/format";
import { useApp } from "@/lib/store";
import { cn } from "@/lib/utils";

function Page({ title, subtitle, action, children }: { title: string; subtitle: string; action?: ReactNode; children: ReactNode }) {
  return (
    <div className="h-full overflow-y-auto px-3 py-4 lg:px-6 lg:py-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold tracking-tight sm:text-2xl">{title}</h1>
          <p className="mt-1 max-w-2xl text-sm text-muted">{subtitle}</p>
        </div>
        {action}
      </div>
      <div className="mt-4">{children}</div>
    </div>
  );
}


export function ReportsView() {
  const tasks = useApp((s) => s.tasks);
  const members = useApp((s) => s.members);
  const projects = useApp((s) => s.projects);
  const [ready, setReady] = useState(false);
  useEffect(() => setReady(true), []);
  const done = tasks.filter((task) => task.status === "done").length;
  const late = tasks.filter((task) => isOverdue(task.due, task.status)).length;
  const soon = tasks.filter((task) => task.status !== "done" && task.due >= todayKey() && task.due <= shiftDay(7)).length;
  const rate = tasks.length === 0 ? 0 : Math.round((done / tasks.length) * 100);
  const statusData = [
    { name: "To Do", value: tasks.filter((task) => task.status === "todo").length, fill: "var(--color-primary)" },
    { name: "In Progress", value: tasks.filter((task) => task.status === "progress").length, fill: "var(--color-progress-ink)" },
    { name: "Done", value: done, fill: "var(--color-done-ink)" },
  ];
  const people = members.map((member) => ({
    name: member.name.split(" ")[0],
    todo: tasks.filter((task) => task.assigneeIds.includes(member.id) && task.status === "todo").length,
    progress: tasks.filter((task) => task.assigneeIds.includes(member.id) && task.status === "progress").length,
    done: tasks.filter((task) => task.assigneeIds.includes(member.id) && task.status === "done").length,
  }));
  const priority = [
    { name: "High", value: tasks.filter((task) => task.priority === "high").length, fill: "var(--color-high-ink)" },
    { name: "Medium", value: tasks.filter((task) => task.priority === "medium").length, fill: "var(--color-medium-ink)" },
    { name: "Low", value: tasks.filter((task) => task.priority === "low").length, fill: "var(--color-primary)" },
  ];
  const pulse = useMemo(
    () =>
      tasks
        .flatMap((task) => task.comments.map((comment) => ({ ...comment, taskTitle: task.title, taskId: task.id })))
        .sort((a, b) => b.at.localeCompare(a.at))
        .slice(0, 5),
    [tasks],
  );

  return (
    <Page title="Reports" subtitle="A read on load, lateness, and who is carrying what — from the tasks on this board.">
      <div className="grid grid-cols-2 gap-2 lg:grid-cols-4">
        <Kpi label="Completion" value={`${rate}%`} />
        <Kpi label="Overdue" value={String(late)} warn={late > 0} />
        <Kpi label="Due in 7 days" value={String(soon)} />
        <Kpi label="Active projects" value={String(projects.filter((project) => project.status === "active").length)} />
      </div>
      <div className="mt-4 grid gap-3 lg:grid-cols-2">
        <ChartCard title="Tasks by status">
          {ready && (
            <ChartBox>
              {(width) => (
                <BarChart width={width} height={220} data={statusData}>
                  <CartesianGrid vertical={false} stroke="var(--color-line)" />
                  <XAxis dataKey="name" tick={{ fill: "var(--color-muted)", fontSize: 12 }} axisLine={false} tickLine={false} />
                  <YAxis allowDecimals={false} tick={{ fill: "var(--color-muted)", fontSize: 12 }} axisLine={false} tickLine={false} width={28} />
                  <Tooltip cursor={{ fill: "var(--color-chip)" }} contentStyle={{ borderRadius: 12, borderColor: "var(--color-line)", fontSize: 12 }} />
                  <Bar dataKey="value" radius={[8, 8, 0, 0]}>
                    {statusData.map((entry) => (
                      <Cell key={entry.name} fill={entry.fill} />
                    ))}
                  </Bar>
                </BarChart>
              )}
            </ChartBox>
          )}
        </ChartCard>
        <ChartCard title="Priority mix">
          {ready && (
            <ChartBox>
              {(width) => (
                <PieChart width={width} height={220}>
                  <Pie data={priority} dataKey="value" nameKey="name" innerRadius={52} outerRadius={80} paddingAngle={3}>
                    {priority.map((entry) => (
                      <Cell key={entry.name} fill={entry.fill} />
                    ))}
                  </Pie>
                  <Tooltip contentStyle={{ borderRadius: 12, borderColor: "var(--color-line)", fontSize: 12 }} />
                </PieChart>
              )}
            </ChartBox>
          )}
          <ul className="mt-2 flex justify-center gap-3 text-xs text-muted">
            {priority.map((item) => (
              <li key={item.name} className="flex items-center gap-1">
                <span className="size-2 rounded-full" style={{ background: item.fill }} />
                {item.name} {item.value}
              </li>
            ))}
          </ul>
        </ChartCard>
      </div>
      <div className="mt-3">
        <ChartCard title="Load by teammate">
          {ready && (
            <ChartBox>
              {(width) => (
                <BarChart width={width} height={240} data={people}>
                  <CartesianGrid vertical={false} stroke="var(--color-line)" />
                  <XAxis dataKey="name" tick={{ fill: "var(--color-muted)", fontSize: 12 }} axisLine={false} tickLine={false} />
                  <YAxis allowDecimals={false} tick={{ fill: "var(--color-muted)", fontSize: 12 }} axisLine={false} tickLine={false} width={28} />
                  <Tooltip contentStyle={{ borderRadius: 12, borderColor: "var(--color-line)", fontSize: 12 }} />
                  <Bar dataKey="todo" stackId="a" fill="var(--color-primary)" />
                  <Bar dataKey="progress" stackId="a" fill="var(--color-progress-ink)" />
                  <Bar dataKey="done" stackId="a" fill="var(--color-done-ink)" radius={[6, 6, 0, 0]} />
                </BarChart>
              )}
            </ChartBox>
          )}
        </ChartCard>
      </div>
      <div className="mt-3 rounded-2xl border border-line bg-surface p-4">
        <h2 className="font-semibold">Latest comments</h2>
        <ul className="mt-3 divide-y divide-line">
          {pulse.length === 0 && <li className="py-3 text-sm text-muted">No comments yet.</li>}
          {pulse.map((item) => (
            <li key={item.id}>
              <button type="button" onClick={() => useApp.getState().selectTask(item.taskId)} className="w-full py-3 text-left">
                <span className="text-xs text-faint">{formatStamp(item.at)} · {item.taskTitle}</span>
                <span className="mt-1 block text-sm">{item.body}</span>
              </button>
            </li>
          ))}
        </ul>
      </div>
    </Page>
  );
}

function Kpi({ label, value, warn = false }: { label: string; value: string; warn?: boolean }) {
  return (
    <div className="rounded-2xl border border-line bg-surface px-4 py-3">
      <p className="text-xs text-muted">{label}</p>
      <p className={cn("mt-1 text-2xl font-bold", warn && "text-high-ink")}>{value}</p>
    </div>
  );
}

function ChartCard({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="rounded-2xl border border-line bg-surface p-4">
      <h2 className="mb-2 font-semibold">{title}</h2>
      {children}
    </section>
  );
}

function ChartBox({ children }: { children: (width: number) => ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(0);
  useEffect(() => {
    const node = ref.current;
    if (!node) return;
    const measure = () => setWidth(node.clientWidth);
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(node);
    return () => observer.disconnect();
  }, []);
  return (
    <div ref={ref} className="h-56 w-full">
      {width > 0 ? children(width) : null}
    </div>
  );
}

