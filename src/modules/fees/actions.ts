"use server";

import { revalidatePath } from "next/cache";
import { parseInput, runAction, type ActionResult } from "@/server/action";
import { requireTenantContext } from "@/server/tenancy/context";
import {
  assignmentDeleteSchema,
  assignmentEndSchema,
  assignmentSchema,
  feeRateDeleteSchema,
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

function action<T>(
  scope: string,
  run: (input: unknown) => Promise<T>,
): (input: unknown) => Promise<ActionResult<T>> {
  return async (input: unknown) =>
    runAction(async () => {
      const result = await run(input);
      refresh();
      return result;
    }, scope);
}

export async function createFeeTypeAction(input: unknown) {
  return action("fee-type", async (value) =>
    createFeeType(await requireTenantContext(), parseInput(feeTypeCreateSchema, value)),
  )(input);
}

export async function updateFeeTypeAction(input: unknown) {
  return action("fee-type", async (value) =>
    updateFeeType(await requireTenantContext(), parseInput(feeTypeUpdateSchema, value)),
  )(input);
}

export async function archiveFeeTypeAction(input: unknown) {
  return action("fee-type", async (value) =>
    archiveFeeType(await requireTenantContext(), parseInput(feeTypeArchiveSchema, value)),
  )(input);
}

export async function moveFeeTypeAction(input: unknown) {
  return action("fee-type", async (value) =>
    moveFeeType(await requireTenantContext(), parseInput(feeTypeMoveSchema, value)),
  )(input);
}

export async function addFeeRateAction(input: unknown) {
  return action("fee-rate", async (value) =>
    addFeeRate(await requireTenantContext(), parseInput(feeRateSchema, value)),
  )(input);
}

export async function deleteFeeRateAction(input: unknown) {
  return action("fee-rate", async (value) =>
    deleteFeeRate(await requireTenantContext(), parseInput(feeRateDeleteSchema, value)),
  )(input);
}

export async function updateMemberFinanceAction(input: unknown) {
  return action("member-finance", async (value) =>
    updateMemberFinance(await requireTenantContext(), parseInput(memberFinanceSchema, value)),
  )(input);
}

export async function addAssignmentAction(input: unknown) {
  return action("fee-assignment", async (value) =>
    addAssignment(await requireTenantContext(), parseInput(assignmentSchema, value)),
  )(input);
}

export async function endAssignmentAction(input: unknown) {
  return action("fee-assignment", async (value) =>
    endAssignment(await requireTenantContext(), parseInput(assignmentEndSchema, value)),
  )(input);
}

export async function updateFeeSettingsAction(input: unknown) {
  return action("fee-settings", async (value) =>
    updateFeeSettings(await requireTenantContext(), parseInput(feeSettingsSchema, value)),
  )(input);
}

export async function deleteAssignmentAction(input: unknown) {
  return action("fee-assignment", async (value) =>
    deleteAssignment(await requireTenantContext(), parseInput(assignmentDeleteSchema, value)),
  )(input);
}
