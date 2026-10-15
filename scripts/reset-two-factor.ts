/**
 * Setzt die Zwei-Faktor-Anmeldung eines Kontos zurück – für den Betreiber, wenn jemand Handy und Wiederherstellungscodes
 * verloren hat und kein Verein es darf (Plattform-Administratoren, Personen in mehreren Vereinen).
 *
 *   npm run admin:reset-2fa -- --email person@example.org
 *
 * Danach meldet sich die Person nur mit dem Passwort an; alle ihre Sitzungen enden, sie bekommt eine E-Mail, und im
 * Protokoll steht „Zwei-Faktor-Anmeldung zurückgesetzt“ (Akteur: System). Prüfe vorher auf anderem Weg (Telefon,
 * persönlich), dass die Anfrage wirklich von der Person kommt. Hintergrund: docs/OPERATIONS.md.
 */
import "dotenv/config";
import { prisma } from "../src/server/db/client";
import { resetTwoFactorByOperator } from "../src/server/auth/two-factor";

/** Liest `--name wert` und `--name=wert`. */
function option(name: string): string | undefined {
  const args = process.argv.slice(2);
  const flag = `--${name}`;
  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index]!;
    if (arg === flag) return args[index + 1];
    if (arg.startsWith(`${flag}=`)) return arg.slice(flag.length + 1);
  }
  return undefined;
}

const USAGE = "Aufruf: npm run admin:reset-2fa -- --email <adresse>";

async function main(): Promise<number> {
  const email = option("email");
  if (!email) {
    console.error(USAGE);
    return 2;
  }

  const result = await resetTwoFactorByOperator(email);
  if (!result.changed) {
    console.log(
      `\nFür ${email.toLowerCase()} ist keine Zwei-Faktor-Anmeldung eingerichtet – nichts geändert.\n`,
    );
    return 0;
  }
  console.log(`\n✓ Zwei-Faktor-Anmeldung für ${email.toLowerCase()} zurückgesetzt.`);
  console.log(
    `  ${result.sessionsEnded === 1 ? "1 Sitzung" : `${result.sessionsEnded} Sitzungen`} beendet, die Person wurde per E-Mail informiert.\n`,
  );
  return 0;
}

main()
  .then(async (code) => {
    await prisma.$disconnect();
    process.exit(code);
  })
  .catch(async (error: unknown) => {
    console.error(error instanceof Error ? error.message : error);
    await prisma.$disconnect().catch(() => undefined);
    process.exit(1);
  });
