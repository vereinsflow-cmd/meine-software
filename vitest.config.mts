import path from "node:path";
import { defineConfig } from "vitest/config";

/**
 * Zwei Test-Projekte:
 *   unit        – schnelle Tests ohne Datenbank
 *   integration – Tests gegen ein echtes PostgreSQL (jede Testdatei bekommt eine eigene,
 *                 frisch aus einer Vorlage kopierte Datenbank → parallel und ohne Aufräumen)
 */
const root = import.meta.dirname;

const alias = {
  "@": path.resolve(root, "src"),
  // `server-only` wirft absichtlich außerhalb von Next.js; in Tests wird es durch einen leeren Stub ersetzt.
  "server-only": path.resolve(root, "tests/stubs/server-only.ts"),
};

export default defineConfig({
  resolve: { alias },
  test: {
    // Begrenzt die Parallelität: Jede Testdatei öffnet eine eigene Datenbank und Verbindungen.
    maxWorkers: 4,
    projects: [
      {
        extends: true,
        test: {
          name: "unit",
          environment: "node",
          include: ["src/**/*.test.ts", "tests/unit/**/*.test.ts"],
          setupFiles: ["tests/setup/unit.ts"],
        },
      },
      {
        extends: true,
        test: {
          name: "integration",
          environment: "node",
          include: ["tests/integration/**/*.test.ts"],
          globalSetup: ["tests/setup/global-db.ts"],
          setupFiles: ["tests/setup/integration.ts"],
          testTimeout: 30_000,
          hookTimeout: 60_000,
        },
      },
    ],
    coverage: {
      provider: "v8",
      include: ["src/server/**", "src/modules/**", "src/lib/**"],
      exclude: ["src/generated/**", "**/*.test.ts"],
    },
  },
});
