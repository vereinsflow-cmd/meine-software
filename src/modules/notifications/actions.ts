"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { parseInput, runAction, type ActionResult } from "@/server/action";
import { requireTenantContext } from "@/server/tenancy/context";
import { markAllNotificationsRead, markNotificationRead, markNotificationUnread } from "./service";

const idSchema = z.object({ id: z.string().min(1).max(64) });

/** Markiert als gelesen und gibt das Ziel zurück, damit der Browser dorthin wechseln kann. */
export async function markNotificationReadAction(
  input: unknown,
): Promise<ActionResult<{ linkUrl: string | null }>> {
  return runAction(async () => {
    const { id } = parseInput(idSchema, input);
    const ctx = await requireTenantContext();
    const result = await markNotificationRead(ctx, id);
    revalidatePath("/benachrichtigungen");
    return result;
  }, "notification-read");
}

export async function markNotificationUnreadAction(input: unknown): Promise<ActionResult> {
  return runAction(async () => {
    const { id } = parseInput(idSchema, input);
    const ctx = await requireTenantContext();
    await markNotificationUnread(ctx, id);
    revalidatePath("/benachrichtigungen");
    return undefined;
  }, "notification-unread");
}

export async function markAllNotificationsReadAction(): Promise<ActionResult<{ count: number }>> {
  return runAction(async () => {
    const ctx = await requireTenantContext();
    const count = await markAllNotificationsRead(ctx);
    revalidatePath("/benachrichtigungen");
    return { count };
  }, "notification-read-all");
}
