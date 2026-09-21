import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

/**
 * Architektur-Regeln, die der Compiler nicht prüft – und deren Verletzung sich erst im Browser zeigt
 * ("You're importing a component that needs server-only", fehlende Build-Manifeste im Dev-Server).
 *
 *  1. Client-Komponenten ("use client"), Formular-Schemas (`modules/*\/schemas.ts`) und `src/lib/**` laufen im Browser
 *     oder in beiden Umgebungen. Sie dürfen – auch über Zwischenschritte – keinen Server-Code importieren:
 *     nichts aus `@/server/**`, keine Node-Module, kein `server-only`-Modul.
 *     Ausnahmen: reine Typ-Importe (`import type`) und Server Actions ("use server" – der Browser bekommt nur Stubs).
 *  2. Nur `src/server/**` und Fachdienste dürfen den Datenbank-Client (`@/server/db/client`) importieren; Seiten und
 *     Komponenten greifen nie direkt auf die Datenbank zu.
 */
const SRC = path.resolve(__dirname, "../../src");

function walk(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const full = path.join(dir, name);
    if (name === "generated") continue;
    if (statSync(full).isDirectory()) walk(full, out);
    else if (/\.(ts|tsx)$/.test(name)) out.push(full);
  }
  return out;
}

const rel = (file: string) => path.relative(SRC, file).replaceAll("\\", "/");
const read = (file: string) => readFileSync(file, "utf8");

const directive = (source: string): "client" | "server" | null => {
  const first = source
    .split(/\r?\n/)
    .find(
      (line) =>
        line.trim() &&
        !line.trim().startsWith("//") &&
        !line.trim().startsWith("/*") &&
        !line.trim().startsWith("*"),
    );
  if (/^["']use client["']/.test(first ?? "")) return "client";
  if (/^["']use server["']/.test(first ?? "")) return "server";
  return null;
};

interface ImportRef {
  specifier: string;
  typeOnly: boolean;
}

function importsOf(source: string): ImportRef[] {
  const refs: ImportRef[] = [];
  // Die Import-Klausel darf weder Anführungszeichen, Semikolons noch weitere import/export-Schlüsselwörter enthalten –
  // sonst würde ein blanker `import "x";` mit dem nächsten Import zu einer Anweisung verschmelzen.
  const pattern =
    /(?:^|\n)\s*(import|export)\s+(type\s+)?((?:(?!\b(?:import|export)\b)[^"';])*?)\s*from\s*["']([^"']+)["']|(?:^|\n)\s*import\s*["']([^"']+)["']/g;
  for (const match of source.matchAll(pattern)) {
    if (match[5]) {
      refs.push({ specifier: match[5], typeOnly: false });
      continue;
    }
    const clause = match[3] ?? "";
    const named = /^\{([\s\S]*)\}$/.exec(clause.trim());
    const allNamedAreTypes = named
      ? named[1]!
          .split(",")
          .map((part) => part.trim())
          .filter(Boolean)
          .every((part) => part.startsWith("type "))
      : false;
    refs.push({ specifier: match[4]!, typeOnly: Boolean(match[2]) || allNamedAreTypes });
  }
  return refs;
}

function resolve(from: string, specifier: string): string | null {
  const base = specifier.startsWith("@/")
    ? path.join(SRC, specifier.slice(2))
    : specifier.startsWith(".")
      ? path.resolve(path.dirname(from), specifier)
      : null;
  if (!base) return null;
  for (const candidate of [
    `${base}.ts`,
    `${base}.tsx`,
    path.join(base, "index.ts"),
    path.join(base, "index.tsx"),
    base,
  ]) {
    if (existsSync(candidate) && statSync(candidate).isFile()) return candidate;
  }
  return null;
}

const FORBIDDEN_PACKAGES = /^(node:|server-only$|next\/headers$|@node-rs\/|nodemailer$|@prisma\/)/;

/** Liefert die Importkette zu einem Verstoß oder `null`. */
function findServerImport(file: string, chain: string[], seen: Set<string>): string[] | null {
  if (seen.has(file)) return null;
  seen.add(file);
  const source = read(file);
  const kind = directive(source);
  if (kind === "server") return null; // Server Actions: im Browser nur Stubs
  if (/import\s+["']server-only["']/.test(source))
    return [...chain, `${rel(file)} (importiert "server-only")`];

  for (const ref of importsOf(source)) {
    if (ref.typeOnly) continue;
    if (ref.specifier.startsWith("@/server/")) return [...chain, rel(file), ref.specifier];
    if (FORBIDDEN_PACKAGES.test(ref.specifier)) return [...chain, rel(file), ref.specifier];
    const target = resolve(file, ref.specifier);
    if (!target) continue;
    const found = findServerImport(target, [...chain, rel(file)], seen);
    if (found) return found;
  }
  return null;
}

const files = walk(SRC);
const browserEntries = files.filter((file) => {
  const source = read(file);
  return (
    directive(source) === "client" ||
    /modules\/[^/]+\/schemas\.ts$/.test(rel(file)) ||
    rel(file).startsWith("lib/")
  );
});

describe("Architektur: Browser-Code importiert keinen Server-Code", () => {
  it("es gibt Einstiegspunkte zu prüfen (Schutz vor einer kaputten Suche)", () => {
    expect(browserEntries.length).toBeGreaterThan(40);
    expect(browserEntries.some((file) => rel(file).endsWith("privacy/schemas.ts"))).toBe(true);
    expect(
      browserEntries.some((file) => rel(file).endsWith("privacy/components/privacy-panels.tsx")),
    ).toBe(true);
  });

  it("Client-Komponenten, Formular-Schemas und src/lib importieren – auch transitiv – keinen Server-Code", () => {
    const violations = browserEntries
      .map((file) => ({ file, chain: findServerImport(file, [], new Set()) }))
      .filter((entry) => entry.chain !== null)
      .map((entry) => `${rel(entry.file)}: ${entry.chain!.join(" → ")}`);
    expect(violations).toEqual([]);
  });

  it("die Prüfung erkennt einen Verstoß (Gegenprobe an einer bekannten Serverdatei)", () => {
    const serverFile = path.join(SRC, "modules/privacy/consents.ts");
    expect(findServerImport(serverFile, [], new Set())).not.toBeNull();
  });
});

describe("Architektur: Server-Code ruft keine Funktionen aus Client-Dateien auf", () => {
  /**
   * React Server Components dürfen aus einer "use client"-Datei nur KOMPONENTEN (großgeschriebene Namen) rendern oder als
   * Props weiterreichen – Funktionen und Werte lassen sich auf dem Server nicht aufrufen ("Attempted to call x() from the
   * server but x is on the client"). Hilfsfunktionen gehören in eine neutrale Datei (z. B. schemas.ts oder lib/).
   */
  const namedImports = (clause: string): string[] => {
    const match = /\{([\s\S]*)\}/.exec(clause);
    return match
      ? match[1]!
          .split(",")
          .map((part) => part.trim())
          .filter((part) => part && !part.startsWith("type "))
          .map((part) => part.split(/\s+as\s+/)[0]!.trim())
      : [];
  };
  const importClauses = (source: string): { clause: string; specifier: string }[] => {
    const out: { clause: string; specifier: string }[] = [];
    for (const match of source.matchAll(
      /(?:^|\n)\s*import\s+(?!type\b)((?:(?!\b(?:import|export)\b)[^"';])*?)\s*from\s*["']([^"']+)["']/g,
    ))
      out.push({ clause: match[1] ?? "", specifier: match[2]! });
    return out;
  };

  it("importiert aus Client-Dateien nur Komponenten (Großbuchstabe) – keine Funktionen oder Werte", () => {
    const offenders: string[] = [];
    for (const file of files) {
      const source = read(file);
      if (directive(source) === "client") continue; // Client-Dateien dürfen untereinander alles nutzen
      for (const { clause, specifier } of importClauses(source)) {
        const target = resolve(file, specifier);
        if (!target || directive(read(target)) !== "client") continue;
        for (const name of namedImports(clause))
          if (!/^[A-Z]/.test(name))
            offenders.push(`${rel(file)} importiert ${name}() aus der Client-Datei ${rel(target)}`);
      }
    }
    expect(offenders).toEqual([]);
  });
});

describe("Architektur: Datenbankzugriff", () => {
  it("Seiten und Komponenten importieren den Datenbank-Client nicht direkt", () => {
    const offenders = files
      .filter(
        (file) =>
          (rel(file).startsWith("app/") && !rel(file).startsWith("app/api/")) ||
          rel(file).includes("/components/") ||
          rel(file).startsWith("components/"),
      )
      .filter((file) =>
        importsOf(read(file)).some(
          (ref) => !ref.typeOnly && /^@\/server\/db\/(client|tenant)$/.test(ref.specifier),
        ),
      )
      .map(rel);
    expect(offenders).toEqual([]);
  });

  it("die Import-Erkennung versteht die üblichen Schreibweisen", () => {
    const refs = importsOf(
      `import type { A } from "@/x";\nimport { type B, type C } from "./y";\nimport { D, type E } from "./z";\nimport "server-only";\nexport * from "./w";\nimport {\n  F,\n  G,\n} from "./multi";`,
    );
    expect(refs).toEqual([
      { specifier: "@/x", typeOnly: true },
      { specifier: "./y", typeOnly: true },
      { specifier: "./z", typeOnly: false },
      { specifier: "server-only", typeOnly: false },
      { specifier: "./w", typeOnly: false },
      { specifier: "./multi", typeOnly: false },
    ]);
    // Ein Typ-Export davor darf einen echten Import danach nicht zum Typ-Import machen.
    expect(importsOf(`export type Foo = string;\nexport { b } from "c";`)).toEqual([
      { specifier: "c", typeOnly: false },
    ]);
  });
});
