# Sicherheit

Dieses Dokument beschreibt, **was** VereinsFlow schützt, **wo** das im Code geschieht und **was nicht** abgedeckt ist. Die Tests
sind Teil der Zusicherung: Wo „getestet“ steht, gibt es einen automatischen Test, der bei einer Verschlechterung fehlschlägt.

Sicherheitslücken bitte **nicht** öffentlich melden, sondern vertraulich an die Betreiber (Kontakt: siehe Impressum der
Installation).

## Schutzziele und Bedrohungen

| Bedrohung                                                    | Gegenmaßnahme                                                                                                             | Abschnitt                                       |
| ------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------- |
| Ein Verein sieht oder ändert Daten eines anderen (IDOR)      | Kontext aus der Sitzung, gefilterter Datenbank-Client, zusammengesetzte Fremdschlüssel; „nicht gefunden“ statt „verboten“ | [Mandanten](#mandantentrennung)                 |
| Rechteausweitung innerhalb eines Vereins                     | Rechte mit Reichweite, Prüfung immer im Dienst, Rollen serverseitig                                                       | [Rechte](#rechte)                               |
| Passwort erraten / Konto übernehmen                          | Argon2id, Passwortregeln, Rate-Limits je Konto und IP, konstante Antwortzeit, keine Konto-Aufzählung                      | [Anmeldung](#anmeldung-und-sitzungen)           |
| Sitzung stehlen oder fixieren                                | Zufallstoken, nur Hash gespeichert, `HttpOnly`/`Secure`/`__Host-`, Inaktivitäts- und Höchstdauer                          | [Anmeldung](#anmeldung-und-sitzungen)           |
| Fremde Seite löst Aktionen im Namen des Benutzers aus (CSRF) | `SameSite=Lax`, Herkunftsprüfung, Server Actions mit eingebautem Schutz                                                   | [Web](#webangriffe)                             |
| Skripteinschleusung (XSS)                                    | React-Escaping, keine `innerHTML`-Nutzung, CSP mit Nonce, Nachrichten nur als Text                                        | [Web](#webangriffe)                             |
| SQL-Einschleusung                                            | Nur Prisma mit Parametern; Roh-SQL nur mit gebundenen Werten; unsichere Varianten im Tenant-Client gesperrt               | [Web](#webangriffe)                             |
| Schädliche oder getarnte Uploads                             | Positivliste, Inhaltsprüfung, zufälliger Speicherort, Download nur als Anhang mit `nosniff` und `sandbox`                 | [Uploads](#uploads)                             |
| Missbrauch durch Massenanfragen                              | Rate-Limits (Anmeldung, Reset, Einladung, Upload, Export, Support-Meldung, Cron, Kalender-Feed)                           | [Rate-Limits](#rate-limits)                     |
| Manipulation des Protokolls                                  | Datenbank-Trigger: Änderungsprotokoll ist unveränderlich                                                                  | [Protokoll](#protokoll-und-nachvollziehbarkeit) |
| Unsichere Konfiguration in Produktion                        | Start verweigert bei Platzhalter-Geheimnissen, `http://` oder Mail-Transport ≠ `smtp`                                     | [Betrieb](#konfiguration-und-geheimnisse)       |
| Datenabfluss über Logs                                       | Keine Personendaten, Passwörter oder Token in Logs; IP nur gekürzt gespeichert                                            | [Logs](#logs-und-fehler)                        |

## Mandantentrennung

Ausführlich in [ARCHITECTURE.md](ARCHITECTURE.md#mandantentrennung-das-wichtigste). Kurz: drei Schichten (Kontext, gefilterter Client,
zusammengesetzte Fremdschlüssel). **Getestet** in jedem Fachbereich mit zwei Vereinen (`tests/integration/*.test.ts`,
`tests/unit/tenant-scope.test.ts`) und Ende-zu-Ende (Nachrichten, Dokumente, Veranstaltungen, Mitglieder anderer Vereine → 404).

## Rechte

- Rechte-Katalog und Standardrollen: `src/server/permissions/`. Reichweiten: Verein, Abteilung, eigene Daten.
- Serverseitig in **jedem** Dienst (`assertCan`); Listen werden über `scopeFilter` von vornherein eingeschränkt.
- Abteilungsleiter verwalten nur Objekte ihrer Abteilung, Hochladende nur ihre eigenen Dokumente (Beispiel für einen echten Fund
  aus den Tests: Ein pauschales „Leitung verwalten“ hätte Abteilungsleitern erlaubt, fremde Leitungen zu entfernen – jetzt je Abteilung geprüft).
- Der **letzte Vereinsadministrator** kann weder entfernt noch herabgestuft werden; der **letzte Plattform-Administrator** kann sich
  nicht löschen.

## Anmeldung und Sitzungen

- **Passwörter:** Argon2id (19 MiB, 2 Durchläufe – Mindestprofil der OWASP-Empfehlung), Länge 10–128, keine häufigen oder
  einfachen Folgen, kein Name oder E-Mail-Teil im Passwort. Es gibt keine Passwort-Hinweise oder -Fragen.
- **Keine Konto-Aufzählung:** Unbekannte E-Mail und falsches Passwort liefern dieselbe Meldung und – über einen Blind-Hash – die
  gleiche Antwortzeit. „Passwort vergessen“ antwortet immer gleich.
- **Sperren:** 8 Fehlversuche je Konto und 30 je IP in 15 Minuten führen zu einer Wartezeit (Rate-Limit in der Datenbank).
- **Sitzung:** 256-Bit-Zufallstoken; die Datenbank kennt nur den SHA-256-Hash. Cookie `HttpOnly`, `SameSite=Lax`, in Produktion
  `Secure` und `__Host-`-Präfix. Beim Anmelden entsteht immer eine **neue** Sitzung (keine Fixierung); beim Passwortwechsel werden
  andere Sitzungen beendet. Inaktivität (Vorgabe 60 Minuten) und Höchstdauer (14 Tage) prüft der Server bei jeder Anfrage.
- **Einladungen und Reset-Links:** Einmal-Token, nur als Hash gespeichert, begrenzte Gültigkeit, nach Gebrauch ungültig; gleichzeitiges Einlösen gelingt genau einmal (getestet).
- **Zwei-Faktor:** _noch nicht umgesetzt_ (siehe [ROADMAP.md](ROADMAP.md)); Datenfelder (`totpSecretEnc`) sind vorbereitet.

## Webangriffe

- **CSRF:** Cookie `SameSite=Lax`; Server Actions prüfen die Herkunft (Next.js); Route Handler mit Schreibzugriff laufen durch
  `apiHandler` → `assertSameOrigin` (Origin bzw. `Sec-Fetch-Site`). Getestet, u. a. Upload mit fremdem `Origin` → 403.
- **XSS:** Inhalte werden über React escaped; es gibt kein `dangerouslySetInnerHTML`. Nachrichten und Notizen sind **reiner Text**
  (getestet: `<img onerror>` erscheint als Text). Zusätzlich setzt `src/proxy.ts` je Anfrage eine **Content-Security-Policy mit Nonce**
  (`script-src 'self' 'nonce-…' 'strict-dynamic'`, `object-src 'none'`, `frame-ancestors 'none'`, `form-action 'self'`, in Produktion
  `upgrade-insecure-requests`). **Inline-Stile sind erlaubt** (`style-src 'self' 'unsafe-inline'`): Bibliotheken für Meldungen und Dialoge fügen
  ihre Stile zur Laufzeit ein und können keinen Nonce tragen (mit strengem `style-src` blieben Meldungen ungestaltet und Dialoge ohne Scroll-Sperre
  – aufgefallen erst im Produktions-Rauchtest). Die eigentliche XSS-Grenze, `script-src`, bleibt streng: kein `unsafe-inline`, kein `unsafe-eval`
  (getestet gegen den Produktions-Build, `tests/prod-smoke`).
- **Weitere Header:** `X-Content-Type-Options: nosniff`, `X-Frame-Options: DENY`, `Referrer-Policy`, `Permissions-Policy` (Kamera, Mikrofon,
  Standort aus), `Cross-Origin-Opener-Policy: same-origin`, in Produktion HSTS (2 Jahre, `includeSubDomains`, `preload`).
- **SQL-Einschleusung:** Alle Abfragen laufen über Prisma (parametrisiert). Wo Roh-SQL nötig ist (Advisory-Locks, Aufbewahrung,
  Anonymisierung), sind Werte gebunden (`$queryRaw`/`$executeRaw` mit Template-Literal). Der Tenant-Client sperrt `…Unsafe`-Varianten.
- **Open-Redirect:** Rücksprungziele nach der Anmeldung und Benachrichtigungs-Links sind nur interne Pfade (Prüfung in der Anwendung
  **und** per Datenbank-CHECK).
- **Eingaben:** Jede Server Action und jeder Route Handler validiert mit Zod, am Server – die Prüfung im Browser ist nur Komfort.

## Uploads

Umsetzung: `src/lib/uploads.ts`, `src/server/storage/`, `src/modules/documents/service.ts`, Routen unter `src/app/api/dokumente`.

- **Positivliste:** PDF, PNG, JPEG, GIF, WebP, DOCX, XLSX, PPTX, ODT, ODS, ODP, TXT, CSV. **Nicht** erlaubt: Ausführbares, HTML, SVG (kann
  Skripte enthalten), Office-Dateien mit Makros (`.doc`, `.xls`, `.docm`, …), Archive.
- **Inhaltsprüfung:** Der Typ wird an der **Signatur** erkannt; Endung und Inhalt müssen zusammenpassen. Der vom Browser gemeldete
  Typ wird ignoriert – der ausgelieferte Typ stammt aus der Positivliste (getestet mit absichtlich falschem Typ).
- **Dateiname:** wird nur zur **Anzeige** bereinigt (Pfadanteile, Steuer- und Richtungszeichen wie U+202E, unter Windows verbotene Zeichen, Länge). Er bestimmt nie den Speicherort.
- **Speicherort:** zufälliger 32-stelliger Schlüssel je Verein, außerhalb von `public/`, Pfad wird geprüft (kein Ausbrechen aus dem Verzeichnis), Schreiben mit `wx` (nie überschreiben).
- **Größe:** Obergrenze `MAX_UPLOAD_MB` (Vorabprüfung über `Content-Length`, bevor der Inhalt gelesen wird) und **Speicherkontingent** je Verein (`CLUB_STORAGE_QUOTA_MB`).
- **Rate-Limit:** 30 Uploads je Benutzer und Stunde.
- **Download:** immer über die geprüfte Route; Anmeldung, Verein und Zugriffsstufe werden **bei jedem Abruf** geprüft. Header:
  `Content-Disposition: attachment`, `X-Content-Type-Options: nosniff`, `Content-Security-Policy: sandbox; default-src 'none'`,
  `Cache-Control: private, no-store`. Fremde oder nicht sichtbare Dokumente → 404.
- **Zugriffsstufen:** „Alle Mitglieder“, „Nur Vorstand“ (Recht `documents:manage`), „Nur Verwaltung“ (Recht `club:update`). Wer eine Stufe
  nicht sieht, kann sie auch nicht vergeben.
- **Löschen:** weiches Löschen, nach 30 Tagen entfernt die Aufbewahrungsroutine Datei und Datensatz.
- **Nicht enthalten: Virenscan.** Dateien werden nicht auf Schadsoftware untersucht. `registerUploadScanner(...)` in
  `src/server/storage/scan.ts` ist der Erweiterungspunkt (z. B. für ClamAV); solange keiner registriert ist, warnt der Server einmalig im
  Protokoll. Für Vereine, die Dateien von Dritten annehmen, empfehlen wir, vor dem Produktiveinsatz einen Scanner anzubinden.

## Rate-Limits

Zähler liegen in PostgreSQL (`RateLimitBucket`), also gemeinsam für alle Server-Instanzen und ohne Zusatzdienst. Begrenzt sind:
Anmeldung (je Konto und IP), Passwort-Reset (anfordern und einlösen), Passwortwechsel, Einladungen, Datei-Upload, Datenexport,
Löschantrag, Support-Meldungen (10 je Person und Stunde), Kalender-Feed und der Cron-Endpunkt. **Hinter einem Reverse-Proxy** muss `TRUST_PROXY=true` gesetzt sein, sonst sehen alle
Anfragen wie eine IP aus – und nur dann, wenn der Proxy `X-Forwarded-For` selbst setzt und Fremdwerte überschreibt.

## Protokoll und Nachvollziehbarkeit

- `AuditLog` ist per Datenbank-Trigger **unveränderlich** (kein UPDATE; DELETE nur in der Aufbewahrungsroutine).
- Erfasst werden Anmeldungen, Rechteänderungen, Änderungen an Mitgliedern, Veranstaltungen, Schichten, Aufgaben, Nachrichten, Dokumenten,
  Einwilligungen und Datenschutz-Vorgängen. Sensible Werte (E-Mail, Telefon, Adresse, Notizen) werden nur als „geändert“ vermerkt.
- Ansicht für Berechtigte unter „Änderungsprotokoll“, filterbar nach Bereich, Person, Zeitraum und Text.

## Konfiguration und Geheimnisse

- Alle Geheimnisse (`APP_SECRET`, `CRON_SECRET`, Datenbank- und SMTP-Zugang) kommen aus der Umgebung, nie aus dem Code. `.env` steht in `.gitignore`.
- **Der Server startet in Produktion nicht**, wenn `APP_SECRET` oder `CRON_SECRET` noch den Platzhalter der Vorlage enthalten, `APP_URL` nicht mit `https://`
  beginnt oder `MAIL_TRANSPORT` nicht `smtp` ist (sonst landeten Reset-Links im Server-Protokoll). Geprüft beim Start (`src/instrumentation.ts`).
- Geheimnisse werden mit `timingSafeEqual` verglichen (Cron-Token); Token für Einladungen, Reset und Kalender-Abo nur als **Hash** gespeichert.
- Der Seed (Demo-Konten mit bekanntem Passwort) **verweigert die Ausführung in Produktion**.

## Logs und Fehler

- Fehler an Benutzer sind allgemein („Etwas ist schiefgelaufen“); Details stehen nur im Server-Protokoll – als Fehlertyp, ohne Personendaten, Passwörter, Token oder Dateiinhalte.
- IP-Adressen werden nur **gekürzt** (Präfix) gespeichert (Protokoll, Sitzungen).
- Der Mailversand ist von der Antwort entkoppelt: „Passwort vergessen“ antwortet immer gleich und schnell, ob die Adresse existiert oder nicht; ein langsamer Mailserver bremst nichts.

## Abhängigkeiten und Lieferkette

- Versionen sind in `package-lock.json` festgelegt; native Pakete mit Build-Skripten sind ausdrücklich freigegeben (`allowScripts` in `package.json`).
- Empfehlung für den Betrieb: regelmäßig `npm audit` ausführen und Updates einspielen; die CI führt Typprüfung, Lint und alle Tests bei jeder Änderung aus, Dependabot schlägt Aktualisierungen vor.
- **Bekannter Befund (Stand 21.09.2026):** `npm audit` meldet vier Hinweise (hoch) in Abhängigkeiten des **Prisma-Kommandozeilenwerkzeugs** (`deepmerge-ts`, `mysql2`). Sie betreffen
  nur das Entwicklungs- und Migrationswerkzeug (Konfiguration laden, MySQL-Anbindung, die VereinsFlow nicht nutzt), nicht die laufende Anwendung – das Laufzeit-Image enthält das Werkzeug nicht.
  Eine Behebung ist zurzeit nur durch ein Downgrade auf Prisma 6 möglich; wir warten auf eine korrigierte 7er-Version. Bitte bei jedem Update erneut prüfen.

## Nicht abgedeckt (bewusst benannt)

- Kein Virenscan der Uploads (Erweiterungspunkt vorhanden).
- Keine Zwei-Faktor-Anmeldung (vorbereitet).
- Keine Datenbank-Zeilensicherheit (Row-Level-Security) als vierte Schicht – siehe [ADR-0002](adr/0002-mandantentrennung.md); die drei vorhandenen Schichten sind getestet.
- Keine automatische Verschlüsselung der Dateiablage; empfohlen ist ein verschlüsselter Datenträger auf dem Server.
- Kein Schutz vor Angriffen auf Netzwerkebene (DDoS): dafür Reverse-Proxy oder Anbieter-Dienste einsetzen.
- Penetrationstest durch Dritte: nicht durchgeführt.
