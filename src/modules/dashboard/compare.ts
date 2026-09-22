import type { Tone } from "@/components/shared/status-badge";
import { formatNumber } from "@/lib/charts/geometry";
import { inDaysLabel } from "@/lib/dates";

/**
 * Kurze Vergleichsinformation unter einer Kennzahlenkarte („+3 gegenüber dem Vormonat“, „35 von 50 Schichten
 * besetzt“ …) – reine Textbausteine mit einer Farbbedeutung wie bei Abzeichen (`ToneBadge`), aus bereits vorhandenen
 * Zahlen. Getrennt von der Darstellung (`StatCard`), damit sich die Sätze einzeln testen lassen.
 */
export interface Compare {
  text: string;
  tone: Tone;
}

/** „+3 gegenüber dem Vormonat“ – für Bestandsgrößen wie die Mitgliederzahl (`trend`: älteste zuerst, ein Wert je Monat). */
export function memberCompare(trend: readonly number[]): Compare | null {
  if (trend.length < 2) return null;
  const diff = trend.at(-1)! - trend.at(-2)!;
  if (diff === 0) return { text: "Unverändert gegenüber dem Vormonat", tone: "neutral" };
  return {
    text: `${diff > 0 ? "+" : ""}${diff} gegenüber dem Vormonat`,
    tone: diff > 0 ? "success" : "neutral",
  };
}

/**
 * „+12 % gegenüber letzter Woche“ – für Helferstunden (`trend`: älteste zuerst, ein Wert je Woche). Prozente nur,
 * wenn die Vorwoche nicht 0 Stunden war (sonst wäre jeder Sprung „von 0“ formal unendlich Prozent).
 */
export function hoursCompare(trend: readonly number[]): Compare | null {
  if (trend.length < 2) return null;
  const previous = trend.at(-2)!;
  const current = trend.at(-1)!;
  const diff = current - previous;
  if (diff === 0) {
    return previous === 0
      ? { text: "Noch keine Stunden erfasst", tone: "neutral" }
      : { text: "Unverändert gegenüber letzter Woche", tone: "neutral" };
  }
  if (previous <= 0) {
    return { text: `+${formatNumber(diff, 1)} Std. gegenüber letzter Woche`, tone: "success" };
  }
  const percent = Math.round((diff / previous) * 100);
  return {
    text: `${percent > 0 ? "+" : ""}${percent} % gegenüber letzter Woche`,
    tone: percent > 0 ? "success" : "neutral",
  };
}

/** „35 von 50 Schichten besetzt“ – dieselbe Ampelfarbe wie bei einzelnen Schichten (voll/teilweise/unbesetzt). */
export function staffingCompare(filled: number, required: number): Compare {
  if (required === 0) return { text: "Keine Schichten geplant", tone: "neutral" };
  const ratio = filled / required;
  const tone: Tone = ratio >= 1 ? "success" : ratio > 0 ? "warning" : "danger";
  return { text: `${filled} von ${required} Schichten besetzt`, tone };
}

/** „Nächster Termin in 4 Tagen“ / „… morgen“ / „… heute“; ohne kommenden Termin gibt es nichts zu vergleichen. */
export function nextEventCompare(daysUntilNext: number | null): Compare | null {
  if (daysUntilNext === null) return null;
  return { text: `Nächster Termin ${inDaysLabel(daysUntilNext)}`, tone: "neutral" };
}
