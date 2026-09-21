"use server";

import { revalidatePath } from "next/cache";
import { parseInput, runAction, type ActionResult } from "@/server/action";
import { requireTenantContext } from "@/server/tenancy/context";
import { assignSchema, hoursSchema, idSchema, shiftFormSchema, shiftRefSchema } from "./schemas";
import {
  assignMember,
  confirmPlannedHours,
  createShift,
  deleteShift,
  listAssignableMembers,
  recordHours,
  signOut,
  signUp,
  unassignMember,
  updateShift,
  type AssignableMember,
} from "./service";

const refresh = (eventId?: string) => {
  revalidatePath("/helferplanung");
  if (eventId) {
    revalidatePath(`/helferplanung/${eventId}`);
    revalidatePath(`/veranstaltungen/${eventId}`);
  }
  revalidatePath("/veranstaltungen");
  revalidatePath("/dashboard");
};

export async function createShiftAction(
  eventId: string,
  input: unknown,
): Promise<ActionResult<{ id: string }>> {
  return runAction(async () => {
    const { id } = parseInput(idSchema, { id: eventId });
    const result = await createShift(
      await requireTenantContext(),
      id,
      parseInput(shiftFormSchema, input),
    );
    refresh(id);
    return result;
  }, "shift-create");
}

export async function updateShiftAction(
  shiftId: string,
  eventId: string,
  input: unknown,
): Promise<ActionResult> {
  return runAction(async () => {
    const { id } = parseInput(idSchema, { id: shiftId });
    await updateShift(await requireTenantContext(), id, parseInput(shiftFormSchema, input));
    refresh(eventId);
    return undefined;
  }, "shift-update");
}

export async function deleteShiftAction(input: unknown): Promise<ActionResult> {
  return runAction(async () => {
    const { id, eventId } = parseInput(
      idSchema.extend({ eventId: idSchema.shape.id.optional() }),
      input,
    );
    await deleteShift(await requireTenantContext(), id);
    refresh(eventId);
    return undefined;
  }, "shift-delete");
}

const withEvent = shiftRefSchema.extend({ eventId: idSchema.shape.id.optional() });

export async function signUpAction(input: unknown): Promise<ActionResult> {
  return runAction(async () => {
    const { shiftId, eventId } = parseInput(withEvent, input);
    await signUp(await requireTenantContext(), shiftId);
    refresh(eventId);
    return undefined;
  }, "shift-signup");
}

export async function signOutAction(input: unknown): Promise<ActionResult> {
  return runAction(async () => {
    const { shiftId, eventId } = parseInput(withEvent, input);
    await signOut(await requireTenantContext(), shiftId);
    refresh(eventId);
    return undefined;
  }, "shift-signout");
}

export async function assignMemberAction(input: unknown): Promise<ActionResult> {
  return runAction(async () => {
    const data = parseInput(assignSchema.extend({ eventId: idSchema.shape.id.optional() }), input);
    await assignMember(await requireTenantContext(), data);
    refresh(data.eventId);
    return undefined;
  }, "shift-assign");
}

/** Lädt die Zuweisungsliste erst beim Öffnen des Dialogs (spart Abfragen, solange niemand zuweist). */
export async function listAssignableAction(
  input: unknown,
): Promise<ActionResult<AssignableMember[]>> {
  return runAction(async () => {
    const { shiftId } = parseInput(shiftRefSchema, input);
    return listAssignableMembers(await requireTenantContext(), shiftId);
  }, "shift-assignable");
}

export async function unassignMemberAction(input: unknown): Promise<ActionResult> {
  return runAction(async () => {
    const data = parseInput(assignSchema.extend({ eventId: idSchema.shape.id.optional() }), input);
    await unassignMember(await requireTenantContext(), data);
    refresh(data.eventId);
    return undefined;
  }, "shift-unassign");
}

export async function recordHoursAction(input: unknown): Promise<ActionResult> {
  return runAction(async () => {
    const data = parseInput(hoursSchema.extend({ eventId: idSchema.shape.id.optional() }), input);
    await recordHours(await requireTenantContext(), data);
    refresh(data.eventId);
    return undefined;
  }, "shift-hours");
}

export async function confirmPlannedHoursAction(
  input: unknown,
): Promise<ActionResult<{ count: number }>> {
  return runAction(async () => {
    const { shiftId, eventId } = parseInput(withEvent, input);
    const count = await confirmPlannedHours(await requireTenantContext(), shiftId);
    refresh(eventId);
    return { count };
  }, "shift-hours-planned");
}
