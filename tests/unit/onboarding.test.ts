import { describe, expect, it } from "vitest";
import { onboardingSteps } from "@/modules/dashboard/onboarding";

const empty = {
  logo: false,
  contact: false,
  departments: 0,
  members: 1,
  users: 1,
  events: 0,
  joinLink: false,
};
const all = {
  club: true,
  departments: true,
  members: true,
  users: true,
  events: true,
  joinLink: true,
};

describe("Erste Schritte", () => {
  it("neuer Verein: alle sieben Schritte offen; das eigene Mitglied und das eigene Konto zählen nicht", () => {
    const steps = onboardingSteps(empty, all);
    expect(steps.map((s) => s.id)).toEqual([
      "logo",
      "vereinsdaten",
      "abteilungen",
      "mitglieder",
      "vorstand",
      "termin",
      "qr-code",
    ]);
    expect(steps.every((s) => !s.done)).toBe(true);
  });

  it("hakt sich an den Daten ab und zeigt nur Schritte, für die das Recht da ist", () => {
    const steps = onboardingSteps(
      { ...empty, logo: true, departments: 2, members: 5, events: 1 },
      { ...all, users: false, joinLink: false },
    );
    expect(steps.map((s) => [s.id, s.done])).toEqual([
      ["logo", true],
      ["vereinsdaten", false],
      ["abteilungen", true],
      ["mitglieder", true],
      ["termin", true],
    ]);
  });
});
