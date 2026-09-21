import "server-only";
import { createHash, randomBytes } from "node:crypto";
import { createReadStream } from "node:fs";
import { mkdir, rm, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { Readable } from "node:stream";
import { env } from "@/server/env";

/**
 * Dateiablage auf der Festplatte (Verzeichnis `STORAGE_DIR`, AUSSERHALB von `public/` – Dateien sind nie direkt per URL
 * erreichbar, sondern nur über die geprüfte Download-Route).
 *
 * Sicherheit:
 *  - Der Speicherschlüssel ist eine zufällige 128-Bit-Zahl (32 Hex-Zeichen), niemals der Dateiname des Benutzers.
 *  - Pfade werden ausschließlich aus geprüften Bausteinen (UUID des Vereins + Schlüssel) zusammengesetzt und noch einmal
 *    darauf geprüft, dass sie im Speicherverzeichnis bleiben (kein "../").
 *  - Dateien werden mit "wx" geschrieben (nie bestehende überschreiben) und ohne Rechte für "andere" angelegt.
 *  - Je Verein ein eigenes Unterverzeichnis (erleichtert Sicherung und Löschung eines Vereins).
 */
const KEY_PATTERN = /^[0-9a-f]{32}$/;
const CLUB_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

export const storageRoot = (): string => path.resolve(env.STORAGE_DIR);

function resolveSafe(clubId: string, storageKey: string): string {
  if (!CLUB_PATTERN.test(clubId) || !KEY_PATTERN.test(storageKey)) throw new Error("Ungültiger Speicherschlüssel.");
  const root = storageRoot();
  const full = path.resolve(root, clubId, storageKey);
  if (!full.startsWith(root + path.sep)) throw new Error("Pfad außerhalb des Speicherverzeichnisses.");
  return full;
}

export async function saveFile(clubId: string, bytes: Uint8Array): Promise<{ storageKey: string; sha256: string }> {
  const storageKey = randomBytes(16).toString("hex");
  const target = resolveSafe(clubId, storageKey);
  await mkdir(path.dirname(target), { recursive: true });
  await writeFile(target, bytes, { flag: "wx", mode: 0o640 });
  return { storageKey, sha256: createHash("sha256").update(bytes).digest("hex") };
}

/** Datei als Web-Stream für die Antwort. Wirft, wenn sie fehlt (z. B. nach Wiederherstellung ohne Dateiablage). */
export async function openFile(clubId: string, storageKey: string): Promise<{ stream: ReadableStream<Uint8Array>; size: number }> {
  const file = resolveSafe(clubId, storageKey);
  const info = await stat(file);
  return { stream: Readable.toWeb(createReadStream(file)) as ReadableStream<Uint8Array>, size: info.size };
}

export async function deleteFile(clubId: string, storageKey: string): Promise<void> {
  await rm(resolveSafe(clubId, storageKey), { force: true });
}
