import "server-only";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@/generated/prisma/client";
import { env } from "@/server/env";

/**
 * UNGESCHÜTZTER Datenbank-Client (kein Mandantenfilter!).
 *
 * Er darf ausschließlich von vertrauenswürdiger Infrastruktur unter `src/server/**`
 * verwendet werden (Authentifizierung, Plattformverwaltung, Jobs, Seed). Fachlogik
 * unter `src/modules/**` arbeitet ausschließlich mit `ctx.db` (siehe ./tenant.ts) –
 * das erzwingt eine ESLint-Regel.
 */
const globalForPrisma = globalThis as unknown as { __prisma?: PrismaClient };

function createClient(): PrismaClient {
  const adapter = new PrismaPg({ connectionString: env.DATABASE_URL });
  return new PrismaClient({
    adapter,
    log: env.NODE_ENV === "development" ? ["warn", "error"] : ["error"],
    // Standard wären 2 s (Wartezeit auf eine freie Verbindung) und 5 s (Laufzeit). Bei Lastspitzen
    // oder langsamen Verbindungen reicht das nicht; großzügige Werte vermeiden unnötige Abbrüche.
    transactionOptions: { maxWait: 10_000, timeout: 30_000 },
  });
}

/**
 * Der Client entsteht erst beim ersten Zugriff, nicht schon beim Import: `next build` lädt alle Routen, braucht dafür
 * aber weder Konfiguration noch Datenbank. Er liegt auf `globalThis`, damit Hot Reload (Entwicklung) und mehrere
 * Modul-Instanzen (Produktion) sich EINE Verbindung teilen statt jeweils einen neuen Pool zu öffnen.
 */
function getClient(): PrismaClient {
  globalForPrisma.__prisma ??= createClient();
  return globalForPrisma.__prisma;
}

export const prisma: PrismaClient = new Proxy({} as PrismaClient, {
  get(_target, property) {
    const client = getClient();
    const value: unknown = Reflect.get(client, property, client);
    return typeof value === "function" ? value.bind(client) : value;
  },
});

export type { PrismaClient };
