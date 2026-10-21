import { describe, expect, it } from "vitest";
import { nothingToChooseText } from "@/modules/shifts/components/new-shift-picker";

describe("Neue Schicht: Erklärung, wenn keine Veranstaltung zur Auswahl steht", () => {
  it("vereinsweit ohne Zusatz – mit dem Hinweis auf „Veranstaltung anlegen“, wenn erlaubt", () => {
    expect(nothingToChooseText(0, true)).toBe(
      "Eine Schicht gehört immer zu einer Veranstaltung. Gerade steht keine an, für die du Schichten anlegen kannst. " +
        "Lege zuerst die Veranstaltung an – danach planst du dort die Schichten.",
    );
    expect(nothingToChooseText(0, false)).toContain(
      "Gerade steht keine an, für die du Schichten anlegen kannst. Sobald eine angelegt ist, kannst du hier Schichten planen.",
    );
  });

  it("Abteilungsleitung: „deiner Abteilung“ bzw. „deiner Abteilungen“", () => {
    expect(nothingToChooseText(1, false)).toContain(
      "Gerade steht keine Veranstaltung deiner Abteilung an, für die du Schichten anlegen kannst.",
    );
    expect(nothingToChooseText(2, true)).toContain(
      "Gerade steht keine Veranstaltung deiner Abteilungen an, für die du Schichten anlegen kannst.",
    );
  });
});
