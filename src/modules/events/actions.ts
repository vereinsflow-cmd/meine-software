"use server";

import { revalidatePath } from "next/cache";
import { parseInput, runAction, type ActionResult } from "@/server/action";
import { requireTenantContext } from "@/server/tenancy/context";
import { removeParticipant, respondToEvent, setParticipantStatus } from "./participants";
import {
  cancelEventSchema,
  duplicateSchema,
  eventFormSchema,
  idSchema,
  participantSchema,
  respondSchema,
} from "./schemas";
import {
  archiveEvent,
  cancelEvent,
  completeEvent,
  createEvent,
  deleteEvent,
  duplicateEvent,
  publishEvent,
  restoreEvent,
  updateEvent,
} from "./service";
import type { ParticipantStatus } from "@/generated/prisma/enums";

const refresh = (id?: string) => {
  revalidatePath("/veranstaltungen");
  if (id) revalidatePath(`/veranstaltungen/${id}`);
  revalidatePath("/kalender");
  revalidatePath("/dashboard");
  revalidatePath("/helferplanung");
};

export async function createEventAction(
  input: unknown,
): Promise<ActionResult<{ id: string; count: number }>> {
  return runAction(async () => {
    const result = await createEvent(
      await requireTenantContext(),
      parseInput(eventFormSchema, input),
    );
    refresh();
    return result;
  }, "event-create");
}

export async function updateEventAction(id: string, input: unknown): Promise<ActionResult> {
  return runAction(async () => {
    const { id: eventId } = parseInput(idSchema, { id });
    await updateEvent(await requireTenantContext(), eventId, parseInput(eventFormSchema, input));
    refresh(eventId);
    return undefined;
  }, "event-update");
}

function statusAction(
  scope: string,
  run: (ctx: Awaited<ReturnType<typeof requireTenantContext>>, id: string) => Promise<void>,
) {
  return async (input: unknown): Promise<ActionResult> =>
    runAction(async () => {
      const { id } = parseInput(idSchema, input);
      await run(await requireTenantContext(), id);
      refresh(id);
      return undefined;
    }, scope);
}

export const publishEventAction = statusAction("event-publish", publishEvent);
export const completeEventAction = statusAction("event-complete", completeEvent);
export const archiveEventAction = statusAction("event-archive", archiveEvent);
export const restoreEventAction = statusAction("event-restore", restoreEvent);
export const deleteEventAction = statusAction("event-delete", deleteEvent);

export async function cancelEventAction(input: unknown): Promise<ActionResult> {
  return runAction(async () => {
    const { id, reason } = parseInput(cancelEventSchema, input);
    await cancelEvent(await requireTenantContext(), id, reason);
    refresh(id);
    return undefined;
  }, "event-cancel");
}

export async function duplicateEventAction(input: unknown): Promise<ActionResult<{ id: string }>> {
  return runAction(async () => {
    const { id, startDate } = parseInput(duplicateSchema, input);
    const result = await duplicateEvent(await requireTenantContext(), id, startDate);
    refresh();
    return result;
  }, "event-duplicate");
}

export async function respondAction(
  input: unknown,
): Promise<ActionResult<{ status: ParticipantStatus }>> {
  return runAction(async () => {
    const data = parseInput(respondSchema, input);
    const result = await respondToEvent(await requireTenantContext(), data);
    refresh(data.eventId);
    return result;
  }, "event-respond");
}

export async function setParticipantAction(input: unknown): Promise<ActionResult> {
  return runAction(async () => {
    const data = parseInput(participantSchema, input);
    await setParticipantStatus(await requireTenantContext(), data);
    refresh(data.eventId);
    return undefined;
  }, "event-participant-set");
}

export async function removeParticipantAction(input: unknown): Promise<ActionResult> {
  return runAction(async () => {
    const data = parseInput(participantSchema.pick({ eventId: true, memberId: true }), input);
    await removeParticipant(await requireTenantContext(), data);
    refresh(data.eventId);
    return undefined;
  }, "event-participant-remove");
}
