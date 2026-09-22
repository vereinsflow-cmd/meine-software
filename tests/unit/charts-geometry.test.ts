import { describe, expect, it } from "vitest";
import {
  areaPath,
  donutAngles,
  donutSegmentPath,
  formatNumber,
  formatPercent,
  formatWithUnit,
  labelStride,
  linePath,
  linearScale,
  nearestIndex,
  niceScale,
  niceStep,
  polar,
  sparkBars,
  sparklinePoints,
} from "@/lib/charts/geometry";

describe("niceStep / niceScale", () => {
  it("rundet Schritte auf 1, 2, 2,5, 5, 10", () => {
    expect(niceStep(0.9)).toBe(1);
    expect(niceStep(1.5)).toBe(2);
    expect(niceStep(2.2)).toBe(2.5);
    expect(niceStep(3.7)).toBe(5);
    expect(niceStep(7)).toBe(10);
    expect(niceStep(230)).toBe(250);
  });

  it("Achse reicht bis zu einem runden Wert über dem Höchstwert", () => {
    expect(niceScale(7)).toEqual({ max: 8, ticks: [0, 2, 4, 6, 8] });
    expect(niceScale(100)).toEqual({ max: 100, ticks: [0, 25, 50, 75, 100] });
    expect(niceScale(1234).max).toBeGreaterThanOrEqual(1234);
  });

  it("Anzahlen bekommen nur ganze Teilstriche", () => {
    expect(niceScale(3, 4, true)).toEqual({ max: 3, ticks: [0, 1, 2, 3] });
    expect(niceScale(1, 4, true)).toEqual({ max: 1, ticks: [0, 1] });
    expect(niceScale(10, 4, true).ticks.every(Number.isInteger)).toBe(true);
    expect(niceScale(2.4, 4, true).ticks.every(Number.isInteger)).toBe(true);
  });

  it("Nachkommawerte (Stunden) bleiben ohne Rundungsrauschen", () => {
    expect(niceScale(0.9)).toEqual({ max: 1, ticks: [0, 0.25, 0.5, 0.75, 1] });
    expect(niceScale(4.6).ticks).toEqual([0, 2, 4, 6]);
  });

  it("ohne Daten gibt es eine neutrale Achse", () => {
    for (const value of [0, -3, Number.NaN, Number.POSITIVE_INFINITY]) {
      expect(niceScale(value)).toEqual({ max: 4, ticks: [0, 1, 2, 3, 4] });
    }
  });
});

describe("linearScale, Pfade", () => {
  it("bildet linear ab (auch umgekehrt, wie die y-Achse im Browser)", () => {
    const y = linearScale([0, 10], [100, 0]);
    expect(y(0)).toBe(100);
    expect(y(10)).toBe(0);
    expect(y(2.5)).toBe(75);
    expect(linearScale([5, 5], [0, 50])(5)).toBe(0); // leerer Wertebereich: kein Teilen durch 0
  });

  it("Linienzug und Fläche", () => {
    const points = [
      [0, 10],
      [5.555, 20],
    ] as const;
    expect(linePath(points)).toBe("M0 10 L5.56 20");
    expect(areaPath(points, 30)).toBe("M0 10 L5.56 20 L5.56 30 L0 30 Z");
    expect(linePath([])).toBe("");
    expect(areaPath([], 30)).toBe("");
  });

  it("polar: 0 = 12 Uhr, im Uhrzeigersinn", () => {
    const [x0, y0] = polar(50, 50, 10, 0);
    expect([Math.round(x0), Math.round(y0)]).toEqual([50, 40]);
    const [x1, y1] = polar(50, 50, 10, Math.PI / 2);
    expect([Math.round(x1), Math.round(y1)]).toEqual([60, 50]);
  });
});

describe("Ring", () => {
  it("Winkel: Anteile summieren sich (abzüglich der Lücken) zum Vollkreis", () => {
    const angles = donutAngles([50, 30, 20], 0.03);
    const swept = angles.reduce((sum, angle) => sum + (angle.to - angle.from), 0);
    expect(swept).toBeCloseTo(2 * Math.PI - 3 * 0.03, 5);
    expect(angles.map((a) => a.fraction)).toEqual([0.5, 0.3, 0.2]);
    expect(angles[1]!.from).toBeGreaterThan(angles[0]!.to); // Lücke zwischen den Stücken
  });

  it("ein einziges Stück ist ein voller Ring ohne Lücke", () => {
    const [only] = donutAngles([7]);
    expect(only!.from).toBe(0);
    expect(only!.to).toBeCloseTo(2 * Math.PI, 8);
  });

  it("ohne Werte oder nur Nullen gibt es keine Stücke; Nullwerte erzeugen kein sichtbares Stück", () => {
    expect(donutAngles([])).toEqual([]);
    expect(donutAngles([0, 0])).toEqual([]);
    const withZero = donutAngles([5, 0, 5]);
    expect(withZero[1]!.to).toBe(withZero[1]!.from);
  });

  it("Pfad eines Ringstücks; der volle Ring besteht aus zwei Hälften", () => {
    const quarter = donutSegmentPath(50, 50, 40, 25, 0, Math.PI / 2);
    expect(quarter.startsWith("M50 10 A40 40 0 0 1 90 50")).toBe(true);
    expect(quarter.endsWith("Z")).toBe(true);
    const full = donutSegmentPath(50, 50, 40, 25, 0, 2 * Math.PI);
    expect(full.match(/Z/g)).toHaveLength(2);
    const large = donutSegmentPath(50, 50, 40, 25, 0, 1.5 * Math.PI);
    expect(large).toContain("A40 40 0 1 1"); // Bogen über 180°
  });
});

describe("Hilfen für Achsen und Zeiger", () => {
  it("labelStride: nur so viele Beschriftungen, wie nebeneinander passen", () => {
    expect(labelStride(12, 600, 40)).toBe(1);
    expect(labelStride(12, 300, 50)).toBe(2);
    expect(labelStride(12, 200, 60)).toBe(4);
    expect(labelStride(1, 200, 60)).toBe(1);
    expect(labelStride(12, 0, 60)).toBe(1);
  });

  it("nearestIndex findet die nächste Position", () => {
    expect(nearestIndex(12, [0, 10, 20, 30])).toBe(1);
    expect(nearestIndex(-50, [0, 10, 20])).toBe(0);
    expect(nearestIndex(99, [0, 10, 20])).toBe(2);
    expect(nearestIndex(5, [])).toBe(-1);
  });
});

describe("sparklinePoints (Trendlinie)", () => {
  it("verteilt die Punkte gleichmäßig in der Breite und skaliert Werte auf die Höhe (größer = weiter oben)", () => {
    const points = sparklinePoints([1, 2, 3], 100, 28, 2);
    expect(points).toHaveLength(3);
    expect(points[0]).toEqual([2, 26]); // kleinster Wert, unten
    expect(points[1]).toEqual([50, 14]); // Mitte
    expect(points[2]).toEqual([98, 2]); // größter Wert, oben
  });

  it("überall derselbe Wert ergibt eine waagerechte Linie in der Mitte (keine Division durch 0)", () => {
    const points = sparklinePoints([5, 5, 5, 5], 100, 28);
    expect(points.every(([, y]) => y === 14)).toBe(true);
  });

  it("ein einzelner Wert steht am linken Rand", () => {
    expect(sparklinePoints([7], 100, 28, 2)).toEqual([[2, 14]]);
  });

  it("keine Werte ergeben keine Punkte", () => {
    expect(sparklinePoints([], 100, 28)).toEqual([]);
  });

  it("skaliert im eigenen Wertebereich, nicht ab 0 – kleine Schwankungen bleiben sichtbar", () => {
    const points = sparklinePoints([98, 99, 100], 100, 28, 2);
    // Trotz kleinem Unterschied nutzt die Linie die volle Höhe (nicht nur die obersten paar Pixel wie bei einer 0-Achse).
    expect(points[0]![1]).toBe(26);
    expect(points[2]![1]).toBe(2);
  });
});

describe("sparkBars (kleines Balkendiagramm)", () => {
  it("skaliert ab der Grundlinie (0), nicht ab dem kleinsten Wert – anders als sparklinePoints", () => {
    const bars = sparkBars([50, 100], 100, 32, 0); // ohne Lücke: einfache Zahlen
    expect(bars).toHaveLength(2);
    expect(bars[0]).toMatchObject({ x: 0, width: 50, y: 16, height: 16 }); // 50 % vom Höchstwert
    expect(bars[1]).toMatchObject({ x: 50, width: 50, y: 0, height: 32 }); // Höchstwert: volle Höhe
  });

  it("ein Wert von 0 ergibt einen unsichtbar flachen Balken (Höhe 0), keinen negativen", () => {
    const bars = sparkBars([0, 10], 100, 32, 0);
    expect(bars[0]).toMatchObject({ y: 32, height: 0 });
  });

  it("sind alle Werte 0, sind alle Balken flach (keine Division durch 0)", () => {
    const bars = sparkBars([0, 0, 0], 100, 32);
    expect(bars.every((b) => b.height === 0)).toBe(true);
  });

  it("Balken gleicher Breite mit Lücke bleiben je in ihrem gleich breiten Abschnitt", () => {
    const bars = sparkBars([1, 2, 3, 4], 100, 32, 0.5);
    const slot = 100 / 4; // 25 px je Balken samt Lücke
    const width = slot / 1.5; // Balkenbreite bei gapRatio 0,5
    for (const [index, bar] of bars.entries()) {
      expect(bar.width).toBeCloseTo(width);
      expect(bar.x).toBeCloseTo(index * slot + (slot - width) / 2); // mittig in seinem Abschnitt
    }
    expect(bars.at(-1)!.x + bars.at(-1)!.width).toBeLessThanOrEqual(100);
  });

  it("keine Werte ergeben keine Balken", () => {
    expect(sparkBars([], 100, 32)).toEqual([]);
  });
});

describe("Zahlenformat", () => {
  it("deutsches Format mit Tausenderpunkt und Dezimalkomma", () => {
    expect(formatNumber(1234)).toBe("1.234");
    expect(formatNumber(4.5, 1)).toBe("4,5");
    expect(formatNumber(4.04, 1)).toBe("4");
    expect(formatNumber(0)).toBe("0");
  });
  it("Einheit im Singular und Plural", () => {
    const unit = { singular: "Mitglied", plural: "Mitglieder", decimals: 0 };
    expect(formatWithUnit(1, unit)).toBe("1 Mitglied");
    expect(formatWithUnit(12, unit)).toBe("12 Mitglieder");
    expect(formatWithUnit(0, unit)).toBe("0 Mitglieder");
    expect(formatWithUnit(4.5, { singular: "Std.", plural: "Std.", decimals: 1 })).toBe("4,5 Std.");
  });
  it("Prozent ohne Nachkommastellen, mit geschütztem Leerzeichen", () => {
    expect(formatPercent(0.833)).toBe("83 %");
    expect(formatPercent(1)).toBe("100 %");
  });
});
