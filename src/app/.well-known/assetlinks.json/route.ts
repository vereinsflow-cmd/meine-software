import { NextResponse } from "next/server";
import { buildAssetLinks } from "@/server/asset-links";
import { env } from "@/server/env";

/**
 * Digital Asset Links für die Android-App (Trusted Web Activity): Android ruft diese Adresse ohne Anmeldung ab und verlangt
 * eine direkte Antwort (keine Weiterleitung, `application/json`) – deshalb steht sie in den öffentlichen Pfaden des Proxys.
 * Enthält nur Paketname und Zertifikats-Fingerabdrücke aus der Konfiguration (öffentliche Angaben), ohne Fingerabdruck `[]`.
 *
 * Zur Laufzeit erzeugt (nicht beim Build), weil die Werte aus den Umgebungsvariablen des Servers kommen.
 */
export const dynamic = "force-dynamic";

export function GET(): NextResponse {
  return NextResponse.json(buildAssetLinks(env.ANDROID_APP_PACKAGE, env.ANDROID_APP_CERT_SHA256), {
    // Öffentliche, selten geänderte Angabe: eine Stunde zwischenspeichern ist unbedenklich.
    headers: { "Cache-Control": "public, max-age=3600" },
  });
}
