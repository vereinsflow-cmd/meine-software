"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { parseInput, runAction, type ActionResult } from "@/server/action";
import { startSession } from "@/server/auth/session";
import { completeFirstRun } from "@/server/platform/first-run";
import { getRequestMeta } from "@/server/security/request";
import { requireTenantContext } from "@/server/tenancy/context";
import { firstRunSchema } from "./schemas";
import { completeSetup } from "./service";

/** Ersteinrichtung der leeren Version: Verein + erstes Konto anlegen, anmelden, weiter zum Assistenten. */
export async function firstRunAction(input: unknown): Promise<ActionResult> {
  return runAction(async () => {
    const data = parseInput(firstRunSchema, input);
    const { userId, clubId } = await completeFirstRun(data, await getRequestMeta());
    await startSession(userId, clubId);
    revalidatePath("/", "layout");
    redirect("/einrichtung");
  }, "first-run");
}

export async function completeSetupAction(): Promise<ActionResult> {
  return runAction(async () => {
    await completeSetup(await requireTenantContext());
    revalidatePath("/", "layout"); // Der Hinweis „Verein einrichten“ verschwindet aus dem Rahmen
    redirect("/dashboard");
  }, "setup-complete");
}
