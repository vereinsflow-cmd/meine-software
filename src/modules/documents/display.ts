import type { Accent } from "@/components/shared/accent";
import { formatDate, formatEuroFromCents } from "@/lib/dates";
import { extensionOf } from "@/lib/uploads";
import type { DocumentInvoice } from "./service";

/**
 * Anzeige der Dokumentenliste („Ruhige Liste“, seit 20.10.2026) – reine Funktionen, im Browser und auf dem Server nutzbar,
 * einzeln getestet (tests/unit/document-display.test.ts).
 */

/**
 * Name und Endung getrennt: Die Liste zeigt den Namen ohne „.pdf“ – die Endung steht schon auf der Kachel davor. Ohne
 * erkennbare Endung bleibt der ganze Name stehen.
 */
export function splitFileName(name: string): { base: string; ext: string } {
  const ext = extensionOf(name);
  if (!ext || name.length <= ext.length + 1) return { base: name, ext: "" };
  return { base: name.slice(0, -(ext.length + 1)), ext };
}

/** Beschriftung der Kachel: die Endung in Großbuchstaben („PDF“, „DOCX“), sonst der Dateityp („DATEI“ als Notnagel). */
export function fileTypeLabel(name: string, mimeType: string): string {
  const ext = extensionOf(name);
  if (ext && ext.length <= 4) return ext.toUpperCase();
  const subtype = mimeType.split("/").pop() ?? "";
  return /^[a-z0-9]{1,4}$/i.test(subtype) ? subtype.toUpperCase() : "DATEI";
}

/**
 * Überschrift der Liste (nur für Screenreader, `tabIndex={-1}`): Sie nimmt nach dem Löschen den Fokus auf, wenn keine Zeile
 * mehr übrig ist (siehe `DocumentRowActions`).
 */
export const DOCUMENT_LIST_HEADING_ID = "dokumente-titel";

/**
 * Farben der Kategorien (ohne Kategorie grau). Sechs Töne, die auch auf einen Blick verschieden aussehen (Farbton paarweise
 * mindestens 30° auseinander, im Alphabet benachbarte noch weiter – geprüft in tests/unit/document-display.test.ts). Cyan
 * statt Türkis (seit 21.10.2026): Türkis lag nur 20° neben Grün, „Protokolle“ und „Satzung“ sahen gleich aus. Rosa
 * zuletzt – es liegt nah am Rot von „überfällig“.
 */
const CATEGORY_ACCENTS: readonly Accent[] = ["blue", "amber", "emerald", "violet", "cyan", "rose"];

/** Kategorie → Farbe für die Dokumentenliste (siehe `categoryAccents`). */
export type CategoryAccents = ReadonlyMap<string, Accent>;

/**
 * Farben der Kategorien, die der Benutzer sieht – in der Reihenfolge von `listCategories` (alphabetisch) der Reihe nach aus
 * der Palette. So bekommen die ersten sechs Kategorien eines Vereins verschiedene Farben; ein Wert aus dem Namen allein
 * ergäbe bei sechs Farben schon ab drei, vier Kategorien Doppelte (beim ersten Foto: drei violette). Unabhängig von Suche,
 * Filter und Seite, also überall in der Liste dieselbe Farbe; sie ändert sich nur, wenn eine Kategorie dazukommt oder
 * wegfällt (und kann je nach Zugriffsstufe abweichen, weil jeder nur die Kategorien seiner Dokumente sieht).
 */
export function categoryAccents(categories: readonly string[]): CategoryAccents {
  return new Map(
    categories.map((name, index) => [name, CATEGORY_ACCENTS[index % CATEGORY_ACCENTS.length]!]),
  );
}

/**
 * Farbe einer Kategorie aus `accents`; fehlt sie dort (z. B. eine nur über die Adresse gewählte), aus ihrem Namen errechnet –
 * auch dann nach jedem Neuladen dieselbe. Die Farbe ist nur Orientierung (gleiche Kategorien erkennt man auf einen Blick);
 * der Name steht immer daneben.
 */
export function categoryAccent(category: string | null, accents?: CategoryAccents): Accent {
  if (!category) return "slate";
  const known = accents?.get(category);
  if (known) return known;
  let hash = 0;
  for (const char of category) hash = (hash * 31 + char.charCodeAt(0)) >>> 0;
  return CATEGORY_ACCENTS[hash % CATEGORY_ACCENTS.length]!;
}

/** Farbpunkt der Kategorie auf den Filterknöpfen (Stufe 500, rein schmückend). */
export const CATEGORY_DOT: Record<Accent, string> = {
  blue: "bg-blue-500",
  violet: "bg-violet-500",
  emerald: "bg-emerald-500",
  amber: "bg-amber-500",
  rose: "bg-rose-500",
  slate: "bg-slate-400",
  teal: "bg-teal-500",
  cyan: "bg-cyan-500",
};

export interface InvoiceState {
  /** Betrag („349,50 €“), `null` ohne Betrag (z. B. schon bezahlt hochgeladen). */
  amount: string | null;
  tone: "danger" | "warning" | "success";
  /** Kurzes Schild: „überfällig seit 9 Tagen“, „fällig in 14 Tagen“, „offen“, „bezahlt am 10.09.2026“. */
  text: string;
}

/**
 * Zahlungsstand einer Rechnung für die Liste: Das erste Wort sagt, worum es geht („überfällig …“, „fällig …“, „bezahlt …“) –
 * so überfliegt man die Spalte schnell. Rot nur bei Überfälligem, Bernstein für Offenes, Grün für Bezahltes; die Bedeutung
 * steht immer im Text.
 */
export function invoiceState(invoice: DocumentInvoice): InvoiceState {
  const amount = invoice.amountCents === null ? null : formatEuroFromCents(invoice.amountCents);
  if (invoice.status === "PAID")
    return {
      amount,
      tone: "success",
      // paidAt ist ein Zeitpunkt (kein Kalendertag) – daher in Berliner Zeit.
      text: invoice.paidAt ? `bezahlt am ${formatDate(invoice.paidAt)}` : "bezahlt",
    };
  const days = invoice.dueInDays;
  if (days === null) return { amount, tone: "warning", text: "offen" };
  if (days < 0)
    return {
      amount,
      tone: "danger",
      text: days === -1 ? "überfällig seit gestern" : `überfällig seit ${-days} Tagen`,
    };
  return {
    amount,
    tone: "warning",
    text: days === 0 ? "heute fällig" : days === 1 ? "morgen fällig" : `fällig in ${days} Tagen`,
  };
}
