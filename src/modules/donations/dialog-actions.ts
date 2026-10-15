"use server";

import { z } from "zod";
import { trimmedIdString } from "@/lib/id-schema";
import { parseInput, runAction, type ActionResult } from "@/server/action";
import { requireTenantContext } from "@/server/tenancy/context";
import {
  getAssignDonationSetup,
  getDonationEditData,
  getDonationEvidenceData,
  type AssignDonationSetup,
  type DonationEditData,
  type DonationEvidenceData,
} from "./dialog-data";

/**
 * Lesende Server Actions für Fenster, die ihre Daten erst beim Öffnen holen (siehe `dialog-data.ts`). Rechte prüfen die
 * Dienste: Kennzeichnen und Ändern brauchen `finance:manage`, Nachweise ansehen `finance:read`.
 */

const id = trimmedIdString;

export async function loadAssignDonationAction(
  input: unknown,
): Promise<ActionResult<AssignDonationSetup>> {
  return runAction(async () => {
    const { ledgerLineId } = parseInput(z.object({ ledgerLineId: id }), input);
    return getAssignDonationSetup(await requireTenantContext(), ledgerLineId);
  }, "donation-assign-load");
}

export async function loadDonationEditAction(
  input: unknown,
): Promise<ActionResult<DonationEditData>> {
  return runAction(async () => {
    const data = parseInput(z.object({ id }), input);
    return getDonationEditData(await requireTenantContext(), data.id);
  }, "donation-edit-load");
}

export async function loadDonationEvidenceAction(
  input: unknown,
): Promise<ActionResult<DonationEvidenceData>> {
  return runAction(async () => {
    const { donationId } = parseInput(z.object({ donationId: id }), input);
    return getDonationEvidenceData(await requireTenantContext(), donationId);
  }, "donation-evidence-load");
}
