import type { PermissionKey } from "@/server/permissions/catalog";
import { forbidden } from "@/server/errors";
import { scopeOf, type PermissionHolder } from "@/server/permissions/policy";

/** Die Rechte des Finanzbereichs. */
export type FinanceKey = Extract<PermissionKey, `finance:${string}`>;

/**
 * Finanzen gibt es nur vereinsweit: Kontostände, Beiträge und Bankdaten lassen sich nicht sinnvoll auf „eigene Abteilung“ oder
 * „eigene Daten“ eingrenzen. Wer ein Finanzrecht nur mit Reichweite Abteilung oder eigene Daten hat (eigene Rolle), bekommt
 * deshalb keinen Zugang – lieber zu wenig als zu viel.
 */
export function canFinance(ctx: PermissionHolder, key: FinanceKey): boolean {
  return scopeOf(ctx, key) === "CLUB";
}

export function assertFinance(ctx: PermissionHolder, key: FinanceKey): void {
  if (!canFinance(ctx, key)) throw forbidden();
}
