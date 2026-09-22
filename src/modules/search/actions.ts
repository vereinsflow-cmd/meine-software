"use server";

import { z } from "zod";
import type { EntitySearchResult } from "@/lib/search/types";
import { parseInput, runAction, type ActionResult } from "@/server/action";
import { requireTenantContext } from "@/server/tenancy/context";
import { searchEntities } from "./service";

const querySchema = z.object({ q: z.string().max(100) });

/** Für die zentrale Suche (Strg/⌘+K): sucht Mitglieder, Veranstaltungen und Dokumente. */
export async function searchEntitiesAction(
  query: string,
): Promise<ActionResult<EntitySearchResult>> {
  return runAction(async () => {
    const { q } = parseInput(querySchema, { q: query });
    const ctx = await requireTenantContext();
    return searchEntities(ctx, q);
  }, "global-search");
}
