import "server-only";
import { prisma } from "@/server/db/client";

const TIMEOUT_MS = 3_000;

/**
 * Antwortet die Datenbank? Für den Health-Endpunkt (Docker-HEALTHCHECK, Reverse-Proxy, Überwachung).
 * Höchstens {@link TIMEOUT_MS} Millisekunden Wartezeit – eine hängende Datenbank soll die Prüfung nicht selbst hängen lassen.
 * Gibt nur ja/nein zurück; Fehlerdetails gehören nicht in eine öffentlich erreichbare Antwort.
 */
export async function isDatabaseReachable(): Promise<boolean> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    const timeout = new Promise<never>((_resolve, reject) => {
      timer = setTimeout(() => reject(new Error("timeout")), TIMEOUT_MS);
    });
    await Promise.race([prisma.$queryRaw`SELECT 1`, timeout]);
    return true;
  } catch {
    return false;
  } finally {
    clearTimeout(timer);
  }
}
