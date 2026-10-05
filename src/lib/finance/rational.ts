/**
 * Genaue Brüche für Geldbeträge in Cent: Zähler und Nenner als `bigint`, immer gekürzt, Nenner immer positiv. So bleiben
 * Teilbeträge wie „1.200 Cent × 11/30 Tage“ oder „10.000 Cent / 12 Monate“ bis zum Schluss genau; gerundet wird erst ganz
 * am Ende (`roundHalfAwayFromZero`), und `apportion` verteilt eine gerundete Summe centgenau auf die einzelnen Teile.
 * Reine Funktionen ohne Nebenwirkungen, im Browser und auf dem Server nutzbar.
 */

export interface Rational {
  /** Zähler (mit Vorzeichen). */
  readonly n: bigint;
  /** Nenner, immer > 0. */
  readonly d: bigint;
}

const abs = (x: bigint) => (x < 0n ? -x : x);

function gcd(a: bigint, b: bigint): bigint {
  let x = abs(a);
  let y = abs(b);
  while (y !== 0n) [x, y] = [y, x % y];
  return x;
}

/** Ganzzahl als `bigint`; wirft bei Kommazahlen, damit sich keine Rundungsfehler einschleichen. */
function toBigInt(value: number | bigint): bigint {
  if (typeof value === "bigint") return value;
  if (!Number.isSafeInteger(value)) throw new RangeError(`Keine ganze Zahl: ${value}`);
  return BigInt(value);
}

/** Kürzt den Bruch und macht den Nenner positiv. */
export function normalize(n: bigint, d: bigint): Rational {
  if (d === 0n) throw new RangeError("Nenner 0");
  if (d < 0n) {
    n = -n;
    d = -d;
  }
  const g = gcd(n, d);
  return g > 1n ? { n: n / g, d: d / g } : { n, d };
}

/** Bruch `n/d` aus Ganzzahlen. */
export function rational(n: number | bigint, d: number | bigint = 1n): Rational {
  return normalize(toBigInt(n), toBigInt(d));
}

/** Ganze Zahl als Bruch (z. B. Cent). */
export function fromInt(value: number | bigint): Rational {
  return { n: toBigInt(value), d: 1n };
}

export const ZERO: Rational = { n: 0n, d: 1n };

export function add(a: Rational, b: Rational): Rational {
  return normalize(a.n * b.d + b.n * a.d, a.d * b.d);
}

export function sub(a: Rational, b: Rational): Rational {
  return normalize(a.n * b.d - b.n * a.d, a.d * b.d);
}

export function mul(a: Rational, b: Rational): Rational {
  return normalize(a.n * b.n, a.d * b.d);
}

/** Teilt durch eine ganze Zahl (≠ 0). */
export function divInt(a: Rational, k: number | bigint): Rational {
  return normalize(a.n, a.d * toBigInt(k));
}

/** Multipliziert mit einer ganzen Zahl. */
export function mulInt(a: Rational, k: number | bigint): Rational {
  return normalize(a.n * toBigInt(k), a.d);
}

export function neg(a: Rational): Rational {
  return { n: -a.n, d: a.d };
}

/** Summe beliebig vieler Brüche (leer = 0). */
export function sum(values: readonly Rational[]): Rational {
  return values.reduce(add, ZERO);
}

/** −1, 0 oder 1 je nachdem, ob `a` kleiner, gleich oder größer als `b` ist. */
export function compare(a: Rational, b: Rational): -1 | 0 | 1 {
  const left = a.n * b.d;
  const right = b.n * a.d;
  return left < right ? -1 : left > right ? 1 : 0;
}

export function isZero(a: Rational): boolean {
  return a.n === 0n;
}

/** Größte ganze Zahl ≤ `a` (rundet bei negativen Werten nach unten, also weg von null). */
export function floor(a: Rational): bigint {
  const q = a.n / a.d; // bigint-Division schneidet Richtung null ab
  return a.n < 0n && q * a.d !== a.n ? q - 1n : q;
}

/**
 * Kaufmännisch runden auf ganze Cent: ab einem halben Cent wird aufgerundet, bei negativen Beträgen symmetrisch
 * (−0,5 → −1). Formel: Vorzeichen · ⌊(2·|n| + d) / (2·d)⌋.
 */
export function roundHalfAwayFromZero(a: Rational): number {
  const magnitude = (2n * abs(a.n) + a.d) / (2n * a.d);
  const result = a.n < 0n ? -magnitude : magnitude;
  return Number(result);
}

/**
 * Verteilt eine ganze Summe in Cent so auf die Teile, dass jede Zeile ganze Cent hat und die Zeilen zusammen genau die
 * Summe ergeben (Verfahren der größten Reste):
 *
 *  1. Jeder Teil wird abgerundet – immer zur nächstkleineren ganzen Zahl, auch bei negativen Teilen (−13,75 → −14). So
 *     ist der Rest jedes Teils eine Zahl zwischen 0 und 1, gleich welches Vorzeichen der Teil hat.
 *  2. Fehlen danach Cent zur Summe, bekommen die Teile mit dem größten Rest je einen Cent dazu; bei gleichem Rest zuerst
 *     der weiter vorne stehende Teil.
 *  3. Ist die Summe kleiner als die abgerundeten Teile zusammen (nur möglich, wenn `totalCents` nicht die gerundete
 *     Summe der Teile ist), verlieren die Teile mit dem kleinsten Rest je einen Cent; bei gleichem Rest zuerst der
 *     weiter hinten stehende. Fehlen mehr Cent, als es Teile gibt, bekommt bzw. verliert zuerst jeder Teil gleich viele.
 *
 * Mit `totalCents = roundHalfAwayFromZero(sum(parts))` weicht jede Zeile höchstens um einen Cent vom genauen Wert ab.
 * Wirft, wenn es keine Teile gibt, die Summe aber nicht 0 ist.
 */
export function apportion(totalCents: number, parts: readonly Rational[]): number[] {
  const total = toBigInt(totalCents);
  if (parts.length === 0) {
    if (total !== 0n) throw new RangeError("Keine Teile, auf die sich die Summe verteilen lässt");
    return [];
  }
  const floors = parts.map(floor);
  const remainders = parts.map((part, i) => normalize(part.n - floors[i]! * part.d, part.d));
  let missing = total - floors.reduce((acc, value) => acc + value, 0n);

  const count = BigInt(parts.length);
  // Mehr Cent als Teile: zuerst gleichmäßig auf alle verteilen (abgerundete Division, auch bei negativem Fehlbetrag).
  const even = missing >= 0n ? missing / count : -((-missing + count - 1n) / count);
  if (even !== 0n) {
    for (let i = 0; i < floors.length; i++) floors[i] = floors[i]! + even;
    missing -= even * count;
  }

  // Jetzt gilt 0 ≤ missing < Anzahl der Teile.
  if (missing > 0n) {
    const order = parts
      .map((_, i) => i)
      .sort((a, b) => compare(remainders[b]!, remainders[a]!) || a - b);
    for (let k = 0; k < Number(missing); k++) floors[order[k]!] = floors[order[k]!]! + 1n;
  }
  return floors.map(Number);
}

/** „Zähler/Nenner“, z. B. „660/3“ – zum Nachvollziehen des genauen Werts (auch bei ganzen Zahlen „3600/1“). */
export function formatRational(a: Rational): string {
  return `${a.n}/${a.d}`;
}
