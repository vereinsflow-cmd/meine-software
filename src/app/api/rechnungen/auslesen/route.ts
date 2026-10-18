import type { NextRequest } from "next/server";
import { readInvoice } from "@/modules/finance/invoice-reader";
import { apiHandler, jsonOk } from "@/server/api";
import { validationFailed } from "@/server/errors";
import { requireTenantContext } from "@/server/tenancy/context";
import { rejectOversizedDocumentUpload } from "@/server/upload-limit";

/**
 * Rechnung auslesen (multipart/form-data: `file`) – liefert Vorschläge für Name, Betrag und Fälligkeit, speichert nichts.
 * Berechtigung (`finance:manage`), Größe und Dateityp prüft `readInvoice`; die angekündigte Größe wird vorher abgelehnt.
 */
export const POST = apiHandler(async (request: NextRequest) => {
  const ctx = await requireTenantContext();

  const tooLarge = rejectOversizedDocumentUpload(request);
  if (tooLarge) return tooLarge;

  const form = await request.formData();
  const file = form.get("file");
  if (!(file instanceof File)) throw validationFailed({ file: ["Bitte wähle eine Datei aus."] });

  const bytes = new Uint8Array(await file.arrayBuffer());
  const result = await readInvoice(ctx, { fileName: file.name, bytes });
  return jsonOk(result, { headers: { "Cache-Control": "no-store" } });
}, "invoice-read");
