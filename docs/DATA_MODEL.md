# Datenmodell

Maßgeblich ist [`prisma/schema.prisma`](../prisma/schema.prisma) (mit Erläuterungen im Kopf der Datei) und die SQL-Migrationen in
[`prisma/migrations`](../prisma/migrations), die Prüfregeln und Trigger enthalten, die sich im Schema nicht ausdrücken lassen.

## Konventionen

- **Mandant = Verein (`Club`).** Jede mandantenbezogene Tabelle trägt `clubId`. Beziehungen zwischen ihnen sind
  **zusammengesetzte Fremdschlüssel** `(clubId, id)` – die Datenbank verhindert, dass Zeilen zweier Vereine verknüpft werden.
- **Globale Tabellen** ohne `clubId`: `User`, `Session`, `VerificationToken`, `RateLimitBucket`, `DeletionRequest`, `Permission` (Katalog).
- **IDs:** UUIDv7 (zeitlich sortierbar, nicht erratbar). **Zeitpunkte:** `timestamptz`, UTC. **Kalendertage:** `@db.Date`.
- **Weiches Löschen:** `deletedAt` (Papierkorb), **Archivieren:** `archivedAt`. Endgültig entfernt bzw. anonymisiert die
  Aufbewahrungsroutine nach den Fristen des Vereins.
- Felder `…ById` ohne Fremdschlüssel sind reine Herkunftsangaben (Wer hat das angelegt?). So lässt sich ein Benutzerkonto
  datenschutzgerecht entfernen, ohne Fachdaten zu zerstören.

## Überblick

```mermaid
erDiagram
    Club ||--o{ ClubMembership : hat
    User ||--o{ ClubMembership : "ist Mitglied in"
    Role ||--o{ ClubMembership : vergibt
    Role ||--o{ RolePermission : enthaelt
    Permission ||--o{ RolePermission : "wird gewaehrt"
    Club ||--o{ Member : fuehrt
    User |o--o| Member : "Konto zu Mitglied"
    Member ||--o{ MemberDepartment : gehoert
    Department ||--o{ MemberDepartment : hat
    Department ||--o{ Group : gliedert
    Member ||--o{ GroupMember : ""
    Group ||--o{ GroupMember : ""
    Member ||--o{ Consent : erteilt
    Club ||--o{ MembershipApplication : "Beitritt per QR-Code"
    MembershipApplication }o--o| Member : "angenommen als"
    Department |o--o{ MembershipApplication : "gewuenscht"
    Club ||--o{ Event : veranstaltet
    Department |o--o{ Event : "gehoert zu"
    Event ||--o{ EventParticipant : "Zu- und Absagen"
    Member ||--o{ EventParticipant : ""
    Event ||--o{ EventAttendance : "Anwesenheit"
    Member ||--o{ EventAttendance : ""
    Event ||--o{ EventShift : plant
    EventShift ||--o{ ShiftAssignment : besetzt
    Member ||--o{ ShiftAssignment : leistet
    Event |o--o{ Task : ""
    Task }o--o| Member : "zustaendig"
    Event |o--o{ Checklist : ""
    Checklist ||--o{ ChecklistItem : ""
    Message ||--o{ MessageRecipient : "geht an"
    User ||--o{ Notification : erhaelt
    Event |o--o{ Document : "Unterlagen"
    Document ||--o| Invoice : "ist Rechnung"
    Member |o--o| Donor : "spendet als"
    Donor |o--o{ Donation : gibt
    Department |o--o{ Donation : "Zweck"
    Event |o--o{ Donation : "Zweck"
    Donation ||--o{ DonationAttachment : "Nachweise"
    Document |o--o{ DonationAttachment : ""
    Club ||--o{ AuditLog : protokolliert
```

## Modelle nach Bereich

### Plattform (ohne Verein)

| Modell              | Zweck                                                                                                                                                                                                                                                                                                                   |
| ------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `User`              | Konto: E-Mail (klein geschrieben, per CHECK), Argon2id-Hash, Plattform-Administrator-Kennzeichen, Zwei-Faktor-Anmeldung (`totpSecretEnc` verschlüsselt, `totpEnabledAt`, `totpLastStep` = zuletzt angenommener Zeitschritt – derselbe Code gilt nie zweimal, `recoveryCodeHashes` nur als Hash), Datenschutz-Zustimmung |
| `Session`           | Sitzung: `id` ist der **Hash** des Tokens; Erstellung, letzte Aktivität, Ablauf, Gerät (gekürzt), IP-Präfix                                                                                                                                                                                                             |
| `VerificationToken` | Einmal-Token für E-Mail-Bestätigung, Passwort-Reset (nur als Hash)                                                                                                                                                                                                                                                      |
| `RateLimitBucket`   | Zähler für Anmelde- und andere Begrenzungen (Rate-Limit in PostgreSQL)                                                                                                                                                                                                                                                  |
| `DeletionRequest`   | Löschantrag einer Person (Bedenkzeit, Status, Nachweis ohne Klarnamen)                                                                                                                                                                                                                                                  |
| `Permission`        | Katalog aller Rechte (wird aus dem Code gepflegt, schreibgeschützt)                                                                                                                                                                                                                                                     |

### Verein, Rollen, Benutzer

| Modell           | Zweck                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| ---------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `Club`           | Der Mandant: Name, Kennung (`slug`), Status, Einstellungen (JSON, u. a. Aufbewahrungsfristen), Kontaktdaten, Vereinslogo (`logo*`: Speicherschlüssel, Typ, Größe, Prüfsumme, Zeitpunkt), Beitrittslink (`joinToken`, `joinTokenCreatedAt`; leer = Beitritt geschlossen) mit begrenzten Plätzen (`joinLimit` 1–5000, leer = unbegrenzt; `joinUsed` = eingegangene Anträge über den aktuellen Code, abgelehnte geben ihren Platz zurück), Abschluss der Einrichtung (`setupCompletedAt`; leer = Assistent „Verein einrichten“ noch offen) |
| `Role`           | Rolle eines Vereins (Standardrollen und – vorbereitet – eigene)                                                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| `RolePermission` | Recht einer Rolle **mit Reichweite** (`CLUB`, `DEPARTMENT`, `OWN`)                                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| `ClubMembership` | Verbindet Benutzer, Verein und Rolle; Status (aktiv/gesperrt); eigene Anordnung des Dashboards (`dashboardLayout`, JSON, leer = Standard)                                                                                                                                                                                                                                                                                                                                                                                               |
| `Invitation`     | Einladung per Link (Token als Hash), höchstens eine offene je E-Mail und Verein                                                                                                                                                                                                                                                                                                                                                                                                                                                         |

### Mitglieder

| Modell                  | Zweck                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| ----------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `Member`                | Stammdaten (Name, Kontakt, Adresse, Geburtsdatum, Status, Ein-/Austritt, interne Notizen, Funktion im Verein); optional mit `User` verknüpft; `archivedAt`, `deletedAt`, `anonymizedAt`                                                                                                                                                                                                                                                                                                |
| `Department`            | Abteilung (Farbe, Beschreibung)                                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| `MemberDepartment`      | Zugehörigkeit eines Mitglieds zu einer Abteilung, mit Kennzeichen „Leitung“                                                                                                                                                                                                                                                                                                                                                                                                            |
| `Group`, `GroupMember`  | Gruppen innerhalb einer Abteilung (z. B. Mannschaften)                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| `Consent`               | Einwilligung als **Ereignisfolge** (erteilt/widerrufen, Zeitpunkt, Quelle, wer) – nie überschrieben                                                                                                                                                                                                                                                                                                                                                                                    |
| `MembershipApplication` | Beitrittsantrag über den QR-Code (ohne Konto): Name, E-Mail, Telefon, Geburtsdatum, gewünschte Abteilung, Nachricht, Zeitpunkt und Textfassung der Einwilligung (`consentAt`, `consentTextVersion` – nur für die Bearbeitung des Antrags, wird beim Annehmen nicht ans Mitglied übertragen), Stand (offen/angenommen/abgelehnt), entschieden am/von (`decidedById` ohne Fremdschlüssel), angelegtes Mitglied, gekürzte IP. Entschiedene werden nach 30, offene nach 180 Tagen gelöscht |

### Veranstaltungen und Helfer

| Modell             | Zweck                                                                                                                                                                                                                                                                                                                                                           |
| ------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `Event`            | Veranstaltung: Art, Status, Sichtbarkeit, Zeitraum, Ort, Abteilung, Teilnehmerlimit, Serien-ID                                                                                                                                                                                                                                                                  |
| `EventParticipant` | Zu-/Absage, Warteliste; Trigger sichert das Teilnehmerlimit                                                                                                                                                                                                                                                                                                     |
| `EventShift`       | Helferschicht: Zeitraum, benötigte Anzahl (1–500), Mindestalter, Treffpunkt, Verantwortliche/r, Status                                                                                                                                                                                                                                                          |
| `ShiftAssignment`  | Eintragung eines Mitglieds; Trigger sichern **Kapazität** und **Überlappungsfreiheit**; geleistete Minuten, Freigabe, Erinnerungszeitpunkt                                                                                                                                                                                                                      |
| `EventAttendance`  | Anwesenheit eines Mitglieds bei einem Termin: `status` (`PRESENT` da, `EXCUSED` entschuldigt, `ABSENT` unentschuldigt), erfasst am/von (`recordedAt`, `recordedById` ohne Fremdschlüssel, wird beim Löschen des Kontos geleert); je Termin und Mitglied genau eine Zeile; **bewusst ohne Freitext** (keine Gesundheitsdaten); entfällt mit Termin bzw. Mitglied |

### Aufgaben, Nachrichten, Dokumente, Kalender

| Modell                        | Zweck                                                                                                                                                              |
| ----------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `Task`                        | Aufgabe: Zuständige/r, Fälligkeit, Priorität, Status, Bezug zu Veranstaltung                                                                                       |
| `Checklist`, `ChecklistItem`  | Checkliste mit abhakbaren Punkten, optional einer Veranstaltung zugeordnet                                                                                         |
| `Message`, `MessageRecipient` | Nachricht (Entwurf/gesendet, Zielgruppe, Ankündigung) und ihre Empfänger mit Lesezeitpunkt                                                                         |
| `Notification`                | Benachrichtigung je Benutzer; E-Mail-Status als Warteschlange; `dedupeKey` gegen Doppelungen; Link nur auf interne Pfade (CHECK)                                   |
| `Document`                    | Dokument-Metadaten: Name, Kategorie, Typ, Größe, SHA-256, Zugriffsstufe, Bezug (höchstens **ein** Bezugsobjekt, per CHECK); die Datei liegt im Dateispeicher       |
| `DocumentFolder`              | Ordner – im Modell vorbereitet, die Oberfläche nutzt derzeit Kategorien                                                                                            |
| `Invoice`                     | Rechnung zu genau einem Dokument (Beleg): Rechnungstag, Betrag in Cent, Fälligkeit (Kalendertage), Status offen/bezahlt, bezahlt am/von; entfällt mit dem Dokument |
| `SupportTicket`               | Meldung an die Vereinsverwaltung (Hilfe & Support): Art, Überschrift, Text, Seite, gekürztes Gerät, Status, Antwort; `createdById` ohne Fremdschlüssel             |
| `CalendarFeedToken`           | Persönlicher Kalender-Abo-Link (nur Hash gespeichert, widerrufbar)                                                                                                 |

### Spenden (Finanzen)

Kassenbuch, Belege, Abschluss und Beiträge sind in [ADR-0010](adr/0010-finanzen-kassenbuch.md) bis
[ADR-0012](adr/0012-beitragslauf.md) beschrieben; die Spenden in [ADR-0013](adr/0013-spenden.md).

| Modell                        | Zweck                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                |
| ----------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `Donor`                       | Spender: ein Mitglied (`memberId`, eindeutig je Verein – Name und Anschrift kommen aus dem Mitglied) oder eine andere Person, Firma, Stiftung bzw. ein anderer Verein (`kind`, eigener `name` und Anschrift, Land als ISO-Code, leer = Deutschland). `restrictedAt`/`restrictedReason`: gesperrt (Art. 18 DSGVO) – keine neuen Spenden; ein anonymisiertes Mitglied hinterlässt hier Name und Anschrift als Momentaufnahme                                                                                                                                                                                                                                                                                                           |
| `Donation`                    | Spende (Aufzeichnung nach § 50 Abs. 7 EStDV): Art (`MONEY`, `IN_KIND`, `EXPENSE_WAIVER`), Spender **oder** Bezeichnung ohne Namen (`anonymousLabel`, Spendendose), Tag der Zuwendung, Betrag in Cent, Zahlweg des Spenders (`paymentMethod`, nur Geld), Zweck (Abteilung oder Veranstaltung, dazu optional Text), Wunsch zur Bestätigung (`receiptWish`), bei Geld die Zeile im Kassenbuch (`ledgerLineId`, eine Spende je Zeile), bei Sachspenden Bezeichnung, Herkunft, „Unterlagen liegen vor“, bei Aufwandsspenden Tätigkeit, Zeitraum, Grundlage, eingeräumt/fällig, regelmäßig und die Bestätigung des Anspruchs (`claimConfirmedAt/ById`), Storno mit Grund (nur Sach/Aufwand). Kein gespeicherter Status – er wird berechnet |
| `DonationAttachment`          | Nachweis einer Spende: Dokument (Stufe „Nur Finanzen“, Kategorie „Spendennachweise“) **oder** kurzer Vermerk; unveränderlich                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| `FinanceSettings` (Finanzamt) | Finanzamt (Ort), Steuernummer, Art und Datum des Bescheids (`exemptionKind`, `exemptionDate`), letzter Veranlagungszeitraum, begünstigte Zwecke im Genitiv (`taxPurposes`, „des Sports“) und – nur § 60a – im Akkusativ (`taxPurposesStatute`, „den Sport“), Mitgliedsbeiträge abziehbar ja/nein                                                                                                                                                                                                                                                                                                                                                                                                                                     |

Geld ist immer in ganzen Cent gespeichert; Kalendertage als `@db.Date`. Verweise innerhalb des Vereins sind zusammengesetzte
Fremdschlüssel mit `NO ACTION`: Ein Mitglied, eine Abteilung oder eine Buchungszeile mit Spenden lässt sich nicht löschen.

### Protokoll

| Modell     | Zweck                                                                                                                          |
| ---------- | ------------------------------------------------------------------------------------------------------------------------------ |
| `AuditLog` | Unveränderliches Änderungsprotokoll (Trigger): Akteur, Aktion, Objekt, Zusammenfassung, Änderungsdetails, IP-Präfix, Zeitpunkt |

## Datenbank-Prüfregeln (Auszug)

| Regel                                                                                                                                 | Umsetzung                                                                             |
| ------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------- |
| E-Mail-Adressen stets klein geschrieben; Vereinskennung nur `a-z0-9-`                                                                 | CHECK                                                                                 |
| Zwei-Faktor: zuletzt angenommener Zeitschritt leer oder ≥ 0                                                                           | CHECK (`User_totp_last_step_chk`)                                                     |
| Ende nicht vor Beginn (Veranstaltung), nach Beginn (Schicht)                                                                          | CHECK                                                                                 |
| Schicht: 1–500 Helfer, Mindestalter 0–120; geleistete Minuten 0–1440                                                                  | CHECK                                                                                 |
| Nie mehr Helfer als benötigt                                                                                                          | Trigger `shift_assignment_capacity_guard` (sperrt die Schicht)                        |
| Keine überlappenden Schichten je Mitglied                                                                                             | Trigger `shift_assignment_overlap_guard` (Advisory-Lock je Mitglied)                  |
| Teilnehmerlimit                                                                                                                       | Trigger `event_participant_capacity_guard`                                            |
| Anwesenheit: je Termin und Mitglied höchstens eine Zeile, beide aus demselben Verein                                                  | Unique (`eventId`, `memberId`), zusammengesetzte Fremdschlüssel                       |
| Änderungsprotokoll unveränderlich                                                                                                     | Trigger `audit_log_guard` (Löschen nur in der Aufbewahrungsroutine)                   |
| Höchstens eine offene Einladung je E-Mail und Verein                                                                                  | Teil-Unique-Index                                                                     |
| Benachrichtigungs-Links und Seite einer Support-Meldung nur intern (kein Open-Redirect)                                               | CHECK (`Notification_link_chk`, `SupportTicket_path_chk`)                             |
| Dokument gehört zu höchstens einem Bezugsobjekt                                                                                       | CHECK                                                                                 |
| Vereinslogo: alle Angaben oder keine; nur PNG/JPEG/WebP, 1 B – 1 MiB                                                                  | CHECK (`Club_logo_*_chk`), auch Schlüssel- und Prüfsummenformat                       |
| Rechnung: Betrag 1 Cent – 10 Mio. €; offene Rechnung immer mit Betrag                                                                 | CHECK (`Invoice_amount_chk`, `Invoice_open_amount_chk`)                               |
| Rechnung: „bezahlt am/von“ nur bei bezahlten; höchstens eine je Dokument                                                              | CHECK (`Invoice_paid_chk`), Unique (`clubId`, `documentId`)                           |
| Beitrittslink: 43 Zeichen base64url, immer mit Zeitpunkt; eindeutig                                                                   | CHECK (`Club_join_token_chk`), Unique (`joinToken`)                                   |
| Beitrittslink: Anzahl der Anmeldungen 1–5000 oder leer (unbegrenzt); genutzt ≥ 0                                                      | CHECK (`Club_join_limit_chk`, `Club_join_used_chk`)                                   |
| Beitrittsantrag: Namen 1–80 Zeichen, E-Mail klein geschrieben, Nachricht ≤ 1000 Zeichen                                               | CHECK (`MembershipApplication_name_chk`, `_email_chk`, `_text_chk`)                   |
| Beitrittsantrag: offen ⇔ nicht entschieden; Mitglied nur bei „angenommen“                                                             | CHECK (`MembershipApplication_decision_chk`)                                          |
| Beitrittsantrag: Fassung des Einwilligungstexts nie leer, höchstens 64 Zeichen                                                        | CHECK (`MembershipApplication_consent_version_chk`)                                   |
| Geldspende: genau eine geltende Einnahme der Kategorie „Spenden“; Betrag, Tag, Abteilung und Veranstaltung aus der Zeile, danach fest | Trigger `donation_before_insert`, `donation_guard`; Unique (`clubId`, `ledgerLineId`) |
| Geld hat Buchungszeile und Zahlweg, Sach-/Aufwandsspende nie; ohne Spender nur Geld mit Bezeichnung                                   | CHECK (`Donation_kind_chk`, `Donation_donor_chk`)                                     |
| Sachspende mit Bezeichnung (10–500 Zeichen) und Herkunft; Aufwandsspende: eingeräumt ≤ Beginn ≤ Ende ≤ fällig, Ende ≤ Verzicht        | CHECK (`Donation_in_kind_chk`, `Donation_waiver_chk`)                                 |
| Sach-/Aufwandsspende nicht in der Zukunft, nicht vor dem Beginn des Kassenbuchs; nur stornieren (mit Grund), nie löschen              | Trigger `donation_day_check`, `donation_guard`; CHECK (`Donation_void_chk`)           |
| Gesperrter Spender bekommt keine neuen Spenden; die Verknüpfung Spender ↔ Mitglied steht fest                                         | Trigger `donation_donor_check`, `donor_guard`                                         |
| Nachweise 10 Jahre gesperrt (längere Frist gewinnt, wenn das Dokument auch an einer Buchung hängt)                                    | Trigger `DonationAttachment_retention`, `document_finance_retain_until`               |
| Finanzamt-Angaben: Steuernummer-Form, Art und Datum gemeinsam, letzter Veranlagungszeitraum nicht nach dem Bescheid                   | CHECK (`FinanceSettings_tax_chk`)                                                     |

Interne Pfade (`Notification.linkUrl`, `SupportTicket.pagePath`) beginnen mit `/`, ihr zweites Zeichen ist weder `/` noch `\`, und
sie enthalten keine Steuerzeichen – Browser lesen `/\host` wie `//host` und entfernen Tabulator und Zeilenumbruch aus Adressen. Bis zur
Migration `20261014120200_notification_link_check_fix` ließ die Regel wegen der LIKE-Maskierung (`NOT LIKE '/\%'`) Pfade wie `/\host` durch.

Die gewünschte Abteilung eines Beitrittsantrags ist ein zusammengesetzter Fremdschlüssel mit `RESTRICT` (wie alle optionalen
Verweise): Beim Löschen der Abteilung leert der Dienst das Feld vorher (`deleteDepartment`), ein Antrag verhindert das Löschen nie.
Die E-Mail-Adresse ist bei Mitgliedern bewusst nicht eindeutig (Familien teilen Adressen); beim Annehmen eines Antrags verhindert
deshalb eine Transaktionssperre je Verein und Adresse (`lockUntilCommit`), dass zwei gleichzeitig angenommene Anträge derselben Person
zwei Mitglieder anlegen.

**Ehrungen** (runde Mitgliedsjubiläen) haben kein eigenes Modell: Sie werden bei jedem Aufruf aus `Member.joinedAt`, `leftAt` und
`status` berechnet (`src/lib/anniversaries.ts`). Die Stufen (10, 25, 40, 50, 60, 70 und 75 Jahre) sind für alle Vereine gleich.

Ein Test gleicht die Einstufung aller Modelle (`MODEL_SCOPE`) mit den echten Datenbankspalten ab – ein Modell mit `clubId`, das
nicht als mandantenbezogen geführt wird, fällt sofort auf.
