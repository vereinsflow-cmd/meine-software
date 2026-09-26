import type { NextConfig } from "next";

const isProd = process.env.NODE_ENV === "production";

/**
 * Sicherheits-Header, die für jede Antwort gelten.
 * Die Content-Security-Policy (mit Nonce) wird pro Request in src/proxy.ts gesetzt,
 * weil sie einen zufälligen Nonce enthalten muss.
 */
const securityHeaders = [
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  {
    key: "Permissions-Policy",
    value: "camera=(), microphone=(), geolocation=(), payment=(), usb=(), interest-cohort=()",
  },
  { key: "Cross-Origin-Opener-Policy", value: "same-origin" },
  { key: "X-DNS-Prefetch-Control", value: "off" },
  ...(isProd
    ? [
        {
          key: "Strict-Transport-Security",
          value: "max-age=63072000; includeSubDomains; preload",
        },
      ]
    : []),
];

const nextConfig: NextConfig = {
  // Eigenes Build-Verzeichnis erlaubt einen zweiten Server (E2E-Tests) neben dem Entwicklungsserver.
  distDir: process.env.NEXT_DIST_DIR || ".next",
  reactStrictMode: true,
  poweredByHeader: false,
  // Das runde Next.js-Symbol (nur im Entwicklungsmodus) verdeckt in jeder Ecke etwas: unten links den Knopf zum
  // Aufklappen der Seitenleiste, unten rechts Knöpfe am Seitenende („Weiter“, „Speichern“), oben Logo und Benutzermenü.
  // Fehlermeldungen beim Entwickeln zeigt Next.js auch ohne das Symbol an.
  devIndicators: false,
  // Für das Docker-Image ("standalone"). Lokal unter Windows wird es nicht benötigt und
  // kann dort wegen fehlender Symlink-Rechte scheitern – daher nur per Umgebungsvariable.
  output: process.env.BUILD_STANDALONE === "1" ? "standalone" : undefined,
  // Native Module dürfen nicht gebündelt werden.
  serverExternalPackages: ["@node-rs/argon2", "pg", "@prisma/adapter-pg", "nodemailer"],
  // Next.js schreibt im Entwicklungsmodus jeden Server-Action-Aufruf samt Argumenten ins
  // Terminal – also auch Passwörter und Tokens aus Anmeldung, Einladung und Passwort-Formularen.
  // Eine Schwärzung einzelner Felder bietet Next.js nicht an, daher ganz abgeschaltet.
  logging: { serverFunctions: false },
  async headers() {
    return [{ source: "/:path*", headers: securityHeaders }];
  },
};

export default nextConfig;
