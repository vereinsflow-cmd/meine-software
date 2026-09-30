import { describe, expect, it } from "vitest";
import { parseEnv } from "@/server/env";

const valid = {
  DATABASE_URL: "postgresql://u:p@localhost:5432/db",
  APP_SECRET: "x".repeat(40),
  CRON_SECRET: "y".repeat(20),
};

describe("Konfiguration (parseEnv)", () => {
  it("übernimmt Standardwerte", () => {
    const env = parseEnv(valid);
    expect(env.APP_URL).toBe("http://localhost:3000");
    expect(env.SESSION_IDLE_MINUTES).toBe(60);
    expect(env.SESSION_MAX_DAYS).toBe(14);
    expect(env.MAIL_TRANSPORT).toBe("log");
    expect(env.TRUST_PROXY).toBe(false);
  });

  it("wandelt Zahlen und Wahrheitswerte aus Strings um; leere Werte gelten als nicht gesetzt", () => {
    const env = parseEnv({
      ...valid,
      SESSION_IDLE_MINUTES: "15",
      TRUST_PROXY: "true",
      SMTP_USER: "",
      SMTP_SECURE: "",
    });
    expect(env.SESSION_IDLE_MINUTES).toBe(15);
    expect(env.TRUST_PROXY).toBe(true);
    expect(env.SMTP_USER).toBeUndefined();
    expect(env.SMTP_SECURE).toBe(false);
  });

  it("meldet fehlende oder unsichere Pflichtwerte verständlich", () => {
    expect(() => parseEnv({})).toThrow(/DATABASE_URL/);
    expect(() => parseEnv({ ...valid, APP_SECRET: "zu-kurz" })).toThrow(/APP_SECRET/);
    expect(() => parseEnv({ ...valid, SESSION_IDLE_MINUTES: "0" })).toThrow(/SESSION_IDLE_MINUTES/);
    expect(() => parseEnv({ ...valid, APP_URL: "keine-url" })).toThrow(/APP_URL/);
  });

  describe("Produktion", () => {
    const production = {
      ...valid,
      NODE_ENV: "production",
      APP_URL: "https://verein.example",
      MAIL_TRANSPORT: "smtp",
    };

    it("akzeptiert eine sichere Konfiguration", () => {
      expect(() => parseEnv(production)).not.toThrow();
    });

    it("verweigert Entwicklungs-Platzhalter und unverschlüsselte URLs", () => {
      expect(() =>
        parseEnv({ ...production, APP_SECRET: "dev-only-secret-change-me-at-least-32-chars" }),
      ).toThrow(/APP_SECRET/);
      expect(() =>
        parseEnv({ ...production, CRON_SECRET: "dev-only-cron-secret-change-me" }),
      ).toThrow(/CRON_SECRET/);
      expect(() => parseEnv({ ...production, APP_URL: "http://verein.example" })).toThrow(/https/);
      expect(() => parseEnv({ ...production, MAIL_TRANSPORT: "file" })).toThrow(/MAIL_TRANSPORT/);
      expect(() => parseEnv({ ...production, MAIL_TRANSPORT: "log" })).toThrow(/MAIL_TRANSPORT/);
    });
  });
});

describe("Konfiguration: Web-Push (VAPID)", () => {
  const publicKey = `B${"A".repeat(86)}`;
  const privateKey = "c".repeat(43);
  const vapid = {
    VAPID_PUBLIC_KEY: publicKey,
    VAPID_PRIVATE_KEY: privateKey,
    VAPID_SUBJECT: "mailto:betrieb@vereins-flow.com",
  };

  it("ist ohne Angaben abgeschaltet – kein Fehler; leere Werte aus .env zählen als nicht gesetzt", () => {
    const env = parseEnv(valid);
    expect(env.VAPID_PUBLIC_KEY).toBeUndefined();
    expect(env.VAPID_PRIVATE_KEY).toBeUndefined();
    expect(env.VAPID_SUBJECT).toBeUndefined();
    expect(() =>
      parseEnv({ ...valid, VAPID_PUBLIC_KEY: "", VAPID_PRIVATE_KEY: "", VAPID_SUBJECT: "" }),
    ).not.toThrow();
  });

  it("nimmt ein vollständiges Schlüsselpaar mit mailto:- oder https://-Absender an", () => {
    expect(parseEnv({ ...valid, ...vapid })).toMatchObject(vapid);
    expect(
      parseEnv({ ...valid, ...vapid, VAPID_SUBJECT: "https://vereins-flow.com/kontakt" })
        .VAPID_SUBJECT,
    ).toBe("https://vereins-flow.com/kontakt");
  });

  it("verlangt alle drei Angaben gemeinsam (halb eingerichtetes Push wäre stilles Versagen)", () => {
    expect(() => parseEnv({ ...valid, VAPID_PUBLIC_KEY: publicKey })).toThrow(/gemeinsam/);
    expect(() => parseEnv({ ...valid, ...vapid, VAPID_SUBJECT: "" })).toThrow(/gemeinsam/);
  });

  it("prüft Form der Schlüssel und des Absenders – ohne den Wert in der Meldung zu nennen", () => {
    expect(() => parseEnv({ ...valid, ...vapid, VAPID_PUBLIC_KEY: "zu-kurz" })).toThrow(
      /VAPID_PUBLIC_KEY/,
    );
    expect(() => parseEnv({ ...valid, ...vapid, VAPID_PRIVATE_KEY: "zu-kurz" })).toThrow(
      /VAPID_PRIVATE_KEY/,
    );
    expect(() =>
      parseEnv({ ...valid, ...vapid, VAPID_SUBJECT: "http://unsicher.example" }),
    ).toThrow(/VAPID_SUBJECT/);
    expect(() =>
      parseEnv({ ...valid, ...vapid, VAPID_SUBJECT: "betrieb@vereins-flow.com" }),
    ).toThrow(/VAPID_SUBJECT/);
    try {
      parseEnv({ ...valid, ...vapid, VAPID_PRIVATE_KEY: "geheim-aber-falsch" });
    } catch (error) {
      expect(String(error)).not.toContain("geheim-aber-falsch");
    }
  });
});
