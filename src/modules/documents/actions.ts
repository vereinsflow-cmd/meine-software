"use server";

import { revalidatePath } from "next/cache";
import { parseInput, runAction, type ActionResult } from "@/server/action";
import { requireTenantContext } from "@/server/tenancy/context";
import { documentFormSchema, idSchema } from "./schemas";
import { deleteDocument, updateDocument } from "./service";

const refresh = () => revalidatePath("/dokumente");

export async function updateDocumentAction(id: string, input: unknown): Promise<ActionResult> {
  return runAction(async () => {
    const { id: documentId } = parseInput(idSchema, { id });
    await updateDocument(
      await requireTenantContext(),
      documentId,
      parseInput(documentFormSchema, input),
    );
    refresh();
    return undefined;
  }, "document-update");
}

export async function deleteDocumentAction(input: unknown): Promise<ActionResult> {
  return runAction(async () => {
    const { id } = parseInput(idSchema, input);
    await deleteDocument(await requireTenantContext(), id);
    refresh();
    return undefined;
  }, "document-delete");
}
