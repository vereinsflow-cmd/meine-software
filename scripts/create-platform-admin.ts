/**
 * Legt den ersten Plattform-Administrator einer neuen Installation an (oder erzeugt für einen bestehenden einen neuen Link).
 *
 *   npm run admin:create -- --email deine@adresse.de --first-name Vorname --last-name Nachname
 *
 * Gibt einmalig einen Link aus, über den das Passwort festgelegt wird (24 Stunden gültig). Er wird nicht per E-Mail versendet.
 * Behandle die Ausgabe wie ein Passwort. Hintergrund: docs/OPERATIONS.md, Abschnitt "Ersten Plattform-Administrator anlegen".
 */
import "dotenv/config";
import { formatDateTime } from "../src/lib/dates";
import { prisma } from "../src/server/db/client";
import { createPlatformAdmin } from "../src/server/platform/bootstrap";

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

const USAGE =
  "Aufruf: npm run admin:create -- --email <adresse> --first-name <vorname> --last-name <nachname>";

async function main(): Promise<number> {
  const email = option("email");
  const firstName = option("first-name");
  const lastName = option("last-name");
  if (!email || !firstName || !lastName) {
    console.error(USAGE);
    return 2;
  }

  const result = await createPlatformAdmin({ email, firstName, lastName });
  console.log(
    result.created
      ? `\n✓ Plattform-Administrator angelegt: ${email.toLowerCase()}`
      : `\n✓ Neuer Einrichtungslink für den bestehenden Plattform-Administrator ${email.toLowerCase()}`,
  );
  console.log(
    `\nPasswort festlegen (einmalig, gültig bis ${formatDateTime(result.expiresAt)} Uhr):\n`,
  );
  console.log(`  ${result.setPasswordUrl}\n`);
  console.log("Behandle diesen Link wie ein Passwort und gib ihn nicht weiter.\n");
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
