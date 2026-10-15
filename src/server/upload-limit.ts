import "server-only";
import { NextResponse } from "next/server";
import type { ApiResponse } from "@/lib/action-result";
import { env } from "./env";

/** Platz für die übrigen Felder des Formulars (multipart) neben der Datei – bei Dokumenten und Belegen. */
const DOCUMENT_FORM_OVERHEAD_BYTES = 256 * 1024;

/**
 * Vorab-Prüfung für Upload-Routen: Ist die angekündigte Größe (`Content-Length`) größer als `limitBytes`, wird der Upload
 * abgelehnt, BEVOR der Inhalt gelesen wird – mit HTTP 413 und der Meldung als Feldfehler am Feld `file` (wie die übrigen
 * Fehler der Route im Format `{ ok: false, error }`). Sonst `null`: weiter im Route Handler.
 *
 * Fehlt der Header oder ist er keine Zahl, entscheidet die Prüfung des Inhalts im Dienst (Größe, Typ, Kontingent) – die
 * Angabe des Browsers ist nur ein früher Riegel, kein Schutz. Hinter einem Reverse-Proxy gilt zusätzlich dessen Limit.
 */
export function rejectOversizedUpload(
  request: Request,
  limitBytes: number,
  message: string,
): NextResponse<ApiResponse<never>> | null {
  const announced = Number(request.headers.get("content-length") ?? "0");
  if (Number.isFinite(announced) && announced > limitBytes) {
    return NextResponse.json(
      {
        ok: false,
        error: { code: "VALIDATION", message, fieldErrors: { file: [message] } },
      } satisfies ApiResponse<never>,
      { status: 413, headers: { "Cache-Control": "no-store" } },
    );
  }
  return null;
}

/** Dokumente und Belege: höchstens `MAX_UPLOAD_MB` je Datei (plus Formular-Overhead). */
export function rejectOversizedDocumentUpload(
  request: Request,
): NextResponse<ApiResponse<never>> | null {
  return rejectOversizedUpload(
    request,
    env.MAX_UPLOAD_MB * 1024 * 1024 + DOCUMENT_FORM_OVERHEAD_BYTES,
    `Die Datei ist zu groß (höchstens ${env.MAX_UPLOAD_MB} MB).`,
  );
}
