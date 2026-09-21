"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { parseInput, runAction, type ActionResult } from "@/server/action";
import { getCurrentSession } from "@/server/auth/session";
import { unauthenticated } from "@/server/errors";
import { switchActiveClub } from "@/server/tenancy/clubs";

const switchSchema = z.object({ clubId: z.string().min(1).max(64) });

/** Wechselt den aktiven Verein. Die Zugehörigkeit wird serverseitig geprüft. */
export async function switchClubAction(input: unknown): Promise<ActionResult> {
  return runAction(async () => {
    const { clubId } = parseInput(switchSchema, input);
    const session = await getCurrentSession();
    if (!session) throw unauthenticated();
    await switchActiveClub(session.id, session.user.id, clubId);
    // Das Layout (Vereinsname, Menü, Benachrichtigungen) ist vereinsabhängig und würde sonst im
    // Client-Cache des Routers veraltet bleiben.
    revalidatePath("/", "layout");
    redirect("/dashboard");
  }, "switch-club");
}
