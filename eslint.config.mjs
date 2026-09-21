import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // Mandantentrennung: Der ungefilterte Datenbank-Client gehört ausschließlich in src/server/** (Anmeldung, Jobs, Plattform,
  // Datenschutz). Seiten, Komponenten und Fachdienste arbeiten über `ctx.db`, den auf den Verein begrenzten Client.
  // (Zusätzlich prüft tests/unit/architecture.test.ts dieselbe Regel – auch für Import-Schreibweisen, die ESLint nicht sieht.)
  {
    files: ["src/**/*.{ts,tsx}"],
    ignores: ["src/server/**"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          paths: [
            {
              name: "@/server/db/client",
              message:
                "Der ungefilterte Datenbank-Client ist nur in src/server/** erlaubt. Nutze ctx.db (mandantengefiltert) aus dem Tenant-Kontext.",
            },
          ],
        },
      ],
    },
  },
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    ".next-e2e/**",
    ".local/**",
    "src/generated/**",
    "playwright-report/**",
    "test-results/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    // Die Werbe-Website ist eine eigenständige statische Seite (Browser-Skript, Node-Werkzeuge) – eigene Prüfung in website/.
    "website/**",
  ]),
]);

export default eslintConfig;
