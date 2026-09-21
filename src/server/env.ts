import "server-only";
import { z } from "zod";

/** Leere Strings aus `.env` (z. B. `SMTP_USER=`) gelten als "nicht gesetzt". */
const emptyToUndefined = (value: unknown) => (value === "" ? undefined : value);

const boolean = z.preprocess(
  (value) => (value === undefined || value === "" ? "false" : value),
  z.enum(["true", "false"]).transform((v) => v === "true"),
);

const schema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  APP_URL: z.url().default("http://localhost:3000"),
  TRUST_PROXY: boolean,

  DATABASE_URL: z.string().min(1, "DATABASE_URL fehlt"),

  APP_SECRET: z.string().min(32, "APP_SECRET muss mindestens 32 Zeichen lang sein"),
  SESSION_IDLE_MINUTES: z.coerce.number().int().min(5).max(1440).default(60),
  SESSION_MAX_DAYS: z.coerce.number().int().min(1).max(90).default(14),
  CRON_SECRET: z.string().min(16, "CRON_SECRET muss mindestens 16 Zeichen lang sein"),

  MAIL_TRANSPORT: z.enum(["log", "file", "smtp"]).default("log"),
  MAIL_FROM: z.string().min(3).default("VereinsFlow <noreply@vereinsflow.local>"),
  SMTP_HOST: z.string().default("localhost"),
  SMTP_PORT: z.coerce.number().int().min(1).max(65535).default(1025),
  SMTP_SECURE: boolean,
  SMTP_USER: z.preprocess(emptyToUndefined, z.string().optional()),
  SMTP_PASSWORD: z.preprocess(emptyToUndefined, z.string().optional()),

  STORAGE_DIR: z.string().default("./storage"),
  MAX_UPLOAD_MB: z.coerce.number().int().min(1).max(100).default(10),
  /** Gesamter Speicherplatz für Dokumente je Verein (Schutz vor Missbrauch und unbegrenztem Wachstum). */
  CLUB_STORAGE_QUOTA_MB: z.coerce.number().int().min(1).max(102_400).default(1024),

  /** Technischer Support des Plattformbetreibers: erscheint unter „Hilfe & Support“ (optional). */
  SUPPORT_EMAIL: z.preprocess(emptyToUndefined, z.email().optional()),
});

export type Env = z.infer<typeof schema>;

/**
 * Prüft und normalisiert die Umgebungsvariablen. Ist exportiert, damit Tests die Regeln
 * (insbesondere die Produktions-Sicherheitsprüfungen) mit eigenen Werten ausführen können.
 */
export function parseEnv(source: Record<string, string | undefined> = process.env): Env {
  const result = schema.safeParse(source);
  if (!result.success) {
    const lines = result.error.issues.map(
      (issue) => `  - ${issue.path.join(".")}: ${issue.message}`,
    );
    throw new Error(`Ungültige Konfiguration (.env):\n${lines.join("\n")}`);
  }
  const env = result.data;

  if (env.NODE_ENV === "production") {
    const problems: string[] = [];
    if (/dev-only|change-me/i.test(env.APP_SECRET)) {
      problems.push("APP_SECRET enthält noch den Entwicklungs-Platzhalter.");
    }
    if (/dev-only|change-me/i.test(env.CRON_SECRET)) {
      problems.push("CRON_SECRET enthält noch den Entwicklungs-Platzhalter.");
    }
    if (!env.APP_URL.startsWith("https://")) {
      problems.push(
        "APP_URL muss in Produktion mit https:// beginnen (verschlüsselte Übertragung).",
      );
    }
    if (env.MAIL_TRANSPORT !== "smtp") {
      // "log" würde Passwort-Reset- und Einladungslinks ins Server-Protokoll schreiben, "file" ist nur für Tests.
      problems.push(
        'MAIL_TRANSPORT muss in Produktion "smtp" sein (log/file sind nur für Entwicklung und Tests).',
      );
    }
    if (problems.length > 0) {
      throw new Error(
        `Unsichere Produktionskonfiguration:\n${problems.map((p) => `  - ${p}`).join("\n")}`,
      );
    }
  }
  return env;
}

let cached: Env | undefined;

/**
 * Lazy geladene, validierte Konfiguration. Die Prüfung läuft erst beim ersten Zugriff,
 * damit z. B. `next build` ohne Datenbank-Zugangsdaten möglich bleibt.
 */
export const env: Env = new Proxy({} as Env, {
  get(_target, property: string) {
    cached ??= parseEnv();
    return cached[property as keyof Env];
  },
});
