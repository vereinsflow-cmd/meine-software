"use server";

import { revalidatePath } from "next/cache";
import { parseInput, type ActionResult } from "@/server/action";
import { runActionAndRefresh } from "@/server/action-refresh";
import { requireTenantContext } from "@/server/tenancy/context";
import { countCash, type CashCountResult } from "./cash-count";
import { closePeriod } from "./closing";
import {
  accountCreateSchema,
  accountUpdateSchema,
  archiveSchema,
  cashCountSchema,
  categoryCreateSchema,
  categoryUpdateSchema,
  closePeriodSchema,
} from "./ledger-schemas";
import {
  archiveAccount,
  archiveCategory,
  createAccount,
  createCategory,
  updateAccount,
  updateCategory,
} from "./settings";

/** Monatsabschluss, Kassensturz, Konten und Kategorien – danach zeigen alle Finanzseiten den neuen Stand. */
function refresh() {
  revalidatePath("/finanzen", "layout");
  revalidatePath("/dashboard");
}

export async function closePeriodAction(input: unknown): Promise<ActionResult<{ label: string }>> {
  return runActionAndRefresh("finance-close", refresh, async () =>
    closePeriod(await requireTenantContext(), parseInput(closePeriodSchema, input)),
  );
}

export async function countCashAction(input: unknown): Promise<ActionResult<CashCountResult>> {
  return runActionAndRefresh("finance-cash-count", refresh, async () =>
    countCash(await requireTenantContext(), parseInput(cashCountSchema, input)),
  );
}

export async function createAccountAction(input: unknown): Promise<ActionResult<{ id: string }>> {
  return runActionAndRefresh("finance-account", refresh, async () =>
    createAccount(await requireTenantContext(), parseInput(accountCreateSchema, input)),
  );
}

export async function updateAccountAction(input: unknown): Promise<ActionResult> {
  return runActionAndRefresh("finance-account", refresh, async () => {
    await updateAccount(await requireTenantContext(), parseInput(accountUpdateSchema, input));
    return undefined;
  });
}

export async function archiveAccountAction(input: unknown): Promise<ActionResult> {
  return runActionAndRefresh("finance-account", refresh, async () => {
    await archiveAccount(await requireTenantContext(), parseInput(archiveSchema, input));
    return undefined;
  });
}

export async function createCategoryAction(input: unknown): Promise<ActionResult<{ id: string }>> {
  return runActionAndRefresh("finance-category", refresh, async () =>
    createCategory(await requireTenantContext(), parseInput(categoryCreateSchema, input)),
  );
}

export async function updateCategoryAction(input: unknown): Promise<ActionResult> {
  return runActionAndRefresh("finance-category", refresh, async () => {
    await updateCategory(await requireTenantContext(), parseInput(categoryUpdateSchema, input));
    return undefined;
  });
}

export async function archiveCategoryAction(input: unknown): Promise<ActionResult> {
  return runActionAndRefresh("finance-category", refresh, async () => {
    await archiveCategory(await requireTenantContext(), parseInput(archiveSchema, input));
    return undefined;
  });
}
