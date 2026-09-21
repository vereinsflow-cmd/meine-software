import { describe, expect, it } from "vitest";
import {
  DASHBOARD_TABS,
  DASHBOARD_TAB_IDS,
  SWIPE,
  availableTabs,
  resolveSwipe,
  resolveTab,
  type DashboardTabId,
} from "@/modules/dashboard/tabs";

const none = {
  members: null,
  events: null,
  shifts: null,
  tasks: null,
  birthdays: null,
  activity: null,
};
// Die Blöcke sind für die Reiterwahl nur „vorhanden oder nicht“ – der Inhalt ist hier egal.
const some = <T>() => ({}) as NonNullable<T>;

describe("Dashboard-Reiter: Aufteilung", () => {
  it("es gibt vier Reiter mit eindeutigen Namen und Kennungen", () => {
    expect(DASHBOARD_TABS).toHaveLength(4);
    expect(new Set(DASHBOARD_TAB_IDS).size).toBe(4);
    expect(new Set(DASHBOARD_TABS.map((tab) => tab.label)).size).toBe(4);
    expect(DASHBOARD_TABS[0]).toEqual({ id: "uebersicht", label: "Übersicht" });
  });

  it("Administrator (alles sichtbar): alle vier Reiter in fester Reihenfolge", () => {
    const admin = {
      members: some<never>(),
      events: some<never>(),
      shifts: some<never>(),
      tasks: some<never>(),
      birthdays: [],
      activity: [],
    };
    expect(availableTabs(admin)).toEqual(["uebersicht", "termine", "mitglieder", "aktivitaet"]);
  });

  it("Mitglied (nur Termine und Einsätze): Übersicht und Termine – kein Mitglieder-, kein Aufgaben-Reiter", () => {
    expect(availableTabs({ ...none, events: some<never>(), shifts: some<never>() })).toEqual([
      "uebersicht",
      "termine",
    ]);
  });

  it("Helferin (Aufgaben, aber keine Mitgliederzahlen): Übersicht, Termine, Aufgaben & Aktivität", () => {
    expect(
      availableTabs({
        ...none,
        events: some<never>(),
        shifts: some<never>(),
        tasks: some<never>(),
      }),
    ).toEqual(["uebersicht", "termine", "aktivitaet"]);
  });

  it("Geburtstage allein genügen für den Mitglieder-Reiter; Aktivitäten allein für den vierten", () => {
    expect(availableTabs({ ...none, birthdays: [] })).toEqual(["uebersicht", "mitglieder"]);
    expect(availableTabs({ ...none, activity: [] })).toEqual(["uebersicht", "aktivitaet"]);
  });

  it("ohne jeden Fachbereich bleibt die Übersicht (Benachrichtigungen sieht jeder)", () => {
    expect(availableTabs(none)).toEqual(["uebersicht"]);
  });
});

describe("Dashboard-Folien: Wischgeste", () => {
  it("nach links = nächster Bereich, nach rechts = voriger", () => {
    expect(resolveSwipe(-200, 5, 250)).toBe("next");
    expect(resolveSwipe(200, -5, 250)).toBe("prev");
  });

  it("zu kurzer Weg ist ein Antippen oder Zittern, kein Wischen (Grenze: 64 px)", () => {
    expect(resolveSwipe(-63, 0, 100)).toBeNull();
    expect(resolveSwipe(-64, 0, 100)).toBe("next");
    expect(resolveSwipe(0, 0, 100)).toBeNull();
  });

  it("überwiegend senkrechte Bewegung ist Scrollen (Grenze: waagerecht mindestens 1,6-mal so weit)", () => {
    expect(resolveSwipe(-90, 260, 300)).toBeNull();
    expect(resolveSwipe(-100, 100, 300)).toBeNull(); // Diagonale
    expect(resolveSwipe(-160, 100, 300)).toBe("next");
    expect(resolveSwipe(-159, 100, 300)).toBeNull();
  });

  it("langsames Ziehen (über 0,7 s) ist kein Wischen", () => {
    expect(resolveSwipe(-200, 0, 700)).toBe("next");
    expect(resolveSwipe(-200, 0, 701)).toBeNull();
  });

  it("die Schwellen stehen an einer Stelle", () => {
    expect(SWIPE).toEqual({ minDistance: 64, ratio: 1.6, maxDuration: 700 });
  });
});

describe("Dashboard-Reiter: Auswahl aus der Adresse", () => {
  const all: DashboardTabId[] = ["uebersicht", "termine", "mitglieder", "aktivitaet"];

  it("übernimmt einen vorhandenen Reiter", () => {
    expect(resolveTab("mitglieder", all)).toBe("mitglieder");
    expect(resolveTab("aktivitaet", all)).toBe("aktivitaet");
  });

  it("fällt auf den ersten Reiter zurück: nichts angegeben, unbekannt oder für die Rolle nicht vorhanden", () => {
    expect(resolveTab(undefined, all)).toBe("uebersicht");
    expect(resolveTab("gibt-es-nicht", all)).toBe("uebersicht");
    expect(resolveTab("", all)).toBe("uebersicht");
    expect(resolveTab("mitglieder", ["uebersicht", "termine"])).toBe("uebersicht");
  });

  it("nimmt keine Eingabe, die nur ähnlich aussieht (Groß-/Kleinschreibung, Leerzeichen, Pfade)", () => {
    for (const bad of ["Mitglieder", " mitglieder", "mitglieder ", "../termine", "termine&x=1"]) {
      expect(resolveTab(bad, all)).toBe("uebersicht");
    }
  });
});
