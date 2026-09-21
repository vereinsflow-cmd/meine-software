/**
 * Rechnen für die Diagramme: Achsen mit „runden“ Werten, Pfade für Linien, Flächen und Ringe, Zahlenformat.
 * Alles reine Funktionen ohne Oberfläche – dadurch einfach zu testen.
 */

/** Rundet einen Schritt auf 1, 2, 2,5, 5 oder 10 (mal einer Zehnerpotenz). */
export function niceStep(rawStep: number): number {
  const exponent = Math.floor(Math.log10(rawStep));
  const fraction = rawStep / 10 ** exponent;
  const nice =
    fraction <= 1 ? 1 : fraction <= 2 ? 2 : fraction <= 2.5 ? 2.5 : fraction <= 5 ? 5 : 10;
  return nice * 10 ** exponent;
}

export interface NiceScale {
  /** Obere Grenze der Achse (immer ein Vielfaches des Schritts). */
  max: number;
  ticks: number[];
}

/**
 * Achse von 0 bis zu einem runden Höchstwert mit etwa `targetTicks` Teilstrichen. Bei `integer` sind alle Teilstriche
 * ganze Zahlen (Anzahlen). Ohne Daten (alles 0) gibt es eine neutrale Achse 0–4, damit ein leeres Diagramm nicht „kippt“.
 */
export function niceScale(maxValue: number, targetTicks = 4, integer = false): NiceScale {
  if (!Number.isFinite(maxValue) || maxValue <= 0) return { max: 4, ticks: [0, 1, 2, 3, 4] };
  let step = niceStep(maxValue / targetTicks);
  if (integer) step = Math.max(1, Math.ceil(step));
  const count = Math.ceil(maxValue / step - 1e-9);
  const ticks = Array.from({ length: count + 1 }, (_, index) => Number((index * step).toFixed(10)));
  return { max: ticks[ticks.length - 1]!, ticks };
}

/** Bildet einen Wertebereich linear auf einen Pixelbereich ab. */
export function linearScale(
  [domainMin, domainMax]: readonly [number, number],
  [rangeMin, rangeMax]: readonly [number, number],
): (value: number) => number {
  const span = domainMax - domainMin;
  return (value) =>
    span === 0 ? rangeMin : rangeMin + ((value - domainMin) / span) * (rangeMax - rangeMin);
}

const round = (n: number) => Math.round(n * 100) / 100;

/** Linienzug durch die Punkte (gerade Verbindungen – keine Glättung, die Werte dazwischen erfinden würde). */
export function linePath(points: readonly (readonly [number, number])[]): string {
  return points
    .map(([x, y], index) => `${index === 0 ? "M" : "L"}${round(x)} ${round(y)}`)
    .join(" ");
}

/** Fläche unter dem Linienzug bis zur Grundlinie `baselineY`. */
export function areaPath(
  points: readonly (readonly [number, number])[],
  baselineY: number,
): string {
  const first = points[0];
  const last = points[points.length - 1];
  if (!first || !last) return "";
  return `${linePath(points)} L${round(last[0])} ${round(baselineY)} L${round(first[0])} ${round(baselineY)} Z`;
}

/** Punkt auf dem Kreis; Winkel in Bogenmaß, 0 = 12 Uhr, im Uhrzeigersinn. */
export function polar(cx: number, cy: number, radius: number, angle: number): [number, number] {
  return [cx + radius * Math.sin(angle), cy - radius * Math.cos(angle)];
}

function ringSegment(
  cx: number,
  cy: number,
  outer: number,
  inner: number,
  from: number,
  to: number,
): string {
  const large = to - from > Math.PI ? 1 : 0;
  const [x0, y0] = polar(cx, cy, outer, from);
  const [x1, y1] = polar(cx, cy, outer, to);
  const [x2, y2] = polar(cx, cy, inner, to);
  const [x3, y3] = polar(cx, cy, inner, from);
  return (
    `M${round(x0)} ${round(y0)} A${outer} ${outer} 0 ${large} 1 ${round(x1)} ${round(y1)} ` +
    `L${round(x2)} ${round(y2)} A${inner} ${inner} 0 ${large} 0 ${round(x3)} ${round(y3)} Z`
  );
}

/** Pfad eines Ringstücks. Ein voller Ring (ein einziges Stück) wird aus zwei Hälften gebaut, weil ein Bogen von 360° in SVG nichts zeichnet. */
export function donutSegmentPath(
  cx: number,
  cy: number,
  outer: number,
  inner: number,
  from: number,
  to: number,
): string {
  if (to - from >= 2 * Math.PI - 1e-6) {
    return (
      ringSegment(cx, cy, outer, inner, from, from + Math.PI) +
      " " +
      ringSegment(cx, cy, outer, inner, from + Math.PI, from + 2 * Math.PI)
    );
  }
  return ringSegment(cx, cy, outer, inner, from, to);
}

export interface DonutAngle {
  from: number;
  to: number;
  fraction: number;
}

/**
 * Winkel der Ringstücke. Zwischen den Stücken bleibt eine kleine Lücke (`gap`, Bogenmaß) in der Hintergrundfarbe –
 * das trennt sie, ohne dass man Rahmen um die Marken zeichnen müsste. Bei nur einem Stück gibt es keine Lücke,
 * und sehr kleine Stücke behalten mindestens ihre Sichtbarkeit.
 */
export function donutAngles(values: readonly number[], gap = 0.03): DonutAngle[] {
  const total = values.reduce((sum, value) => sum + Math.max(0, value), 0);
  if (total <= 0) return [];
  const visible = values.filter((value) => value > 0).length;
  const effectiveGap = visible > 1 ? gap : 0;
  let cursor = 0;
  return values.map((value) => {
    const fraction = Math.max(0, value) / total;
    const sweep = fraction * 2 * Math.PI;
    const from = cursor + effectiveGap / 2;
    const to = Math.max(from + 0.01, cursor + sweep - effectiveGap / 2);
    cursor += sweep;
    return { from, to: fraction === 0 ? from : to, fraction };
  });
}

/** Wie viele Achsenbeschriftungen übersprungen werden müssen, damit sie sich nicht überlappen (1 = alle zeigen). */
export function labelStride(count: number, plotWidth: number, labelWidth: number): number {
  if (count <= 1 || plotWidth <= 0) return 1;
  return Math.max(1, Math.ceil(labelWidth / (plotWidth / count)));
}

/** Index des Werts in `positions`, der `x` am nächsten liegt (-1 bei leerer Liste). */
export function nearestIndex(x: number, positions: readonly number[]): number {
  let best = -1;
  let bestDistance = Number.POSITIVE_INFINITY;
  positions.forEach((position, index) => {
    const distance = Math.abs(position - x);
    if (distance < bestDistance) {
      best = index;
      bestDistance = distance;
    }
  });
  return best;
}

const numberFormats = new Map<number, Intl.NumberFormat>();

/** Zahl im deutschen Format (Tausenderpunkt, Dezimalkomma) mit höchstens `decimals` Nachkommastellen. */
export function formatNumber(value: number, decimals = 0): string {
  let format = numberFormats.get(decimals);
  if (!format) {
    format = new Intl.NumberFormat("de-DE", { maximumFractionDigits: decimals });
    numberFormats.set(decimals, format);
  }
  return format.format(value);
}

/** "1 Mitglied" / "12 Mitglieder" / "4,5 Std." */
export function formatWithUnit(
  value: number,
  unit: { singular: string; plural: string; decimals: number },
): string {
  const text = formatNumber(value, unit.decimals);
  return `${text} ${Math.abs(value) === 1 ? unit.singular : unit.plural}`;
}

/** Anteil in Prozent, ganzzahlig: "83 %" (mit geschütztem Leerzeichen). */
export function formatPercent(fraction: number): string {
  return `${Math.round(fraction * 100)} %`;
}
