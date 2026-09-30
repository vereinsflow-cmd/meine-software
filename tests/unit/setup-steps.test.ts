import { describe, expect, it } from "vitest";
import { hasRequiredClubData, isAllowedDuringSetup } from "@/lib/club-setup";
import { clubSetupSchema, clubSettingsSchema } from "@/modules/clubs/schemas";
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

describe("Sperre während der Einrichtung", () => {
  it("Pflichtangaben: Kontakt-E-Mail und vollständige Anschrift", () => {
    const full = {
      contactEmail: "info@verein.test",
      street: "Am Sportplatz 1",
      postalCode: "12345",
      city: "Musterstadt",
    };
    expect(hasRequiredClubData(full)).toBe(true);
    for (const field of ["contactEmail", "street", "postalCode", "city"] as const) {
      expect(hasRequiredClubData({ ...full, [field]: null })).toBe(false);
      expect(hasRequiredClubData({ ...full, [field]: "" })).toBe(false);
    }
  });

  it("vor den Pflichtangaben nur der Assistent", () => {
    expect(isAllowedDuringSetup("/einrichtung", false)).toBe(true);
    for (const path of [
      "/dashboard",
      "/mitglieder",
      "/mitglieder/neu",
      "/benutzer",
      "/einstellungen",
    ]) {
      expect(isAllowedDuringSetup(path, false)).toBe(false);
    }
  });

  it("danach zusätzlich die Seiten, zu denen der Assistent führt – sonst nichts", () => {
    for (const path of [
      "/einrichtung",
      "/mitglieder/neu",
      "/mitglieder/import",
      "/mitglieder/antraege/aushang",
      "/mitglieder",
      "/benutzer",
    ]) {
      expect(isAllowedDuringSetup(path, true)).toBe(true);
    }
    for (const path of [
      "/dashboard",
      "/kalender",
      "/einstellungen",
      "/mitgliederversammlung",
      "/benutzerkonto",
    ]) {
      expect(isAllowedDuringSetup(path, true)).toBe(false);
    }
  });
});

describe("Vereinsdaten im Assistenten (Pflichtfelder)", () => {
  const base = { name: "TSV Test", leftMembersMonths: 24, trashDays: 30, auditMonths: 24 };

  it("verlangt Kontakt-E-Mail und Anschrift – nur Leerzeichen zählen nicht", () => {
    const result = clubSetupSchema.safeParse({ ...base, street: "   " });
    expect(result.success).toBe(false);
    const fields = result.error!.issues.map((issue) => issue.path.join("."));
    expect(fields).toEqual(
      expect.arrayContaining(["contactEmail", "street", "postalCode", "city"]),
    );
    // In den normalen Vereinseinstellungen bleiben die Felder freiwillig
    expect(clubSettingsSchema.safeParse(base).success).toBe(true);
  });

  it("akzeptiert vollständige Angaben", () => {
    const result = clubSetupSchema.safeParse({
      ...base,
      contactEmail: "Info@Verein.test",
      street: "Am Sportplatz 1",
      postalCode: "12345",
      city: "Musterstadt",
    });
    expect(result.success).toBe(true);
    expect(result.data?.contactEmail).toBe("info@verein.test");
  });
});
