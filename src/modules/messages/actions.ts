"use server";

import { revalidatePath } from "next/cache";
import { parseInput, runAction, type ActionResult } from "@/server/action";
import { requireTenantContext } from "@/server/tenancy/context";
import { audienceSchema, idSchema, messageFormSchema } from "./schemas";
import { deleteMessage, previewRecipients, saveDraft, sendDraft } from "./service";

const refresh = () => {
  revalidatePath("/nachrichten");
  revalidatePath("/dashboard");
};

/** Speichert einen Entwurf (neu oder bestehend). */
export async function saveDraftAction(
  id: string | null,
  input: unknown,
): Promise<ActionResult<{ id: string }>> {
  return runAction(async () => {
    const data = parseInput(messageFormSchema, input);
    const result = await saveDraft(
      await requireTenantContext(),
      data,
      id ? parseInput(idSchema, { id }).id : undefined,
    );
    refresh();
    return result;
  }, "message-draft");
}

/** Speichert (falls nötig) und sendet in einem Schritt. Bei Fehlern im Versand bleibt der Entwurf erhalten. */
export async function sendMessageAction(
  id: string | null,
  input: unknown,
): Promise<ActionResult<{ id: string; recipients: number; unreachable: number }>> {
  return runAction(async () => {
    const data = parseInput(messageFormSchema, input);
    const ctx = await requireTenantContext();
    const saved = await saveDraft(ctx, data, id ? parseInput(idSchema, { id }).id : undefined);
    const sent = await sendDraft(ctx, saved.id);
    refresh();
    return { id: saved.id, ...sent };
  }, "message-send");
}

export async function deleteMessageAction(input: unknown): Promise<ActionResult> {
  return runAction(async () => {
    const { id } = parseInput(idSchema, input);
    await deleteMessage(await requireTenantContext(), id);
    refresh();
    return undefined;
  }, "message-delete");
}

/** Zählt die erreichbaren Empfänger, ohne etwas zu senden (Vorschau im Formular). */
export async function previewRecipientsAction(
  input: unknown,
): Promise<ActionResult<{ reachable: number; unreachable: number }>> {
  return runAction(async () => {
    const data = parseInput(audienceSchema, input);
    return previewRecipients(await requireTenantContext(), data);
  }, "message-preview");
}
