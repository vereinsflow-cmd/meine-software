"use server";

import { revalidatePath } from "next/cache";
import { parseInput, type ActionResult } from "@/server/action";
import { runActionAndRefresh } from "@/server/action-refresh";
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
  return runActionAndRefresh("finance-setup", refresh, async () => {
    await setupLedger(await requireTenantContext(), parseInput(ledgerSetupSchema, input));
    return undefined;
  });
}

export async function createEntryAction(input: unknown): Promise<ActionResult<CreatedEntry>> {
  return runActionAndRefresh("finance-entry", refresh, async () =>
    createEntry(await requireTenantContext(), parseInput(entrySchema, input)),
  );
}

export async function reverseEntryAction(input: unknown): Promise<ActionResult<{ label: string }>> {
  return runActionAndRefresh("finance-reverse", refresh, async () =>
    reverseEntry(await requireTenantContext(), parseInput(reverseSchema, input)),
  );
}

export async function correctEntryAction(
  id: string,
  reason: string,
  entry: unknown,
): Promise<ActionResult<CreatedEntry>> {
  return runActionAndRefresh("finance-correct", refresh, async () =>
    correctEntry(await requireTenantContext(), {
      ...parseInput(reverseSchema, { id, reason }),
      entry: parseInput(entrySchema, entry),
    }),
  );
}

export async function createTransferAction(
  input: unknown,
): Promise<ActionResult<{ label: string }>> {
  return runActionAndRefresh("finance-transfer", refresh, async () =>
    createTransfer(await requireTenantContext(), parseInput(transferSchema, input)),
  );
}

export async function correctOpeningAction(
  input: unknown,
): Promise<ActionResult<{ amountCents: number }>> {
  return runActionAndRefresh("finance-opening", refresh, async () =>
    correctOpening(await requireTenantContext(), parseInput(openingSchema, input)),
  );
}

export async function attachReceiptNoteAction(input: unknown): Promise<ActionResult> {
  return runActionAndRefresh("finance-receipt", refresh, async () => {
    await attachReceiptNote(await requireTenantContext(), parseInput(receiptNoteSchema, input));
    return undefined;
  });
}

export async function removeAttachmentAction(input: unknown): Promise<ActionResult> {
  return runActionAndRefresh("finance-receipt", refresh, async () => {
    await removeAttachment(await requireTenantContext(), parseInput(attachmentIdSchema, input));
    return undefined;
  });
}
