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
import {
  cancelTwoFactorSetup,
  confirmTwoFactorSetup,
  disableTwoFactor,
  renewRecoveryCodes,
  startTwoFactorSetup,
} from "@/server/auth/two-factor";
import { unauthenticated } from "@/server/errors";
import { getRequestMeta } from "@/server/security/request";
import {
  confirmTwoFactorSchema,
  emailNotificationsSchema,
  profileNameSchema,
  revokeSessionSchema,
  twoFactorProtectedSchema,
} from "./schemas";

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

// ---------------------------------------------------------------------------------------------------------------------
// Zwei-Faktor-Anmeldung
// ---------------------------------------------------------------------------------------------------------------------

/** Einrichtung beginnen: Danach zeigt die Profilseite QR-Code und Schlüssel. */
export async function startTwoFactorSetupAction(): Promise<ActionResult> {
  return runAction(async () => {
    const session = await requireSession();
    await startTwoFactorSetup(session.user.id);
    revalidatePath("/profil");
    return undefined;
  }, "profile-2fa-start");
}

export async function cancelTwoFactorSetupAction(): Promise<ActionResult> {
  return runAction(async () => {
    const session = await requireSession();
    await cancelTwoFactorSetup(session.user.id);
    revalidatePath("/profil");
    return undefined;
  }, "profile-2fa-cancel");
}

/**
 * Passwort und erster Code aus der App: schaltet ein und liefert die Wiederherstellungscodes – nur in dieser Antwort,
 * danach nie wieder. Bewusst ohne `revalidatePath`: Die Seite lädt erst neu, wenn die Person „Ich habe sie gespeichert“ wählt,
 * sonst verschwänden die Codes, bevor sie notiert sind.
 */
export async function confirmTwoFactorSetupAction(
  input: unknown,
): Promise<ActionResult<{ recoveryCodes: string[] }>> {
  return runAction(async () => {
    const { password, code } = parseInput(confirmTwoFactorSchema, input);
    const session = await requireSession();
    const recoveryCodes = await confirmTwoFactorSetup(
      { userId: session.user.id, password, code, keepSessionId: session.id },
      await getRequestMeta(),
    );
    return { recoveryCodes };
  }, "profile-2fa-confirm");
}

export async function disableTwoFactorAction(input: unknown): Promise<ActionResult> {
  return runAction(async () => {
    const data = parseInput(twoFactorProtectedSchema, input);
    const session = await requireSession();
    await disableTwoFactor({ userId: session.user.id, ...data }, await getRequestMeta());
    revalidatePath("/profil");
    return undefined;
  }, "profile-2fa-disable");
}

/** Neue Wiederherstellungscodes (wie beim Einschalten nur in dieser Antwort sichtbar). */
export async function renewRecoveryCodesAction(
  input: unknown,
): Promise<ActionResult<{ recoveryCodes: string[] }>> {
  return runAction(async () => {
    const data = parseInput(twoFactorProtectedSchema, input);
    const session = await requireSession();
    const recoveryCodes = await renewRecoveryCodes(
      { userId: session.user.id, ...data },
      await getRequestMeta(),
    );
    return { recoveryCodes };
  }, "profile-2fa-renew");
}
