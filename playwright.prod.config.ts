import "dotenv/config";
import { randomBytes } from "node:crypto";
import { defineConfig, devices } from "@playwright/test";

/**
 * Rauchtest gegen den PRODUKTIONS-Build (`npm run build`, dann `npm start`) – nicht gegen den Dev-Server.
 *
 * Warum: Im Entwicklungsmodus ist die Content-Security-Policy großzügiger (`unsafe-inline`, `unsafe-eval`), und der Start
 * prüft die Konfiguration nicht streng. Erst der Produktionsbetrieb zeigt, ob z. B. eingefügte <style>-Elemente oder
 * Skripte von der strengen Policy blockiert werden, ob Cookies mit `Secure` und `__Host-` funktionieren und ob der
 * Sicherheits-Startcheck mit einer gültigen Konfiguration durchläuft.
 *
 *   npm run build
 *   npm run test:prod-smoke
 *
 * Eigene Datenbank (`vf_prod_smoke`) und Port 3300; die Entwicklungsdatenbank bleibt unberührt.
 */
const PORT = Number(process.env.PROD_SMOKE_PORT ?? 3300);
const channel = process.env.PLAYWRIGHT_CHANNEL || undefined;

const adminUrl =
  process.env.TEST_DATABASE_ADMIN_URL ??
  "postgresql://vereinsflow:vereinsflow@localhost:5432/postgres";
const databaseUrl = new URL(adminUrl);
databaseUrl.pathname = "/vf_prod_smoke";

export default defineConfig({
  testDir: "tests/prod-smoke",
  outputDir: "test-results/prod-smoke",
  workers: 1,
  fullyParallel: false,
  retries: 0,
  timeout: 45_000,
  expect: { timeout: 10_000 },
  reporter: [["list"]],
  globalSetup: "./tests/prod-smoke/global-setup.ts",
  use: {
    baseURL: `http://localhost:${PORT}`,
    locale: "de-DE",
    timezoneId: "Europe/Berlin",
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },
  projects: [{ name: "prod", use: { ...devices["Desktop Chrome"], channel } }],
  webServer: {
    command: `npm run start -- -p ${PORT}`,
    // Nicht /api/health: Der Server startet vor dem globalSetup, das die Datenbank erst anlegt – die Anmeldeseite braucht keine.
    url: `http://localhost:${PORT}/anmelden`,
    reuseExistingServer: false,
    timeout: 120_000,
    env: {
      NODE_ENV: "production",
      DATABASE_URL: databaseUrl.toString(),
      // Eine gültige Produktionskonfiguration (sonst verweigert der Start): https-Adresse, SMTP (es wird nichts versendet),
      // frische Zufalls-Geheimnisse. Der Browser ruft die Seite über http://localhost auf – das ist als "sicherer Kontext" erlaubt.
      APP_URL: `https://localhost:${PORT}`,
      MAIL_TRANSPORT: "smtp",
      SMTP_HOST: "localhost",
      SMTP_PORT: "1",
      APP_SECRET: randomBytes(36).toString("base64url"),
      CRON_SECRET: randomBytes(24).toString("base64url"),
      STORAGE_DIR: "./.local/prod-smoke-storage",
      NEXT_TELEMETRY_DISABLED: "1",
    },
  },
});
