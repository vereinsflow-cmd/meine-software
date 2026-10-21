import type { FinanceAccountKind } from "@/generated/prisma/enums";
import { departmentImage, type DepartmentImage } from "@/modules/departments/department-image";

/**
 * Reine Hilfen für die Konten als Bankkarten auf der Finanz-Übersicht (seit 21.10.2026, Entwurf 1 „Wie eine Banking-App“):
 * Farbe je Konto, Foto im Hintergrund und Reihenfolge im Stapel. Ohne Datenbank und ohne React, einzeln getestet
 * (tests/unit/finance-account-cards.test.ts).
 */

/** Tönung einer Karte: Bankkonten blau (weitere violett, petrol), Barkasse grün, Sonstige violett. */
export type CardTint = "blue" | "emerald" | "violet" | "teal";

/** Was eine Karte vom Konto braucht (`FinanceAccountDto`). */
export interface CardAccount {
  id: string;
  kind: FinanceAccountKind;
  isDefault: boolean;
}

export interface AccountCard<A extends CardAccount> {
  account: A;
  tint: CardTint;
  /** Foto einer Abteilung als Motiv – reine Zierde; `null`: nur Verlauf in der Kontofarbe. */
  photo: DepartmentImage | null;
}

/**
 * Dunkle Abdeckung über Foto und Tönung einer Karte – [Stelle in % der Kartenhöhe, Deckkraft von Schwarz]: Wo Schrift steht
 * (oberes Drittel, unteres Viertel), mindestens 60 % Schwarz. Weiße Schrift hat so selbst über einer rein weißen Bildstelle
 * mindestens 4,5 : 1 (wie `CARD_SCRIM` der Abteilungskarten, nachgerechnet in tests/unit/finance-hero-look.test.ts); die
 * Tönung darunter dunkelt zusätzlich ab. In der Mitte (nur Chip und das Schild „Standardkonto“ auf eigener dunkler Fläche)
 * scheint das Foto durch.
 */
export const CARD_SCRIM_STOPS: readonly (readonly [number, number])[] = [
  [0, 0.66],
  [34, 0.6],
  [52, 0.2],
  [70, 0.6],
  [100, 0.75],
];

const BANK_TINTS: readonly CardTint[] = ["blue", "violet", "teal"];

/** Farbe je Konto in der gelieferten Reihenfolge: das erste Bankkonto blau, das zweite violett, das dritte petrol … */
export function accountTints(accounts: readonly CardAccount[]): CardTint[] {
  let bank = 0;
  return accounts.map((account) =>
    account.kind === "CASH"
      ? "emerald"
      : account.kind === "OTHER"
        ? "violet"
        : BANK_TINTS[bank++ % BANK_TINTS.length]!,
  );
}

/**
 * Die Fotos für die Karten: je Sportart eines, in der Reihenfolge der Abteilungsnamen (deutsch sortiert) – so hängt die
 * Auswahl nur an den Namen, nicht daran, welche Abteilung gerade am meisten ausgegeben hat. Abteilungen ohne passende
 * Sportart haben kein Foto.
 */
export function cardPhotos(departmentNames: readonly string[]): DepartmentImage[] {
  const photos: DepartmentImage[] = [];
  for (const name of [...departmentNames].sort((a, b) => a.localeCompare(b, "de"))) {
    const image = departmentImage(name);
    if (image && !photos.some((photo) => photo.sport === image.sport)) photos.push(image);
  }
  return photos;
}

/**
 * Karten in Konto-Reihenfolge (wie in den Einstellungen sortiert): Das n-te Konto bekommt das n-te Foto (reihum, wenn es
 * weniger Fotos als Konten gibt) – fest, solange sich Konten und Abteilungsnamen nicht ändern. Ohne Fotos nur der Verlauf.
 */
export function accountCards<A extends CardAccount>(
  accounts: readonly A[],
  departmentNames: readonly string[],
): AccountCard<A>[] {
  const tints = accountTints(accounts);
  const photos = cardPhotos(departmentNames);
  return accounts.map((account, index) => ({
    account,
    tint: tints[index]!,
    photo: photos.length > 0 ? photos[index % photos.length]! : null,
  }));
}

/**
 * Reihenfolge im Stapel (gezeichnet von hinten nach vorn): Das Standardkonto liegt vorn, also zuletzt – ohne Standardkonto
 * das erste. Die übrigen behalten ihre Reihenfolge.
 */
export function stackOrder<T extends { account: CardAccount }>(cards: readonly T[]): T[] {
  if (cards.length === 0) return [];
  const front = Math.max(
    0,
    cards.findIndex((card) => card.account.isDefault),
  );
  return [...cards.filter((_, index) => index !== front), cards[front]!];
}
