import { describe, expect, it } from "vitest";
import { sortByImportance, taskRank } from "@/modules/dashboard/task-order";

const task = (id: string, priority: "LOW" | "NORMAL" | "HIGH" | "URGENT", overdue = false) => ({
  id,
  priority,
  overdue,
});

describe("Dashboard: Reihenfolge der eigenen Aufgaben", () => {
  it("Überfälliges vor Dringendem vor hoher Priorität vor dem Rest", () => {
    expect(taskRank(task("a", "LOW", true))).toBeLessThan(taskRank(task("b", "URGENT")));
    expect(taskRank(task("b", "URGENT"))).toBeLessThan(taskRank(task("c", "HIGH")));
    expect(taskRank(task("c", "HIGH"))).toBeLessThan(taskRank(task("d", "NORMAL")));
    expect(taskRank(task("d", "NORMAL"))).toBe(taskRank(task("e", "LOW")));
  });

  it("sortiert stabil und verändert die Eingabe nicht", () => {
    const input = [
      task("normal-1", "NORMAL"),
      task("hoch", "HIGH"),
      task("normal-2", "LOW"),
      task("überfällig", "NORMAL", true),
      task("dringend", "URGENT"),
    ];
    const before = input.map((t) => t.id);
    expect(sortByImportance(input).map((t) => t.id)).toEqual([
      "überfällig",
      "dringend",
      "hoch",
      "normal-1",
      "normal-2",
    ]);
    expect(input.map((t) => t.id)).toEqual(before);
  });

  it("leere Liste bleibt leer", () => {
    expect(sortByImportance([])).toEqual([]);
  });
});
