# VereinsFlow

Moderne, sichere Vereinsverwaltung als Mehrmandanten-Anwendung (SaaS): **ein Verein = ein Mandant**. Mitglieder, Abteilungen,
Veranstaltungen, **Helferschichten** (mit Schutz vor Überbuchung und Doppelbelegung), Aufgaben, Kalender, Nachrichten und
Dokumente – mit Rollen und Rechten, Änderungsprotokoll und DSGVO-Funktionen. Oberfläche durchgehend Deutsch, mobil nutzbar,
barrierefrei gebaut.

> **Stand:** Das erste Ziel (MVP) ist erreicht und in weiten Teilen darüber hinaus ausgebaut. Ehrlich benannt sind die
> Lücken unter [Bekannte Grenzen](#bekannte-grenzen) – vor allem: **Finanzen** und **Zwei-Faktor-Anmeldung** sind noch nicht
> gebaut, eine **öffentliche Veranstaltungsseite** fehlt, und der **Virenscan** für Uploads ist nur als Erweiterungspunkt
> vorbereitet.

## Funktionsumfang

| Bereich                            | Stand       | Kern                                                                                                                                                                                  |
| ---------------------------------- | ----------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Anmeldung, Konto, Einladungen      | fertig      | Sitzungen mit Inaktivitäts- und Höchstdauer, Passwort-Reset, Einladungen per Link, Rate-Limits, Profil und Sitzungsübersicht                                                          |
| **Vereinslogo**                    | fertig      | Eigenes Logo je Verein neben dem Namen (Kopfzeile, Vereinswechsler, Menü, Profil, gedruckter Helferplan); PNG/JPEG/WebP bis 1 MB, Inhalts- und Größenprüfung, sonst Anfangsbuchstaben |
| Mandanten, Rollen, Rechte          | fertig      | Superadministrator (Plattform) sowie Vereinsadmin, Vorstand, Abteilungsleiter, Helfer, Mitglied; Rechte mit Reichweite Verein / Abteilung / nur eigene Daten                          |
| Mitglieder                         | fertig      | Anlegen, Bearbeiten, Archivieren, Papierkorb, Suche/Filter/Sortierung, CSV-Import mit Vorschau, CSV-Export, Statistik, Notizen, Einwilligungen, Änderungshistorie                     |
| Abteilungen und Gruppen            | fertig      | Abteilungen, Gruppen, Leiter, Zuordnung von Mitgliedern                                                                                                                               |
| Veranstaltungen                    | fertig      | Status-Ablauf, Anmeldung mit Limit und Warteliste, Duplizieren, Serientermine, Absage mit Benachrichtigung                                                                            |
| **Helferschichten**                | fertig      | Überbuchungs- und Doppelbelegungsschutz (Datenbank-Sperren), Mindestalter, Zuweisung durch Veranstalter, Stundenerfassung, Ampel-Zustände, Druckansicht, CSV-Export, Erinnerungen     |
| Aufgaben und Checklisten           | fertig      | Aufgaben mit Zuständigen, Fälligkeit, Priorität, Status; Checklisten je Veranstaltung                                                                                                 |
| Kalender                           | fertig      | Monat, Woche, Tag, Liste; iCal-Export je Termin und persönlicher Kalender-Abo-Link (widerrufbar)                                                                                      |
| Nachrichten und Benachrichtigungen | fertig      | Nachrichten an Verein, Abteilung, Teilnehmer oder Helfer; Entwürfe, Ankündigungen, Rückruf, Lesestatistik; Benachrichtigungscenter, E-Mail mit Warteschlange                          |
| Dokumente                          | fertig      | Sicherer Upload (Positivliste, Inhaltsprüfung), Zugriffsstufen, Speicherkontingent, Download nur über geprüfte Route                                                                  |
| **Hilfe & Support**                | fertig      | Ansprechpartner des Vereins, Meldeformular für Fehler, Fragen und Vorschläge (mit Antwort und Status), durchsuchbare Bedienungsanleitung passend zur Rolle                            |
| Dashboard                          | fertig      | Rollenabhängige Kacheln (Mitglieder, Termine, freie Schichten, Aufgaben, Geburtstage, Benachrichtigungen)                                                                             |
| Änderungsprotokoll                 | fertig      | Unveränderlich (Datenbank-Trigger), filterbar; sensible Werte nur als „geändert“                                                                                                      |
| Datenschutz (DSGVO)                | fertig      | Datenexport, Löschantrag mit Bedenkzeit, Einwilligungen, Anonymisierung, Aufbewahrungsfristen je Verein                                                                               |
| **Finanzen**                       | Platzhalter | Seite mit Roadmap – bewusst ohne Funktionen. Plan und Datenmodell: [docs/ROADMAP.md](docs/ROADMAP.md)                                                                                 |
| Zwei-Faktor-Anmeldung (TOTP)       | geplant     | Datenfelder sind vorbereitet, die Anmeldung damit fehlt noch                                                                                                                          |

## Technik im Überblick

| Baustein   | Wahl                                                                                                                              |
| ---------- | --------------------------------------------------------------------------------------------------------------------------------- |
| Framework  | Next.js 16 (App Router, Server Actions, `proxy.ts`), React 19, TypeScript 5.9 (strict)                                            |
| Oberfläche | Tailwind CSS 4, shadcn/ui (Radix), lucide-react, React Hook Form + Zod 4                                                          |
| Datenbank  | PostgreSQL 18, Prisma 7 (Migrationen, UUIDv7, eigene SQL-Migrationen für Prüfregeln und Trigger)                                  |
| Anmeldung  | Eigene Sitzungen (gehashte Token in der Datenbank), Argon2id – begründet in [ADR-0001](docs/adr/0001-eigene-authentifizierung.md) |
| Tests      | Vitest (Unit und Integration gegen echte PostgreSQL), Playwright (Ende-zu-Ende, Desktop und Smartphone)                           |
| Betrieb    | Docker Compose (Entwicklung), Dockerfile (Produktion), GitHub Actions                                                             |

Abweichungen von den üblichen Standardlösungen und ihre Gründe stehen in den [Architekturentscheidungen](docs/adr/README.md)
(z. B. eigene Authentifizierung statt Auth.js, Rate-Limit in PostgreSQL statt Redis, lokale Dateiablage statt S3).

## Schnellstart

Voraussetzungen: **Node.js 22 oder neuer** (entwickelt mit 24), npm, und entweder **Docker** oder das mitgelieferte
Embedded-PostgreSQL.

> **Kurzweg (ohne Docker):** Nach den Schritten 1 und 2 genügt **ein Befehl** – `npm run dev:all`, unter Windows ein
> Doppelklick auf **`Start-VereinsFlow.cmd`**. Er startet die Datenbank, legt fehlende Tabellen an (beim allerersten Mal
> auch die Demo-Daten), startet die Anwendung und öffnet den Browser. Das Fenster bleibt offen, solange man VereinsFlow
> benutzt; mit Strg+C wird alles sauber beendet. Die Schritte 3 bis 6 unten beschreiben dasselbe von Hand.

1. **Abhängigkeiten installieren**

   ```bash
   npm install
   ```

2. **Konfiguration anlegen** – die Vorlage enthält Werte für die lokale Entwicklung

   ```bash
   # macOS / Linux
   cp .env.example .env
   ```

   ```powershell
   # Windows (PowerShell)
   Copy-Item .env.example .env
   ```

3. **Datenbank starten** – entweder mit Docker (PostgreSQL und Mailpit für Test-Mails)

   ```bash
   docker compose up -d
   ```

   …oder ohne Docker mit der eingebetteten Datenbank (Fenster offen lassen; Beenden mit Strg+C)

   ```bash
   npm run db:embedded
   ```

4. **Tabellen anlegen**

   ```bash
   npm run db:deploy
   ```

5. **Demo-Daten einspielen** (zwei getrennte Vereine mit Benutzern in allen Rollen)

   ```bash
   npm run db:seed
   ```

6. **Anwendung starten**

   ```bash
   npm run dev
   ```

7. **Anmelden** unter <http://localhost:3000> mit einem der Demo-Zugänge (Passwort: Wert von `SEED_PASSWORD` in `.env`,
   Vorlage: `Vereinsflow-Demo-2026!`):

   | Rolle                              | E-Mail                         |
   | ---------------------------------- | ------------------------------ |
   | Vereinsadmin                       | `admin@demo-verein.local`      |
   | Vorstand                           | `vorstand@demo-verein.local`   |
   | Abteilungsleiter (Fußball)         | `abteilung@demo-verein.local`  |
   | Helfer                             | `helfer@demo-verein.local`     |
   | Mitglied                           | `mitglied@demo-verein.local`   |
   | Mitglied in zwei Vereinen          | `mehrfach@demo-verein.local`   |
   | Vereinsadmin eines anderen Vereins | `admin@anderer-verein.local`   |
   | Superadministrator (Plattform)     | `superadmin@vereinsflow.local` |

   Diese Zugänge sind **ausschließlich für die lokale Entwicklung**. Das Seed-Skript verweigert die Ausführung in
   Produktion.

Mit `docker compose up -d` läuft zusätzlich **Mailpit**: Setze in `.env` `MAIL_TRANSPORT=smtp`, dann erscheinen alle
E-Mails (Einladungen, Passwort-Reset, Erinnerungen) unter <http://localhost:8025>. Mit dem Standard `log` stehen sie in der
Server-Konsole.

**Datenbank zurücksetzen** (löscht alle Daten und spielt die Demo-Daten neu ein): `npm run db:reset`.

### Fehlermeldung „ECONNREFUSED“ oder „Can't reach database server“

Das heißt: **Die Datenbank läuft nicht** (oder nicht dort, wo `DATABASE_URL` in `.env` hinzeigt). Die eingebettete
Datenbank ist ein eigener Prozess, der nur so lange läuft, wie sein Fenster offen ist – nach einem Neustart des Rechners
oder dem Schließen des Fensters ist sie aus. Lösung: `npm run dev:all` (bzw. `Start-VereinsFlow.cmd`) starten; das holt
die Datenbank automatisch hoch. Wer sie lieber einzeln startet: `npm run db:embedded` in einem **eigenen** Fenster
offen lassen (oder `docker compose up -d`) und erst dann `npm run dev` bzw. `npm run db:seed` ausführen.

## Befehle

| Befehl                            | Wirkung                                                                       |
| --------------------------------- | ----------------------------------------------------------------------------- |
| `npm run dev:all`                 | Alles starten: Datenbank + Tabellen + Anwendung (`-- --open`: Browser öffnen) |
| `npm run dev`                     | Nur der Entwicklungsserver (Port 3000; die Datenbank muss schon laufen)       |
| `npm run build` / `npm start`     | Produktions-Build und -Start                                                  |
| `npm run typecheck`               | TypeScript-Prüfung                                                            |
| `npm run lint`                    | ESLint (inkl. Regel zur Mandantentrennung)                                    |
| `npm run format` / `format:check` | Prettier anwenden / prüfen                                                    |
| `npm run test:unit`               | Schnelle Unit-Tests                                                           |
| `npm run test:integration`        | Integrationstests gegen PostgreSQL                                            |
| `npm test`                        | Unit- und Integrationstests                                                   |
| `npm run test:e2e`                | Ende-zu-Ende-Tests im Browser (Desktop und Smartphone)                        |
| `npm run check`                   | Typen, Lint und alle Tests                                                    |
| `npm run db:migrate`              | Neue Migration erstellen und anwenden (Entwicklung)                           |
| `npm run db:deploy`               | Vorhandene Migrationen anwenden (auch Produktion)                             |
| `npm run db:seed` / `db:reset`    | Demo-Daten einspielen / Datenbank zurücksetzen und neu befüllen               |
| `npm run db:studio`               | Datenbank im Browser ansehen                                                  |
| `npm run jobs:run`                | Hintergrundjobs einmal ausführen (Erinnerungen, Mailversand, Aufbewahrung, …) |
| `npm run admin:create`            | Ersten Plattform-Administrator anlegen (Produktion: siehe Betrieb)            |
| `npm run test:prod-smoke`         | Rauchtest gegen den Produktions-Build (vorher `npm run build`)                |

## Tests

- **Unit** (`tests/unit`): reine Logik – Berechtigungen, Zeit und Zeitzonen, Schichtregeln, Dateiprüfung, iCal, Architekturregeln.
- **Integration** (`tests/integration`): die Fachdienste gegen eine echte PostgreSQL, je Testdatei eine frische Datenbank.
  Sie prüfen unter anderem Mandantentrennung, Überbuchungs- und Doppelbelegungsschutz (auch bei gleichzeitigen Zugriffen),
  Datenexport und -löschung sowie Dateizugriff.
- **Barrierefreiheit** (`tests/e2e/a11y.spec.ts`): axe-core prüft alle Hauptseiten (öffentlich und angemeldet, mehrere Rollen, hell und dunkel,
  geöffneter Dialog) nach WCAG 2.1 A/AA. Das findet nur einen Teil der Probleme – ein Durchgang mit Screenreader und Tastatur bleibt nötig.
- **Ende-zu-Ende** (`tests/e2e`): Playwright startet einen eigenen Server (Port 3100) mit eigener Datenbank `vf_e2e`, die vor
  jedem Lauf neu aufgebaut wird – die Entwicklungsdatenbank bleibt unberührt.

Die Tests brauchen einen laufenden PostgreSQL (siehe Schnellstart, Schritt 3). Die Verbindung für die Test-Datenbanken kommt
aus `TEST_DATABASE_ADMIN_URL` (Vorgabe: `postgresql://vereinsflow:vereinsflow@localhost:5432/postgres`).

```bash
npx playwright install chromium     # einmalig: Browser für die E2E-Tests
npm run test:e2e                    # Desktop und Smartphone
npx playwright test --project=mobil
```

Ist Edge oder Chrome bereits installiert, geht es ohne Download: `PLAYWRIGHT_CHANNEL=msedge npm run test:e2e`
(PowerShell: `$env:PLAYWRIGHT_CHANNEL = "msedge"`).

Screenshots der wichtigsten Seiten zur optischen Kontrolle: `SCREENSHOTS=1 npx playwright test screenshots --project=desktop`
(Ergebnis in `.local/screens`).

**Produktions-Rauchtest:** Die E2E-Tests laufen gegen den Dev-Server, dessen Sicherheitsrichtlinie (CSP) großzügiger ist. Was erst im
Produktionsbetrieb auffällt – blockierte Stile oder Skripte, `__Host-`-Cookies, Sicherheits-Header, die Startprüfung der Konfiguration –
prüft ein eigener Lauf gegen den echten Build (eigene Datenbank `vf_prod_smoke`, Port 3300):

```bash
npm run build
npm run test:prod-smoke
```

## Projektstruktur

```text
prisma/            Schema, Migrationen (inkl. SQL-Prüfregeln und Trigger), Seed
src/app/           Seiten und Route Handler (Next.js App Router) – dünn, ohne Fachlogik
src/modules/       Fachlogik je Bereich: service.ts (Regeln), actions.ts (Server Actions), schemas.ts (Zod), components/
src/server/        Infrastruktur: Anmeldung, Mandanten-Kontext, Rechte, Datenbank, Jobs, Mail, Speicher, Datenschutz
src/lib/           Reine Hilfen ohne Server-Abhängigkeit (Datum/Zeit, Formatierung, Dateiprüfung, Schicht-Ampel, …)
src/components/    Wiederverwendbare Oberflächenbausteine (ui = shadcn, shared, layout)
tests/             unit, integration, e2e, prod-smoke
scripts/           Hilfsprogramme: eingebettete Datenbank, Hintergrundjobs, ersten Plattform-Administrator anlegen
docs/              Architektur, Sicherheit, Datenschutz, Betrieb, Roadmap, Entscheidungen
website/           Werbe-Website (statisch, mit eigenen Werkzeugen – siehe website/README.md)
Dockerfile, docker-compose*.yml, .github/   Betrieb (Container) und CI
```

Die Schichten und ihre Regeln (wer was importieren darf) beschreibt [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md); ein
Architekturtest sowie eine ESLint-Regel erzwingen sie.

## Dokumentation

- [Architektur](docs/ARCHITECTURE.md) – Schichten, Mandantentrennung, Rechte, Zeit, Jobs, Fehlerbehandlung
- [Datenmodell](docs/DATA_MODEL.md) – Entitäten und Beziehungen
- [Sicherheit](docs/SECURITY.md) – Schutzmaßnahmen und was nicht abgedeckt ist
- [Datenschutz (DSGVO)](docs/PRIVACY.md) – Datenarten, Fristen, Betroffenenrechte, Cookie-Konzept
- [Betrieb](docs/OPERATIONS.md) – Produktion, Docker, Cron, Datensicherung, Reverse-Proxy
- [Oberfläche und Gestaltung](docs/DESIGN.md) – Größen, Farben, Hervorhebungen, Seitenleiste, Ansichten prüfen
- [Roadmap](docs/ROADMAP.md) – Finanzen, Zwei-Faktor, Push, mobile Apps, weitere Ideen
- [Architekturentscheidungen](docs/adr/README.md)
- [Werbe-Website](website/README.md) – Vorschau, Prüfung und Veröffentlichung der Startseite

## Bekannte Grenzen

Diese Punkte sind bekannt und bewusst offen – sie stehen nicht „still“ in der Oberfläche, sondern sind dort als
„in Vorbereitung“ gekennzeichnet oder hier beschrieben:

- **Finanzen** – nur Platzhalterseite, keine Funktion.
- **Zwei-Faktor-Anmeldung** – in der Profilseite als „in Vorbereitung“ vermerkt.
- **Öffentliche Veranstaltungsseite** – die Sichtbarkeit „öffentlich“ kennzeichnet Veranstaltungen nur; eine Seite für Gäste
  ohne Anmeldung gibt es noch nicht.
- **Virenscan für Uploads** – Dateien werden auf Typ und Inhalt geprüft, aber nicht auf Schadsoftware gescannt. Der
  Erweiterungspunkt `registerUploadScanner` (`src/server/storage/scan.ts`) ist vorbereitet; ohne Scanner warnt der Server einmalig im Protokoll.
- **Docker-Image** – Dockerfile und Compose-Datei für den Betrieb sind vorhanden, wurden aber in der Entwicklungsumgebung
  (ohne Docker) nicht gestartet. Bitte vor dem Produktiveinsatz einmal testen.
- **Push-Benachrichtigungen und mobile Apps** – nicht enthalten; die Anwendung ist so aufgebaut, dass sie sich anbinden
  lassen (siehe Roadmap).
- **Rechtstexte** – Impressum und Datenschutzerklärung sind Platzhalter und müssen vom Verein ausgefüllt werden.

## Lizenz

Noch nicht festgelegt.
