import "server-only";
import { isIP } from "node:net";
import { prisma } from "@/server/db/client";
import { rateLimited } from "@/server/errors";
import { hashToken } from "./tokens";

/**
 * Rate-Limiting mit festem Zeitfenster, gespeichert in PostgreSQL.
 * Der Zähler wird in EINER atomaren Anweisung erhöht (INSERT … ON CONFLICT DO UPDATE) –
 * damit ist es auch bei gleichzeitigen Anfragen und mehreren Server-Instanzen korrekt.
 */
export interface RateLimitResult {
  allowed: boolean;
  remaining: number;
  retryAfterSeconds: number;
}

export async function checkRateLimit(
  key: string,
  limit: number,
  windowSeconds: number,
): Promise<RateLimitResult> {
  const rows = await prisma.$queryRaw<{ count: number; retryAfter: number }[]>`
    INSERT INTO "RateLimitBucket" ("key", "count", "resetAt")
    VALUES (${key}, 1, now() + make_interval(secs => ${windowSeconds}::double precision))
    ON CONFLICT ("key") DO UPDATE SET
      "count" = CASE
        WHEN "RateLimitBucket"."resetAt" <= now() THEN 1
        ELSE "RateLimitBucket"."count" + 1
      END,
      "resetAt" = CASE
        WHEN "RateLimitBucket"."resetAt" <= now()
          THEN now() + make_interval(secs => ${windowSeconds}::double precision)
        ELSE "RateLimitBucket"."resetAt"
      END
    RETURNING "count", ceil(extract(epoch FROM ("resetAt" - now())))::int AS "retryAfter"`;

  const row = rows[0];
  const count = Number(row?.count ?? 1);
  return {
    allowed: count <= limit,
    remaining: Math.max(0, limit - count),
    retryAfterSeconds: Math.max(1, Number(row?.retryAfter ?? windowSeconds)),
  };
}

/**
 * Prüft, ob ein Limit bereits ausgeschöpft ist, OHNE den Zähler zu erhöhen.
 * Zusammen mit `checkRateLimit` (Erhöhen bei Fehlversuchen) lassen sich nur Fehlversuche zählen –
 * korrekte Anmeldungen verbrauchen dann kein Kontingent.
 */
export async function peekRateLimit(key: string, limit: number): Promise<RateLimitResult> {
  const rows = await prisma.$queryRaw<{ count: number; retryAfter: number }[]>`
    SELECT "count", ceil(extract(epoch FROM ("resetAt" - now())))::int AS "retryAfter"
      FROM "RateLimitBucket"
     WHERE "key" = ${key} AND "resetAt" > now()`;
  const row = rows[0];
  if (!row) return { allowed: true, remaining: limit, retryAfterSeconds: 0 };
  const count = Number(row.count);
  return {
    allowed: count < limit,
    remaining: Math.max(0, limit - count),
    retryAfterSeconds: Math.max(1, Number(row.retryAfter)),
  };
}

/** Wirft `RATE_LIMITED`, wenn das Limit bereits ausgeschöpft ist (ohne zu zählen). */
export async function assertNotRateLimited(key: string, limit: number): Promise<void> {
  const result = await peekRateLimit(key, limit);
  if (!result.allowed) {
    throw rateLimited(result.retryAfterSeconds);
  }
}

/** Wirft `RATE_LIMITED` (HTTP 429), wenn das Limit überschritten ist. */
export async function enforceRateLimit(
  key: string,
  limit: number,
  windowSeconds: number,
): Promise<void> {
  const result = await checkRateLimit(key, limit, windowSeconds);
  if (!result.allowed) {
    throw rateLimited(result.retryAfterSeconds);
  }
}

/** Setzt einen Zähler zurück (z. B. nach erfolgreicher Anmeldung). */
export async function resetRateLimit(key: string): Promise<void> {
  await prisma.rateLimitBucket.deleteMany({ where: { key } });
}

/** Schlüsselbestandteil aus einer E-Mail-Adresse: gehasht, damit keine Adressen im Zähler stehen. */
export function rateLimitSubject(value: string): string {
  return hashToken(value.trim().toLowerCase()).slice(0, 32);
}

/** Die acht 16-Bit-Blöcke einer IPv6-Adresse, ausgeschrieben und ohne führende Nullen (`::` aufgelöst, IPv4-Ende umgerechnet). */
function ipv6Blocks(ip: string): string[] {
  let address = ip.toLowerCase();
  const zone = address.indexOf("%"); // Zonen-Angabe wie in „fe80::1%eth0“ gehört nicht zur Adresse
  if (zone >= 0) address = address.slice(0, zone);
  const embedded = /(\d+)\.(\d+)\.(\d+)\.(\d+)$/.exec(address);
  if (embedded) {
    const [a, b, c, d] = embedded.slice(1).map(Number) as [number, number, number, number];
    address = `${address.slice(0, embedded.index)}${((a << 8) | b).toString(16)}:${((c << 8) | d).toString(16)}`;
  }
  const [head = "", tail] = address.split("::");
  const left = head ? head.split(":") : [];
  const right = tail ? tail.split(":") : [];
  const blocks =
    tail === undefined
      ? left
      : [...left, ...Array<string>(8 - left.length - right.length).fill("0"), ...right];
  return blocks.map((block) => parseInt(block, 16).toString(16));
}

/**
 * Bezugsgröße für IP-Rate-Limits: IPv4 als ganze Adresse, IPv6 nur das /64-Netz. Ein IPv6-Anschluss bekommt fast immer ein
 * ganzes /64 und kann darin seine Adresse beliebig wechseln – je Einzeladresse gezählt, griffe eine Grenze wie „5 Anträge je
 * IP und Stunde“ praktisch nicht. Das /64 entspricht damit ungefähr einem IPv4-Anschluss hinter einem Router. IPv4-Adressen
 * in IPv6-Schreibweise (`::ffff:203.0.113.7`) zählen als IPv4. Alles andere (z. B. „unknown“) bleibt unverändert.
 */
export function rateLimitIp(ip: string): string {
  if (isIP(ip) !== 6) return ip;
  const blocks = ipv6Blocks(ip);
  if (blocks.slice(0, 5).every((block) => block === "0") && blocks[5] === "ffff") {
    const [high, low] = [parseInt(blocks[6]!, 16), parseInt(blocks[7]!, 16)];
    return `${high >> 8}.${high & 255}.${low >> 8}.${low & 255}`;
  }
  return `${blocks.slice(0, 4).join(":")}::/64`;
}

/** Löscht abgelaufene Zähler (Aufräum-Job). */
export async function purgeExpiredRateLimits(): Promise<number> {
  const { count } = await prisma.rateLimitBucket.deleteMany({
    where: { resetAt: { lte: new Date() } },
  });
  return count;
}
