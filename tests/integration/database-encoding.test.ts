import { describe, expect, it } from "vitest";
import { prisma } from "@/server/db/client";
import { createClub, createMember } from "../helpers/factories";

/**
 * Vereinsdaten enthalten beliebige Namen und Texte. Die Datenbank MUSS UTF-8 verwenden – sonst scheitert das
 * Speichern von Zeichen außerhalb von Windows-1252 (z. B. "Şahin", "Żak", "→", Emojis) mit einem Datenbankfehler.
 * (Aufgefallen, weil die eingebettete Datenbank unter Windows zunächst WIN1252 verwendete.)
 */
describe("Datenbank-Kodierung", () => {
  it("ist UTF-8", async () => {
    const [{ server_encoding }] = await prisma.$queryRaw<
      { server_encoding: string }[]
    >`SHOW server_encoding`;
    expect(server_encoding).toBe("UTF8");
  });

  it("speichert und liefert Sonderzeichen aus vielen Schriften unverändert zurück", async () => {
    const club = await createClub();
    const names = [
      "Şahin Öztürk",
      "Żaneta Wójcik",
      "Đorđe Nikolić",
      "Ελένη Παπαδοπούλου",
      "Иван Петров",
      "李小龍",
      "José Ñandú",
      "Åse Ærø",
      "Max → Moritz 😀",
    ];
    for (const name of names) {
      const created = await createMember(club.id, { firstName: name, lastName: "Test" });
      const loaded = await prisma.member.findUniqueOrThrow({ where: { id: created.id } });
      expect(loaded.firstName).toBe(name);
    }
  });

  it("sortiert deutsche Namen erwartungsgemäß (Umlaute bei ihrem Grundbuchstaben)", async () => {
    const rows = await prisma.$queryRaw<
      { n: string }[]
    >`SELECT n FROM (VALUES ('Zimmer'), ('Ärzte'), ('Adler'), ('Öl'), ('Ost')) AS t(n) ORDER BY n`;
    expect(rows.map((r) => r.n)).toEqual(["Adler", "Ärzte", "Öl", "Ost", "Zimmer"]);
  });
});
