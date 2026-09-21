"use server";

import { revalidatePath } from "next/cache";
import { parseInput, runAction, type ActionResult } from "@/server/action";
import {
  revokeOtherSessions,
  revokeOwnSession,
  setEmailNotifications,
  updateOwnName,
} from "@/server/auth/profile";
import { getCurrentSession } from "@/server/auth/session";
import { unauthenticated } from "@/server/errors";
import { getRequestMeta } from "@/server/security/request";
import { emailNotificationsSchema, profileNameSchema, revokeSessionSchema } from "./schemas";

/** Server Actions des Profils. Die Benutzer-ID stammt immer aus der geprüften Sitzung, nie aus der Eingabe. */
async function requireSession() {
  const session = await getCurrentSession();
  if (!session) throw unauthenticated();
  return session;
}

export async function updateProfileAction(input: unknown): Promise<ActionResult> {
  return runAction(async () => {
    const data = parseInput(profileNameSchema, input);
    const session = await requireSession();
    const { ipPrefix } = await getRequestMeta();
    await updateOwnName(session.user.id, data, { ipPrefix });
    revalidatePath("/", "layout"); // Name im Benutzermenü
    return undefined;
  }, "profile-update");
}

export async function setEmailNotificationsAction(input: unknown): Promise<ActionResult> {
  return runAction(async () => {
    const { enabled } = parseInput(emailNotificationsSchema, input);
    const session = await requireSession();
    await setEmailNotifications(session.user.id, enabled);
    revalidatePath("/profil");
    return undefined;
  }, "profile-email-notifications");
}

export async function revokeSessionAction(input: unknown): Promise<ActionResult> {
  return runAction(async () => {
    const { sessionId } = parseInput(revokeSessionSchema, input);
    const session = await requireSession();
    await revokeOwnSession(session.user.id, sessionId, session.id);
    revalidatePath("/profil");
    return undefined;
  }, "profile-session-revoke");
}

export async function revokeOtherSessionsAction(): Promise<ActionResult<{ count: number }>> {
  return runAction(async () => {
    const session = await requireSession();
    const count = await revokeOtherSessions(session.user.id, session.id);
    revalidatePath("/profil");
    return { count };
  }, "profile-sessions-revoke-others");
}
