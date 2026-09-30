/**
 * Der Assistent „Verein einrichten“: sechs Schritte, die ein neuer Verein nacheinander durchgeht. Jeder Schritt (außer
 * dem Abschluss) gilt als erledigt, sobald die Daten da sind – egal ob im Assistenten oder auf der normalen Seite
 * angelegt. Pflicht sind nur die Vereinsdaten (Kontakt-E-Mail und Anschrift, `lib/club-setup.ts`); alle übrigen Schritte
 * lassen sich überspringen.
 */
export const SETUP_STEPS = [
  { id: "verein", title: "Vereinsdaten", hint: "Name, Anschrift und Kontakt" },
  { id: "logo", title: "Logo", hint: "Erscheint in der Kopfzeile und auf dem Aushang" },
  { id: "abteilungen", title: "Abteilungen", hint: "Sparten und Gruppen deines Vereins" },
  { id: "mitglieder", title: "Mitglieder", hint: "Anlegen, importieren oder per QR-Code" },
  { id: "vorstand", title: "Vorstand & Zugänge", hint: "Wer außer dir mitarbeitet" },
  { id: "abschluss", title: "Abschluss", hint: "Kurz prüfen und fertig" },
] as const;

export type SetupStepId = (typeof SETUP_STEPS)[number]["id"];
export type SetupTaskId = Exclude<SetupStepId, "abschluss">;
export const SETUP_STEP_IDS: readonly SetupStepId[] = SETUP_STEPS.map((step) => step.id);

export interface SetupFacts {
  /** Pflichtangaben vollständig: Kontakt-E-Mail und Anschrift (`hasRequiredClubData`). */
  contact: boolean;
  logo: boolean;
  departments: number;
  /** Mitglieder im Bestand – die einrichtende Person selbst zählt mit. */
  members: number;
  /** Aktive Zugänge – die einrichtende Person selbst zählt mit. */
  users: number;
  openInvitations: number;
}

export function doneSteps(facts: SetupFacts): Record<SetupTaskId, boolean> {
  return {
    verein: facts.contact,
    logo: facts.logo,
    abteilungen: facts.departments > 0,
    mitglieder: facts.members > 1,
    vorstand: facts.users > 1 || facts.openInvitations > 0,
  };
}

/** Wo der Assistent ohne Angabe beginnt: beim ersten offenen Schritt – nach einem Abstecher (z. B. zum Import) geht es dort weiter. */
export function firstOpenStep(done: Record<SetupTaskId, boolean>): SetupStepId {
  return SETUP_STEPS.find((step) => step.id !== "abschluss" && !done[step.id])?.id ?? "abschluss";
}
