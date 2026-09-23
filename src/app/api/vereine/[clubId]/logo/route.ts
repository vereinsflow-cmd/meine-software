import { revalidatePath } from "next/cache";
import { NextResponse, type NextRequest } from "next/server";
import { CLUB_LOGO_MAX_BYTES } from "@/lib/club-logo";
import { formatBytes } from "@/lib/uploads";
import { openClubLogo, updateClubLogo } from "@/modules/clubs/service";
import { apiHandler, jsonOk } from "@/server/api";
import { notFound, validationFailed } from "@/server/errors";
import { getRequestMeta } from "@/server/security/request";
import { loadTenantContextForUser } from "@/server/tenancy/context-core";
import { requireTenantContext, requireUser } from "@/server/tenancy/context";

type RouteContext = { params: Promise<{ clubId: string }> };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

/**
 * Vereinslogo anzeigen.
 *
 * Schutz: Nur angemeldete Mitglieder des Vereins in der URL erhalten das Bild – geprüft über eine AKTIVE Mitgliedschaft
 * in einem AKTIVEN Verein (`loadTenantContextForUser`, ohne Ausweichen auf einen anderen Verein). So kann der
 * Vereinswechsler auch die Logos der übrigen eigenen Vereine zeigen; für alle anderen – fremde, unbekannte oder
 * deaktivierte Vereine, Vereine ohne Logo – lautet die Antwort gleich „nicht gefunden“ (kein Hinweis auf Bestehen).
 * Ausgeliefert wird:
 *  - mit dem Medientyp aus der Positivliste (nur Rasterbilder, nie SVG) und `nosniff`,
 *  - mit `sandbox`-CSP und nur für dieselbe Herkunft (`Cross-Origin-Resource-Policy`),
 *  - nur im Browser zwischengespeichert (`private`), lange nur bei passender Version – ein neues Logo hat eine neue
 *    Adresse; eine veraltete oder geratene Version wird jedes Mal neu geprüft.
 */
export const GET = apiHandler(async (request: NextRequest, context: RouteContext) => {
  const { clubId } = await context.params;
  const user = await requireUser();
  if (!UUID.test(clubId)) throw notFound("Das Logo");
  const meta = await getRequestMeta();
  const ctx = await loadTenantContextForUser(user.id, clubId, { ipPrefix: meta.ipPrefix });
  if (!ctx) throw notFound("Das Logo");

  const logo = await openClubLogo(ctx);
  const etag = `"${logo.version}"`;
  const current = request.nextUrl.searchParams.get("v") === logo.version;
  const headers = {
    "Content-Type": logo.mimeType,
    "Content-Disposition": `inline; filename="vereinslogo.${logo.ext}"`,
    "X-Content-Type-Options": "nosniff",
    "Content-Security-Policy": "sandbox; default-src 'none'",
    "Cross-Origin-Resource-Policy": "same-origin",
    "Referrer-Policy": "no-referrer",
    "Cache-Control": current ? "private, max-age=31536000, immutable" : "private, no-cache",
    ETag: etag,
  };
  if (request.headers.get("if-none-match") === etag) {
    await logo.stream.cancel();
    return new NextResponse(null, { status: 304, headers });
  }
  return new NextResponse(logo.stream, {
    status: 200,
    headers: { ...headers, "Content-Length": String(logo.size) },
  });
}, "club-logo");

/**
 * Vereinslogo hochladen oder ersetzen (multipart/form-data: `file`).
 *
 * Schutz: Der Verein kommt aus der Sitzung, nie aus der URL – die ID in der Adresse muss dem aktiven Verein entsprechen,
 * sonst „nicht gefunden“. Anmeldung wird vor dem Lesen des Inhalts geprüft, die Herkunft des Aufrufs ebenfalls
 * (`apiHandler`, gegen CSRF), eine zu große angekündigte Datei wird abgelehnt, bevor sie gelesen wird. Berechtigung,
 * Format, Inhalt und Bildmaße prüft der Dienst (`updateClubLogo`).
 */
export const POST = apiHandler(async (request: NextRequest, context: RouteContext) => {
  const { clubId } = await context.params;
  const ctx = await requireTenantContext();
  if (clubId !== ctx.clubId) throw notFound("Der Verein");

  const limit = CLUB_LOGO_MAX_BYTES + 64 * 1024; // Datei plus Formular-Overhead
  const announced = Number(request.headers.get("content-length") ?? "0");
  if (Number.isFinite(announced) && announced > limit) {
    const message = `Das Logo ist zu groß (höchstens ${formatBytes(CLUB_LOGO_MAX_BYTES)}).`;
    return NextResponse.json(
      { ok: false, error: { code: "VALIDATION", message, fieldErrors: { file: [message] } } },
      { status: 413, headers: { "Cache-Control": "no-store" } },
    );
  }

  const form = await request.formData();
  const file = form.get("file");
  if (!(file instanceof File) || file.size === 0)
    throw validationFailed({ file: ["Bitte wähle eine Datei aus."] });

  const result = await updateClubLogo(ctx, {
    fileName: file.name,
    bytes: new Uint8Array(await file.arrayBuffer()),
  });
  revalidatePath("/", "layout"); // Logo erscheint in Kopfzeile und Vereinswechsler
  return jsonOk(result, { status: 200, headers: { "Cache-Control": "no-store" } });
}, "club-logo-upload");
