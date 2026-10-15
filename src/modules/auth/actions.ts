"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { parseInput, runAction, type ActionResult } from "@/server/action";
import { recordSystemAudit } from "@/server/audit/audit";
import {
  acceptInvitationAsExistingUser,
  acceptInvitationAsNewUser,
} from "@/server/auth/invitations";
import {
  clearLoginChallenge,
  readLoginChallenge,
  startLoginChallenge,
} from "@/server/auth/login-challenge";
import {
  changePassword,
  authenticate,
  needsSecondFactor,
  requestPasswordReset,
  resetPassword,
  type AuthenticatedUser,
} from "@/server/auth/service";
import { endSession, getCurrentSession, startSession } from "@/server/auth/session";
import { setSessionActiveClub } from "@/server/auth/session-core";
import { verifySecondFactor } from "@/server/auth/two-factor";
import { AppError, unauthenticated } from "@/server/errors";
import { getRequestMeta } from "@/server/security/request";
import { safeRedirectPath } from "@/lib/safe-redirect";
import {
  acceptExistingInvitationSchema,
  acceptInvitationSchema,
  changePasswordSchema,
  forgotPasswordSchema,
  loginSchema,
  resetPasswordSchema,
  secondFactorSchema,
} from "./schemas";

/**
 * Server Actions der Anmelde-Seiten. Jede Action validiert die Eingabe erneut auf dem Server,
 * denn die Prüfung im Browser lässt sich umgehen.
 */

/** Startseite nach der Anmeldung, wenn kein (gültiges) Rücksprungziel mitkam. */
const homeFor = (user: AuthenticatedUser) =>
  user.activeClubId ? "/dashboard" : user.isPlatformAdmin ? "/system" : "/kein-verein";

export async function loginAction(input: unknown): Promise<ActionResult> {
  return runAction(async () => {
    const data = parseInput(loginSchema, input);
    const meta = await getRequestMeta();
    const result = await authenticate(data, meta);

    if (needsSecondFactor(result)) {
      // Passwort richtig, aber noch keine Sitzung: Erst der Code aus der App meldet an.
      await startLoginChallenge({
        userId: result.userId,
        next: data.next && safeRedirectPath(data.next, "") ? data.next : null,
        passwordFingerprint: result.passwordFingerprint,
      });
      redirect("/anmelden/bestaetigen");
    }

    await clearLoginChallenge(); // Reste eines abgebrochenen zweiten Schritts
    await startSession(result.userId, result.activeClubId);
    revalidatePath("/", "layout"); // Kein Layout eines früheren Benutzers im Client-Cache behalten
    redirect(safeRedirectPath(data.next, homeFor(result)));
  }, "login");
}

/**
 * Zweiter Schritt der Anmeldung: Code aus der App oder Wiederherstellungscode. Wer das Passwort richtig eingegeben hat,
 * steht nur im kurzlebigen, verschlüsselten Cookie – nie in einem Formularfeld.
 */
export async function verifySecondFactorAction(input: unknown): Promise<ActionResult> {
  return runAction(async () => {
    const data = parseInput(secondFactorSchema, input);
    const challenge = await readLoginChallenge();
    if (!challenge) {
      await clearLoginChallenge();
      redirect("/anmelden?abgelaufen=1");
    }

    let user: AuthenticatedUser;
    try {
      ({ user } = await verifySecondFactor(
        {
          userId: challenge.userId,
          passwordFingerprint: challenge.passwordFingerprint,
          code: data.code,
        },
        await getRequestMeta(),
      ));
    } catch (error) {
      // Konto inzwischen gesperrt, Passwort geändert oder Zwei-Faktor abgeschaltet: von vorn beginnen.
      if (error instanceof AppError && error.code === "UNAUTHENTICATED") {
        await clearLoginChallenge();
        redirect("/anmelden?abgelaufen=1");
      }
      throw error;
    }

    await clearLoginChallenge();
    await startSession(user.userId, user.activeClubId);
    revalidatePath("/", "layout");
    redirect(safeRedirectPath(challenge.next, homeFor(user)));
  }, "login-second-factor");
}

/** „Abbrechen“ im zweiten Schritt: Der Zwischenstand wird verworfen, zurück zur Anmeldung. */
export async function cancelSecondFactorAction(): Promise<void> {
  await clearLoginChallenge();
  redirect("/anmelden");
}

export async function logoutAction(): Promise<void> {
  const session = await getCurrentSession();
  if (session) {
    await recordSystemAudit({
      clubId: session.activeClubId,
      actorUserId: session.user.id,
      action: "auth.logout",
      entityType: "User",
      entityId: session.user.id,
      summary: "Abmeldung",
    });
  }
  await endSession();
  revalidatePath("/", "layout");
  redirect("/anmelden");
}

/** Antwortet immer gleich – egal ob die Adresse existiert (keine Konto-Enumeration). */
export async function forgotPasswordAction(input: unknown): Promise<ActionResult> {
  return runAction(async () => {
    const data = parseInput(forgotPasswordSchema, input);
    await requestPasswordReset(data.email, await getRequestMeta());
    return undefined;
  }, "forgot-password");
}

export async function resetPasswordAction(input: unknown): Promise<ActionResult> {
  return runAction(async () => {
    const data = parseInput(resetPasswordSchema, input);
    await resetPassword({ token: data.token, password: data.password }, await getRequestMeta());
    redirect("/anmelden?reset=1");
  }, "reset-password");
}

export async function acceptInvitationAction(input: unknown): Promise<ActionResult> {
  return runAction(async () => {
    const data = parseInput(acceptInvitationSchema, input);
    const { userId, clubId } = await acceptInvitationAsNewUser(
      {
        token: data.token,
        firstName: data.firstName,
        lastName: data.lastName,
        password: data.password,
      },
      await getRequestMeta(),
    );
    await startSession(userId, clubId);
    revalidatePath("/", "layout");
    redirect("/dashboard");
  }, "accept-invitation");
}

/** Für bereits registrierte Personen: Sie müssen angemeldet sein (der Link allein reicht nie). */
export async function acceptInvitationExistingAction(input: unknown): Promise<ActionResult> {
  return runAction(async () => {
    const data = parseInput(acceptExistingInvitationSchema, input);
    const session = await getCurrentSession();
    if (!session) throw unauthenticated("Bitte melde dich zuerst an, um die Einladung anzunehmen.");

    const { clubId } = await acceptInvitationAsExistingUser(
      { token: data.token, userId: session.user.id },
      await getRequestMeta(),
    );
    await setSessionActiveClub(session.id, clubId);
    revalidatePath("/", "layout");
    redirect("/dashboard");
  }, "accept-invitation-existing");
}

export async function changePasswordAction(input: unknown): Promise<ActionResult> {
  return runAction(async () => {
    const data = parseInput(changePasswordSchema, input);
    const session = await getCurrentSession();
    if (!session) throw unauthenticated();
    await changePassword(
      {
        userId: session.user.id,
        currentPassword: data.currentPassword,
        newPassword: data.newPassword,
        keepSessionId: session.id,
      },
      await getRequestMeta(),
    );
    return undefined;
  }, "change-password");
}
