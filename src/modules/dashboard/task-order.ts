import type { TaskPriority } from "@/generated/prisma/enums";

export interface RankableTask {
  overdue: boolean;
  priority: TaskPriority;
}

/** Rang für „Meine Aufgaben“ auf dem Dashboard: Überfälliges zuerst, dann dringend, dann hohe Priorität, dann der Rest. */
export function taskRank(task: RankableTask): number {
  if (task.overdue) return 0;
  if (task.priority === "URGENT") return 1;
  if (task.priority === "HIGH") return 2;
  return 3;
}

/** Sortiert nach Wichtigkeit; gleich wichtige Aufgaben behalten ihre Reihenfolge (stabil), das Original bleibt unverändert. */
export function sortByImportance<T extends RankableTask>(tasks: readonly T[]): T[] {
  return [...tasks].sort((a, b) => taskRank(a) - taskRank(b));
}
