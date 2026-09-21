"use server";

import { revalidatePath } from "next/cache";
import { parseInput, runAction, type ActionResult } from "@/server/action";
import { requireTenantContext } from "@/server/tenancy/context";
import {
  addChecklistItem,
  createChecklist,
  deleteChecklist,
  removeChecklistItem,
  toggleChecklistItem,
} from "./checklists";
import {
  checklistItemSchema,
  checklistSchema,
  idSchema,
  taskFormSchema,
  taskStatusSchema,
  toggleItemSchema,
} from "./schemas";
import { createTask, deleteTask, setTaskStatus, updateTask } from "./service";

const refresh = (eventId?: string | null) => {
  revalidatePath("/aufgaben");
  revalidatePath("/dashboard");
  if (eventId) revalidatePath(`/veranstaltungen/${eventId}`);
};

export async function createTaskAction(input: unknown): Promise<ActionResult<{ id: string }>> {
  return runAction(async () => {
    const result = await createTask(
      await requireTenantContext(),
      parseInput(taskFormSchema, input),
    );
    refresh();
    return result;
  }, "task-create");
}

export async function updateTaskAction(id: string, input: unknown): Promise<ActionResult> {
  return runAction(async () => {
    const { id: taskId } = parseInput(idSchema, { id });
    await updateTask(await requireTenantContext(), taskId, parseInput(taskFormSchema, input));
    refresh();
    return undefined;
  }, "task-update");
}

export async function setTaskStatusAction(input: unknown): Promise<ActionResult> {
  return runAction(async () => {
    const { id, status } = parseInput(taskStatusSchema, input);
    await setTaskStatus(await requireTenantContext(), id, status);
    refresh();
    return undefined;
  }, "task-status");
}

export async function deleteTaskAction(input: unknown): Promise<ActionResult> {
  return runAction(async () => {
    const { id } = parseInput(idSchema, input);
    await deleteTask(await requireTenantContext(), id);
    refresh();
    return undefined;
  }, "task-delete");
}

// Checklisten -------------------------------------------------------------------------------------

export async function createChecklistAction(input: unknown): Promise<ActionResult<{ id: string }>> {
  return runAction(async () => {
    const data = parseInput(checklistSchema, input);
    const result = await createChecklist(await requireTenantContext(), data);
    refresh(data.eventId);
    return result;
  }, "checklist-create");
}

export async function deleteChecklistAction(input: unknown): Promise<ActionResult> {
  return runAction(async () => {
    const { id } = parseInput(idSchema, input);
    await deleteChecklist(await requireTenantContext(), id);
    revalidatePath("/aufgaben");
    revalidatePath("/veranstaltungen", "layout");
    return undefined;
  }, "checklist-delete");
}

export async function addChecklistItemAction(
  input: unknown,
): Promise<ActionResult<{ id: string }>> {
  return runAction(async () => {
    const result = await addChecklistItem(
      await requireTenantContext(),
      parseInput(checklistItemSchema, input),
    );
    revalidatePath("/aufgaben");
    revalidatePath("/veranstaltungen", "layout");
    return result;
  }, "checklist-item-add");
}

export async function toggleChecklistItemAction(input: unknown): Promise<ActionResult> {
  return runAction(async () => {
    const { id, done } = parseInput(toggleItemSchema, input);
    await toggleChecklistItem(await requireTenantContext(), id, done);
    revalidatePath("/aufgaben");
    revalidatePath("/veranstaltungen", "layout");
    return undefined;
  }, "checklist-item-toggle");
}

export async function removeChecklistItemAction(input: unknown): Promise<ActionResult> {
  return runAction(async () => {
    const { id } = parseInput(idSchema, input);
    await removeChecklistItem(await requireTenantContext(), id);
    revalidatePath("/aufgaben");
    revalidatePath("/veranstaltungen", "layout");
    return undefined;
  }, "checklist-item-remove");
}
