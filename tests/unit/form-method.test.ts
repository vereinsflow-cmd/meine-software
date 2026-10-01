import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

/**
 * Formulare, die per JavaScript abschicken (`onSubmit`), tragen `method="post"`: Klickt jemand, bevor die Seite fertig
 * geladen ist, schickt der Browser das Formular selbst ab – ohne Angabe als GET, also mit allen Feldern in der Adresse
 * (z. B. `…/anmelden?email=…&password=…`): im Verlauf, in Protokollen von Servern und Proxys. Mit POST bleibt die Adresse
 * sauber.
 */
const SRC = path.resolve(__dirname, "../../src");

function files(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const full = path.join(dir, name);
    if (name === "generated") continue;
    if (statSync(full).isDirectory()) files(full, out);
    else if (name.endsWith(".tsx")) out.push(full);
  }
  return out;
}

describe("Formulare schicken nie per GET ab", () => {
  it('jedes <form> mit onSubmit hat method="post"', () => {
    const offenders: string[] = [];
    for (const file of files(SRC)) {
      for (const match of readFileSync(file, "utf8").matchAll(/<form\b[^>]*>/g)) {
        const tag = match[0];
        if (/\bonSubmit=/.test(tag) && !/\bmethod="post"/.test(tag)) {
          offenders.push(`${path.relative(SRC, file)}: ${tag.slice(0, 80)}`);
        }
      }
    }
    expect(offenders).toEqual([]);
  });
});
