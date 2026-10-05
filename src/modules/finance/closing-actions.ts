"use server";

import { revalidatePath } from "next/cache";
import { parseInput, runAction, type ActionResult } from "@/server/action";
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
  return runAction(async () => {
    const result = await closePeriod(
      await requireTenantContext(),
      parseInput(closePeriodSchema, input),
    );
    refresh();
    return result;
  }, "finance-close");
}

export async function countCashAction(input: unknown): Promise<ActionResult<CashCountResult>> {
  return runAction(async () => {
    const result = await countCash(
      await requireTenantContext(),
      parseInput(cashCountSchema, input),
    );
    refresh();
    return result;
  }, "finance-cash-count");
}

export async function createAccountAction(input: unknown): Promise<ActionResult<{ id: string }>> {
  return runAction(async () => {
    const result = await createAccount(
      await requireTenantContext(),
      parseInput(accountCreateSchema, input),
    );
    refresh();
    return result;
  }, "finance-account");
}

export async function updateAccountAction(input: unknown): Promise<ActionResult> {
  return runAction(async () => {
    await updateAccount(await requireTenantContext(), parseInput(accountUpdateSchema, input));
    refresh();
    return undefined;
  }, "finance-account");
}

export async function archiveAccountAction(input: unknown): Promise<ActionResult> {
  return runAction(async () => {
    await archiveAccount(await requireTenantContext(), parseInput(archiveSchema, input));
    refresh();
    return undefined;
  }, "finance-account");
}

export async function createCategoryAction(input: unknown): Promise<ActionResult<{ id: string }>> {
  return runAction(async () => {
    const result = await createCategory(
      await requireTenantContext(),
      parseInput(categoryCreateSchema, input),
    );
    refresh();
    return result;
  }, "finance-category");
}

export async function updateCategoryAction(input: unknown): Promise<ActionResult> {
  return runAction(async () => {
    await updateCategory(await requireTenantContext(), parseInput(categoryUpdateSchema, input));
    refresh();
    return undefined;
  }, "finance-category");
}

export async function archiveCategoryAction(input: unknown): Promise<ActionResult> {
  return runAction(async () => {
    await archiveCategory(await requireTenantContext(), parseInput(archiveSchema, input));
    refresh();
    return undefined;
  }, "finance-category");
}
