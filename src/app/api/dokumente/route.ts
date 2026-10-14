import type { NextRequest } from "next/server";
import { uploadMetaSchema } from "@/modules/documents/schemas";
import { uploadDocument } from "@/modules/documents/service";
import { apiHandler, jsonOk } from "@/server/api";
import { parseInput } from "@/server/action";
import { validationFailed } from "@/server/errors";
import { requireTenantContext } from "@/server/tenancy/context";
import { rejectOversizedDocumentUpload } from "@/server/upload-limit";

/**
 * Dokument hochladen (multipart/form-data: `file`, `access`, optional `category` und `eventId`; Rechnungen zusätzlich
 * `isInvoice`, `paymentDue`, `amount` und `dueDate`).
 *
 * Schutz: Anmeldung und Berechtigung werden VOR dem Lesen des Inhalts geprüft; die Herkunft des Aufrufs wird geprüft
 * (`apiHandler`, gegen CSRF); die angekündigte Größe wird abgelehnt, bevor der Inhalt gelesen wird. Dateityp, Größe,
 * Speicherkontingent und Zugriffsstufen prüft der Dienst (`uploadDocument`) – auf Basis des Inhalts, nie der Angaben.
 * Hinter einem Reverse-Proxy sollte zusätzlich dessen Größenlimit gesetzt sein (siehe Betriebshinweise).
 */
export const POST = apiHandler(async (request: NextRequest) => {
  const ctx = await requireTenantContext();

  const tooLarge = rejectOversizedDocumentUpload(request);
  if (tooLarge) return tooLarge;

  const form = await request.formData();
  const file = form.get("file");
  if (!(file instanceof File)) throw validationFailed({ file: ["Bitte wähle eine Datei aus."] });
  const meta = parseInput(uploadMetaSchema, {
    category: form.get("category") ?? undefined,
    access: form.get("access") ?? "ALL_MEMBERS",
    eventId: form.get("eventId") ?? undefined,
    isInvoice: form.get("isInvoice") ?? undefined,
    paymentDue: form.get("paymentDue") ?? undefined,
    amount: form.get("amount") ?? undefined,
    dueDate: form.get("dueDate") ?? undefined,
  });

  const bytes = new Uint8Array(await file.arrayBuffer());
  const result = await uploadDocument(ctx, { fileName: file.name, bytes, ...meta });
  return jsonOk(result, { status: 201, headers: { "Cache-Control": "no-store" } });
}, "document-upload");
