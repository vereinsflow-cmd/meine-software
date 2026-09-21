"use server";

import { revalidatePath } from "next/cache";
import { describeDevice } from "@/lib/user-agent";
import { parseInput, runAction, type ActionResult } from "@/server/action";
import { getRequestMeta } from "@/server/security/request";
import { requireTenantContext } from "@/server/tenancy/context";
import { contactsFormSchema, idSchema, ticketFormSchema, ticketUpdateSchema } from "./schemas";
import { createTicket, saveContacts, updateTicket } from "./service";

const refresh = () => {
  revalidatePath("/hilfe");
  revalidatePath("/hilfe/meldungen");
};

/** Meldung an die Vereinsverwaltung. */
export async function createTicketAction(input: unknown): Promise<ActionResult<{ id: string }>> {
  return runAction(async () => {
    const data = parseInput(ticketFormSchema, input);
    const ctx = await requireTenantContext();
    const { userAgent } = await getRequestMeta();
    const result = await createTicket(ctx, data, userAgent ? describeDevice(userAgent) : null);
    refresh();
    return result;
  }, "support-ticket-create");
}

export async function updateTicketAction(id: string, input: unknown): Promise<ActionResult> {
  return runAction(async () => {
    const { id: ticketId } = parseInput(idSchema, { id });
    await updateTicket(
      await requireTenantContext(),
      ticketId,
      parseInput(ticketUpdateSchema, input),
    );
    refresh();
    return undefined;
  }, "support-ticket-update");
}

export async function saveContactsAction(input: unknown): Promise<ActionResult> {
  return runAction(async () => {
    await saveContacts(await requireTenantContext(), parseInput(contactsFormSchema, input));
    refresh();
    return undefined;
  }, "support-contacts-save");
}
