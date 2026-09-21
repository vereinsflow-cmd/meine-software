"use server";

import { revalidatePath } from "next/cache";
import { parseInput, runAction, type ActionResult } from "@/server/action";
import { requireTenantContext } from "@/server/tenancy/context";
import { changeRoleSchema, idSchema, inviteSchema, membershipStatusSchema } from "./schemas";
import {
  changeUserRole,
  inviteUser,
  removeUser,
  resendInvitation,
  revokeInvitation,
  setUserStatus,
} from "./service";

const refresh = () => {
  revalidatePath("/benutzer");
  revalidatePath("/mitglieder");
};

export async function inviteUserAction(input: unknown): Promise<ActionResult> {
  return runAction(async () => {
    await inviteUser(await requireTenantContext(), parseInput(inviteSchema, input));
    refresh();
    return undefined;
  }, "user-invite");
}

export async function revokeInvitationAction(input: unknown): Promise<ActionResult> {
  return runAction(async () => {
    await revokeInvitation(await requireTenantContext(), parseInput(idSchema, input).id);
    refresh();
    return undefined;
  }, "invitation-revoke");
}

export async function resendInvitationAction(input: unknown): Promise<ActionResult> {
  return runAction(async () => {
    await resendInvitation(await requireTenantContext(), parseInput(idSchema, input).id);
    refresh();
    return undefined;
  }, "invitation-resend");
}

export async function changeRoleAction(input: unknown): Promise<ActionResult> {
  return runAction(async () => {
    await changeUserRole(await requireTenantContext(), parseInput(changeRoleSchema, input));
    refresh();
    return undefined;
  }, "user-role");
}

export async function setUserStatusAction(input: unknown): Promise<ActionResult> {
  return runAction(async () => {
    await setUserStatus(await requireTenantContext(), parseInput(membershipStatusSchema, input));
    refresh();
    return undefined;
  }, "user-status");
}

export async function removeUserAction(input: unknown): Promise<ActionResult> {
  return runAction(async () => {
    await removeUser(await requireTenantContext(), parseInput(idSchema, input).id);
    refresh();
    return undefined;
  }, "user-remove");
}
