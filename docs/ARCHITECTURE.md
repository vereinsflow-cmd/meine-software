# Architektur

VereinsFlow ist ein modularer Monolith: **eine** Next.js-Anwendung, **eine** PostgreSQL-Datenbank, klare Schichten. Das hält den
Betrieb einfach (ein Prozess, eine Datenbank) und lässt sich später trotzdem teilen – die Fachlogik hängt nicht an Next.js.

## Schichten

```text
Browser ──► src/app          Seiten und Route Handler: lesen Parameter, rufen Dienste auf, zeigen Ergebnisse. Keine Fachregeln.
              │
              ▼
            src/modules/*    Fachlogik je Bereich
              ├─ service.ts     Regeln, Abfragen, Protokollierung  (arbeitet nur mit dem Kontext `ctx`)
              ├─ actions.ts     Server Actions: Eingabe prüfen (Zod) → Dienst aufrufen → typisiertes Ergebnis
              ├─ schemas.ts     Zod-Schemas, gemeinsam für Browser (Sofort-Feedback) und Server (verbindlich)
              └─ components/    Oberfläche des Bereichs
              │
              ▼
            src/server/*     Infrastruktur: Anmeldung, Mandanten-Kontext, Rechte, Datenbank, Jobs, Mail, Speicher, Datenschutz
              │
              ▼
            PostgreSQL       Tabellen, Fremdschlüssel, CHECKs, Trigger – die letzte Instanz für Datenintegrität
```

`src/lib` enthält reine Hilfen ohne Server-Abhängigkeit (Datum und Zeitzone, Formatierung, Dateiprüfung, Schicht-Ampel,
Wiederholungen). Sie laufen im Browser und auf dem Server und sind deshalb einzeln testbar.

### Regeln, die Werkzeuge erzwingen

| Regel                                                                                                                     | Durchgesetzt durch                                   |
| ------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------- |
| Browser-Code (Client-Komponenten, Formular-Schemas, `src/lib`) importiert – auch über Umwege – keinen Server-Code         | `tests/unit/architecture.test.ts`                    |
| Server-Code ruft aus Client-Dateien nur Komponenten auf, keine Funktionen (sonst Fehler beim Rendern)                     | `tests/unit/architecture.test.ts`                    |
| Nur `src/server/**` darf den ungefilterten Datenbank-Client (`@/server/db/client`) importieren                            | ESLint (`no-restricted-imports`) und Architekturtest |
| Jedes Prisma-Modell ist einer Mandanten-Klasse zugeordnet (`MODEL_SCOPE`); ein neues Modell ohne Eintrag kompiliert nicht | TypeScript (`Record<Prisma.ModelName, …>`) und Test  |
| Jede protokollierte Aktion hat einen deutschen Namen                                                                      | `tests/unit/audit-labels.test.ts`                    |

## Mandantentrennung (das Wichtigste)

Ein Verein darf nie Daten eines anderen sehen oder ändern. Das sichern **drei unabhängige Schichten** – fällt eine aus, halten
die anderen:

1. **Kontext statt Parameter.** Jede Seite, Server Action und jeder Route Handler beginnt mit `requirePageContext()` bzw.
   `requireTenantContext()`. Der Kontext (`TenantContext`) entsteht aus der **Sitzung** – nie aus einer ID in der URL oder im
   Formular. Er enthält Benutzer, Verein, Mitglied, Rechte und den auf den Verein begrenzten Datenbank-Client `ctx.db`.
2. **Gefilterter Datenbank-Client** (`src/server/db/tenant.ts`). `createTenantDb(clubId)` ist eine Prisma-Client-Erweiterung, die
   bei **jeder** Operation auf mandantenbezogenen Tabellen `clubId` in den Filter setzt (Lesen, Ändern, Löschen), beim Anlegen
   fest einträgt und ein Umziehen in einen anderen Verein verbietet. Verschachtelte Schreibzugriffe, Roh-SQL und unbekannte
   Operationen sind gesperrt („fail closed“). Plattformweite Tabellen (Benutzer, Sitzungen, …) erreicht man mit diesem Client
   gar nicht.
3. **Datenbank.** Alle Beziehungen zwischen mandantenbezogenen Tabellen sind **zusammengesetzte Fremdschlüssel** `(clubId, id)`:
   Eine Schicht eines Vereins kann nicht mit einem Mitglied eines anderen Vereins verknüpft werden – selbst dann nicht, wenn der
   Anwendungscode es versuchte.

Fremde Datensätze sind **„nicht gefunden“**, nicht „verboten“: Das verrät nicht, dass es sie gibt (Schutz vor ID-Raten, IDOR).
Die Integrationstests prüfen das für jeden Bereich mit zwei Vereinen.

## Rechte

Rollen sind Bündel von Rechten; jedes Recht hat eine **Reichweite**:

- `CLUB` – im ganzen Verein,
- `DEPARTMENT` – nur in den Abteilungen, die der Benutzer leitet,
- `OWN` – nur eigene Daten.

Der Rechte-Katalog steht im Code (`src/server/permissions/catalog.ts`, mit deutschen Bezeichnungen), die Standardrollen in
`defaults.ts` (Vereinsadmin, Vorstand, Abteilungsleiter, Helfer, Mitglied). Diensten stehen `can`, `scopeOf`, `assertCan` und
`scopeFilter` zur Verfügung – letzteres übersetzt die Reichweite in einen Datenbankfilter, damit Listen von vornherein nur
Erlaubtes enthalten. **Die Prüfung geschieht immer im Dienst**, nie nur in der Oberfläche; ausgeblendete Schaltflächen sind Komfort,
kein Schutz. Der Superadministrator ist ein Plattform-Merkmal am Benutzer, keine Vereinsrolle: Er verwaltet Vereine, sieht aber
keine Mitgliederdaten.

## Anmeldung und Sitzungen

Eigene, datenbankgestützte Sitzungen (Begründung: [ADR-0001](adr/0001-eigene-authentifizierung.md)):

- Das Sitzungs-Token ist zufällig (256 Bit), im Cookie liegt das Token, in der Datenbank nur sein **SHA-256-Hash** – ein
  Datenbank-Leck liefert keine nutzbaren Sitzungen.
- Cookie: `HttpOnly`, `SameSite=Lax`, in Produktion `Secure` und mit Präfix `__Host-`.
- **Inaktivitäts-Timeout** (`SESSION_IDLE_MINUTES`, Vorgabe 60) und **Höchstdauer** (`SESSION_MAX_DAYS`, Vorgabe 14) werden bei jeder
  Anfrage serverseitig geprüft. Der Browser meldet zusätzlich nach Inaktivität selbst ab (`IdleLogout`) – als Komfort, nicht als Schutz.
- Passwörter: **Argon2id**; Anmeldefehler werden je Konto und je IP gezählt (Rate-Limit in der Datenbank).
- Wer Mitglied in mehreren Vereinen ist, wählt den aktiven Verein; der Kontext verwendet nie „irgendeinen anderen“ Verein als Ersatz.

## Zeit und Zeitzone

- Zeitpunkte werden in **UTC** gespeichert (`timestamptz`) und in **Europe/Berlin** angezeigt (`@date-fns/tz`), Format `TT.MM.JJJJ`
  und 24 Stunden. Reine Kalendertage (Geburtstag, Fälligkeit) sind `@db.Date` und werden als „UTC-Mitternacht“ geführt.
- „Heute“ ist immer der **Berliner** Tag (`todayCalendarDate`), nicht der des Servers. Tageswechsel und Sommerzeit sind getestet.
- Schichten über Mitternacht sind erlaubt (Endzeit vor Beginn = nächster Tag).

## Helferschichten: Überbuchung und Doppelbelegung

Die zentrale Anforderung wird **doppelt** abgesichert – vorab im Dienst (für verständliche Meldungen) und endgültig in der Datenbank
(für gleichzeitige Zugriffe):

- Trigger `shift_assignment_capacity_guard`: sperrt die Schicht-Zeile und verweigert den Platz, wenn `requiredCount` erreicht ist
  → nie Überbuchung, auch wenn zwei Personen im selben Moment den letzten Platz wollen.
- Trigger `shift_assignment_overlap_guard`: serialisiert je Mitglied per Advisory-Lock und verweigert überlappende Schichten
  → keine Doppelbelegung. Abgesagte und gelöschte Schichten zählen nicht.
- Trigger `event_participant_capacity_guard`: dasselbe für das Teilnehmerlimit von Veranstaltungen.
- Der Dienst wandelt die Datenbank-Fehler (`SHIFT_FULL`, `SHIFT_OVERLAP`, `EVENT_FULL`) in freundliche Meldungen um
  (`mapDatabaseError`).
- Zusätzlich prüft `eligibility.ts` vorab: Mindestalter (am Berliner Tag berechnet), Schichtstatus, Beginn, Veranstaltungsstatus.
- Die Ampel (`lib/shift-health.ts`) leitet Zustände wie „voll“, „kritisch“, „überfällig“ aus Besetzung und Zeit ab – als Text und Farbe.

Die Tests fahren parallele Eintragungen gegen die echte Datenbank (`tests/integration/db-guards.test.ts`, `events.test.ts`).

## Änderungsprotokoll

`AuditLog` ist **unveränderlich**: Ein Datenbank-Trigger verbietet `UPDATE` und – außer in der Aufbewahrungsroutine – `DELETE`.
Einträge nennen Akteur, Aktion, Objekt und Zeitpunkt; Änderungsdetails maskieren sensible Felder („geändert“ statt Wert). Für die
Datenschutz-Löschung darf die Routine ausschließlich `summary` und `changes` schwärzen (Namen entfernen) – Akteur, Aktion und
Zeitpunkt bleiben als Nachweis.

## Hintergrundjobs

Es gibt bewusst **keinen** dauerhaft laufenden Worker. Ein Cron-Aufruf (alle 15 Minuten) startet die Jobs
(`npm run jobs:run` oder `POST /api/cron/run` – auch `GET` – mit `Authorization: Bearer <CRON_SECRET>`):

| Job         | Aufgabe                                                                                                           |
| ----------- | ----------------------------------------------------------------------------------------------------------------- |
| `events`    | Vergangene Veranstaltungen automatisch abschließen                                                                |
| `reminders` | Erinnerungen 24 Stunden vor Schichten und Veranstaltungen (einmalig je Person, idempotent)                        |
| `privacy`   | Fällige Löschanträge nach Ablauf der Bedenkzeit ausführen                                                         |
| `mail`      | E-Mail-Warteschlange abarbeiten, Wiederholung nach Fehlern                                                        |
| `cleanup`   | Abgelaufene Sitzungen, Rate-Limit-Zähler, Token, alte Benachrichtigungen und widerrufene Kalender-Links entfernen |
| `retention` | Aufbewahrungsfristen anwenden (Papierkorb, Ausgetretene, Änderungsprotokoll, gelöschte Dokumente)                 |

Jeder Job läuft unter einer **Datenbank-Sperre** (`withJobLock`): Startet Cron versehentlich zweimal oder laufen zwei Instanzen,
arbeitet nur eine. Alle Jobs sind **idempotent** (bedingte Updates, `dedupeKey`, `reminderSentAt`) – ein doppelter Lauf richtet nichts an.

## Dateien

Hochgeladene Dateien liegen **außerhalb von `public/`** im `STORAGE_DIR`, unter einem zufälligen Schlüssel (nicht dem Dateinamen)
je Verein. Zugriff nur über `GET /api/dokumente/<id>/download`, das Anmeldung, Verein und Zugriffsstufe bei jedem Abruf prüft.
Details der Prüfungen: [SECURITY.md](SECURITY.md#uploads).

## Fehlerbehandlung

Dienste werfen typisierte Fehler (`AppError`: nicht angemeldet, verboten, nicht gefunden, ungültig, Konflikt, zu viele Anfragen).
`actions.ts` und Route Handler übersetzen sie in ein einheitliches Ergebnis `{ ok, data | error }` mit deutscher Meldung und – wo
möglich – Feldfehlern; Route Handler setzen den passenden HTTP-Status (401, 403, 404, 409, 422, 429). **Interne Fehler zeigen nie
Details**: Der Benutzer sieht eine allgemeine Meldung, das Server-Protokoll den Fehlertyp – ohne Personendaten, Passwörter oder Token.

## Konfiguration

Alle Einstellungen kommen aus Umgebungsvariablen (`src/server/env.ts`, Zod-geprüft). Die Prüfung läuft beim **Start des Servers**
(`src/instrumentation.ts`); in Produktion **verweigert er den Start** bei Platzhalter-Geheimnissen, `http://`-Adresse oder
Mail-Transport ungleich `smtp`. `next build` benötigt keine Konfiguration – der Datenbank-Client entsteht erst beim ersten Zugriff.

## Erweiterbarkeit

- **Neuer Fachbereich:** `src/modules/<name>/` mit `service.ts`, `actions.ts`, `schemas.ts`, `components/`; Rechte im Katalog ergänzen;
  Modelle im Schema mit Eintrag in `MODEL_SCOPE`; Aktionen in `audit-labels.ts` benennen.
- **Finanzen, Push, mobile Apps:** Fachdienste kennen weder Next.js noch HTML; ein zukünftiger API-Zugang (z. B. für eine App) ruft
  dieselben Dienste mit demselben Kontext auf. Einzelheiten: [ROADMAP.md](ROADMAP.md).
- **Virenscan:** `registerUploadScanner(...)` in `src/server/storage/scan.ts`.
