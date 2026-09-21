# ADR-0007: Versionen – Next.js 16, TypeScript 5.9, `proxy.ts`, CSP mit Nonce

**Status:** gültig

## Kontext

Die Anwendung nutzt bewusst aktuelle Hauptversionen (Next.js 16, React 19, Prisma 7, Tailwind 4, Zod 4). Einige Konventionen weichen dabei von älteren Anleitungen ab.

## Entscheidung

- **Next.js 16 (App Router, Turbopack).** Wichtige Unterschiede zu früheren Versionen, die der Code berücksichtigt: `proxy.ts` statt `middleware.ts`; `params`, `searchParams`, `cookies()`
  und `headers()` sind asynchron; aus Client-Dateien dürfen Server-Seiten nur **Komponenten** aufrufen (ein Architekturtest prüft das); `unstable_rethrow` in Fehlerbehandlungen,
  die Next.js-Steuerausnahmen (Weiterleitung, „nicht gefunden“) durchlassen müssen.
- **TypeScript ist auf die 5.9-Linie festgelegt** (`~5.9.3`), damit Compiler, ESLint-Typprüfung und Next.js zusammenpassen. Ein Wechsel auf die nächste Hauptversion erfolgt bewusst als eigener Schritt mit vollständigem Testlauf.
- **Content-Security-Policy mit Nonce je Anfrage** im `proxy.ts` (`script-src 'self' 'nonce-…' 'strict-dynamic'`). Dadurch dürfen nur Skripte laufen, die Next.js selbst mit dem Nonce
  versieht; `unsafe-inline` für Skripte ist nicht nötig (im Entwicklungsmodus zusätzlich `unsafe-eval` für Hot Reload). Der Nonce zwingt alle Seiten zu **dynamischem Rendern** – die Anwendung
  ist ohnehin anmeldepflichtig und datenabhängig, statische Seiten gäbe es kaum.
  - **Stile sind bewusst weniger streng:** `style-src 'self' 'unsafe-inline'`. Ein erster Entwurf verlangte auch für Stile einen Nonce; der Produktions-Rauchtest (`tests/prod-smoke`) zeigte, dass
    dann Sonner (Meldungen, 15 KB Stile per `<style>`) ungestaltet blieb und Radix (Scroll-Sperre bei Dialogen) wirkungslos war – beide Bibliotheken können keinen Nonce setzen, und im
    Entwicklungsmodus fällt das nicht auf (dort ist `unsafe-inline` ohnehin erlaubt). Kosten/Nutzen: Skripte bleiben streng (die eigentliche XSS-Grenze), Inline-Stile sind ein geringes Risiko.
  - **Zod läuft im Browser ohne Laufzeit-Compiler** (`z.config({ jitless: true })` in `src/instrumentation-client.ts`): Zods `new Function`-Probe würde sonst bei jeder Seite als
    CSP-Verstoß (`script-src: eval`) gemeldet. Auf dem Server bleibt die schnelle Variante aktiv.
  - Eine Regression fängt der **Produktions-Rauchtest** ab: Er lädt alle Hauptseiten im echten Build und schlägt bei jedem CSP-Verstoß, Konsolenfehler oder ungestalteten Bestandteil fehl.
- **Prisma 7** mit dem `prisma-client`-Generator (Ausgabe `src/generated/prisma`, nicht eingecheckt) und dem Treiber-Adapter für PostgreSQL. Der Client entsteht **erst beim ersten Zugriff**, damit `next build` ohne Konfiguration läuft.
- **Prüfung der Konfiguration beim Serverstart** (`src/instrumentation.ts`): unsichere Produktionswerte verhindern den Start (harter Abbruch, weil Next.js Fehler im Start-Hook sonst nur meldet und weiterläuft).

## Folgen

- (+) Moderne, unterstützte Versionen; Sicherheitsfunktionen (CSP-Nonce, Startprüfung) sind Teil der Grundstruktur.
- (−) Anleitungen und Beispiele für ältere Versionen passen nicht immer. Bei Zweifeln zählt die mitgelieferte Dokumentation unter `node_modules/next/dist/docs/`.
- (−) Der E2E-Test läuft immer im Entwicklungsmodus (der Produktionsstart verlangt bewusst https und SMTP). Was nur im Produktionsbetrieb auffällt, prüft der **Produktions-Rauchtest** (`npm run test:prod-smoke`) gegen den echten Build; die CI führt ihn bei jeder Änderung aus.
