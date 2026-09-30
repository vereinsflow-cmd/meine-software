import { pushEndpointSchema } from "@/modules/notifications/push-schemas";
import { ownsPushSubscription } from "@/server/push/subscriptions";
import { parseInput } from "@/server/action";
import { apiHandler, jsonOk } from "@/server/api";
import { badRequest } from "@/server/errors";
import { enforceRateLimit } from "@/server/security/rate-limit";
import { requireUser } from "@/server/tenancy/context";

/**
 * Ist dieses Gerät für die angemeldete Person eingeschaltet? Der Browser schickt seinen eigenen Endpunkt mit und erfährt nur
 * ja/nein – die Adressen der Geräte werden nie ausgeliefert. Als POST, damit die Adresse nicht in einer URL (Protokolle,
 * Verlauf) landet.
 */
export const POST = apiHandler(async (request) => {
  const user = await requireUser();
  await enforceRateLimit(`push-status:user:${user.id}`, 120, 3600);
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    throw badRequest("Die Anfrage konnte nicht gelesen werden.");
  }
  const { endpoint } = parseInput(pushEndpointSchema, body);
  return jsonOk(
    { subscribed: await ownsPushSubscription(user.id, endpoint) },
    { headers: { "Cache-Control": "no-store" } },
  );
}, "push-status");
