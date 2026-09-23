# Berührungspunkte personenbezogener Daten in VereinsFlow

Für jedes neue oder geänderte Feld/Modell mit Personenbezug alle Punkte A–N prüfen. Hintergrund: `docs/PRIVACY.md`,
`docs/ARCHITECTURE.md`, `docs/adr/0006-aufbewahrung-und-anonymisierung.md`.

## Inhalt
A Mandantentrennung · B Rechte und Sichtbarkeit · C Datenexport (Art. 15/20) · D Anonymisierung · E Kontolöschung (Art. 17) ·
F Änderungsprotokoll · G Aufbewahrung · H Geheimnisse · I Logs und Fehler · J Einwilligungen · K Mails, Benachrichtigungen, Suche, CSV ·
L Tests · M Dokumentation · N Sonderfall Finanzen

---

## A. Mandantentrennung
- Neues Modell: Eintrag in `MODEL_SCOPE` (sonst kompiliert es nicht), `clubId` bei vereinsbezogenen Daten.
- Beziehungen zu `Member` & Co. als **zusammengesetzte Fremdschlüssel** `(clubId, id)`.
- Zugriff im Service ausschließlich über `ctx.db`; nur `src/server/**` nutzt `@/server/db/client`.
- Fremde Datensätze → „nicht gefunden“, nicht „verboten“.

## B. Rechte und Sichtbarkeit (`src/server/permissions/catalog.ts`, Services)
- Kontaktdaten nur mit `members:read_contact`, sensible Daten nur mit `members:read_private` – geprüft **im Service**
  (`can`/`assertCan`/`scopeFilter`), nicht nur in der Oberfläche. Vorbild: `src/modules/members/service.ts`
  (z. B. `birthDate: canPrivate ? … : ""`).
- Reichweite beachten (`CLUB`, `DEPARTMENT`, `OWN`).
- **Datensparsamkeit:** Wird das Feld wirklich gebraucht? Reicht ein gröberer Wert (Jahrgang statt Geburtsdatum, gekürzte IP
  wie `truncateIp` in `src/server/security/request.ts`)?

## C. Datenexport – `src/server/privacy/export.ts` (`buildUserDataExport`)
- Jedes Datum **über die anfragende Person** gehört in den Export – mit **deutschem Schlüssel** (`telefon`, `geburtsdatum`, …),
  Zeitpunkte über `iso()`, reine Kalendertage über `day()`.
- Neue Tabellen mit `memberId`/`userId`: eigenes Unterobjekt pro Verein (Muster: `inClub(rows, clubId)`), `take: LIMIT`.
- **Nie** hinein: Daten anderer Personen (Mitanmeldungen, andere Helfer, Namen in Protokolltexten, Objekt-IDs aus dem Audit),
  Geheimnisse (Hash, Token, TOTP-Secret, IBAN im Klartext nur, wenn es die eigene ist – im Zweifel maskiert/letzte 4 Stellen).
- Bei nicht abwärtskompatibler Strukturänderung `EXPORT_VERSION` erhöhen und in der Antwort erwähnen.
- Freitext, den die Person selbst geschrieben hat (Notiz, Meldung), gehört hinein; Freitext von Dritten **über** die Person
  (interne Notizen) wird im Projekt bisher mit exportiert – `interneNotizen` – an diesem Muster orientieren.

## D. Anonymisierung – `src/server/privacy/anonymize.ts` (`anonymizeMemberData`)
Wird von Aufbewahrung (Papierkorb, Ausgetretene) **und** Löschantrag genutzt.
- Neues Feld an `Member` mit Personenbezug → im `tx.member.update({ data: … })` auf `null` (oder neutralen Wert) setzen.
- Neue Tabelle mit `memberId`:
  - reine Zugehörigkeit/Personenbezug ohne statistischen Wert → `tx.<modell>.deleteMany({ where: { clubId, memberId } })`
  - Statistik soll erhalten bleiben (wie Schichten, Teilnahmen) → Datensatz behalten, **Freitexte** auf `null`
    (Muster: `eventParticipant`/`shiftAssignment` → `note: null`).
  - Dateien → Dokumente in den Papierkorb (`deletedAt: now`), der Aufbewahrungsjob entfernt sie.
- Immer mit `clubId` filtern, alles in der übergebenen Transaktion `tx`, **wiederholbar** (idempotent) bleiben.
- Audit: Einträge zum Objekt selbst werden geleert; Namen in anderen Texten schwärzt `scrubNamesInAudit` – **aber nur den vollen
  Namen „Vorname Nachname“**. Schreibt das neue Feature andere Identifikatoren in `summary` (E-Mail, Spitzname, Mitgliedsnummer),
  werden sie NICHT geschwärzt → Befund.

## E. Kontolöschung – `src/server/privacy/deletion.ts` (`executeDeletionRequest`)
- Neue Tabelle mit `userId` (plattformweit, nicht nur Member): Wird sie mit `tx.user.delete` per `onDelete: Cascade` entfernt?
  Im Schema prüfen. Falls `SetNull`/`Restrict` oder kein Fremdschlüssel: explizit löschen oder lösen (Muster: `supportTicket`
  → `deleteMany` für `createdById`, `updateMany` für Bearbeiter-Verweise).
- Freitexte der Person in vereinsübergreifenden Tabellen mitlöschen.
- Alles bleibt in **einer** Transaktion; Test „schlägt die Ausführung fehl, bleibt alles unverändert“ muss weiter gelten.

## F. Änderungsprotokoll – `src/server/audit/audit.ts` und Services
- Kontakt- und sensible Felder in die Maskierungsliste des Services, z. B. `MASKED_AUDIT_FIELDS` in
  `src/modules/members/service.ts` → im Protokoll steht nur `{ changed: true }`.
- Geheimnisse werden automatisch maskiert, **wenn der Feldname** `password|passwort|token|secret|hash|cookie` enthält.
  Heißt ein Geheimnis anders (`iban`, `pin`, `apiKey`), greift das NICHT → explizit maskieren oder `SECRET_KEY` erweitern.
- `summary` möglichst ohne Personendaten außer dem Namen (siehe D).
- Jede neue Aktion braucht ein deutsches Label in `src/lib/audit-labels.ts` (Test erzwingt das).

## G. Aufbewahrung – `src/server/jobs/retention.ts`, `src/lib/club-settings.ts`, Job `cleanup`
- Jede neue Datenart braucht eine Antwort auf „Wann ist sie weg?“:
  - hängt am Mitglied → über Anonymisierung (D) abgedeckt,
  - eigenständig (Tickets, Benachrichtigungen, Tokens) → eigene Frist im Retention- oder Cleanup-Job, idempotent, in Batches,
  - vereinsspezifisch einstellbar → `RetentionSettings` + `DEFAULT_RETENTION` + Grenzen + Einstellungsformular.
- Soft-Delete (`deletedAt`) ohne spätere endgültige Entfernung ist eine Lücke.

## H. Geheimnisse
- Tokens nur als **SHA-256-Hash** speichern (Muster: Sitzungen), Klartext nur einmal an den Nutzer.
- Umkehrbar benötigte Geheimnisse (TOTP, künftig IBAN) **verschlüsselt** mit Schlüssel aus `APP_SECRET` (Feldname mit `Enc`).
- Nie in Export, Audit, Log, Mail, URL-Parameter.

## I. Logs und Fehler
- Unerwartete Fehler nur über `logUnexpectedError` (`src/server/log.ts`) – keine Payloads, Query-Argumente oder E-Mail-Adressen.
- Keine neuen `console.log` mit Personendaten. `AppError`-Meldungen an den Nutzer ohne Daten Dritter.

## J. Einwilligungen – `src/lib/privacy.ts`, `src/modules/privacy/consents.ts`
- Neue freiwillige Verarbeitung (Fotos, Newsletter, Weitergabe) → eigene Einwilligungsart; Änderungen als **neues Ereignis**
  speichern (Nachweis), nie überschreiben.
- Selbst verwaltbar? → in `SELF_SERVICE_CONSENTS` aufnehmen (Datei ist absichtlich serverfrei).
- Minderjährige: Hinweis auf Einwilligung der Erziehungsberechtigten.

## K. Mails, Benachrichtigungen, Suche, CSV-Export
- `src/server/mail/templates.ts`: nur nötige Daten in Mails (kein Geburtsdatum, keine Notizen).
- Benachrichtigungen: Texte ohne sensible Daten; Löschfristen gelten (gelesen 90, ungelesen 180 Tage).
- Suche (`src/modules/search`): liefert neue Felder nur Berechtigten.
- CSV-Export (`src/modules/members/export.ts`): Spalten nur mit passendem Recht; Export wird protokolliert (Anzahl/Spalten, keine
  Inhalte). CSV-Import (`import.ts`) ebenfalls anpassen, wenn das Feld importierbar sein soll.

## L. Tests – `tests/integration/privacy.test.ts` (und Bereichstests)
Fehlt einer dieser Tests für das neue Datum, ist das mindestens 🟠:
- Export enthält das eigene Datum („enthält alle eigenen Daten …“).
- Export enthält es **nicht** für andere Personen / keine Geheimnisse („enthält NICHTS über andere Personen …“).
- Nach Löschung/Anonymisierung ist das Datum weg bzw. `null` („anonymisiert die Mitgliedsdaten in allen Vereinen …“).
- Bereichstest mit **zwei Vereinen** (Mandantentrennung) und mit Rolle ohne Recht (Sichtbarkeit).
- Maskierung im Protokoll (`tests/unit/audit-diff.test.ts` als Vorbild).

## M. Dokumentation – `docs/PRIVACY.md`
- Tabelle „Welche Daten, wozu“: neue Datenart mit Zweck, üblicher Rechtsgrundlage (Prüfung durch den Verein), Sichtbarkeit.
- Tabelle „Aufbewahrung und automatische Löschung“: neue Frist.
- Datenexport-Aufzählung unter „Betroffenenrechte“, falls neue Kategorie.
- Grundsätzlich neue Regel (z. B. Sperrung statt Löschung) → neue ADR in `docs/adr/`.

## N. Sonderfall Finanzen (Roadmap)
Sobald Finanzdaten dazukommen, gelten zusätzlich (siehe `docs/ROADMAP.md`, „Finanzen – Entwurf“):
- **Aufbewahrungspflicht geht vor Löschung:** Buchungsbelege i. d. R. 10 Jahre. Anonymisierung/Löschantrag dürfen sie nicht
  entfernen, sondern müssen **sperren** bis Fristende (Art. 17 Abs. 3 lit. b DSGVO). Anonymisierung, die Buchungen blind leert,
  ist 🔴.
- IBAN verschlüsselt (H), Gegenbuchung statt Änderung, Abschlusssperre per Trigger.
- Eigene Rechte `finance:read|manage|export`, Aktionen `finance.*` im Protokoll mit Label.
