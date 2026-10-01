"use server";

import { revalidatePath } from "next/cache";
import { parseInput, runAction, type ActionResult } from "@/server/action";
import { getRequestMeta } from "@/server/security/request";
import { requireTenantContext } from "@/server/tenancy/context";
import { applicationFormSchema, idSchema, joinLimitSchema } from "./schemas";
import {
  acceptApplication,
  closeJoinLink,
  enableJoinLink,
  rejectApplication,
  renewJoinLink,
  resendApplicationInvitation,
  setJoinLimit,
  submitApplication,
  type AcceptResult,
} from "./service";

/**
 * Server Actions zum Beitritt per QR-Code. Jede Action prüft die Eingabe mit Zod; die Rechte prüft der Dienst.
 * Die öffentliche Action (`submitApplicationAction`) braucht keine Anmeldung – der Beitrittslink im Formular ist ihr
 * einziger Bezug zum Verein.
 */
const refresh = () => {
  revalidatePath("/mitglieder");
  revalidatePath("/mitglieder/antraege");
  revalidatePath("/mitglieder/antraege/aushang");
};

/** Öffentliches Antragsformular. Antwortet bei einem ausgefüllten Honigtopf genauso wie bei Erfolg. */
export async function submitApplicationAction(input: unknown): Promise<ActionResult> {
  return runAction(async () => {
    const data = parseInput(applicationFormSchema, input);
    await submitApplication(data, await getRequestMeta());
    return undefined;
  }, "application-submit");
}

/** Der Link wird hier nicht zurückgegeben: Die Seite lädt ihn nach dem Neuladen selbst (nur für Berechtigte). */
export async function enableJoinLinkAction(input: unknown): Promise<ActionResult> {
  return runAction(async () => {
    const { limit } = parseInput(joinLimitSchema, input);
    await enableJoinLink(await requireTenantContext(), limit);
    refresh();
    return undefined;
  }, "join-link-enable");
}

export async function renewJoinLinkAction(input: unknown): Promise<ActionResult> {
  return runAction(async () => {
    const { limit } = parseInput(joinLimitSchema, input);
    await renewJoinLink(await requireTenantContext(), limit);
    refresh();
    return undefined;
  }, "join-link-renew");
}

export async function setJoinLimitAction(input: unknown): Promise<ActionResult> {
  return runAction(async () => {
    const { limit } = parseInput(joinLimitSchema, input);
    await setJoinLimit(await requireTenantContext(), limit);
    refresh();
    return undefined;
  }, "join-limit-set");
}

export async function closeJoinLinkAction(): Promise<ActionResult> {
  return runAction(async () => {
    await closeJoinLink(await requireTenantContext());
    refresh();
    return undefined;
  }, "join-link-close");
}

export async function acceptApplicationAction(input: unknown): Promise<ActionResult<AcceptResult>> {
  return runAction(async () => {
    const { id } = parseInput(idSchema, input);
    const result = await acceptApplication(await requireTenantContext(), id);
    refresh();
    revalidatePath("/dashboard");
    return result;
  }, "application-accept");
}

/** Einladung zu einem angenommenen Antrag erneut senden (nicht verschickt oder abgelaufen); liefert die Adresse. */
export async function resendApplicationInvitationAction(
  input: unknown,
): Promise<ActionResult<{ email: string }>> {
  return runAction(async () => {
    const { id } = parseInput(idSchema, input);
    const result = await resendApplicationInvitation(await requireTenantContext(), id);
    revalidatePath("/mitglieder/antraege");
    return result;
  }, "application-invite-resend");
}

export async function rejectApplicationAction(input: unknown): Promise<ActionResult> {
  return runAction(async () => {
    const { id } = parseInput(idSchema, input);
    await rejectApplication(await requireTenantContext(), id);
    refresh();
    return undefined;
  }, "application-reject");
}
