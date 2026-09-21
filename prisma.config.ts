import "dotenv/config";
import { defineConfig } from "prisma/config";

/**
 * Prisma-Konfiguration (Prisma 7).
 *
 * - Laufzeit-Zugriff der Anwendung nutzt DATABASE_URL (siehe src/server/db/client.ts).
 * - Migrationen laufen über MIGRATION_DATABASE_URL, falls gesetzt (z. B. Owner-Rolle),
 *   sonst über DATABASE_URL.
 */
export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: {
    path: "prisma/migrations",
    // --conditions=react-server: das Paket "server-only" ist damit im Skript importierbar.
    seed: "tsx --conditions=react-server prisma/seed.ts",
  },
  datasource: {
    url: process.env["MIGRATION_DATABASE_URL"] || process.env["DATABASE_URL"],
  },
});
