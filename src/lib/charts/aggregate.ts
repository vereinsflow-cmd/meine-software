import { bucketIndexOf, type BucketRange, type TimeBucket } from "./time-buckets";
import type { DistributionSlice } from "./types";

/** Anzahl der Zeitpunkte je Zeitraum. Zeitpunkte außerhalb aller Zeiträume werden ignoriert. */
export function countPerBucket(
  instants: readonly Date[],
  buckets: readonly BucketRange[],
): number[] {
  const counts = buckets.map(() => 0);
  for (const instant of instants) {
    const index = bucketIndexOf(buckets, instant);
    if (index >= 0) counts[index]! += 1;
  }
  return counts;
}

/** Summe der Werte je Zeitraum. */
export function sumPerBucket(
  rows: readonly { at: Date; value: number }[],
  buckets: readonly TimeBucket[],
): number[] {
  const sums = buckets.map(() => 0);
  for (const row of rows) {
    const index = bucketIndexOf(buckets, row.at);
    if (index >= 0) sums[index]! += row.value;
  }
  return sums;
}

export interface MembershipRow {
  /** Eintritt als reiner Kalendertag (UTC-Mitternacht, wie `@db.Date`). */
  joinedAt: Date | null;
  leftAt: Date | null;
  status: string;
}

/**
 * Mitgliederbestand am Ende jedes Zeitraums (beim laufenden Zeitraum: heute). Gezählt wird, wer bis dahin eingetreten und
 * noch nicht ausgetreten war; wer am Enddatum eines Zeitraums austritt, zählt dort nicht mehr mit. Nicht einordnen lässt
 * sich, wer kein Eintrittsdatum hat oder als „ausgetreten“ ohne Austrittsdatum geführt wird – diese Fälle stehen in
 * `skipped`, damit die Oberfläche offen sagen kann, dass sie fehlen.
 */
export function membersAtBucketEnds(
  rows: readonly MembershipRow[],
  buckets: readonly TimeBucket[],
  now: Date,
): { counts: number[]; skipped: number } {
  let skipped = 0;
  const usable: { joined: number; left: number }[] = [];
  for (const row of rows) {
    const undatedLeaver = row.status === "LEFT" && !row.leftAt;
    if (!row.joinedAt || undatedLeaver) {
      skipped += 1;
      continue;
    }
    usable.push({
      joined: row.joinedAt.getTime(),
      left: row.leftAt ? row.leftAt.getTime() : Number.POSITIVE_INFINITY,
    });
  }
  const counts = buckets.map((bucket) => {
    const cutoff = Math.min(bucket.end.getTime(), now.getTime());
    let present = 0;
    for (const member of usable) {
      // Eintritt: bis einschließlich zum Stichtag; Austritt: ab dem Austrittstag nicht mehr dabei.
      if (member.joined <= cutoff && member.left > cutoff) present += 1;
    }
    return present;
  });
  return { counts, skipped };
}

/**
 * Sortiert nach Größe und fasst alles jenseits von `max` Kategorien zu „Andere“ zusammen (mehr als etwa sechs Teile
 * lesen sich in einem Ring nicht mehr). Kategorien ohne Wert entfallen.
 */
export function foldSlices(
  slices: readonly DistributionSlice[],
  max: number,
  otherLabel = "Andere",
  otherSlot = max,
): DistributionSlice[] {
  const sorted = slices.filter((slice) => slice.value > 0).sort((a, b) => b.value - a.value);
  if (sorted.length <= max) return sorted;
  const kept = sorted.slice(0, max - 1);
  const rest = sorted.slice(max - 1);
  return [
    ...kept,
    {
      id: "other",
      label: otherLabel,
      value: rest.reduce((sum, slice) => sum + slice.value, 0),
      slot: otherSlot,
    },
  ];
}
