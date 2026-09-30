import "server-only";
import { z } from "zod";
import {
  ANDROID_PACKAGE_PATTERN,
  DEFAULT_ANDROID_APP_PACKAGE,
  parseCertFingerprints,
} from "./asset-links";

/** Leere Strings aus `.env` (z. B. `SMTP_USER=`) gelten als "nicht gesetzt". */
const emptyToUndefined = (value: unknown) => (value === "" ? undefined : value);

const boolean = z.preprocess(
  (value) => (value === undefined || value === "" ? "false" : value),
  z.enum(["true", "false"]).transform((v) => v === "true"),
);

/**
 * Web-Push (VAPID): Schlüsselpaar und Absenderangabe. Erzeugen mit `npx web-push generate-vapid-keys`.
 * Öffentlicher Schlüssel = 65 Byte (87 Zeichen base64url), privater = 32 Byte (43 Zeichen).
 */
const VAPID_PUBLIC_PATTERN = /^[A-Za-z0-9_-]{87}$/;
const VAPID_PRIVATE_PATTERN = /^[A-Za-z0-9_-]{43}$/;
const VAPID_SUBJECT_PATTERN = /^(mailto:[^\s@]+@[^\s@]+|https:\/\/[^\s]+)$/;

const schema = z
  .object({
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

    /**
     * Technischer Support des Plattformbetreibers (optional): erscheint unter „Hilfe & Support“ und auf der öffentlichen Seite
     * `/konto-loeschen` als Anlaufstelle für Löschanfragen ohne Zugang.
     */
    SUPPORT_EMAIL: z.preprocess(emptyToUndefined, z.email().optional()),

    /** Android-App (Trusted Web Activity): Paketname für `/.well-known/assetlinks.json` (siehe src/server/asset-links.ts). */
    ANDROID_APP_PACKAGE: z.preprocess(
      emptyToUndefined,
      z
        .string()
        .regex(
          ANDROID_PACKAGE_PATTERN,
          "ANDROID_APP_PACKAGE muss ein Paketname wie com.vereinsflow.app sein",
        )
        .default(DEFAULT_ANDROID_APP_PACKAGE),
    ),
    /**
     * SHA-256-Fingerabdrücke des Signaturzertifikats der Android-App, kommagetrennt (`AA:BB:…`, aus der Play Console).
     * Ohne Wert gehört keine App zur Website (`assetlinks.json` ist dann eine leere Liste).
     */
    ANDROID_APP_CERT_SHA256: z
      .preprocess(emptyToUndefined, z.string().optional())
      .transform((value, ctx) => {
        const result = parseCertFingerprints(value);
        if (result.ok) return result.fingerprints;
        const positions = result.invalidPositions;
        ctx.addIssue({
          code: "custom",
          message: `${positions.length === 1 ? "Eintrag" : "Einträge"} ${positions.join(", ")} ${positions.length === 1 ? "ist kein SHA-256-Fingerabdruck" : "sind keine SHA-256-Fingerabdrücke"} (32 Hex-Paare mit Doppelpunkten, z. B. AB:12:…; mehrere durch Kommas getrennt)`,
        });
        return z.NEVER;
      }),

    /**
     * Web-Push (optional): Ohne alle drei Angaben ist Push abgeschaltet – Benachrichtigungscenter und E-Mail laufen unverändert.
     * Nur der öffentliche Schlüssel gelangt zum Browser (Profil → Benachrichtigungen); der private Schlüssel bleibt auf dem Server.
     */
    VAPID_PUBLIC_KEY: z.preprocess(
      emptyToUndefined,
      z
        .string()
        .regex(VAPID_PUBLIC_PATTERN, "VAPID_PUBLIC_KEY ist kein gültiger öffentlicher Schlüssel")
        .optional(),
    ),
    VAPID_PRIVATE_KEY: z.preprocess(
      emptyToUndefined,
      z
        .string()
        .regex(VAPID_PRIVATE_PATTERN, "VAPID_PRIVATE_KEY ist kein gültiger privater Schlüssel")
        .optional(),
    ),
    VAPID_SUBJECT: z.preprocess(
      emptyToUndefined,
      z
        .string()
        .regex(
          VAPID_SUBJECT_PATTERN,
          "VAPID_SUBJECT muss mailto:name@beispiel.de oder eine https://-Adresse sein",
        )
        .optional(),
    ),
  })
  .superRefine((value, ctx) => {
    const given = [value.VAPID_PUBLIC_KEY, value.VAPID_PRIVATE_KEY, value.VAPID_SUBJECT].filter(
      Boolean,
    ).length;
    if (given > 0 && given < 3) {
      ctx.addIssue({
        code: "custom",
        path: ["VAPID_PUBLIC_KEY"],
        message:
          "Web-Push braucht VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY und VAPID_SUBJECT gemeinsam (oder keine der drei)",
      });
    }
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
