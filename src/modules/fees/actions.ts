"use server";

import { revalidatePath } from "next/cache";
import { parseInput } from "@/server/action";
import { runActionAndRefresh } from "@/server/action-refresh";
import { requireTenantContext } from "@/server/tenancy/context";
import {
  addFamilyMember,
  createFamily,
  deleteFamilyMember,
  dissolveFamily,
  endFamilyMember,
  updateFamily,
} from "./families";
import { executeFeeRun, revertFeeRun, voidCharge } from "./run";
import {
  assignmentDeleteSchema,
  assignmentEndSchema,
  assignmentSchema,
  chargeVoidSchema,
  familyCreateSchema,
  familyDissolveSchema,
  familyMemberAddSchema,
  familyMemberDeleteSchema,
  familyMemberEndSchema,
  familyUpdateSchema,
  feeRateDeleteSchema,
  feeRunExecuteSchema,
  feeRunRevertSchema,
  feeRateSchema,
  feeSettingsSchema,
  feeTypeArchiveSchema,
  feeTypeCreateSchema,
  feeTypeMoveSchema,
  feeTypeUpdateSchema,
  memberFinanceSchema,
} from "./schemas";
import {
  addAssignment,
  addFeeRate,
  archiveFeeType,
  deleteAssignment,
  createFeeType,
  deleteFeeRate,
  endAssignment,
  moveFeeType,
  updateFeeSettings,
  updateFeeType,
  updateMemberFinance,
} from "./service";

/** Beiträge ändern die Finanzseiten und die Seiten der Mitglieder (Karte „Beitrag“). */
function refresh() {
  revalidatePath("/finanzen", "layout");
  revalidatePath("/mitglieder", "layout");
}

export async function createFeeTypeAction(input: unknown) {
  return runActionAndRefresh("fee-type", refresh, async () =>
    createFeeType(await requireTenantContext(), parseInput(feeTypeCreateSchema, input)),
  );
}

export async function updateFeeTypeAction(input: unknown) {
  return runActionAndRefresh("fee-type", refresh, async () =>
    updateFeeType(await requireTenantContext(), parseInput(feeTypeUpdateSchema, input)),
  );
}

export async function archiveFeeTypeAction(input: unknown) {
  return runActionAndRefresh("fee-type", refresh, async () =>
    archiveFeeType(await requireTenantContext(), parseInput(feeTypeArchiveSchema, input)),
  );
}

export async function moveFeeTypeAction(input: unknown) {
  return runActionAndRefresh("fee-type", refresh, async () =>
    moveFeeType(await requireTenantContext(), parseInput(feeTypeMoveSchema, input)),
  );
}

export async function addFeeRateAction(input: unknown) {
  return runActionAndRefresh("fee-rate", refresh, async () =>
    addFeeRate(await requireTenantContext(), parseInput(feeRateSchema, input)),
  );
}

export async function deleteFeeRateAction(input: unknown) {
  return runActionAndRefresh("fee-rate", refresh, async () =>
    deleteFeeRate(await requireTenantContext(), parseInput(feeRateDeleteSchema, input)),
  );
}

export async function updateMemberFinanceAction(input: unknown) {
  return runActionAndRefresh("member-finance", refresh, async () =>
    updateMemberFinance(await requireTenantContext(), parseInput(memberFinanceSchema, input)),
  );
}

export async function addAssignmentAction(input: unknown) {
  return runActionAndRefresh("fee-assignment", refresh, async () =>
    addAssignment(await requireTenantContext(), parseInput(assignmentSchema, input)),
  );
}

export async function endAssignmentAction(input: unknown) {
  return runActionAndRefresh("fee-assignment", refresh, async () =>
    endAssignment(await requireTenantContext(), parseInput(assignmentEndSchema, input)),
  );
}

export async function updateFeeSettingsAction(input: unknown) {
  return runActionAndRefresh("fee-settings", refresh, async () =>
    updateFeeSettings(await requireTenantContext(), parseInput(feeSettingsSchema, input)),
  );
}

export async function deleteAssignmentAction(input: unknown) {
  return runActionAndRefresh("fee-assignment", refresh, async () =>
    deleteAssignment(await requireTenantContext(), parseInput(assignmentDeleteSchema, input)),
  );
}

export async function createFamilyAction(input: unknown) {
  return runActionAndRefresh("fee-family", refresh, async () =>
    createFamily(await requireTenantContext(), parseInput(familyCreateSchema, input)),
  );
}

export async function updateFamilyAction(input: unknown) {
  return runActionAndRefresh("fee-family", refresh, async () =>
    updateFamily(await requireTenantContext(), parseInput(familyUpdateSchema, input)),
  );
}

export async function addFamilyMemberAction(input: unknown) {
  return runActionAndRefresh("fee-family", refresh, async () =>
    addFamilyMember(await requireTenantContext(), parseInput(familyMemberAddSchema, input)),
  );
}

export async function endFamilyMemberAction(input: unknown) {
  return runActionAndRefresh("fee-family", refresh, async () =>
    endFamilyMember(await requireTenantContext(), parseInput(familyMemberEndSchema, input)),
  );
}

export async function deleteFamilyMemberAction(input: unknown) {
  return runActionAndRefresh("fee-family", refresh, async () =>
    deleteFamilyMember(await requireTenantContext(), parseInput(familyMemberDeleteSchema, input)),
  );
}

export async function dissolveFamilyAction(input: unknown) {
  return runActionAndRefresh("fee-family", refresh, async () =>
    dissolveFamily(await requireTenantContext(), parseInput(familyDissolveSchema, input)),
  );
}

export async function executeFeeRunAction(input: unknown) {
  return runActionAndRefresh("fee-run", refresh, async () =>
    executeFeeRun(await requireTenantContext(), parseInput(feeRunExecuteSchema, input)),
  );
}

export async function revertFeeRunAction(input: unknown) {
  return runActionAndRefresh("fee-run", refresh, async () =>
    revertFeeRun(await requireTenantContext(), parseInput(feeRunRevertSchema, input)),
  );
}

export async function voidChargeAction(input: unknown) {
  return runActionAndRefresh("charge", refresh, async () =>
    voidCharge(await requireTenantContext(), parseInput(chargeVoidSchema, input)),
  );
}
