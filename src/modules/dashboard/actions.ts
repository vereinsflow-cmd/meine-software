"use server";

import { revalidatePath } from "next/cache";
import { parseInput, runAction, type ActionResult } from "@/server/action";
import { requireTenantContext } from "@/server/tenancy/context";
import { dashboardLayoutSchema } from "./layout-prefs";
import { saveDashboardLayout } from "./layout-service";

/** Eigene Anordnung des Dashboards speichern; `null` = zurück zur Standard-Ansicht. */
export async function saveDashboardLayoutAction(input: unknown): Promise<ActionResult> {
  return runAction(async () => {
    const layout = input === null ? null : parseInput(dashboardLayoutSchema, input);
    await saveDashboardLayout(await requireTenantContext(), layout);
    revalidatePath("/dashboard");
    return undefined;
  }, "dashboard-layout");
}
