# Roadmap

Stand nach der ersten großen Ausbaustufe. Reihenfolge = Empfehlung; jeder Punkt lässt sich einzeln umsetzen, weil die Fachdienste vom
Web-Rahmen getrennt sind (siehe [ARCHITECTURE.md](ARCHITECTURE.md#erweiterbarkeit)).

## Zuerst empfohlen

| Vorhaben                            | Warum                                                                        | Schon vorbereitet                                                                |
| ----------------------------------- | ---------------------------------------------------------------------------- | -------------------------------------------------------------------------------- |
| **Zwei-Faktor-Anmeldung (TOTP)**    | Erhöht den Schutz von Administrator-Konten deutlich                          | Felder `totpSecretEnc`, `totpEnabledAt`; Profil-Abschnitt; Datenexport kennt sie |
| **Öffentliche Veranstaltungsseite** | „Öffentlich“-Veranstaltungen sollen auf der Vereins-Webseite verlinkbar sein | `Event.visibility = PUBLIC`; Kalender-Export je Termin                           |
| **Virenscan für Uploads**           | Vereine nehmen Dateien von Dritten an (Bewerbungen, Formulare)               | `registerUploadScanner(...)` in `src/server/storage/scan.ts`                     |
| **Finanzen** (siehe unten)          | Beiträge und Kasse sind der nächste große Verwaltungsaufwand                 | Nav-Eintrag, Platzhalterseite, Rechte- und Protokoll-Grundlagen                  |

## Weitere Vorhaben

- **Nachrichten planen:** Versand zu einem späteren Zeitpunkt (`MessageStatus.SCHEDULED` existiert; es fehlt der Job und die Auswahl im Formular).
- **Dokumentordner:** Das Modell `DocumentFolder` besteht; die Oberfläche nutzt bisher Kategorien.
- **E-Mail-Adresse ändern** mit Bestätigung (Token-Typ `EMAIL_CHANGE` besteht).
- **Eigene Rollen** in der Oberfläche definieren (das Datenmodell trennt Rollen und Rechte bereits je Verein; die Oberfläche zeigt bisher die Standardrollen und lässt Benutzer ihnen zuordnen).
- **Helferschichten:** Schicht-Vorlagen und wiederkehrende Schichten, Tausch zwischen Helfern, Warteliste je Schicht, Jahresbericht Helferstunden.
- **Push-Benachrichtigungen:** Web-Push (VAPID, Service Worker) zusätzlich zu Benachrichtigungscenter und E-Mail. `Notification` bleibt die
  einzige Quelle; ein Versandkanal mehr, nicht ein zweites System.
- **Mobile Apps:** Die Fachdienste kennen weder Next.js noch HTML. Ein versionierter API-Zugang mit Token-Anmeldung (Persönliche Zugriffstoken bzw. OAuth-Geräteablauf) würde
  denselben `TenantContext` aufbauen – Rechte, Mandantentrennung und Protokoll gelten dadurch unverändert. Ohne diesen Zugang keine App.
- **Mehrsprachigkeit:** Die Oberfläche ist Deutsch (Zeichenketten stehen im Code). Für weitere Sprachen müssen sie in Sprachdateien wandern.
- **Barrierefreiheit von Hand prüfen:** ein Durchgang mit Screenreader (NVDA, VoiceOver) und ausschließlich mit der Tastatur. Die automatische Prüfung (axe, WCAG 2.1 A/AA) läuft bereits in den E2E-Tests (`tests/e2e/a11y.spec.ts`), findet aber nur einen Teil der Probleme.
- **Beobachtbarkeit:** strukturierte Protokolle, Metriken (Anfragen, Jobdauer, Warteschlangen), Fehlerberichte.
- **Vereinsdaten-Export** (Umzug zu einem anderen Anbieter, Kündigung) als vollständiger, maschinenlesbarer Export je Verein.
- **Zeilensicherheit (Row-Level-Security)** in PostgreSQL als vierte Schicht der Mandantentrennung (siehe [ADR-0002](adr/0002-mandantentrennung.md)).
- **Datensicherung in der Anwendung** (geplante Sicherung mit Verschlüsselung), sofern der Betreiber das nicht extern löst.

## Finanzen – Entwurf

Ziel: Mitgliedsbeiträge, Kassenbuch und Spendenbescheinigungen, mandantenfähig und revisionssicher. **Noch nicht umgesetzt**; dieser Entwurf hält
die Entscheidungen fest, damit die Vorbereitung (Rechte, Datenmodell) später nicht neu erfunden wird.

### Grundregeln

- **Geld = ganze Cent** (`Int`/`BigInt`), Währung EUR, nie Fließkommazahlen. Steuersätze und Rundung sind explizit.
- **Nur hinzufügen, nicht ändern:** Buchungen werden nicht überschrieben, sondern durch **Gegenbuchung** (Storno) korrigiert. Ein
  Abschluss (Monat/Jahr) sperrt den Zeitraum per Datenbank-Trigger – wie beim Änderungsprotokoll.
- **Mandantenbezogen** wie alles andere: `clubId`, zusammengesetzte Fremdschlüssel, Eintrag in `MODEL_SCOPE`.
- **Eigene Rechte** (`finance:read`, `finance:manage`, `finance:export`) statt `club:update` – so kann der Kassenwart ohne Vereinsadministrator arbeiten.
- **Alles protokolliert** (`finance.*`-Aktionen im Änderungsprotokoll); Bankdaten (IBAN) **verschlüsselt** gespeichert (Schlüssel aus `APP_SECRET`, dasselbe Verfahren wie für Zwei-Faktor-Geheimnisse).
- **Aufbewahrungspflichten gehen vor Löschung:** Buchungsbelege müssen (in Deutschland i. d. R. 10 Jahre) aufbewahrt werden. Ein Löschantrag führt dann zur
  **Sperrung** der betroffenen Finanzdaten bis zum Fristende statt zur Löschung (Art. 17 Abs. 3 lit. b DSGVO); die Anonymisierung muss das berücksichtigen.

### Modelle (Vorschlag)

| Modell            | Inhalt                                                                                                                                 |
| ----------------- | -------------------------------------------------------------------------------------------------------------------------------------- |
| `FeeType`         | Beitragsart: Name, Betrag (Cent), Intervall (einmalig, monatlich, vierteljährlich, jährlich), optional Abteilung, Altersbereich, aktiv |
| `MemberFee`       | Zuordnung Mitglied ↔ Beitragsart mit Gültigkeitszeitraum, abweichendem Betrag und Begründung (Ermäßigung)                              |
| `Charge`          | Forderung: Mitglied, Beitragsart, Zeitraum, Betrag, Fälligkeit, Status (offen, bezahlt, storniert, ausgebucht), Nummer                 |
| `Payment`         | Zahlungseingang: Betrag, Datum, Weg (Überweisung, Lastschrift, bar), Verwendungszweck, Zuordnung zu Forderungen                        |
| `SepaMandate`     | Lastschriftmandat: Mandatsreferenz, Unterschriftsdatum, IBAN (verschlüsselt), Status                                                   |
| `LedgerAccount`   | Kostenstelle/Konto: Art (Einnahme/Ausgabe), optional Abteilung oder Veranstaltung                                                      |
| `LedgerEntry`     | Buchung: Datum, Betrag, Konto, Text, Gegenpartei, Beleg (`Document`), Bezug zu Veranstaltung/Abteilung, Stornoverweis, gesperrt bis    |
| `DonationReceipt` | Zuwendungsbestätigung: Spender, Betrag, Datum, Nummer, Art                                                                             |

Beiträge nach Abteilung und Altersgruppe ergeben sich aus den vorhandenen Daten (Abteilungszugehörigkeit, Geburtsdatum am Berliner Tag). Der
Beitragslauf wird ein Job (`fees`) unter Job-Sperre und mit Idempotenz-Schlüssel (Mitglied + Beitragsart + Zeitraum) – ein doppelter Lauf erzeugt keine doppelten Forderungen.

### Umsetzungsschritte

1. Rechte, Modelle, Migration (Trigger für Abschlusssperre und Stornoregel), `MODEL_SCOPE`, Audit-Labels.
2. Beitragsarten und Zuordnung; Beitragslauf mit Vorschau (wie beim CSV-Import: erst zeigen, dann ausführen).
3. Zahlungseingang erfassen und zuordnen; offene Posten; Erinnerungsschreiben (Vorlage, per Nachricht/E-Mail).
4. Kassenbuch mit Belegen (vorhandene Dokumentenablage, neue Zugriffsstufe „Nur Finanzen“).
5. SEPA-Lastschriftdatei (pain.008) und CSV/DATEV-Export; Jahresübersicht je Abteilung/Veranstaltung.
6. Zuwendungsbestätigungen als PDF.
7. Tests wie bei den Schichten: Mandantentrennung, parallele Buchungen, Abschlusssperre, Rundung, Aufbewahrung vs. Löschantrag.

## Bekannte Grenzen (Stand heute)

- Kein Finanzmodul, keine Zwei-Faktor-Anmeldung, keine öffentliche Veranstaltungsseite, kein Virenscan – siehe oben.
- Das Docker-Image ist nicht in einer Docker-Umgebung gestartet worden (siehe [OPERATIONS.md](OPERATIONS.md)).
- Die Oberfläche ist nur Deutsch; Zeiten stets in `Europe/Berlin` (auch für Vereine in anderen Zeitzonen).
- Die Barrierefreiheit ist beim Bau berücksichtigt (Beschriftungen, Tastatur, Fokus, Fehlertexte, Farbe nie als einziger Hinweis) und wird automatisch mit axe
  geprüft (WCAG 2.1 A/AA, hell und dunkel, keine Verstöße auf den Hauptseiten). Ein Durchgang mit Screenreader und reiner Tastaturbedienung ist **nicht** erfolgt.
- E-Mails (Text und schlichtes HTML) gibt es nur auf Deutsch.
- Suche ist eine einfache Teilstring-Suche (kein Volltextindex); bei sehr großen Datenbeständen wäre ein Index (`pg_trgm`) sinnvoll.
