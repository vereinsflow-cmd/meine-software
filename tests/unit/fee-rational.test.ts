import { describe, expect, it } from "vitest";
import {
  add,
  apportion,
  compare,
  divInt,
  floor,
  formatRational,
  fromInt,
  mul,
  mulInt,
  neg,
  normalize,
  rational,
  roundHalfAwayFromZero,
  sub,
  sum,
  type Rational,
} from "@/lib/finance/rational";

const r = (n: number, d = 1): Rational => rational(n, d);

describe("Genaue Brüche", () => {
  it("kürzt und hält den Nenner positiv", () => {
    expect(normalize(6n, 8n)).toEqual({ n: 3n, d: 4n });
    expect(normalize(3n, -6n)).toEqual({ n: -1n, d: 2n });
    expect(normalize(0n, -5n)).toEqual({ n: 0n, d: 1n });
    expect(() => normalize(1n, 0n)).toThrow(RangeError);
  });

  it("rechnet ohne Rundungsfehler", () => {
    expect(add(r(1, 3), r(1, 6))).toEqual(r(1, 2));
    expect(sub(r(1, 3), r(1, 2))).toEqual(r(-1, 6));
    expect(mul(r(2, 3), r(9, 4))).toEqual(r(3, 2));
    expect(divInt(fromInt(10000), 12)).toEqual(r(2500, 3));
    expect(mulInt(r(2500, 3), 3)).toEqual(fromInt(2500));
    expect(neg(r(1, 2))).toEqual(r(-1, 2));
    expect(sum([r(1, 10), r(2, 10), r(7, 10)])).toEqual(fromInt(1));
    expect(sum([])).toEqual(fromInt(0));
    expect(compare(r(1, 3), r(1, 2))).toBe(-1);
    expect(compare(r(2, 4), r(1, 2))).toBe(0);
    expect(compare(r(-1, 3), r(-1, 2))).toBe(1);
  });

  it("nimmt nur ganze Zahlen an", () => {
    expect(() => fromInt(1.5)).toThrow(RangeError);
    expect(() => rational(1, 0.5)).toThrow(RangeError);
  });

  it("rundet ab (floor) – auch bei negativen Brüchen nach unten", () => {
    expect(floor(r(7, 2))).toBe(3n);
    expect(floor(r(-7, 2))).toBe(-4n);
    expect(floor(r(-4))).toBe(-4n);
  });

  it("schreibt „Zähler/Nenner“", () => {
    expect(formatRational(r(660, 3))).toBe("220/1");
    expect(formatRational(r(2500, 3))).toBe("2500/3");
    expect(formatRational(r(-1, 2))).toBe("-1/2");
  });
});

describe("Kaufmännisch runden", () => {
  it.each([
    [r(0), 0],
    [r(1, 3), 0],
    [r(1, 2), 1],
    [r(5, 2), 3],
    [r(7, 3), 2],
    [r(8, 3), 3],
    [r(27799, 10), 2780],
    [r(27795, 10), 2780],
    [r(27794, 10), 2779],
  ])("%o → %i", (value, expected) => {
    expect(roundHalfAwayFromZero(value)).toBe(expected);
  });

  it("ist bei negativen Beträgen symmetrisch", () => {
    for (const [n, d] of [
      [1, 2],
      [5, 2],
      [7, 3],
      [8, 3],
      [1, 3],
      [27795, 10],
    ] as const) {
      expect(roundHalfAwayFromZero(r(-n, d))).toBe(0 - roundHalfAwayFromZero(r(n, d)));
    }
    expect(roundHalfAwayFromZero(r(-1, 2))).toBe(-1);
    expect(Object.is(roundHalfAwayFromZero(r(-1, 3)), 0)).toBe(true); // keine −0
  });
});

describe("Summe centgenau auf Zeilen verteilen", () => {
  const total = (parts: Rational[]) => roundHalfAwayFromZero(sum(parts));

  it("verteilt fehlende Cent an die größten Reste, bei Gleichstand zuerst nach vorne", () => {
    expect(apportion(100, [r(100, 3), r(100, 3), r(100, 3)])).toEqual([34, 33, 33]);
    expect(apportion(200, [r(100, 3), r(200, 3), r(100, 1)])).toEqual([33, 67, 100]);
    expect(apportion(3, [r(1, 2), r(1, 2), r(1, 2), r(3, 2)])).toEqual([1, 1, 0, 1]);
  });

  it("lässt ganze Teile unverändert", () => {
    expect(apportion(1800, [fromInt(3600), fromInt(-1800)])).toEqual([3600, -1800]);
  });

  it("kommt mit negativen Teilen (Ermäßigung) zurecht", () => {
    // 27,5 und −13,75 → genau 13,75 → 14 Cent
    const parts = [r(55, 2), r(-55, 4)];
    expect(total(parts)).toBe(14);
    expect(apportion(14, parts)).toEqual([28, -14]);
    // gespiegelt: gleiche Beträge mit umgekehrtem Vorzeichen
    expect(apportion(-14, parts.map(neg))).toEqual([-28, 14]);
  });

  it("ergibt immer genau die Summe und weicht je Zeile höchstens um einen Cent ab", () => {
    const cases: Rational[][] = [
      [r(1200 * 11, 30), r(1200 * 19, 30), r(1200)],
      [r(1000, 7), r(2000, 7), r(-1000, 7), r(1, 3)],
      [r(-1, 3), r(-1, 3), r(-1, 3)],
      [r(10000, 12), r(10000, 12), r(10000, 12)],
      [r(1, 2)],
      [r(-5, 2), r(3, 4)],
    ];
    for (const parts of cases) {
      const t = total(parts);
      const cents = apportion(t, parts);
      expect(cents.reduce((a, b) => a + b, 0)).toBe(t);
      cents.forEach((cent, i) => {
        const diff = sub(fromInt(cent), parts[i]!);
        expect(compare(diff, r(-1))).toBeGreaterThan(-1);
        expect(compare(diff, r(1))).toBeLessThan(1);
      });
    }
  });

  it("verteilt auch eine abweichende Summe (mehr oder weniger Cent als Teile)", () => {
    expect(apportion(10, [fromInt(1), fromInt(1)])).toEqual([5, 5]);
    expect(apportion(-1, [r(1, 2), r(1, 2)])).toEqual([0, -1]);
    expect(apportion(0, [r(1, 4), r(1, 4)])).toEqual([0, 0]);
    expect(apportion(-5, [fromInt(0), fromInt(0)])).toEqual([-2, -3]);
  });

  it("ohne Teile nur die Summe 0", () => {
    expect(apportion(0, [])).toEqual([]);
    expect(() => apportion(1, [])).toThrow(RangeError);
  });
});
