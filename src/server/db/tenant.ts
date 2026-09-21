import "server-only";
import type { Prisma } from "@/generated/prisma/client";
import { prisma } from "./client";

/**
 * Mandantenschutz auf Datenzugriffsebene.
 *
 * `createTenantDb(clubId)` liefert einen Prisma-Client, der JEDE Operation auf mandantenbezogenen
 * Tabellen automatisch auf den Verein `clubId` beschränkt:
 *   - Lesen/Ändern/Löschen: `clubId` wird in den `where`-Filter eingefügt; ein widersprechender
 *     Filter auf `clubId` ist ein Programmierfehler und wirft.
 *   - Anlegen: `clubId` wird fest gesetzt; ein abweichender Wert ist ein Fehler.
 *   - Ändern: `clubId` darf nicht verändert werden (kein "Umziehen" in einen anderen Verein).
 *   - Verschachtelte Schreibzugriffe (`create: { …, children: { create } }`) sind verboten,
 *     weil die Untertabellen den Filter umgehen würden.
 *   - Unbekannte Operationen und globale Tabellen werden abgelehnt (fail closed).
 *
 * Zusätzlich sichert die Datenbank selbst die Konsistenz (zusammengesetzte Fremdschlüssel).
 */

type ModelScope = "tenant" | "club" | "catalog" | "global";

/**
 * Klassifizierung ALLER Modelle. Der Typ `Record<Prisma.ModelName, …>` macht die Liste
 * vollständig: Ein neues Modell im Schema ohne Eintrag hier ist ein Compile-Fehler.
 * Ein Test gleicht die Einstufung zusätzlich mit den echten Datenbankspalten ab.
 *
 *   tenant  – trägt `clubId`; wird automatisch gefiltert
 *   club    – der Verein selbst; gefiltert über `id`, nur lesen/ändern
 *   catalog – globaler, schreibgeschützter Katalog (Permission)
 *   global  – plattformweit; nur über den systemweiten Client erreichbar
 */
export const MODEL_SCOPE = {
  User: "global",
  Session: "global",
  VerificationToken: "global",
  RateLimitBucket: "global",
  DeletionRequest: "global",
  Permission: "catalog",
  Club: "club",
  Role: "tenant",
  RolePermission: "tenant",
  ClubMembership: "tenant",
  Invitation: "tenant",
  Member: "tenant",
  Department: "tenant",
  MemberDepartment: "tenant",
  Group: "tenant",
  GroupMember: "tenant",
  Consent: "tenant",
  Event: "tenant",
  EventParticipant: "tenant",
  EventShift: "tenant",
  ShiftAssignment: "tenant",
  Task: "tenant",
  Checklist: "tenant",
  ChecklistItem: "tenant",
  Notification: "tenant",
  Message: "tenant",
  MessageRecipient: "tenant",
  DocumentFolder: "tenant",
  Document: "tenant",
  SupportTicket: "tenant",
  CalendarFeedToken: "tenant",
  AuditLog: "tenant",
} as const satisfies Record<Prisma.ModelName, ModelScope>;

export class TenantScopeError extends Error {
  constructor(message: string) {
    super(`[Mandantenschutz] ${message}`);
    this.name = "TenantScopeError";
  }
}

type Args = Record<string, unknown>;

const READ_WHERE_OPS = new Set([
  "findFirst",
  "findFirstOrThrow",
  "findMany",
  "count",
  "aggregate",
  "groupBy",
]);
const WRITE_WHERE_OPS = new Set(["updateMany", "updateManyAndReturn", "deleteMany"]);
const UNIQUE_OPS = new Set(["findUnique", "findUniqueOrThrow", "update", "delete"]);
const CREATE_OPS = new Set(["create", "createMany", "createManyAndReturn"]);

/** Schlüssel, die in `data` eine verschachtelte Relations-Operation kennzeichnen. */
const NESTED_WRITE_KEYS = new Set([
  "create",
  "createMany",
  "connect",
  "connectOrCreate",
  "disconnect",
  "delete",
  "deleteMany",
  "update",
  "updateMany",
  "upsert",
]);

function isPlainObject(value: unknown): value is Record<string, unknown> {
  if (value === null || typeof value !== "object") return false;
  const proto = Object.getPrototypeOf(value) as unknown;
  return proto === Object.prototype || proto === null;
}

function assertNoNestedWrites(model: string, data: Record<string, unknown>): void {
  for (const [field, value] of Object.entries(data)) {
    if (isPlainObject(value) && Object.keys(value).some((key) => NESTED_WRITE_KEYS.has(key))) {
      throw new TenantScopeError(
        `Verschachtelte Schreibzugriffe sind auf "${model}" nicht erlaubt (Feld "${field}"). ` +
          `Lege verbundene Datensätze einzeln an und übergib clubId und die Fremdschlüssel explizit.`,
      );
    }
  }
}

function withClubId(model: string, data: unknown, clubId: string): Record<string, unknown> {
  if (!isPlainObject(data)) {
    throw new TenantScopeError(`Ungültige Daten für "${model}".`);
  }
  if (data.clubId !== undefined && data.clubId !== clubId) {
    throw new TenantScopeError(`Zugriff auf einen fremden Verein bei "${model}" abgelehnt.`);
  }
  assertNoNestedWrites(model, data);
  return { ...data, clubId };
}

function withoutClubId(model: string, data: unknown, clubId: string): Record<string, unknown> {
  if (!isPlainObject(data)) {
    throw new TenantScopeError(`Ungültige Daten für "${model}".`);
  }
  if (data.clubId !== undefined && data.clubId !== clubId) {
    throw new TenantScopeError(
      `Ein Datensatz von "${model}" darf nicht in einen anderen Verein verschoben werden.`,
    );
  }
  assertNoNestedWrites(model, data);
  const { clubId: _ignored, ...rest } = data;
  void _ignored;
  return rest;
}

/**
 * Ergänzt den Mandantenfilter. Ein bereits vorhandener, WIDERSPRECHENDER Filter auf `clubId` (bzw.
 * `id` beim Verein selbst) ist ein Programmierfehler und wird nicht stillschweigend überschrieben –
 * sonst würde z. B. `update({ where: { id: <fremder Verein> } })` unbemerkt den eigenen Verein ändern.
 */
function scopedWhere(
  model: string,
  where: unknown,
  key: "clubId" | "id",
  value: string,
): Record<string, unknown> {
  const base = isPlainObject(where) ? where : {};
  if (key in base && base[key] !== value) {
    throw new TenantScopeError(
      `Der Filter auf "${key}" bei "${model}" widerspricht dem Vereinskontext.`,
    );
  }
  return { ...base, [key]: value };
}

/**
 * Wendet den Mandantenfilter auf die Argumente einer Prisma-Operation an.
 * Reine Funktion ohne Datenbankzugriff – deshalb einzeln testbar.
 */
export function scopeOperation(
  model: string,
  operation: string,
  args: unknown,
  clubId: string,
): Args {
  if (!clubId) {
    throw new TenantScopeError("Kein Verein im Kontext.");
  }
  const scope = (MODEL_SCOPE as Record<string, ModelScope | undefined>)[model];
  const a: Args = isPlainObject(args) ? { ...args } : {};

  switch (scope) {
    case "catalog": {
      if (
        READ_WHERE_OPS.has(operation) ||
        operation === "findUnique" ||
        operation === "findUniqueOrThrow"
      ) {
        return a;
      }
      throw new TenantScopeError(`"${model}" ist schreibgeschützt.`);
    }

    case "club": {
      if (READ_WHERE_OPS.has(operation) || UNIQUE_OPS.has(operation)) {
        if (operation === "delete") {
          throw new TenantScopeError(
            "Vereine können nicht über den Mandanten-Client gelöscht werden.",
          );
        }
        const scoped: Args = { ...a, where: scopedWhere(model, a.where, "id", clubId) };
        if (operation === "update") {
          scoped.data = withoutClubId(model, a.data, clubId);
        }
        return scoped;
      }
      throw new TenantScopeError(`Operation "${operation}" auf "${model}" ist nicht erlaubt.`);
    }

    case "tenant": {
      if (READ_WHERE_OPS.has(operation)) {
        return { ...a, where: scopedWhere(model, a.where, "clubId", clubId) };
      }
      if (WRITE_WHERE_OPS.has(operation)) {
        const scoped: Args = { ...a, where: scopedWhere(model, a.where, "clubId", clubId) };
        if (operation !== "deleteMany") {
          scoped.data = withoutClubId(model, a.data, clubId);
        }
        return scoped;
      }
      if (UNIQUE_OPS.has(operation)) {
        const scoped: Args = { ...a, where: scopedWhere(model, a.where, "clubId", clubId) };
        if (operation === "update") {
          scoped.data = withoutClubId(model, a.data, clubId);
        }
        return scoped;
      }
      if (operation === "upsert") {
        return {
          ...a,
          where: scopedWhere(model, a.where, "clubId", clubId),
          create: withClubId(model, a.create, clubId),
          update: withoutClubId(model, a.update, clubId),
        };
      }
      if (CREATE_OPS.has(operation)) {
        const data = a.data;
        return {
          ...a,
          data: Array.isArray(data)
            ? data.map((row) => withClubId(model, row, clubId))
            : withClubId(model, data, clubId),
        };
      }
      throw new TenantScopeError(`Operation "${operation}" auf "${model}" ist nicht erlaubt.`);
    }

    case "global":
      throw new TenantScopeError(
        `"${model}" ist nicht mandantenbezogen und nur über den systemweiten Client (src/server) erreichbar.`,
      );

    default:
      throw new TenantScopeError(`Modell "${model}" ist nicht klassifiziert.`);
  }
}

/** Erzeugt den mandantengebundenen Prisma-Client für genau einen Verein. */
export function createTenantDb(clubId: string) {
  return prisma.$extends({
    name: "tenant-scope",
    query: {
      $allModels: {
        $allOperations({ model, operation, args, query }) {
          return query(scopeOperation(model, operation, args, clubId));
        },
      },
    },
  });
}

/**
 * Typ des mandantengebundenen Clients. Rohe SQL-Methoden sind bewusst entfernt, weil sie den
 * Filter umgehen würden; ebenso `$extends`, damit niemand den Schutz wieder abstreifen kann.
 */
export type TenantDb = Omit<
  ReturnType<typeof createTenantDb>,
  | "$queryRaw"
  | "$queryRawUnsafe"
  | "$executeRaw"
  | "$executeRawUnsafe"
  | "$extends"
  | "$disconnect"
  | "$connect"
>;

/** Transaktions-Client (gleiche Methoden wie TenantDb, ohne Transaktions-/Verbindungsfunktionen). */
export type TenantTx = Parameters<Parameters<TenantDb["$transaction"]>[0]>[0];
