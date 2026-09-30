import "dotenv/config";
import { generateKeyPairSync } from "node:crypto";
import { defineConfig, devices } from "@playwright/test";

/**
 * Ende-zu-Ende-Tests im Browser.
 *
 * - Eigener Server auf Port 3100 mit eigener Datenbank (`vf_e2e`, wird vor dem Lauf neu aufgebaut und
 *   mit den Demo-Daten befüllt) – die Entwicklungsdatenbank bleibt unberührt.
 * - Browser: standardmäßig das von Playwright installierte Chromium (`npx playwright install chromium`).
 *   Wer bereits Edge/Chrome hat, kann es ohne Download nutzen: PLAYWRIGHT_CHANNEL=msedge (oder chrome).
 */
const PORT = 3100;
const channel = process.env.PLAYWRIGHT_CHANNEL || undefined;

/**
 * Web-Push-Schlüsselpaar nur für diesen Testlauf, bei jedem Laden neu erzeugt – ein privater Schlüssel gehört nicht ins
 * Repository, auch kein Testschlüssel. Format wie `npx web-push generate-vapid-keys`: öffentlicher Schlüssel als unkomprimierter
 * P-256-Punkt (0x04 ‖ x ‖ y), privater Schlüssel als d, beides base64url.
 */
function testVapidKeys(): { publicKey: string; privateKey: string } {
  const { publicKey, privateKey } = generateKeyPairSync("ec", { namedCurve: "prime256v1" });
  const pub = publicKey.export({ format: "jwk" });
  const priv = privateKey.export({ format: "jwk" });
  const point = Buffer.concat([
    Buffer.from([4]),
    Buffer.from(pub.x!, "base64url"),
    Buffer.from(pub.y!, "base64url"),
  ]);
  return { publicKey: point.toString("base64url"), privateKey: priv.d! };
}
const vapid = testVapidKeys();
export const E2E_DATABASE = "vf_e2e";
const E2E_STORAGE_DIR = "./.local/e2e-storage";

const adminUrl =
  process.env.TEST_DATABASE_ADMIN_URL ??
  "postgresql://vereinsflow:vereinsflow@localhost:5432/postgres";
const e2eUrl = new URL(adminUrl);
e2eUrl.pathname = `/${E2E_DATABASE}`;

export default defineConfig({
  testDir: "tests/e2e",
  outputDir: "test-results",
  // Alle Tests teilen sich eine Datenbank und laufen deshalb nacheinander.
  workers: 1,
  fullyParallel: false,
  retries: process.env.CI ? 1 : 0,
  timeout: 45_000,
  expect: { timeout: 10_000 },
  reporter: process.env.CI ? [["github"], ["html", { open: "never" }]] : [["list"]],
  globalSetup: "./tests/e2e/global-setup.ts",
  use: {
    baseURL: `http://localhost:${PORT}`,
    locale: "de-DE",
    timezoneId: "Europe/Berlin",
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },
  projects: [
    // Die Smartphone-Tests (*.mobil.spec.ts) erwarten das mobile Layout und laufen nur im Projekt "mobil".
    {
      name: "desktop",
      use: { ...devices["Desktop Chrome"], channel },
      testIgnore: /.*\.mobil\.spec\.ts/,
    },
    { name: "mobil", use: { ...devices["Pixel 7"], channel }, testMatch: /.*\.mobil\.spec\.ts/ },
  ],
  webServer: {
    // Immer der Dev-Server: Der Produktionsstart verlangt bewusst https, SMTP und echte Geheimnisse (siehe src/server/env.ts) –
    // das passt nicht zu einem Test auf http://localhost. Der Produktions-Build selbst wird in der CI separat geprüft.
    command: `npm run dev -- -p ${PORT}`,
    url: `http://localhost:${PORT}/anmelden`,
    reuseExistingServer: !process.env.CI,
    timeout: 180_000,
    env: {
      DATABASE_URL: e2eUrl.toString(),
      APP_URL: `http://localhost:${PORT}`,
      MAIL_TRANSPORT: "file",
      // Hochgeladene Dateien der Tests landen getrennt vom echten Speicher (wird vor jedem Lauf geleert, siehe global-setup).
      STORAGE_DIR: E2E_STORAGE_DIR,
      MAX_UPLOAD_MB: "1", // klein gehalten, damit der Test „Datei zu groß“ nicht viele Megabyte übertragen muss
      NEXT_DIST_DIR: ".next-e2e",
      NEXT_TELEMETRY_DISABLED: "1",
      SESSION_IDLE_MINUTES: "60",
      // Beispiel-Fingerabdruck (kein echter Schlüssel), damit tests/e2e/app-ansicht.spec.ts assetlinks.json mit Inhalt prüft.
      ANDROID_APP_CERT_SHA256: Array.from({ length: 32 }, () => "E2").join(":"),
      // Support-Adresse des Betreibers (Beispiel, .test ist nie zustellbar): erscheint unter „Hilfe & Support“ und auf der
      // öffentlichen Seite „Konto löschen“ (geprüft in tests/e2e/konto-loeschen.spec.ts).
      SUPPORT_EMAIL: "support@vereinsflow.test",
      // Web-Push-Schlüsselpaar dieses Testlaufs (siehe testVapidKeys): schaltet den Schalter
      // „Push-Benachrichtigungen auf diesem Gerät“ im Profil frei (geprüft in tests/e2e/push.spec.ts).
      VAPID_PUBLIC_KEY: vapid.publicKey,
      VAPID_PRIVATE_KEY: vapid.privateKey,
      VAPID_SUBJECT: "mailto:support@vereinsflow.test",
    },
  },
});
