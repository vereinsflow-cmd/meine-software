import { describe, expect, it } from "vitest";
import { prisma } from "@/server/db/client";
import { MODEL_SCOPE } from "@/server/db/tenant";

/**
 * Sicherheitsnetz gegen vergessene Filter: Die Einstufung der Modelle im Code (MODEL_SCOPE)
 * muss exakt mit dem tatsächlichen Datenbankschema übereinstimmen.
 */
describe("Mandanten-Klassifizierung der Tabellen", () => {
  // Hat eine optionale clubId, kann aber wegen "clubId IS NULL" (plattformweit) nicht automatisch
  // gefiltert werden. Wird nur über den systemweiten Client verwendet und enthält keine Vereinsdaten.
  const OPTIONAL_CLUB_ID_EXCEPTIONS = new Set(["DeletionRequest"]);

  it("jede Tabelle mit Spalte clubId ist als 'tenant' eingestuft (oder ausdrücklich ausgenommen)", async () => {
    const rows = await prisma.$queryRaw<{ table_name: string }[]>`
      SELECT DISTINCT table_name FROM information_schema.columns
      WHERE table_schema = 'public' AND column_name = 'clubId'`;

    for (const { table_name } of rows) {
      const scope = (MODEL_SCOPE as Record<string, string>)[table_name];
      if (OPTIONAL_CLUB_ID_EXCEPTIONS.has(table_name)) {
        expect(scope, table_name).toBe("global");
      } else {
        expect(
          scope,
          `Tabelle ${table_name} hat clubId, ist aber nicht als tenant eingestuft`,
        ).toBe("tenant");
      }
    }
  });

  it("jedes als 'tenant' eingestufte Modell hat wirklich eine clubId-Spalte", async () => {
    const rows = await prisma.$queryRaw<{ table_name: string }[]>`
      SELECT DISTINCT table_name FROM information_schema.columns
      WHERE table_schema = 'public' AND column_name = 'clubId'`;
    const withClubId = new Set(rows.map((row) => row.table_name));

    const tenantModels = Object.entries(MODEL_SCOPE)
      .filter(([, scope]) => scope === "tenant")
      .map(([model]) => model);
    for (const model of tenantModels) {
      expect(
        withClubId.has(model),
        `${model} ist als tenant eingestuft, hat aber keine clubId`,
      ).toBe(true);
    }
  });

  it("jede Tabelle der Datenbank ist klassifiziert", async () => {
    const rows = await prisma.$queryRaw<{ table_name: string }[]>`
      SELECT table_name FROM information_schema.tables
      WHERE table_schema = 'public' AND table_type = 'BASE TABLE' AND table_name <> '_prisma_migrations'`;
    const classified = new Set(Object.keys(MODEL_SCOPE));
    for (const { table_name } of rows) {
      expect(
        classified.has(table_name),
        `Tabelle ${table_name} ist nicht in MODEL_SCOPE klassifiziert`,
      ).toBe(true);
    }
  });
});
