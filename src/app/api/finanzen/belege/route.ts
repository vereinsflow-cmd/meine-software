import type { NextRequest } from "next/server";
import { attachReceiptFile } from "@/modules/finance/receipts";
import { apiHandler, jsonOk } from "@/server/api";
import { validationFailed } from "@/server/errors";
import { requireTenantContext } from "@/server/tenancy/context";
import { rejectOversizedDocumentUpload } from "@/server/upload-limit";

/**
 * Beleg zu einer Buchung hochladen (multipart/form-data: `file`, `entryId`). Gleiche Schutzmaßnahmen wie
 * `/api/dokumente`: Anmeldung vor dem Lesen des Inhalts, Herkunftsprüfung (`apiHandler`), angekündigte Größe vorab;
 * Dateityp, Größe, Virenprüfung, Kontingent und Rechte prüft der Dienst. Die Datei landet als Dokument „Nur Finanzen“.
 */
export const POST = apiHandler(async (request: NextRequest) => {
  const ctx = await requireTenantContext();

  const tooLarge = rejectOversizedDocumentUpload(request);
  if (tooLarge) return tooLarge;

  const form = await request.formData();
  const file = form.get("file");
  const entryId = form.get("entryId");
  if (!(file instanceof File)) throw validationFailed({ file: ["Bitte wähle eine Datei aus."] });
  if (typeof entryId !== "string" || !entryId || entryId.length > 64)
    throw validationFailed({ entryId: ["Die Buchung fehlt."] });

  const bytes = new Uint8Array(await file.arrayBuffer());
  const result = await attachReceiptFile(ctx, { entryId, fileName: file.name, bytes });
  return jsonOk(result, { status: 201, headers: { "Cache-Control": "no-store" } });
}, "receipt-upload");
