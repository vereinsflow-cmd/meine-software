import type { CategoryDirection, Sphere } from "@/generated/prisma/enums";

/**
 * Kategorien, mit denen ein Verein sein Kassenbuch beginnt – in Alltagssprache, jeweils mit dem steuerlichen Bereich eines
 * gemeinnützigen Vereins. Es sind Vorschläge („mit Steuerberater prüfen“): Der Kassenwart kann sie umbenennen, ergänzen
 * und archivieren. Die Systemkategorien (`systemKey`) nutzt das Programm selbst (Beiträge, Spenden, Umbuchung …).
 */
export interface DefaultCategory {
  name: string;
  direction: CategoryDirection;
  sphere: Sphere;
  systemKey?: SystemCategoryKey;
  hint?: string;
}

export type SystemCategoryKey =
  | "FEES"
  | "ADMISSION"
  | "DONATIONS"
  | "BANK_FEES"
  | "CASH_DIFFERENCE"
  | "TRANSFER"
  | "OPENING"
  | "OTHER_INCOME"
  | "OTHER_EXPENSE";

export const DEFAULT_CATEGORIES: readonly DefaultCategory[] = [
  // Einnahmen
  { name: "Mitgliedsbeiträge", direction: "INCOME", sphere: "NON_PROFIT", systemKey: "FEES" },
  { name: "Aufnahmegebühren", direction: "INCOME", sphere: "NON_PROFIT", systemKey: "ADMISSION" },
  { name: "Spenden", direction: "INCOME", sphere: "NON_PROFIT", systemKey: "DONATIONS" },
  { name: "Zuschüsse", direction: "INCOME", sphere: "NON_PROFIT", hint: "Stadt, Land, Verband" },
  { name: "Zinsen", direction: "INCOME", sphere: "ASSET_MANAGEMENT" },
  {
    name: "Vermietung",
    direction: "INCOME",
    sphere: "ASSET_MANAGEMENT",
    hint: "z. B. Vereinsheim",
  },
  { name: "Sponsoring und Werbung", direction: "INCOME", sphere: "COMMERCIAL" },
  { name: "Verkauf Speisen und Getränke", direction: "INCOME", sphere: "COMMERCIAL" },
  { name: "Startgelder und Kursgebühren", direction: "INCOME", sphere: "PURPOSE_OPERATION" },
  {
    name: "Sonstige Einnahmen",
    direction: "INCOME",
    sphere: "NON_PROFIT",
    systemKey: "OTHER_INCOME",
  },
  // Ausgaben
  { name: "Hallen- und Platzmiete", direction: "EXPENSE", sphere: "NON_PROFIT" },
  {
    name: "Übungsleiter",
    direction: "EXPENSE",
    sphere: "NON_PROFIT",
    hint: "Honorare, Pauschalen",
  },
  { name: "Sportmaterial", direction: "EXPENSE", sphere: "NON_PROFIT" },
  { name: "Verbandsbeiträge", direction: "EXPENSE", sphere: "NON_PROFIT" },
  { name: "Versicherungen", direction: "EXPENSE", sphere: "NON_PROFIT" },
  { name: "Bankgebühren", direction: "EXPENSE", sphere: "NON_PROFIT", systemKey: "BANK_FEES" },
  { name: "Büro und Porto", direction: "EXPENSE", sphere: "NON_PROFIT" },
  { name: "Fahrtkosten", direction: "EXPENSE", sphere: "NON_PROFIT" },
  {
    name: "Einkauf für Feste",
    direction: "EXPENSE",
    sphere: "COMMERCIAL",
    hint: "Speisen, Getränke",
  },
  {
    name: "Sonstige Ausgaben",
    direction: "EXPENSE",
    sphere: "NON_PROFIT",
    systemKey: "OTHER_EXPENSE",
  },
  // Vom Programm genutzt
  { name: "Umbuchung", direction: "BOTH", sphere: "NEUTRAL", systemKey: "TRANSFER" },
  { name: "Anfangsbestand", direction: "BOTH", sphere: "NEUTRAL", systemKey: "OPENING" },
  {
    name: "Kassendifferenz",
    direction: "BOTH",
    sphere: "NON_PROFIT",
    systemKey: "CASH_DIFFERENCE",
  },
];

/** Kategorien, die man im Fenster „Neue Buchung“ nicht selbst wählt (das Programm bucht sie). */
export const HIDDEN_SYSTEM_KEYS: readonly SystemCategoryKey[] = ["TRANSFER", "OPENING"];
