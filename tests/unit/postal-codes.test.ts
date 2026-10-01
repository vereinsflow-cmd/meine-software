import { describe, expect, it } from "vitest";
import { cityChoices, decideCity, isGermanPostalCode } from "@/lib/postal-code";
import { placesForPostalCode } from "@/server/geo/postal-codes";
import table from "@/server/geo/postal-codes-de.json";

describe("Postleitzahlen → Orte (GeoNames, bereinigt)", () => {
  it("findet Orte – auch mit führender Null, Ortsteile auf den Ort gekürzt", () => {
    expect(placesForPostalCode("10115")).toEqual(["Berlin"]);
    expect(placesForPostalCode("01067")).toEqual(["Dresden"]); // statt „Dresden Innere Altstadt“ usw.
    expect(placesForPostalCode("79379")).toEqual(["Müllheim"]);
    expect(placesForPostalCode("60311")).toEqual(["Frankfurt am Main"]);
    expect(placesForPostalCode(" 80331 ")).toEqual(["München"]);
    expect(placesForPostalCode("31737")).toEqual(["Rinteln"]); // „Rinteln Todenmann“
    expect(placesForPostalCode("54649")).toEqual(
      expect.arrayContaining(["Waxweiler", "Dackscheid"]),
    );
  });

  it("kreisfreie Städte: immer die Stadt, nie der Stadtteil oder ein Großkunde", () => {
    expect(placesForPostalCode("04178")).toEqual(["Leipzig"]); // nicht „Burghausen“
    expect(placesForPostalCode("90457")).toEqual(["Nürnberg"]);
    expect(placesForPostalCode("20095")).toEqual(["Hamburg"]); // nicht „Freie und Hansestadt Hamburg“
    expect(placesForPostalCode("12154")).toEqual(["Berlin"]); // Großkunden in Berlin – nicht „Wertheim“
  });

  it("andere Schreibweisen, gleichnamige Orte und neue Namen", () => {
    expect(placesForPostalCode("48599")).toEqual(["Gronau (Westfalen)"]); // amtlich „Gronau (Westf.)“
    expect(placesForPostalCode("06886")).toEqual(["Lutherstadt Wittenberg"]);
    expect(placesForPostalCode("97522")).toEqual(["Sand am Main"]); // amtlich „Sand a.Main“
    expect(placesForPostalCode("96145")).toEqual(["Seßlach"]); // kein „SE“ (Rechtsform)
    expect(placesForPostalCode("23999")).toEqual(["Insel Poel"]); // nicht auf „Insel“ gekürzt
    expect(placesForPostalCode("93444")).toEqual(["Bad Kötzting"]); // früher „Kötzting“
    expect(placesForPostalCode("16918")).toEqual(["Wittstock/Dosse"]); // „Wittstock/Dosse Freyenstein“
  });

  it("der Hauptort steht vorn", () => {
    expect(placesForPostalCode("06712")[0]).toBe("Zeitz");
    expect(placesForPostalCode("29416")[0]).toBe("Salzwedel");
    expect(placesForPostalCode("16259")[0]).toBe("Bad Freienwalde");
  });

  it("keine reinen Großkunden außerhalb kreisfreier Städte und nichts für ungültige Eingaben", () => {
    expect(placesForPostalCode("71029")).toEqual([]); // „Stadtverwaltung“, „Finanzamt“ … in Böblingen
    for (const input of ["", "1234", "123456", "abcde", "10 115"]) {
      expect(placesForPostalCode(input)).toEqual([]);
    }
  });

  it("die Datei ist sauber: fünfstellige Schlüssel, Orte ohne Doppel und ohne Firmennamen", () => {
    const entries = Object.entries(table as Record<string, string[]>);
    expect(entries.length).toBeGreaterThan(9000);
    for (const [code, places] of entries) {
      expect(code).toMatch(/^\d{5}$/);
      expect(places.length).toBeGreaterThan(0);
      expect(new Set(places).size).toBe(places.length);
      for (const place of places) {
        expect(place).not.toMatch(
          /\b(GmbH|AG|KG|e\.\s?V\.|Stadtverwaltung|Finanzamt|Amtsgericht)\b/,
        );
      }
    }
  });
});

describe("Ort automatisch ergänzen (decideCity, cityChoices)", () => {
  const none = { fill: null, clear: false };

  it("füllt ein leeres Feld, wenn genau ein Ort passt", () => {
    expect(decideCity(["Berlin"], "", null)).toEqual({ fill: "Berlin", clear: false });
    expect(decideCity(["Berlin"], undefined, null)).toEqual({ fill: "Berlin", clear: false });
  });

  it("überschreibt oder entfernt nie, was jemand selbst geschrieben hat", () => {
    expect(decideCity(["Berlin"], "Potsdam", null)).toEqual(none);
    expect(decideCity(["A-Dorf", "B-Dorf"], "Eigener Ort", null)).toEqual(none);
    expect(decideCity([], "Eigener Ort", "Berlin")).toEqual(none);
  });

  it("ersetzt einen selbst eingetragenen Ort, wenn sich die Postleitzahl ändert", () => {
    expect(decideCity(["München"], "Berlin", "Berlin")).toEqual({ fill: "München", clear: false });
    expect(decideCity(["Berlin"], "Berlin", "Berlin")).toEqual(none);
  });

  it("entfernt ihn, wenn er nicht mehr passt (mehrere oder keine Orte zur neuen Postleitzahl)", () => {
    expect(decideCity(["A-Dorf", "B-Dorf"], "Berlin", "Berlin")).toEqual({
      fill: null,
      clear: true,
    });
    expect(decideCity([], "Berlin", "Berlin")).toEqual({ fill: null, clear: true });
    expect(decideCity(["A-Dorf", "B-Dorf"], "B-Dorf", "B-Dorf")).toEqual(none); // gewählter Ort passt
  });

  it("Auswahl bei mehreren Orten, solange das Feld leer ist", () => {
    expect(cityChoices(["A-Dorf", "B-Dorf"], "")).toEqual(["A-Dorf", "B-Dorf"]);
    expect(cityChoices(["A-Dorf", "B-Dorf"], "B-Dorf")).toEqual([]);
    expect(cityChoices(["Berlin"], "")).toEqual([]);
    expect(cityChoices([], "")).toEqual([]);
  });

  it("erkennt deutsche Postleitzahlen", () => {
    expect(isGermanPostalCode("01067")).toBe(true);
    expect(isGermanPostalCode("1067")).toBe(false);
    expect(isGermanPostalCode(null)).toBe(false);
  });
});
