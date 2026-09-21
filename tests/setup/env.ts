/**
 * Feste Test-Konfiguration. Tests lesen bewusst NICHT die `.env` des Entwicklers,
 * damit sie niemals versehentlich gegen die Entwicklungsdatenbank laufen.
 */
export function applyTestEnv(overrides: Record<string, string> = {}): void {
  const values: Record<string, string> = {
    NODE_ENV: "test",
    APP_URL: "http://localhost:3000",
    APP_SECRET: "test-secret-test-secret-test-secret-1234",
    CRON_SECRET: "test-cron-secret-1234",
    SESSION_IDLE_MINUTES: "60",
    SESSION_MAX_DAYS: "14",
    MAIL_TRANSPORT: "log",
    TRUST_PROXY: "false",
    STORAGE_DIR: "./.local/test-storage",
    MAX_UPLOAD_MB: "5",
    ...overrides,
  };
  for (const [key, value] of Object.entries(values)) {
    process.env[key] = value;
  }
}

/** Verbindung zur Datenbank-Instanz (Superuser), in der die Test-Datenbanken angelegt werden. */
export const ADMIN_DATABASE_URL =
  process.env.TEST_DATABASE_ADMIN_URL ??
  "postgresql://vereinsflow:vereinsflow@localhost:5432/postgres";

export function databaseUrlFor(database: string): string {
  const url = new URL(ADMIN_DATABASE_URL);
  url.pathname = `/${database}`;
  return url.toString();
}
