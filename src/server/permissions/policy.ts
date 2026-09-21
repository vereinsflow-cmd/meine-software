import type { PermissionScope } from "@/generated/prisma/enums";
import { forbidden } from "@/server/errors";
import type { PermissionKey } from "./catalog";

/**
 * Berechtigungsprüfung. Reine Funktionen ohne Datenbankzugriff (einzeln testbar).
 *
 * Eine Berechtigung hat je Rolle eine Reichweite (`PermissionScope`):
 *   CLUB       – gilt für den ganzen Verein
 *   DEPARTMENT – gilt nur für Datensätze der Abteilungen, die der Benutzer leitet
 *   OWN        – gilt nur für die eigenen Datensätze
 */
export interface PermissionHolder {
  userId: string;
  /** Mitgliedsdatensatz des Benutzers im aktuellen Verein (falls vorhanden). */
  memberId: string | null;
  /** Abteilungen, die der Benutzer als Leiter verantwortet. */
  ledDepartmentIds: readonly string[];
  permissions: ReadonlyMap<PermissionKey, PermissionScope>;
}

/** Beschreibt, worauf sich eine Aktion bezieht – nötig für DEPARTMENT- und OWN-Berechtigungen. */
export interface ResourceRef {
  /** Abteilungen, denen der Datensatz zugeordnet ist (leer/undefined = keiner Abteilung zugeordnet). */
  departmentIds?: readonly string[] | null;
  /** Mitglied, dem der Datensatz "gehört". */
  ownerMemberId?: string | null;
  /** Benutzer, dem der Datensatz "gehört". */
  ownerUserId?: string | null;
}

export function scopeOf(holder: PermissionHolder, key: PermissionKey): PermissionScope | null {
  return holder.permissions.get(key) ?? null;
}

/**
 * Ohne `resource`: "Darf der Benutzer diese Aktion grundsätzlich (in irgendeiner Reichweite)?"
 * Mit `resource`: "Darf er sie für genau diesen Datensatz?"
 */
export function can(holder: PermissionHolder, key: PermissionKey, resource?: ResourceRef): boolean {
  const scope = scopeOf(holder, key);
  if (scope === null) return false;
  if (resource === undefined) return true;

  switch (scope) {
    case "CLUB":
      return true;
    case "DEPARTMENT":
      return (resource.departmentIds ?? []).some((id) => holder.ledDepartmentIds.includes(id));
    case "OWN":
      return (
        (resource.ownerMemberId != null && resource.ownerMemberId === holder.memberId) ||
        (resource.ownerUserId != null && resource.ownerUserId === holder.userId)
      );
  }
}

/** Wirft `ForbiddenError`, wenn die Aktion nicht erlaubt ist. */
export function assertCan(
  holder: PermissionHolder,
  key: PermissionKey,
  resource?: ResourceRef,
): void {
  if (!can(holder, key, resource)) {
    throw forbidden();
  }
}

export interface ScopeBuilders<W> {
  /** Filter für Datensätze der geleiteten Abteilungen (bei leerer Liste darf nichts passen). */
  department: (departmentIds: readonly string[]) => W;
  /** Filter für die eigenen Datensätze. */
  own: (holder: PermissionHolder) => W;
}

/**
 * Liefert den zusätzlichen `where`-Filter, der für Listenabfragen gilt:
 * `undefined` = keine Einschränkung (CLUB), sonst der Abteilungs- bzw. Eigen-Filter.
 * Fehlt die Berechtigung ganz, wird `ForbiddenError` geworfen.
 */
export function scopeFilter<W>(
  holder: PermissionHolder,
  key: PermissionKey,
  builders: ScopeBuilders<W>,
): W | undefined {
  const scope = scopeOf(holder, key);
  if (scope === null) throw forbidden();
  switch (scope) {
    case "CLUB":
      return undefined;
    case "DEPARTMENT":
      return builders.department(holder.ledDepartmentIds);
    case "OWN":
      return builders.own(holder);
  }
}
