import "server-only";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { SETUP_PATH, hasRequiredClubData, isAllowedDuringSetup } from "@/lib/club-setup";
import { can } from "@/server/permissions/policy";
import type { TenantContext } from "./context-core";

/**
 * Neuer Verein, Einrichtung noch nicht abgeschlossen: Wer ihn verwalten darf (`club:update`), arbeitet bis dahin nur im
 * Assistenten „Verein einrichten“ – ohne Menü und ohne die übrigen Bereiche. Alle anderen Mitglieder sehen die App wie
 * gewohnt (sie könnten den Verein ohnehin nicht einrichten).
 */
export function isSetupLocked(ctx: TenantContext): boolean {
  return ctx.club.setupCompletedAt === null && can(ctx, "club:update");
}

/**
 * Leitet während der Einrichtung jede andere Seite auf den Assistenten um. Läuft in `requirePageContext` jeder Seite –
 * auch beim Wechsel innerhalb der App (dabei wird das gemeinsame Layout nicht neu berechnet, die Seite schon).
 * Benutzerführung, keine Sicherheitsgrenze: Die Rechte der Person bleiben unverändert.
 */
export async function enforceSetupGate(ctx: TenantContext): Promise<void> {
  if (!isSetupLocked(ctx)) return;
  const pathname = (await headers()).get("x-vf-pathname");
  // Vorabrufe (Prefetch) laufen nicht über den Proxy und tragen keinen Pfad; geprüft wird die eigentliche Navigation.
  if (!pathname || isAllowedDuringSetup(pathname, false)) return;
  const club = await ctx.db.club.findFirst({
    select: { contactEmail: true, street: true, postalCode: true, city: true },
  });
  if (!isAllowedDuringSetup(pathname, club !== null && hasRequiredClubData(club))) {
    redirect(SETUP_PATH);
  }
}
