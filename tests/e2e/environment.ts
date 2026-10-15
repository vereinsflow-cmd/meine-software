/**
 * Port und Datenbank des E2E-Testservers – gemeinsam für playwright.config.ts, das globale Setup und die Tests.
 *
 * Vorgabe: Port 3100 und Datenbank `vf_e2e`. Jeder Lauf baut seine Datenbank zu Beginn neu auf (`DROP DATABASE … WITH (FORCE)`)
 * und zerstört damit einen gleichzeitigen Lauf auf derselben Datenbank. Wer parallel testet (z. B. eine zweite Sitzung in einem
 * anderen Worktree), wählt deshalb einen eigenen Port und eine eigene Datenbank:
 *
 *   E2E_PORT=3400 E2E_DATABASE=vf_e2e_zwei npx playwright test
 *
 * Eine solche Extra-Datenbank löscht das globale Setup nach dem Lauf wieder; `vf_e2e` bleibt wie bisher stehen.
 */
const DEFAULT_PORT = 3100;
export const E2E_DEFAULT_DATABASE = "vf_e2e";

function readPort(): number {
  const value = process.env.E2E_PORT?.trim();
  if (!value) return DEFAULT_PORT;
  const port = Number(value);
  if (!/^\d+$/.test(value) || port < 1024 || port > 65535) {
    throw new Error(`E2E_PORT muss eine Zahl von 1024 bis 65535 sein (ist: "${value}").`);
  }
  // Auf 3000/3001 laufen die Entwicklungsserver: Playwright würde sie mitbenutzen und die Tests gegen deren Daten fahren.
  if (port === 3000 || port === 3001) {
    throw new Error(
      `E2E_PORT ${port} gehört dem Entwicklungsserver – bitte einen freien Port wählen (z. B. 3400).`,
    );
  }
  return port;
}

function readDatabase(): string {
  const value = process.env.E2E_DATABASE?.trim();
  if (!value) return E2E_DEFAULT_DATABASE;
  // Der Name landet ungeschützt im DROP DATABASE. Das feste Präfix verhindert, dass ein Tippfehler die Entwicklungsdatenbank löscht.
  if (!/^vf_e2e[a-z0-9_]{0,40}$/.test(value)) {
    throw new Error(
      `E2E_DATABASE muss mit "vf_e2e" beginnen und darf nur Kleinbuchstaben, Ziffern und _ enthalten (ist: "${value}").`,
    );
  }
  return value;
}

export const E2E_PORT = readPort();
export const E2E_DATABASE = readDatabase();
export const E2E_BASE_URL = `http://localhost:${E2E_PORT}`;

/**
 * Muster für einen absoluten Link auf den Testserver (in E-Mails, Abo-Links …), z. B.
 * `appUrlPattern("/einladung/[A-Za-z0-9_-]{43}")`. Die Server-Adresse besteht nur aus `http://localhost:` und Ziffern und
 * braucht daher keine Maskierung. `exact` verlangt, dass der ganze Text der Link ist.
 */
export function appUrlPattern(path: string, { exact = false } = {}): RegExp {
  const source = `${E2E_BASE_URL}${path}`;
  return new RegExp(exact ? `^${source}$` : source);
}
