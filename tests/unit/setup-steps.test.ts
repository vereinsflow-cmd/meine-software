import { describe, expect, it } from "vitest";
import { clubSlugFrom } from "@/server/platform/first-run";
import { doneSteps, firstOpenStep, SETUP_STEP_IDS, type SetupFacts } from "@/modules/setup/steps";

const fresh: SetupFacts = {
  contact: false,
  logo: false,
  departments: 0,
  members: 1, // die einrichtende Person selbst
  users: 1,
  openInvitations: 0,
};

describe("Assistent „Verein einrichten“", () => {
  it("führt die sechs Schritte in fester Reihenfolge", () => {
    expect(SETUP_STEP_IDS).toEqual([
      "verein",
      "logo",
      "abteilungen",
      "mitglieder",
      "vorstand",
      "abschluss",
    ]);
  });

  it("ein frischer Verein: nichts erledigt – die einrichtende Person zählt nicht als Mitglied oder Zugang", () => {
    expect(Object.values(doneSteps(fresh))).toEqual([false, false, false, false, false]);
    expect(firstOpenStep(doneSteps(fresh))).toBe("verein");
  });

  it("beginnt beim ersten offenen Schritt und landet am Ende beim Abschluss", () => {
    const partly = doneSteps({ ...fresh, contact: true, logo: true, departments: 2 });
    expect(firstOpenStep(partly)).toBe("mitglieder");
    // Eine offene Einladung genügt für „Vorstand & Zugänge“
    const all = doneSteps({
      ...fresh,
      contact: true,
      logo: true,
      departments: 1,
      members: 5,
      openInvitations: 1,
    });
    expect(Object.values(all).every(Boolean)).toBe(true);
    expect(firstOpenStep(all)).toBe("abschluss");
  });
});

describe("Kürzel aus dem Vereinsnamen", () => {
  it("ersetzt Umlaute und Sonderzeichen", () => {
    expect(clubSlugFrom("TSV Grün-Weiß Müllheim 1920 e. V.")).toBe(
      "tsv-gruen-weiss-muellheim-1920-e-v",
    );
    expect(clubSlugFrom("  Café  Olé!  ")).toBe("cafe-ole");
  });

  it("fällt bei zu kurzen Namen auf einen Standard zurück und kürzt lange Namen", () => {
    expect(clubSlugFrom("SV")).toBe("mein-verein");
    const long = clubSlugFrom("Förderverein ".repeat(10));
    expect(long.length).toBeLessThanOrEqual(50);
    expect(long).toMatch(/^[a-z0-9]+(-[a-z0-9]+)*$/);
  });
});
