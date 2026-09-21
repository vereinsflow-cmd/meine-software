import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  AUDIT_ACTION_LABEL,
  AUDIT_MODULES,
  auditActionLabel,
  formatAuditChanges,
} from "@/lib/audit-labels";

const root = path.resolve(__dirname, "../..");

describe("Beschriftung von Protokolleinträgen", () => {
  it("bekannte Aktionen haben deutsche Namen, unbekannte werden unverändert angezeigt", () => {
    expect(auditActionLabel("member.created")).toBe("Mitglied angelegt");
    expect(auditActionLabel("auth.login")).toBe("Anmeldung");
    expect(auditActionLabel("zukunft.neu")).toBe("zukunft.neu");
  });

  it("jede Aktion gehört zu genau einem Themenbereich des Filters", () => {
    for (const action of Object.keys(AUDIT_ACTION_LABEL)) {
      const hits = AUDIT_MODULES.filter((m) =>
        m.prefixes.some((prefix) => action.startsWith(prefix)),
      );
      expect(
        hits.map((m) => m.key),
        action,
      ).toHaveLength(1);
    }
  });

  it("jede im Code protokollierte Aktion hat einen deutschen Namen (sonst stünde der technische Name im Protokoll)", () => {
    const files: string[] = [path.join(root, "prisma", "seed.ts")];
    const walk = (dir: string) => {
      for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        const full = path.join(dir, entry.name);
        if (entry.isDirectory()) walk(full);
        else if (/\.tsx?$/.test(entry.name)) files.push(full);
      }
    };
    walk(path.join(root, "src"));

    const used = new Map<string, string>();
    for (const file of files) {
      for (const match of fs
        .readFileSync(file, "utf8")
        .matchAll(/\baction:\s*"([a-z_]+\.[a-z_.]+)"/g))
        used.set(match[1]!, path.relative(root, file));
    }
    expect(used.size).toBeGreaterThan(40); // die Suche funktioniert überhaupt
    const missing = [...used]
      .filter(([action]) => !(action in AUDIT_ACTION_LABEL))
      .map(([action, file]) => `${action} (${file})`);
    expect(missing).toEqual([]);
  });

  it("Themenbereiche überschneiden sich nicht", () => {
    const prefixes = AUDIT_MODULES.flatMap((m) => m.prefixes);
    expect(new Set(prefixes).size).toBe(prefixes.length);
  });
});

describe("Änderungsdetails lesbar machen", () => {
  it("von → nach, nur nach, maskierte Werte, Wahrheitswerte und Listen", () => {
    expect(
      formatAuditChanges({
        firstName: { from: "Max", to: "Moritz" },
        email: "geändert",
        status: { to: "ACTIVE" },
        isLeader: { from: false, to: true },
        departments: { from: ["Fußball"], to: ["Fußball", "Handball"] },
        joinedAt: { from: null, to: "2026-01-01" },
      }),
    ).toEqual([
      "Vorname: Max → Moritz",
      "E-Mail: geändert",
      "Status: ACTIVE",
      "isLeader: nein → ja", // unbekannte Felder behalten ihren technischen Namen
      "Abteilungen: Fußball → Fußball, Handball",
      "Eintrittsdatum: – → 2026-01-01",
    ]);
  });

  it("leere oder unpassende Eingaben ergeben nichts; sehr lange Werte werden gekürzt; höchstens 30 Zeilen", () => {
    expect(formatAuditChanges(null)).toEqual([]);
    expect(formatAuditChanges(undefined)).toEqual([]);
    expect(formatAuditChanges("text")).toEqual([]);
    expect(formatAuditChanges([1, 2])).toEqual([]);
    const long = formatAuditChanges({ notes: { from: "a", to: "b".repeat(500) } })[0]!;
    expect(long.length).toBeLessThan(160);
    expect(long.endsWith("…")).toBe(true);
    expect(
      formatAuditChanges(Object.fromEntries(Array.from({ length: 50 }, (_, i) => [`f${i}`, "x"]))),
    ).toHaveLength(30);
  });
});
