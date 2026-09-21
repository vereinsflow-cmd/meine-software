"use server";

import { runAction, type ActionResult } from "@/server/action";
import { env } from "@/server/env";
import { requireTenantContext } from "@/server/tenancy/context";
import { createFeedLink, revokeFeedLinks } from "./feed";

/** Erzeugt einen neuen Abo-Link. Die URL wird nur in dieser Antwort ausgeliefert und nirgends gespeichert. */
export async function createFeedLinkAction(): Promise<ActionResult<{ url: string }>> {
  return runAction(async () => {
    const ctx = await requireTenantContext();
    const { token } = await createFeedLink(ctx);
    return { url: `${env.APP_URL}/api/calendar/feed/${token}.ics` };
  }, "calendar-feed-create");
}

export async function revokeFeedLinkAction(): Promise<ActionResult> {
  return runAction(async () => {
    const ctx = await requireTenantContext();
    await revokeFeedLinks(ctx);
    return undefined;
  }, "calendar-feed-revoke");
}
