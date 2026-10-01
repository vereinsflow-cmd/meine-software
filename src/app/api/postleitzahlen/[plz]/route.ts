import type { NextRequest } from "next/server";
import { isGermanPostalCode } from "@/lib/postal-code";
import { apiHandler, jsonOk } from "@/server/api";
import { validationFailed } from "@/server/errors";
import { placesForPostalCode } from "@/server/geo/postal-codes";

type RouteContext = { params: Promise<{ plz: string }> };

/**
 * Orte zu einer deutschen Postleitzahl (`{ places: [...] }`, leer, wenn unbekannt) – für „Ort automatisch ergänzen“.
 * Öffentliche Verzeichnisdaten ohne Bezug zu Personen oder Vereinen, deshalb ohne Anmeldung und gut zwischenspeicherbar.
 */
export const GET = apiHandler(async (_request: NextRequest, context: RouteContext) => {
  const { plz } = await context.params;
  if (!isGermanPostalCode(plz)) {
    throw validationFailed({ plz: ["Bitte gib eine fünfstellige Postleitzahl an."] });
  }
  return jsonOk(
    { places: placesForPostalCode(plz) },
    { headers: { "Cache-Control": "public, max-age=86400, stale-while-revalidate=604800" } },
  );
}, "postal-code");
