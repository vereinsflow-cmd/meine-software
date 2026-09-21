"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { CsvError } from "@/lib/csv";
import { badRequest } from "@/server/errors";
import { parseInput, runAction, type ActionResult } from "@/server/action";
import { requireTenantContext } from "@/server/tenancy/context";
import { executeMemberImport, previewMemberImport, type ImportPreview } from "./import";
import { consentSchema, idSchema, memberFormSchema } from "./schemas";
import {
  archiveMember,
  createMember,
  deleteMember,
  recordConsent,
  restoreFromTrash,
  restoreMember,
  updateMember,
} from "./service";

/**
 * Server Actions der Mitgliederverwaltung. Sie validieren die Eingabe, holen den Mandantenkontext
 * aus der Sitzung und rufen die Fachfunktion auf, die die Berechtigung selbst prüft.
 */
const refresh = (id?: string) => {
  revalidatePath("/mitglieder");
  if (id) revalidatePath(`/mitglieder/${id}`);
  revalidatePath("/dashboard");
};

export async function createMemberAction(input: unknown): Promise<ActionResult<{ id: string }>> {
  return runAction(async () => {
    const data = parseInput(memberFormSchema, input);
    const result = await createMember(await requireTenantContext(), data);
    refresh();
    return result;
  }, "member-create");
}

export async function updateMemberAction(id: string, input: unknown): Promise<ActionResult> {
  return runAction(async () => {
    const { id: memberId } = parseInput(idSchema, { id });
    const data = parseInput(memberFormSchema, input);
    await updateMember(await requireTenantContext(), memberId, data);
    refresh(memberId);
    return undefined;
  }, "member-update");
}

function simpleAction(
  scope: string,
  run: (ctx: Awaited<ReturnType<typeof requireTenantContext>>, id: string) => Promise<void>,
) {
  return async (input: unknown): Promise<ActionResult> =>
    runAction(async () => {
      const { id } = parseInput(idSchema, input);
      await run(await requireTenantContext(), id);
      refresh(id);
      return undefined;
    }, scope);
}

export const archiveMemberAction = simpleAction("member-archive", archiveMember);
export const restoreMemberAction = simpleAction("member-restore", restoreMember);
export const deleteMemberAction = simpleAction("member-delete", deleteMember);
export const restoreFromTrashAction = simpleAction("member-restore-trash", restoreFromTrash);

export async function recordConsentAction(input: unknown): Promise<ActionResult> {
  return runAction(async () => {
    const data = parseInput(consentSchema, input);
    await recordConsent(await requireTenantContext(), data);
    refresh(data.memberId);
    return undefined;
  }, "member-consent");
}

const importSchema = z.object({
  csv: z
    .string()
    .min(1, "Bitte wähle eine CSV-Datei aus.")
    .max(1_000_000, "Die Datei ist zu groß (höchstens 1 MB)."),
});

/** Liest und prüft die Datei, schreibt aber nichts. */
export async function previewImportAction(input: unknown): Promise<ActionResult<ImportPreview>> {
  return runAction(async () => {
    const { csv } = parseInput(importSchema, input);
    try {
      return await previewMemberImport(await requireTenantContext(), csv);
    } catch (error) {
      if (error instanceof CsvError) throw badRequest(error.message);
      throw error;
    }
  }, "member-import-preview");
}

export async function executeImportAction(
  input: unknown,
): Promise<ActionResult<{ created: number; skipped: number; failed: number }>> {
  return runAction(async () => {
    const { csv } = parseInput(importSchema, input);
    try {
      const result = await executeMemberImport(await requireTenantContext(), csv);
      refresh();
      return result;
    } catch (error) {
      if (error instanceof CsvError) throw badRequest(error.message);
      throw error;
    }
  }, "member-import");
}
