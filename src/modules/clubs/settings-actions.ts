"use server";

import { revalidatePath } from "next/cache";
import { parseInput, runAction, type ActionResult } from "@/server/action";
import { requireTenantContext } from "@/server/tenancy/context";
import { clubSettingsSchema, clubSetupSchema } from "./schemas";
import { removeClubLogo, updateClubSettings } from "./service";

export async function updateClubSettingsAction(input: unknown): Promise<ActionResult> {
  return runAction(async () => {
    await updateClubSettings(await requireTenantContext(), parseInput(clubSettingsSchema, input));
    revalidatePath("/einstellungen");
    revalidatePath("/", "layout"); // Vereinsname erscheint in der Kopfzeile
    return undefined;
  }, "club-settings");
}

/** Assistent „Verein einrichten“: wie oben, aber Kontakt-E-Mail und Anschrift sind Pflicht. */
export async function saveClubSetupDataAction(input: unknown): Promise<ActionResult> {
  return runAction(async () => {
    await updateClubSettings(await requireTenantContext(), parseInput(clubSetupSchema, input));
    revalidatePath("/", "layout");
    return undefined;
  }, "club-setup-data");
}

/** Vereinslogo entfernen. Hochgeladen wird über `POST /api/vereine/<id>/logo` (Dateien sind für Aktionen zu groß). */
export async function removeClubLogoAction(): Promise<ActionResult> {
  return runAction(async () => {
    await removeClubLogo(await requireTenantContext());
    revalidatePath("/einstellungen");
    revalidatePath("/", "layout"); // Logo erscheint in Kopfzeile und Vereinswechsler
    return undefined;
  }, "club-logo-remove");
}
