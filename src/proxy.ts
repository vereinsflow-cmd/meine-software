import { NextResponse, type NextRequest } from "next/server";
import { SESSION_COOKIE_NAME } from "@/lib/session-cookie";

/**
 * Proxy (früher "Middleware") – läuft vor jeder Seite. Aufgaben:
 *  1. Content-Security-Policy mit frischem Nonce je Anfrage (Schutz vor XSS).
 *  2. Request-ID zur Zuordnung von Protokolleinträgen.
 *  3. Optimistische Weiterleitung nicht angemeldeter Besucher auf die Anmeldeseite.
 *
 * WICHTIG: Punkt 3 prüft nur, ob ein Cookie vorhanden ist – NICHT, ob die Sitzung gültig ist.
 * Die eigentliche Prüfung (Sitzung, Verein, Berechtigung) passiert serverseitig in jeder Seite,
 * Server Action und Route (`requirePageContext`, `requireTenantContext`). Der Proxy ist nur eine Komfortschicht.
 */

const PUBLIC_PATHS = [
  "/anmelden",
  "/registrieren",
  "/passwort-vergessen",
  "/passwort-zuruecksetzen",
  "/impressum",
  "/datenschutzerklaerung",
];
const PUBLIC_PREFIXES = ["/einladung/"];

function isPublic(pathname: string): boolean {
  return (
    PUBLIC_PATHS.includes(pathname) || PUBLIC_PREFIXES.some((prefix) => pathname.startsWith(prefix))
  );
}

function buildCsp(nonce: string): string {
  const isDev = process.env.NODE_ENV === "development";
  const directives = [
    "default-src 'self'",
    // 'strict-dynamic': Skripte, die ein vertrauenswürdiges (mit Nonce versehenes) Skript nachlädt, sind erlaubt.
    `script-src 'self' 'nonce-${nonce}' 'strict-dynamic'${isDev ? " 'unsafe-eval'" : ""}`,
    // Stile: eigene Stylesheets sowie Inline-Stile (<style>-Elemente und style-Attribute) sind erlaubt. Bibliotheken wie Sonner
    // (Meldungen) und Radix (Scroll-Sperre bei geöffneten Dialogen) fügen ihre Stile zur Laufzeit als <style>-Element ein und
    // können keinen Nonce tragen; mit einem strengen style-src blieben Meldungen ungestaltet und Dialoge ohne Scroll-Sperre –
    // das fällt nur im Produktionsbetrieb auf (siehe tests/prod-smoke). Die entscheidende Grenze gegen XSS ist script-src
    // (Nonce + 'strict-dynamic'); Inline-Stile sind dagegen ein geringes Risiko, zumal die Anwendung keine HTML-Einschleusung zulässt.
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' blob: data:",
    "font-src 'self'",
    "connect-src 'self'",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "frame-ancestors 'none'",
    ...(isDev ? [] : ["upgrade-insecure-requests"]),
  ];
  return directives.join("; ");
}

export function proxy(request: NextRequest) {
  const { pathname, search } = request.nextUrl;

  if (!isPublic(pathname) && !request.cookies.has(SESSION_COOKIE_NAME)) {
    const loginUrl = new URL("/anmelden", request.url);
    // Nur interne Pfade als Rücksprungziel – verhindert Open-Redirects.
    if (pathname !== "/" && pathname.startsWith("/") && !pathname.startsWith("//")) {
      loginUrl.searchParams.set("next", `${pathname}${search}`);
    }
    return NextResponse.redirect(loginUrl);
  }

  const nonce = Buffer.from(crypto.randomUUID()).toString("base64");
  const csp = buildCsp(nonce);
  const requestId = crypto.randomUUID();

  const requestHeaders = new Headers(request.headers);
  requestHeaders.set("x-nonce", nonce);
  requestHeaders.set("x-request-id", requestId);
  // Next.js liest den Nonce aus dem CSP-Header der Anfrage und versieht damit die eigenen Skripte.
  requestHeaders.set("Content-Security-Policy", csp);

  const response = NextResponse.next({ request: { headers: requestHeaders } });
  response.headers.set("Content-Security-Policy", csp);
  response.headers.set("x-request-id", requestId);
  return response;
}

export const config = {
  matcher: [
    // Nicht für API-Routen (eigene Authentifizierung), statische Dateien und Prefetches.
    {
      source:
        "/((?!api|_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)",
      missing: [
        { type: "header", key: "next-router-prefetch" },
        { type: "header", key: "purpose", value: "prefetch" },
      ],
    },
  ],
};
