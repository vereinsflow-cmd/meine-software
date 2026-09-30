"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { parseInput, runAction, type ActionResult } from "@/server/action";
import { requireTenantContext } from "@/server/tenancy/context";
import { dashboardLayoutSchema } from "./layout-prefs";
import { hideDashboardBlock, saveDashboardLayout } from "./layout-service";
import { DASHBOARD_TAB_IDS, type DashboardTabId } from "./tabs";

const hideSchema = z.object({
  tab: z.enum(DASHBOARD_TAB_IDS as [DashboardTabId, ...DashboardTabId[]]),
  block: z.string().min(1).max(40),
});

/** Eigene Anordnung des Dashboards speichern; `null` = zurück zur Standard-Ansicht. */
export async function saveDashboardLayoutAction(input: unknown): Promise<ActionResult> {
  return runAction(async () => {
    const layout = input === null ? null : parseInput(dashboardLayoutSchema, input);
    await saveDashboardLayout(await requireTenantContext(), layout);
    revalidatePath("/dashboard");
    return undefined;
  }, "dashboard-layout");
}

/** Eine Karte über die eigene Einstellung ausblenden (unbekannte Karten fallen beim Speichern weg). */
export async function hideDashboardBlockAction(input: unknown): Promise<ActionResult> {
  return runAction(async () => {
    const { tab, block } = parseInput(hideSchema, input);
    await hideDashboardBlock(await requireTenantContext(), tab, block);
    revalidatePath("/dashboard");
    return undefined;
  }, "dashboard-hide-block");
}
