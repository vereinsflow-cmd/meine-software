import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { getNavigation } from "@/components/layout/nav";
import { rankResults } from "@/lib/search/ranking";
import { SEARCH_REGISTRY } from "@/lib/search/registry";
import { PERMISSION_KEYS } from "@/server/permissions/catalog";
import type { PermissionHolder } from "@/server/permissions/policy";

const appDir = path.resolve(__dirname, "../../src/app");

/** Alle Rechte vereinsweit und Superadministrator – so erscheinen sämtliche Menüpunkte. */
const everything: PermissionHolder = {
  userId: "user-1",
  memberId: "member-1",
  ledDepartmentIds: [],
  permissions: new Map(PERMISSION_KEYS.map((key) => [key, "CLUB"])),
};
const items = getNavigation(everything, { isPlatformAdmin: true }).flatMap((group) => group.items);

/** Titel der Seite (`export const metadata = { title: … }`) zum Pfad, gesucht in allen Routengruppen. */
function pageTitle(href: string): string | null {
  for (const group of fs.readdirSync(appDir).filter((name) => name.startsWith("("))) {
    const file = path.join(appDir, group, ...href.split("/").filter(Boolean), "page.tsx");
    if (!fs.existsSync(file)) continue;
    return (
      /metadata: Metadata = \{ title: "([^"]+)"/.exec(fs.readFileSync(file, "utf8"))?.[1] ?? null
    );
  }
  return null;
}

describe("Menüpunkt heißt wie die Seite", () => {
  it("jeder Menüpunkt trägt den Titel der Seite, die er öffnet", () => {
    for (const item of items) {
      expect(pageTitle(item.href), item.href).toBe(item.label);
    }
  });

  it("„Kalender“ und „Helferplanung“ heißen im Menü nicht mehr „Termine“ bzw. „Helferstunden“", () => {
    const labelOf = (href: string) => items.find((item) => item.href === href)?.label;
    expect(labelOf("/kalender")).toBe("Kalender");
    expect(labelOf("/helferplanung")).toBe("Helferplanung");
    expect(items.map((item) => item.label)).not.toContain("Termine");
    expect(items.map((item) => item.label)).not.toContain("Helferstunden");
  });

  it("die Suche nennt die Seiten genauso wie das Menü", () => {
    for (const entry of SEARCH_REGISTRY.filter((entry) => entry.category === "seiten")) {
      const item = items.find((candidate) => candidate.href === entry.href);
      if (item) expect(entry.title, entry.href).toBe(item.label);
    }
  });
});

describe("Suche nach den alten Menünamen", () => {
  const search = (query: string) => rankResults(SEARCH_REGISTRY, [], query).map((hit) => hit.id);

  it("„Termine“ findet den Kalender als besten Treffer", () => {
    expect(search("Termine")[0]).toBe("page:kalender");
  });

  it("„Helferstunden“ findet die Seite Helferstunden und die Helferplanung", () => {
    expect(search("Helferstunden")).toEqual(
      expect.arrayContaining(["page:helferstunden", "page:helferplanung"]),
    );
  });
});
