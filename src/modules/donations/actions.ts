"use server";

import { revalidatePath } from "next/cache";
import { parseInput, type ActionResult } from "@/server/action";
import { runActionAndRefresh } from "@/server/action-refresh";
import { requireTenantContext } from "@/server/tenancy/context";
import { attachDonationNote, removeDonationAttachment } from "./evidence";
import {
  assignDonationSchema,
  donationAttachmentIdSchema,
  donationFormSchema,
  donationNoteSchema,
  donationUpdateSchema,
  donorIdSchema,
  donorSchema,
  donorUpdateSchema,
  restrictDonorSchema,
  taxSettingsSchema,
  unassignDonationSchema,
  voidDonationSchema,
} from "./schemas";
import {
  assignDonation,
  createDonor,
  deleteDonor,
  recordDonation,
  restrictDonor,
  unassignDonation,
  updateDonation,
  updateDonor,
  updateTaxSettings,
  voidDonation,
  type RecordedDonation,
  type TaxSettingsDto,
} from "./service";

/**
 * Server Actions der Spenden – dünne Hüllen um die Dienste. Danach zeigen alle Finanzseiten (Übersicht, Kassenbuch,
 * Spenden), das Dashboard und die Dokumente den neuen Stand.
 */
function refresh() {
  revalidatePath("/finanzen", "layout");
  revalidatePath("/dashboard");
  revalidatePath("/dokumente");
}

function action<T>(
  scope: string,
  run: (input: unknown) => Promise<T>,
): (input: unknown) => Promise<ActionResult<T>> {
  return async (input: unknown) => runActionAndRefresh(scope, refresh, () => run(input));
}

/** „Spende erfassen“ – Rückgabe mit `entryId` (Geld), damit der Beleg danach an die Buchung kann. */
export async function recordDonationAction(
  input: unknown,
): Promise<ActionResult<RecordedDonation>> {
  return action("donation-record", async (value) =>
    recordDonation(await requireTenantContext(), parseInput(donationFormSchema, value)),
  )(input);
}

/** „Als Spende kennzeichnen“ (Kassenbuch „⋯“ bzw. „Spender eintragen“). */
export async function assignDonationAction(
  input: unknown,
): Promise<ActionResult<{ donationId: string }>> {
  return action("donation-assign", async (value) =>
    assignDonation(await requireTenantContext(), parseInput(assignDonationSchema, value)),
  )(input);
}

export async function updateDonationAction(input: unknown): Promise<ActionResult<void>> {
  return action("donation-update", async (value) =>
    updateDonation(await requireTenantContext(), parseInput(donationUpdateSchema, value)),
  )(input);
}

export async function voidDonationAction(input: unknown): Promise<ActionResult<void>> {
  return action("donation-void", async (value) =>
    voidDonation(await requireTenantContext(), parseInput(voidDonationSchema, value)),
  )(input);
}

export async function unassignDonationAction(input: unknown): Promise<ActionResult<void>> {
  return action("donation-unassign", async (value) =>
    unassignDonation(await requireTenantContext(), parseInput(unassignDonationSchema, value)),
  )(input);
}

export async function createDonorAction(input: unknown): Promise<ActionResult<{ id: string }>> {
  return action("donor-create", async (value) =>
    createDonor(await requireTenantContext(), parseInput(donorSchema, value)),
  )(input);
}

export async function updateDonorAction(input: unknown): Promise<ActionResult<void>> {
  return action("donor-update", async (value) =>
    updateDonor(await requireTenantContext(), parseInput(donorUpdateSchema, value)),
  )(input);
}

export async function restrictDonorAction(input: unknown): Promise<ActionResult<void>> {
  return action("donor-restrict", async (value) =>
    restrictDonor(await requireTenantContext(), parseInput(restrictDonorSchema, value)),
  )(input);
}

export async function deleteDonorAction(input: unknown): Promise<ActionResult<void>> {
  return action("donor-delete", async (value) =>
    deleteDonor(await requireTenantContext(), parseInput(donorIdSchema, value)),
  )(input);
}

/** Finanzamt-Angaben speichern – Rückgabe mit dem neuen Stand (Gültigkeit, Hinweise). */
export async function updateTaxSettingsAction(
  input: unknown,
): Promise<ActionResult<TaxSettingsDto>> {
  return action("tax-settings", async (value) =>
    updateTaxSettings(await requireTenantContext(), parseInput(taxSettingsSchema, value)),
  )(input);
}

export async function attachDonationNoteAction(
  input: unknown,
): Promise<ActionResult<{ id: string }>> {
  return action("donation-evidence", async (value) =>
    attachDonationNote(await requireTenantContext(), parseInput(donationNoteSchema, value)),
  )(input);
}

export async function removeDonationAttachmentAction(input: unknown): Promise<ActionResult<void>> {
  return action("donation-evidence", async (value) =>
    removeDonationAttachment(
      await requireTenantContext(),
      parseInput(donationAttachmentIdSchema, value),
    ),
  )(input);
}
