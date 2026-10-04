"use server";

import { revalidatePath } from "next/cache";
import { parseInput, runAction, type ActionResult } from "@/server/action";
import { requireTenantContext } from "@/server/tenancy/context";
import { invoiceStatusSchema } from "./schemas";
import { setInvoiceStatus } from "./service";

/** Rechnung als bezahlt markieren bzw. wieder öffnen. Dashboard und Dokumente zeigen den neuen Stand sofort. */
export async function setInvoiceStatusAction(input: unknown): Promise<ActionResult> {
  return runAction(async () => {
    const { id, status } = parseInput(invoiceStatusSchema, input);
    await setInvoiceStatus(await requireTenantContext(), id, status);
    revalidatePath("/dashboard");
    revalidatePath("/dokumente");
    revalidatePath("/finanzen", "layout");
    return undefined;
  }, "invoice-status");
}
