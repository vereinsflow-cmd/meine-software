"use server";

import { revalidatePath } from "next/cache";
import { parseInput, runAction, type ActionResult } from "@/server/action";
import { getCurrentSession } from "@/server/auth/session";
import { unauthenticated } from "@/server/errors";
import { cancelAccountDeletion, requestAccountDeletion } from "@/server/privacy/deletion";
import { getRequestMeta } from "@/server/security/request";
import { requireTenantContext } from "@/server/tenancy/context";
import { setOwnConsent } from "./consents";
import { consentSchema, deletionRequestSchema } from "./schemas";

export async function setConsentAction(input: unknown): Promise<ActionResult> {
  return runAction(async () => {
    const data = parseInput(consentSchema, input);
    const ctx = await requireTenantContext();
    await setOwnConsent(ctx, data);
    revalidatePath("/datenschutz");
    return undefined;
  }, "privacy-consent");
}

export async function requestDeletionAction(
  input: unknown,
): Promise<ActionResult<{ scheduledFor: string }>> {
  return runAction(async () => {
    const data = parseInput(deletionRequestSchema, input);
    const session = await getCurrentSession();
    if (!session) throw unauthenticated();
    const { ipPrefix } = await getRequestMeta();
    const pending = await requestAccountDeletion(
      { userId: session.user.id, password: data.password, reason: data.reason },
      { ipPrefix },
    );
    revalidatePath("/datenschutz");
    return { scheduledFor: pending.scheduledFor.toISOString() };
  }, "privacy-deletion-request");
}

export async function cancelDeletionAction(): Promise<ActionResult> {
  return runAction(async () => {
    const session = await getCurrentSession();
    if (!session) throw unauthenticated();
    const { ipPrefix } = await getRequestMeta();
    await cancelAccountDeletion(session.user.id, { ipPrefix });
    revalidatePath("/datenschutz");
    return undefined;
  }, "privacy-deletion-cancel");
}
