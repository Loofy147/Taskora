import { ME, type Member, type Notice, type Project, type Settings, type Task } from "./types.ts";
import { PORTFOLIO_PROJECTS, PORTFOLIO_TASKS, describePortfolioProject, describePortfolioTask } from "./portfolio-seed.ts";

export function buildData(): {
  tasks: Task[];
  projects: Project[];
  members: Member[];
  notifications: Notice[];
  settings: Settings;
} {
  // One real owner only. Unknown deadlines, collaborators, files, comments and
  // notifications are left unset rather than invented to make a demo look busy.
  const members: Member[] = [
    { id: ME, name: "Workspace owner", role: "Owner", title: "Personal workspace owner", email: "", tone: 0 },
  ];
  const projects: Project[] = PORTFOLIO_PROJECTS.map((project) => ({
    id: project.id,
    name: project.name,
    description: describePortfolioProject(project),
    status: "active",
  }));
  const installedAt = new Date().toISOString();
  const tasks: Task[] = PORTFOLIO_TASKS.map((task, index) => ({
    id: task.id,
    title: task.title,
    summary: task.summary,
    description: describePortfolioTask(task),
    status: task.status,
    priority: task.priority,
    projectId: task.projectId,
    due: "",
    assigneeIds: [],
    createdById: ME,
    icon: "clipboard",
    tone: task.priority === "high" ? "rose" : task.priority === "medium" ? "amber" : "blue",
    subtasks: [],
    comments: [],
    attachments: [],
    createdAt: installedAt,
    rank: index,
  }));
  const notifications: Notice[] = [];
  const settings: Settings = { weekStart: "mon", density: "comfortable", digest: false };
  return { tasks, projects, members, notifications, settings };
}
