"use server";

import { revalidatePath } from "next/cache";
import { parseInput, runAction, type ActionResult } from "@/server/action";
import { requireTenantContext } from "@/server/tenancy/context";
import {
  departmentSchema,
  groupMemberSchema,
  groupSchema,
  idSchema,
  leaderSchema,
} from "./schemas";
import {
  addGroupMember,
  createDepartment,
  createGroup,
  deleteDepartment,
  deleteGroup,
  removeGroupMember,
  setDepartmentActive,
  setDepartmentLeader,
  updateDepartment,
  updateGroup,
} from "./service";
import { z } from "zod";

const refresh = (id?: string) => {
  revalidatePath("/abteilungen");
  if (id) revalidatePath(`/abteilungen/${id}`);
  revalidatePath("/mitglieder");
};

export async function createDepartmentAction(
  input: unknown,
): Promise<ActionResult<{ id: string }>> {
  return runAction(async () => {
    const result = await createDepartment(
      await requireTenantContext(),
      parseInput(departmentSchema, input),
    );
    refresh();
    return result;
  }, "department-create");
}

export async function updateDepartmentAction(id: string, input: unknown): Promise<ActionResult> {
  return runAction(async () => {
    const { id: departmentId } = parseInput(idSchema, { id });
    await updateDepartment(
      await requireTenantContext(),
      departmentId,
      parseInput(departmentSchema, input),
    );
    refresh(departmentId);
    return undefined;
  }, "department-update");
}

export async function setDepartmentActiveAction(input: unknown): Promise<ActionResult> {
  return runAction(async () => {
    const { id, isActive } = parseInput(idSchema.extend({ isActive: z.boolean() }), input);
    await setDepartmentActive(await requireTenantContext(), id, isActive);
    refresh(id);
    return undefined;
  }, "department-active");
}

export async function deleteDepartmentAction(input: unknown): Promise<ActionResult> {
  return runAction(async () => {
    const { id } = parseInput(idSchema, input);
    await deleteDepartment(await requireTenantContext(), id);
    refresh();
    return undefined;
  }, "department-delete");
}

export async function setLeaderAction(input: unknown): Promise<ActionResult> {
  return runAction(async () => {
    const data = parseInput(leaderSchema, input);
    await setDepartmentLeader(await requireTenantContext(), data);
    refresh(data.departmentId);
    return undefined;
  }, "department-leader");
}

export async function createGroupAction(input: unknown): Promise<ActionResult<{ id: string }>> {
  return runAction(async () => {
    const data = parseInput(groupSchema, input);
    const result = await createGroup(await requireTenantContext(), data);
    refresh(data.departmentId);
    return result;
  }, "group-create");
}

export async function updateGroupAction(
  id: string,
  departmentId: string | undefined,
  input: unknown,
): Promise<ActionResult> {
  return runAction(async () => {
    const { id: groupId } = parseInput(idSchema, { id });
    const data = parseInput(groupSchema, input);
    await updateGroup(await requireTenantContext(), groupId, data);
    refresh(departmentId);
    return undefined;
  }, "group-update");
}

export async function deleteGroupAction(input: unknown): Promise<ActionResult> {
  return runAction(async () => {
    const { id, departmentId } = parseInput(
      idSchema.extend({ departmentId: z.string().optional() }),
      input,
    );
    await deleteGroup(await requireTenantContext(), id);
    refresh(departmentId);
    return undefined;
  }, "group-delete");
}

export async function addGroupMemberAction(input: unknown): Promise<ActionResult> {
  return runAction(async () => {
    const data = parseInput(
      groupMemberSchema.extend({ departmentId: z.string().optional() }),
      input,
    );
    await addGroupMember(await requireTenantContext(), data);
    refresh(data.departmentId);
    return undefined;
  }, "group-member-add");
}

export async function removeGroupMemberAction(input: unknown): Promise<ActionResult> {
  return runAction(async () => {
    const data = parseInput(
      groupMemberSchema.extend({ departmentId: z.string().optional() }),
      input,
    );
    await removeGroupMember(await requireTenantContext(), data);
    refresh(data.departmentId);
    return undefined;
  }, "group-member-remove");
}
