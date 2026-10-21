import { describe, expect, it } from "vitest";
import {
  accountCards,
  accountTints,
  cardPhotos,
  stackOrder,
  type CardAccount,
} from "@/modules/finance/account-cards";

/** Konten als Bankkarten auf der Finanz-Übersicht: Farbe, Foto (fest nach Konto-Reihenfolge) und Reihenfolge im Stapel. */
const account = (
  id: string,
  kind: CardAccount["kind"],
  isDefault = false,
): CardAccount & { name: string } => ({ id, kind, isDefault, name: id });

describe("Farbe je Konto", () => {
  it("Bankkonten blau, dann violett und petrol; Barkasse grün; Sonstige violett", () => {
    expect(
      accountTints([
        account("giro", "BANK"),
        account("kasse", "CASH"),
        account("tagesgeld", "BANK"),
        account("sonst", "OTHER"),
        account("drittes", "BANK"),
        account("viertes", "BANK"),
      ]),
    ).toEqual(["blue", "emerald", "violet", "violet", "teal", "blue"]);
  });
});

describe("Foto im Hintergrund", () => {
  it("je Sportart eines, nach Abteilungsnamen sortiert – Abteilungen ohne Sportart haben keins", () => {
    expect(
      cardPhotos(["Tischtennis", "Jugendarbeit", "Handball Damen", "Fußball", "Handball"]).map(
        (photo) => photo.sport,
      ),
    ).toEqual(["fussball", "handball", "tischtennis"]);
    expect(cardPhotos(["Jugendarbeit", "Vorstand"])).toEqual([]);
  });

  it("das n-te Konto bekommt das n-te Foto (reihum) – unabhängig von der Reihenfolge der Abteilungen", () => {
    const accounts = [
      account("giro", "BANK"),
      account("kasse", "CASH"),
      account("tagesgeld", "BANK"),
    ];
    const sports = (names: string[]) =>
      accountCards(accounts, names).map((card) => card.photo?.sport ?? null);
    expect(sports(["Handball", "Fußball"])).toEqual(["fussball", "handball", "fussball"]);
    // Andere Reihenfolge (etwa nach Ausgaben sortiert): dieselben Motive
    expect(sports(["Fußball", "Handball"])).toEqual(["fussball", "handball", "fussball"]);
  });

  it("ohne Abteilungsfotos nur der Verlauf in der Kontofarbe", () => {
    const cards = accountCards([account("giro", "BANK"), account("kasse", "CASH")], []);
    expect(cards.map((card) => [card.tint, card.photo])).toEqual([
      ["blue", null],
      ["emerald", null],
    ]);
  });
});

describe("Stapel", () => {
  it("das Standardkonto liegt vorn (zuletzt gezeichnet), die übrigen behalten ihre Reihenfolge", () => {
    const cards = accountCards(
      [account("kasse", "CASH"), account("giro", "BANK", true), account("tagesgeld", "BANK")],
      [],
    );
    expect(stackOrder(cards).map((card) => card.account.id)).toEqual([
      "kasse",
      "tagesgeld",
      "giro",
    ]);
  });

  it("ohne Standardkonto das erste vorn; ohne Konten kein Stapel", () => {
    const cards = accountCards([account("a", "BANK"), account("b", "CASH")], []);
    expect(stackOrder(cards).map((card) => card.account.id)).toEqual(["b", "a"]);
    expect(stackOrder([])).toEqual([]);
  });
});
