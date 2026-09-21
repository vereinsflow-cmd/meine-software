import { describe, expect, it } from "vitest";
import { MODEL_SCOPE, TenantScopeError, scopeOperation } from "@/server/db/tenant";

const CLUB = "club-a";

describe("scopeOperation (Mandantenfilter)", () => {
  it("fügt clubId zu Leseabfragen hinzu und behält vorhandene Filter", () => {
    expect(
      scopeOperation("Member", "findMany", { where: { status: "ACTIVE" }, take: 5 }, CLUB),
    ).toEqual({
      where: { status: "ACTIVE", clubId: CLUB },
      take: 5,
    });
    expect(scopeOperation("Member", "findMany", undefined, CLUB)).toEqual({
      where: { clubId: CLUB },
    });
  });

  it("wirft bei einem Filter auf eine fremde clubId (statt ihn still zu überschreiben)", () => {
    expect(() =>
      scopeOperation("Member", "findMany", { where: { clubId: "club-b" } }, CLUB),
    ).toThrow(TenantScopeError);
    expect(() =>
      scopeOperation("Member", "findMany", { where: { clubId: { in: ["club-b"] } } }, CLUB),
    ).toThrow(TenantScopeError);
    expect(() =>
      scopeOperation("Member", "deleteMany", { where: { clubId: "club-b" } }, CLUB),
    ).toThrow(TenantScopeError);
  });

  it("akzeptiert einen Filter auf die eigene clubId", () => {
    expect(scopeOperation("Member", "findMany", { where: { clubId: CLUB } }, CLUB).where).toEqual({
      clubId: CLUB,
    });
  });

  it("verändert OR/AND-Filter nicht, sondern verknüpft clubId zusätzlich (UND)", () => {
    const where = { OR: [{ firstName: "A" }, { lastName: "B" }] };
    expect(scopeOperation("Member", "findFirst", { where }, CLUB).where).toEqual({
      ...where,
      clubId: CLUB,
    });
  });

  it("wirkt auf eindeutige Abfragen, Änderungen und Löschungen", () => {
    for (const op of ["findUnique", "findUniqueOrThrow", "delete"]) {
      expect(scopeOperation("Event", op, { where: { id: "e1" } }, CLUB).where).toEqual({
        id: "e1",
        clubId: CLUB,
      });
    }
    const update = scopeOperation(
      "Event",
      "update",
      { where: { id: "e1" }, data: { title: "x" } },
      CLUB,
    );
    expect(update.where).toEqual({ id: "e1", clubId: CLUB });
    expect(update.data).toEqual({ title: "x" });
  });

  it("setzt clubId beim Anlegen fest", () => {
    expect(scopeOperation("Department", "create", { data: { name: "A" } }, CLUB).data).toEqual({
      name: "A",
      clubId: CLUB,
    });
    expect(
      scopeOperation("Department", "createMany", { data: [{ name: "A" }, { name: "B" }] }, CLUB)
        .data,
    ).toEqual([
      { name: "A", clubId: CLUB },
      { name: "B", clubId: CLUB },
    ]);
  });

  it("verweigert Anlegen mit fremder clubId und Verschieben in einen anderen Verein", () => {
    expect(() =>
      scopeOperation("Department", "create", { data: { name: "A", clubId: "club-b" } }, CLUB),
    ).toThrow(TenantScopeError);
    expect(() =>
      scopeOperation("Member", "update", { where: { id: "m" }, data: { clubId: "club-b" } }, CLUB),
    ).toThrow(TenantScopeError);
    expect(() =>
      scopeOperation("Member", "updateMany", { where: {}, data: { clubId: "club-b" } }, CLUB),
    ).toThrow(TenantScopeError);
  });

  it("entfernt eine gleichlautende clubId aus Änderungsdaten", () => {
    const result = scopeOperation(
      "Member",
      "update",
      { where: { id: "m" }, data: { clubId: CLUB, firstName: "x" } },
      CLUB,
    );
    expect(result.data).toEqual({ firstName: "x" });
  });

  it("verweigert verschachtelte Schreibzugriffe", () => {
    for (const nested of [
      "create",
      "createMany",
      "connect",
      "connectOrCreate",
      "update",
      "upsert",
      "delete",
      "deleteMany",
      "disconnect",
    ]) {
      expect(() =>
        scopeOperation("Event", "create", { data: { title: "x", shifts: { [nested]: {} } } }, CLUB),
      ).toThrow(TenantScopeError);
    }
  });

  it("erlaubt skalare Update-Operatoren wie { set } und { increment }", () => {
    const result = scopeOperation(
      "Event",
      "update",
      { where: { id: "e" }, data: { title: { set: "x" }, maxParticipants: { increment: 1 } } },
      CLUB,
    );
    expect(result.data).toEqual({ title: { set: "x" }, maxParticipants: { increment: 1 } });
  });

  it("scoped upsert vollständig (where, create, update)", () => {
    const result = scopeOperation(
      "Department",
      "upsert",
      { where: { id: "d" }, create: { name: "n" }, update: { name: "m" } },
      CLUB,
    );
    expect(result).toEqual({
      where: { id: "d", clubId: CLUB },
      create: { name: "n", clubId: CLUB },
      update: { name: "m" },
    });
  });

  it("filtert den Verein selbst über id und verbietet das Löschen", () => {
    expect(scopeOperation("Club", "findMany", { where: { name: "x" } }, CLUB).where).toEqual({
      name: "x",
      id: CLUB,
    });
    // Ein Zugriff auf die ID eines FREMDEN Vereins darf nicht stillschweigend den eigenen treffen.
    expect(() =>
      scopeOperation("Club", "update", { where: { id: "club-b" }, data: {} }, CLUB),
    ).toThrow(TenantScopeError);
    expect(() => scopeOperation("Club", "findUnique", { where: { id: "club-b" } }, CLUB)).toThrow(
      TenantScopeError,
    );
    expect(() => scopeOperation("Club", "updateMany", { where: {}, data: {} }, CLUB)).toThrow(
      TenantScopeError,
    );
    expect(() => scopeOperation("Club", "delete", { where: { id: CLUB } }, CLUB)).toThrow(
      TenantScopeError,
    );
    expect(() => scopeOperation("Club", "create", { data: {} }, CLUB)).toThrow(TenantScopeError);
    expect(() => scopeOperation("Club", "deleteMany", {}, CLUB)).toThrow(TenantScopeError);
  });

  it("erlaubt den Berechtigungskatalog nur lesend", () => {
    expect(scopeOperation("Permission", "findMany", {}, CLUB)).toEqual({});
    expect(() => scopeOperation("Permission", "create", { data: {} }, CLUB)).toThrow(
      TenantScopeError,
    );
    expect(() => scopeOperation("Permission", "deleteMany", {}, CLUB)).toThrow(TenantScopeError);
  });

  it("verweigert globale Modelle", () => {
    for (const model of [
      "User",
      "Session",
      "VerificationToken",
      "RateLimitBucket",
      "DeletionRequest",
    ]) {
      expect(() => scopeOperation(model, "findMany", {}, CLUB)).toThrow(TenantScopeError);
    }
  });

  it("verweigert unbekannte Operationen und Modelle (fail closed)", () => {
    expect(() => scopeOperation("Member", "findRaw", {}, CLUB)).toThrow(TenantScopeError);
    expect(() => scopeOperation("Member", "aggregateRaw", {}, CLUB)).toThrow(TenantScopeError);
    expect(() => scopeOperation("GibtEsNicht", "findMany", {}, CLUB)).toThrow(TenantScopeError);
  });

  it("verweigert Aufrufe ohne Verein", () => {
    expect(() => scopeOperation("Member", "findMany", {}, "")).toThrow(TenantScopeError);
  });

  it("jedes mandantenbezogene Modell wird gefiltert (Stichprobe über alle Modelle)", () => {
    const tenantModels = Object.entries(MODEL_SCOPE).filter(([, scope]) => scope === "tenant");
    expect(tenantModels.length).toBeGreaterThan(20);
    for (const [model] of tenantModels) {
      expect(scopeOperation(model, "findMany", {}, CLUB).where).toEqual({ clubId: CLUB });
    }
  });
});
