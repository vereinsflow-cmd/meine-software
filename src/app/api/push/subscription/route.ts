import { NextResponse } from "next/server";
import { pushEndpointSchema, pushSubscribeSchema } from "@/modules/notifications/push-schemas";
import { registerPushSubscription, removePushSubscription } from "@/server/push/subscriptions";
import { parseInput } from "@/server/action";
import { apiHandler, jsonOk } from "@/server/api";
import { badRequest } from "@/server/errors";
import { getPushConfig } from "@/server/push/web-push";
import { enforceRateLimit } from "@/server/security/rate-limit";
import { getRequestMeta } from "@/server/security/request";
import { requireUser } from "@/server/tenancy/context";

/**
 * Push-Gerät der angemeldeten Person anmelden (POST) oder abmelden (DELETE). Die Benutzer-ID stammt aus der Sitzung; die
 * Herkunftsprüfung (CSRF) übernimmt `apiHandler`. Nur Adressen bekannter Push-Dienste werden angenommen (siehe
 * push-schemas.ts). Die Antwort enthält keine Adresse und keine Schlüssel.
 */
const NO_STORE = { "Cache-Control": "no-store" };

async function readJson(request: Request): Promise<unknown> {
  try {
    return await request.json();
  } catch {
    throw badRequest("Die Anfrage konnte nicht gelesen werden.");
  }
}

export const POST = apiHandler(async (request) => {
  const user = await requireUser();
  if (!getPushConfig()) throw badRequest("Push-Benachrichtigungen sind nicht eingerichtet.");
  await enforceRateLimit(`push-subscribe:user:${user.id}`, 20, 3600);
  const input = parseInput(pushSubscribeSchema, await readJson(request));
  const { userAgent } = await getRequestMeta();
  await registerPushSubscription(user.id, input, userAgent);
  return jsonOk({}, { headers: NO_STORE });
}, "push-subscribe");

export const DELETE = apiHandler(async (request) => {
  const user = await requireUser();
  await enforceRateLimit(`push-unsubscribe:user:${user.id}`, 60, 3600);
  const { endpoint } = parseInput(pushEndpointSchema, await readJson(request));
  await removePushSubscription(user.id, endpoint);
  return new NextResponse(null, { status: 204, headers: NO_STORE });
}, "push-unsubscribe");
