import { describe, expect, it } from "vitest";
import { getPasswordIssues, PASSWORD_MAX_LENGTH, PASSWORD_MIN_LENGTH } from "@/lib/password-policy";

describe("Passwortregeln", () => {
  it("akzeptiert ein langes, unauffälliges Passwort", () => {
    expect(getPasswordIssues("Der-Verein-trifft-sich-am-Dienstag!")).toEqual([]);
    expect(getPasswordIssues("korrekt pferd batterie heftklammer")).toEqual([]);
  });

  it("verlangt eine Mindestlänge", () => {
    const issues = getPasswordIssues("kurz");
    expect(issues).toHaveLength(1);
    expect(issues[0]).toContain(String(PASSWORD_MIN_LENGTH));
  });

  it("begrenzt die Länge nach oben (Schutz vor überlangen Eingaben)", () => {
    expect(getPasswordIssues("a1!".repeat(60))[0]).toContain(String(PASSWORD_MAX_LENGTH));
  });

  it("lehnt häufige Passwörter ab, auch mit Groß-/Kleinschreibung und Umlauten", () => {
    expect(getPasswordIssues("Passwort123")).not.toEqual([]);
    expect(getPasswordIssues("PASSWORD123")).not.toEqual([]);
    expect(getPasswordIssues("Fußball123")).not.toEqual([]);
  });

  it("lehnt Wiederholungen und Tastaturfolgen ab", () => {
    expect(getPasswordIssues("aaaaaaaaaaaa")).not.toEqual([]);
    expect(getPasswordIssues("1234567890")).not.toEqual([]);
    expect(getPasswordIssues("qwertzuiop")).not.toEqual([]);
  });

  it("lehnt Passwörter ab, die Namen oder E-Mail-Bestandteile enthalten", () => {
    const context = {
      email: "erika.mustermann@example.de",
      firstName: "Erika",
      lastName: "Mustermann",
    };
    expect(getPasswordIssues("Mustermann-2026-Sommer", context)).not.toEqual([]);
    expect(getPasswordIssues("mein-erika-passwort", context)).not.toEqual([]);
    expect(getPasswordIssues("Zebra-Lampe-Wolke-Tisch", context)).toEqual([]);
  });

  it("ignoriert sehr kurze Namensbestandteile (kein Fehlalarm bei z. B. 'Li')", () => {
    expect(
      getPasswordIssues("Zebra-Lampe-Wolke-Tisch", { firstName: "Li", lastName: "Wu" }),
    ).toEqual([]);
  });
});
