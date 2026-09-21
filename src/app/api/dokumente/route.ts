import { NextResponse, type NextRequest } from "next/server";
import { uploadMetaSchema } from "@/modules/documents/schemas";
import { uploadDocument } from "@/modules/documents/service";
import { apiHandler, jsonOk } from "@/server/api";
import { env } from "@/server/env";
import { parseInput } from "@/server/action";
import { validationFailed } from "@/server/errors";
import { requireTenantContext } from "@/server/tenancy/context";

/**
 * Dokument hochladen (multipart/form-data: `file`, `access`, optional `category` und `eventId`).
 *
 * Schutz: Anmeldung und Berechtigung werden VOR dem Lesen des Inhalts geprüft; die Herkunft des Aufrufs wird geprüft
 * (`apiHandler`, gegen CSRF); die angekündigte Größe wird abgelehnt, bevor der Inhalt gelesen wird. Dateityp, Größe,
 * Speicherkontingent und Zugriffsstufen prüft der Dienst (`uploadDocument`) – auf Basis des Inhalts, nie der Angaben.
 * Hinter einem Reverse-Proxy sollte zusätzlich dessen Größenlimit gesetzt sein (siehe Betriebshinweise).
 */
export const POST = apiHandler(async (request: NextRequest) => {
  const ctx = await requireTenantContext();

  const limit = env.MAX_UPLOAD_MB * 1024 * 1024 + 256 * 1024; // Datei plus Formular-Overhead
  const announced = Number(request.headers.get("content-length") ?? "0");
  if (Number.isFinite(announced) && announced > limit) {
    return NextResponse.json(
      {
        ok: false,
        error: {
          code: "VALIDATION",
          message: `Die Datei ist zu groß (höchstens ${env.MAX_UPLOAD_MB} MB).`,
          fieldErrors: { file: [`Die Datei ist zu groß (höchstens ${env.MAX_UPLOAD_MB} MB).`] },
        },
      },
      { status: 413, headers: { "Cache-Control": "no-store" } },
    );
  }

  const form = await request.formData();
  const file = form.get("file");
  if (!(file instanceof File)) throw validationFailed({ file: ["Bitte wähle eine Datei aus."] });
  const meta = parseInput(uploadMetaSchema, {
    category: form.get("category") ?? undefined,
    access: form.get("access") ?? "ALL_MEMBERS",
    eventId: form.get("eventId") ?? undefined,
  });

  const bytes = new Uint8Array(await file.arrayBuffer());
  const result = await uploadDocument(ctx, { fileName: file.name, bytes, ...meta });
  return jsonOk(result, { status: 201, headers: { "Cache-Control": "no-store" } });
}, "document-upload");
