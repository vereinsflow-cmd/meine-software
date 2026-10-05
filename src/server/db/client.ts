import "server-only";
import { PrismaPg } from "@prisma/adapter-pg";
import { $Enums, Prisma, PrismaClient } from "@/generated/prisma/client";
import { env } from "@/server/env";

/**
 * UNGESCHÜTZTER Datenbank-Client (kein Mandantenfilter!).
 *
 * Er darf ausschließlich von vertrauenswürdiger Infrastruktur unter `src/server/**`
 * verwendet werden (Authentifizierung, Plattformverwaltung, Jobs, Seed). Fachlogik
 * unter `src/modules/**` arbeitet ausschließlich mit `ctx.db` (siehe ./tenant.ts) –
 * das erzwingt eine ESLint-Regel.
 */
const globalForPrisma = globalThis as unknown as {
  /** Je Stand des Datenmodells ein Client (in der Produktion genau einer). */
  __prismaClients?: Map<string, PrismaClient>;
};

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
 * Stand des Datenmodells, mit dem ein Client erzeugt wurde – das ganze Schema (Tabellen, Spalten, Auswahllisten,
 * Verknüpfungen). Prisma legt es am Client ab (intern); fehlt es einmal, dienen Spalten und Auswahllisten als Ersatz.
 */
function schemaOf(client: PrismaClient): string {
  const inline = (client as unknown as { _engineConfig?: { inlineSchema?: unknown } })._engineConfig
    ?.inlineSchema;
  if (typeof inline === "string" && inline.length > 0) return inline;
  return JSON.stringify([
    Object.entries(Prisma).filter(([name]) => name.endsWith("ScalarFieldEnum")),
    $Enums,
  ]);
}

/** Client dieser Modul-Instanz (nach einer Änderung im Code lädt die Entwicklung das Modul neu). */
let own: PrismaClient | undefined;

/**
 * Der Client entsteht erst beim ersten Zugriff, nicht schon beim Import: `next build` lädt alle Routen, braucht dafür
 * aber weder Konfiguration noch Datenbank. Er liegt auf `globalThis`, damit Hot Reload (Entwicklung) und mehrere
 * Modul-Instanzen (Produktion) sich EINE Verbindung teilen statt jeweils einen neuen Pool zu öffnen.
 *
 * Kommen in der Entwicklung neue Tabellen, Spalten oder Auswahlwerte dazu (Migration + `prisma generate`), während der
 * Server läuft, gehört zum neuen Code ein neuer Client – der alte kennt das neue Modell nicht („Cannot read properties of
 * undefined (reading 'findUnique')“). Deshalb je Stand des Modells ein Client: Neuer Code bekommt den neuen, Anfragen,
 * die noch mit dem alten Code laufen, behalten den alten – keiner schließt dem anderen die Verbindung (laufende
 * Transaktionen bleiben heil). Ungenutzte Verbindungen des alten Clients schließt der Pool nach kurzer Zeit selbst; gemerkt
 * wird nur der aktuelle Stand.
 */
function getClient(): PrismaClient {
  if (own) return own;
  const clients = (globalForPrisma.__prismaClients ??= new Map());
  // Der neue Client verbindet sich erst bei der ersten Abfrage – wird er nicht gebraucht, kostet er nichts.
  const fresh = createClient();
  // In der Entwicklung gehört auch die Datenbank zum Schlüssel: Nach einer Änderung von DATABASE_URL in `.env` lädt der
  // Server neu – der neue Code soll dann auch die neue Datenbank nutzen.
  const key =
    env.NODE_ENV === "production" ? "production" : `${env.DATABASE_URL}\n${schemaOf(fresh)}`;
  let client = clients.get(key);
  if (!client) {
    client = fresh;
    // Nur den aktuellen Stand merken: Wer noch mit altem Code läuft, hält seinen Client selbst (`own`); der alte wird
    // danach freigegeben statt über eine lange Sitzung Speicher zu belegen.
    clients.clear();
    clients.set(key, client);
  }
  own = client;
  return client;
}

export const prisma: PrismaClient = new Proxy({} as PrismaClient, {
  get(_target, property) {
    const client = getClient();
    const value: unknown = Reflect.get(client, property, client);
    return typeof value === "function" ? value.bind(client) : value;
  },
});

export type { PrismaClient };
