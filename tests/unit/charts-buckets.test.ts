import { describe, expect, it } from "vitest";
import {
  countPerBucket,
  foldSlices,
  membersAtBucketEnds,
  sumPerBucket,
} from "@/lib/charts/aggregate";
import {
  GRANULARITIES,
  GRANULARITY_COUNT,
  bucketIndexOf,
  buildBuckets,
  isoWeek,
  toLabels,
} from "@/lib/charts/time-buckets";

// Montag, 21.09.2026, 12:00 Uhr Berlin (Sommerzeit, UTC+2)
const NOW = new Date("2026-09-21T10:00:00Z");
const day = (iso: string) => new Date(`${iso}T00:00:00Z`); // reiner Kalendertag wie @db.Date

describe("isoWeek", () => {
  it("zählt nach ISO 8601: die Woche gehört zu dem Jahr, in dem ihr Donnerstag liegt", () => {
    expect(isoWeek(2026, 1, 1)).toEqual({ year: 2026, week: 1 }); // Donnerstag
    expect(isoWeek(2025, 12, 29)).toEqual({ year: 2026, week: 1 }); // Montag derselben Woche
    expect(isoWeek(2027, 1, 1)).toEqual({ year: 2026, week: 53 }); // 2026 hat 53 Wochen
    expect(isoWeek(2024, 12, 30)).toEqual({ year: 2025, week: 1 });
    expect(isoWeek(2026, 9, 21)).toEqual({ year: 2026, week: 39 });
    expect(isoWeek(2026, 9, 27)).toEqual({ year: 2026, week: 39 }); // Sonntag
  });
});

describe("buildBuckets", () => {
  it("liefert je Auflösung die richtige Anzahl, der letzte Zeitraum ist der laufende", () => {
    for (const granularity of GRANULARITIES) {
      const buckets = buildBuckets(granularity, NOW);
      expect(buckets).toHaveLength(GRANULARITY_COUNT[granularity]);
      expect(buckets.at(-1)!.partial).toBe(true);
      expect(buckets.slice(0, -1).every((bucket) => !bucket.partial)).toBe(true);
      expect(buckets.at(-1)!.start.getTime()).toBeLessThanOrEqual(NOW.getTime());
      expect(buckets.at(-1)!.end.getTime()).toBeGreaterThan(NOW.getTime());
    }
  });

  it("Zeiträume schließen lückenlos aneinander an (auch über Sommerzeit und Jahreswechsel)", () => {
    for (const granularity of GRANULARITIES) {
      for (const now of [NOW, new Date("2026-10-28T09:00:00Z"), new Date("2027-01-03T09:00:00Z")]) {
        const buckets = buildBuckets(granularity, now);
        for (let i = 1; i < buckets.length; i += 1) {
          expect(buckets[i]!.start.getTime()).toBe(buckets[i - 1]!.end.getTime());
        }
      }
    }
  });

  it("Monate: 12 Stück von Oktober 2025 bis September 2026, Grenzen in Berliner Ortszeit", () => {
    const buckets = buildBuckets("M", NOW);
    expect(buckets[0]).toMatchObject({
      key: "2025-10",
      label: "Okt 25",
      fullLabel: "Oktober 2025",
    });
    const last = buckets.at(-1)!;
    expect(last).toMatchObject({ key: "2026-09", label: "Sep 26", fullLabel: "September 2026" });
    expect(last.start.toISOString()).toBe("2026-08-31T22:00:00.000Z"); // 1.9. 00:00 Uhr Berlin
    expect(last.end.toISOString()).toBe("2026-09-30T22:00:00.000Z");
  });

  it("Wochen: beginnen am Montag, Kalenderwoche nach ISO, Sonntag gehört zur selben Woche", () => {
    const monday = buildBuckets("W", NOW).at(-1)!;
    expect(monday).toMatchObject({ key: "2026-W39", label: "KW 39" });
    expect(monday.start.toISOString()).toBe("2026-09-20T22:00:00.000Z"); // Mo 21.9. 00:00 Berlin
    expect(monday.fullLabel).toBe("KW 39 (21.09.–27.09.2026)");
    const sunday = buildBuckets("W", new Date("2026-09-27T20:00:00Z")).at(-1)!; // So 22:00 Berlin
    expect(sunday.key).toBe("2026-W39");
  });

  it("Wochen bei Zeitumstellung: die Woche mit dem Ende der Sommerzeit dauert 169 Stunden", () => {
    const buckets = buildBuckets("W", new Date("2026-10-28T09:00:00Z"));
    const changeWeek = buckets.find((bucket) => bucket.key === "2026-W43")!; // 19.–25.10.2026
    expect((changeWeek.end.getTime() - changeWeek.start.getTime()) / 3_600_000).toBe(169);
  });

  it("Quartale und Jahre", () => {
    const quarters = buildBuckets("Q", NOW);
    expect(quarters[0]).toMatchObject({
      key: "2024-Q4",
      label: "Q4 24",
      fullLabel: "4. Quartal 2024",
    });
    expect(quarters.at(-1)).toMatchObject({ key: "2026-Q3", label: "Q3 26" });
    expect(quarters.at(-1)!.start.toISOString()).toBe("2026-06-30T22:00:00.000Z"); // 1.7. 00:00 Berlin
    const years = buildBuckets("Y", NOW);
    expect(years.map((bucket) => bucket.key)).toEqual(["2022", "2023", "2024", "2025", "2026"]);
  });

  it("Jahreswechsel: Anfang Januar reicht der Rückblick über das Jahr hinaus", () => {
    const buckets = buildBuckets("M", new Date("2027-01-03T09:00:00Z"));
    expect(buckets.at(-1)!.key).toBe("2027-01");
    expect(buckets[0]!.key).toBe("2026-02");
  });

  it("toLabels gibt nur Beschriftungen weiter (keine Zeitpunkte)", () => {
    const labels = toLabels(buildBuckets("Y", NOW));
    expect(Object.keys(labels[0]!).sort()).toEqual(["fullLabel", "key", "label", "partial"]);
  });
});

describe("bucketIndexOf", () => {
  const buckets = buildBuckets("M", NOW);
  it("ordnet Zeitpunkte dem richtigen Zeitraum zu; Grenzen gehören zum späteren Zeitraum", () => {
    expect(bucketIndexOf(buckets, new Date("2026-09-10T12:00:00Z"))).toBe(11);
    expect(bucketIndexOf(buckets, new Date("2026-08-31T21:59:59Z"))).toBe(10); // 31.8. 23:59 Berlin
    expect(bucketIndexOf(buckets, new Date("2026-08-31T22:00:00Z"))).toBe(11); // 1.9. 00:00 Berlin
    expect(bucketIndexOf(buckets, new Date("2025-10-15T12:00:00Z"))).toBe(0);
  });
  it("liefert -1 außerhalb des Bereichs", () => {
    expect(bucketIndexOf(buckets, new Date("2025-09-30T21:59:59Z"))).toBe(-1);
    expect(bucketIndexOf(buckets, new Date("2026-09-30T22:00:00Z"))).toBe(-1);
    expect(bucketIndexOf([], NOW)).toBe(-1);
  });
});

describe("countPerBucket / sumPerBucket", () => {
  const buckets = buildBuckets("M", NOW);
  it("zählt je Zeitraum und ignoriert Zeitpunkte außerhalb", () => {
    const counts = countPerBucket(
      [
        new Date("2026-09-01T10:00:00Z"),
        new Date("2026-09-20T10:00:00Z"),
        new Date("2026-08-15T10:00:00Z"),
        new Date("2020-01-01T10:00:00Z"), // zu alt
        new Date("2027-05-01T10:00:00Z"), // zu neu
      ],
      buckets,
    );
    expect(counts.at(-1)).toBe(2);
    expect(counts.at(-2)).toBe(1);
    expect(counts.reduce((a, b) => a + b, 0)).toBe(3);
  });
  it("summiert Werte je Zeitraum", () => {
    const sums = sumPerBucket(
      [
        { at: new Date("2026-09-01T10:00:00Z"), value: 90 },
        { at: new Date("2026-09-02T10:00:00Z"), value: 30 },
        { at: new Date("2026-07-02T10:00:00Z"), value: 60 },
      ],
      buckets,
    );
    expect(sums.at(-1)).toBe(120);
    expect(sums.at(-3)).toBe(60);
  });
  it("leere Eingabe ergibt lauter Nullen", () => {
    expect(countPerBucket([], buckets)).toEqual(Array(12).fill(0));
  });
});

describe("membersAtBucketEnds", () => {
  const buckets = buildBuckets("M", NOW);
  const rows = [
    { joinedAt: day("2025-01-10"), leftAt: null, status: "ACTIVE" }, // A: schon lange dabei
    { joinedAt: day("2026-09-15"), leftAt: null, status: "ACTIVE" }, // B: neu im laufenden Monat
    { joinedAt: day("2024-05-01"), leftAt: day("2026-03-31"), status: "LEFT" }, // C: Austritt zum 31.3.2026
    { joinedAt: null, leftAt: null, status: "ACTIVE" }, // D: ohne Eintrittsdatum
    { joinedAt: day("2020-01-01"), leftAt: null, status: "LEFT" }, // E: ausgetreten ohne Datum
    { joinedAt: day("2027-01-01"), leftAt: null, status: "ACTIVE" }, // F: Eintritt liegt in der Zukunft
  ];
  const { counts, skipped } = membersAtBucketEnds(rows, buckets, NOW);
  const at = (key: string) => counts[buckets.findIndex((bucket) => bucket.key === key)];

  it("zählt den Bestand am Ende jedes Zeitraums", () => {
    expect(at("2025-10")).toBe(2); // A und C
    expect(at("2026-02")).toBe(2); // A und C
  });
  it("wer zum letzten Tag eines Zeitraums austritt, zählt dort nicht mehr mit", () => {
    expect(at("2026-03")).toBe(1); // nur A
    expect(at("2026-08")).toBe(1);
  });
  it("der laufende Zeitraum zählt bis heute (Eintritt am 15.9. ist dabei, Zukunft nicht)", () => {
    expect(at("2026-09")).toBe(2); // A und B
  });
  it("meldet, wer sich nicht einordnen lässt", () => {
    expect(skipped).toBe(2); // D und E
  });
  it("ohne Mitglieder: überall 0", () => {
    expect(membersAtBucketEnds([], buckets, NOW)).toEqual({
      counts: Array(12).fill(0),
      skipped: 0,
    });
  });
});

describe("foldSlices", () => {
  const slice = (id: string, value: number, slot: number) => ({ id, label: id, value, slot });
  it("sortiert nach Größe und lässt leere Kategorien weg", () => {
    const result = foldSlices([slice("a", 1, 1), slice("b", 5, 2), slice("c", 0, 3)], 6);
    expect(result.map((s) => s.id)).toEqual(["b", "a"]);
  });
  it("fasst den Rest jenseits der Höchstzahl zu „Andere“ zusammen", () => {
    const many = Array.from({ length: 8 }, (_, i) => slice(`s${i}`, 10 - i, i + 1));
    const result = foldSlices(many, 6);
    expect(result).toHaveLength(6);
    expect(result.slice(0, 5).map((s) => s.id)).toEqual(["s0", "s1", "s2", "s3", "s4"]);
    expect(result[5]).toMatchObject({ id: "other", label: "Andere", value: 5 + 4 + 3 });
  });
  it("Gesamtsumme bleibt beim Zusammenfassen erhalten", () => {
    const many = Array.from({ length: 9 }, (_, i) => slice(`s${i}`, i + 1, (i % 6) + 1));
    const total = many.reduce((sum, s) => sum + s.value, 0);
    expect(foldSlices(many, 6).reduce((sum, s) => sum + s.value, 0)).toBe(total);
  });
});
