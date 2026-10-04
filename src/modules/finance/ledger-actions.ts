"use server";

import { revalidatePath } from "next/cache";
import { parseInput, runAction, type ActionResult } from "@/server/action";
import { requireTenantContext } from "@/server/tenancy/context";
import {
  correctEntry,
  correctOpening,
  createEntry,
  createTransfer,
  reverseEntry,
  setupLedger,
  type CreatedEntry,
} from "./ledger";
import {
  attachmentIdSchema,
  entrySchema,
  ledgerSetupSchema,
  openingSchema,
  receiptNoteSchema,
  reverseSchema,
  transferSchema,
} from "./ledger-schemas";
import { attachReceiptNote, removeAttachment } from "./receipts";

/** Alle Finanzseiten zeigen nach einer Buchung den neuen Stand (Übersicht, Kassenbuch, Rechnungen, Dashboard, Dokumente). */
function refresh() {
  revalidatePath("/finanzen", "layout");
  revalidatePath("/dashboard");
  revalidatePath("/dokumente");
}

export async function setupLedgerAction(input: unknown): Promise<ActionResult> {
  return runAction(async () => {
    await setupLedger(await requireTenantContext(), parseInput(ledgerSetupSchema, input));
    refresh();
    return undefined;
  }, "finance-setup");
}

export async function createEntryAction(input: unknown): Promise<ActionResult<CreatedEntry>> {
  return runAction(async () => {
    const created = await createEntry(await requireTenantContext(), parseInput(entrySchema, input));
    refresh();
    return created;
  }, "finance-entry");
}

export async function reverseEntryAction(input: unknown): Promise<ActionResult<{ label: string }>> {
  return runAction(async () => {
    const result = await reverseEntry(
      await requireTenantContext(),
      parseInput(reverseSchema, input),
    );
    refresh();
    return result;
  }, "finance-reverse");
}

export async function correctEntryAction(
  id: string,
  reason: string,
  entry: unknown,
): Promise<ActionResult<CreatedEntry>> {
  return runAction(async () => {
    const created = await correctEntry(await requireTenantContext(), {
      ...parseInput(reverseSchema, { id, reason }),
      entry: parseInput(entrySchema, entry),
    });
    refresh();
    return created;
  }, "finance-correct");
}

export async function createTransferAction(
  input: unknown,
): Promise<ActionResult<{ label: string }>> {
  return runAction(async () => {
    const result = await createTransfer(
      await requireTenantContext(),
      parseInput(transferSchema, input),
    );
    refresh();
    return result;
  }, "finance-transfer");
}

export async function correctOpeningAction(
  input: unknown,
): Promise<ActionResult<{ amountCents: number }>> {
  return runAction(async () => {
    const result = await correctOpening(
      await requireTenantContext(),
      parseInput(openingSchema, input),
    );
    refresh();
    return result;
  }, "finance-opening");
}

export async function attachReceiptNoteAction(input: unknown): Promise<ActionResult> {
  return runAction(async () => {
    await attachReceiptNote(await requireTenantContext(), parseInput(receiptNoteSchema, input));
    refresh();
    return undefined;
  }, "finance-receipt");
}

export async function removeAttachmentAction(input: unknown): Promise<ActionResult> {
  return runAction(async () => {
    await removeAttachment(await requireTenantContext(), parseInput(attachmentIdSchema, input));
    refresh();
    return undefined;
  }, "finance-receipt");
}
