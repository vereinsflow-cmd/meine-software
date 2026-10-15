import type { NextRequest } from "next/server";
import { attachDonationFile } from "@/modules/donations/evidence";
import { apiHandler, jsonOk } from "@/server/api";
import { validationFailed } from "@/server/errors";
import { requireTenantContext } from "@/server/tenancy/context";
import { rejectOversizedDocumentUpload } from "@/server/upload-limit";

/**
 * Nachweis zu einer Spende hochladen (multipart/form-data: `file`, `donationId`) – z. B. Rechnung zur Bewertung einer
 * Sachspende, Abrechnung und Verzichtserklärung einer Aufwandsspende. Gleiche Schutzmaßnahmen wie `/api/finanzen/belege`:
 * Anmeldung vor dem Lesen des Inhalts, Herkunftsprüfung (`apiHandler`), angekündigte Größe vorab; Dateityp, Größe,
 * Virenprüfung, Kontingent und Rechte prüft der Dienst. Die Datei landet als Dokument „Nur Finanzen“.
 */
export const POST = apiHandler(async (request: NextRequest) => {
  const ctx = await requireTenantContext();

  const tooLarge = rejectOversizedDocumentUpload(request);
  if (tooLarge) return tooLarge;

  const form = await request.formData();
  const file = form.get("file");
  const donationId = form.get("donationId");
  if (!(file instanceof File)) throw validationFailed({ file: ["Bitte wähle eine Datei aus."] });
  if (typeof donationId !== "string" || !donationId || donationId.length > 64)
    throw validationFailed({ donationId: ["Die Spende fehlt."] });

  const bytes = new Uint8Array(await file.arrayBuffer());
  const result = await attachDonationFile(ctx, { donationId, fileName: file.name, bytes });
  return jsonOk(result, { status: 201, headers: { "Cache-Control": "no-store" } });
}, "donation-evidence-upload");
