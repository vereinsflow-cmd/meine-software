"use server";

import { revalidatePath } from "next/cache";
import { parseInput, runAction, type ActionResult } from "@/server/action";
import { createClubWithAdmin, setClubActive } from "@/server/platform/clubs";
import { requirePlatformAdmin } from "@/server/tenancy/context";
import { clubStatusSchema, createClubSchema } from "./schemas";

export async function createClubAction(input: unknown): Promise<ActionResult<{ clubId: string }>> {
  return runAction(async () => {
    const actor = await requirePlatformAdmin();
    const result = await createClubWithAdmin(actor, parseInput(createClubSchema, input));
    revalidatePath("/system");
    return result;
  }, "platform-club-create");
}

export async function setClubStatusAction(input: unknown): Promise<ActionResult> {
  return runAction(async () => {
    const actor = await requirePlatformAdmin();
    const { clubId, active } = parseInput(clubStatusSchema, input);
    await setClubActive(actor, clubId, active);
    revalidatePath("/system");
    return undefined;
  }, "platform-club-status");
}
