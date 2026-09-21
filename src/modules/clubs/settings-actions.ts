"use server";

import { revalidatePath } from "next/cache";
import { parseInput, runAction, type ActionResult } from "@/server/action";
import { requireTenantContext } from "@/server/tenancy/context";
import { clubSettingsSchema } from "./schemas";
import { updateClubSettings } from "./service";

export async function updateClubSettingsAction(input: unknown): Promise<ActionResult> {
  return runAction(async () => {
    await updateClubSettings(await requireTenantContext(), parseInput(clubSettingsSchema, input));
    revalidatePath("/einstellungen");
    revalidatePath("/", "layout"); // Vereinsname erscheint in der Kopfzeile
    return undefined;
  }, "club-settings");
}
