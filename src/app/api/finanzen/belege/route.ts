import { NextResponse, type NextRequest } from "next/server";
import { attachReceiptFile } from "@/modules/finance/receipts";
import { apiHandler, jsonOk } from "@/server/api";
import { env } from "@/server/env";
import { validationFailed } from "@/server/errors";
import { requireTenantContext } from "@/server/tenancy/context";

/**
 * Beleg zu einer Buchung hochladen (multipart/form-data: `file`, `entryId`). Gleiche Schutzmaßnahmen wie
 * `/api/dokumente`: Anmeldung vor dem Lesen des Inhalts, Herkunftsprüfung (`apiHandler`), angekündigte Größe vorab;
 * Dateityp, Größe, Virenprüfung, Kontingent und Rechte prüft der Dienst. Die Datei landet als Dokument „Nur Finanzen“.
 */
export const POST = apiHandler(async (request: NextRequest) => {
  const ctx = await requireTenantContext();

  const limit = env.MAX_UPLOAD_MB * 1024 * 1024 + 256 * 1024;
  const announced = Number(request.headers.get("content-length") ?? "0");
  if (Number.isFinite(announced) && announced > limit) {
    const message = `Die Datei ist zu groß (höchstens ${env.MAX_UPLOAD_MB} MB).`;
    return NextResponse.json(
      { ok: false, error: { code: "VALIDATION", message, fieldErrors: { file: [message] } } },
      { status: 413, headers: { "Cache-Control": "no-store" } },
    );
  }

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
