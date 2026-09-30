# Roadmap

Stand nach der ersten großen Ausbaustufe. Reihenfolge = Empfehlung; jeder Punkt lässt sich einzeln umsetzen, weil die Fachdienste vom
Web-Rahmen getrennt sind (siehe [ARCHITECTURE.md](ARCHITECTURE.md#erweiterbarkeit)).

## Zuerst empfohlen

| Vorhaben                            | Warum                                                                        | Schon vorbereitet                                                                                                  |
| ----------------------------------- | ---------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------ |
| **Zwei-Faktor-Anmeldung (TOTP)**    | Erhöht den Schutz von Administrator-Konten deutlich                          | Felder `totpSecretEnc`, `totpEnabledAt`; Profil-Abschnitt; Datenexport kennt sie                                   |
| **Öffentliche Veranstaltungsseite** | „Öffentlich“-Veranstaltungen sollen auf der Vereins-Webseite verlinkbar sein | `Event.visibility = PUBLIC`; Kalender-Export je Termin                                                             |
| **Virenscan für Uploads**           | Vereine nehmen Dateien von Dritten an (Bewerbungen, Formulare)               | `registerUploadScanner(...)` in `src/server/storage/scan.ts`                                                       |
| **Finanzen** (siehe unten)          | Beiträge und Kasse sind der nächste große Verwaltungsaufwand                 | Rechte `finance:read`/`finance:manage`, Rechnungen mit offenen Zahlungen (27.09.2026), Protokollbereich „Finanzen“ |

## Weitere Vorhaben

- **Nachrichten planen:** Versand zu einem späteren Zeitpunkt (`MessageStatus.SCHEDULED` existiert; es fehlt der Job und die Auswahl im Formular).
- **Dokumentordner:** Das Modell `DocumentFolder` besteht; die Oberfläche nutzt bisher Kategorien.
- **E-Mail-Adresse ändern** mit Bestätigung (Token-Typ `EMAIL_CHANGE` besteht).
- **Löschanfragen ohne Anmeldung:** Wer sich nicht mehr anmelden kann, schreibt an `SUPPORT_EMAIL` (so steht es auf `/konto-loeschen`). Es
  fehlt ein Werkzeug für den Betreiber – etwa `npm run account:delete -- --email …` wie `admin:create` –, das daraufhin einen regulären
  Löschantrag anlegt (Bedenkzeit, E-Mail an die Adresse, Prüfung auf den letzten Administrator) und so dieselbe Löschung auslöst.
- **Eigene Rollen** in der Oberfläche definieren (das Datenmodell trennt Rollen und Rechte bereits je Verein; die Oberfläche zeigt bisher die Standardrollen und lässt Benutzer ihnen zuordnen).
- **Helferschichten:** Schicht-Vorlagen und wiederkehrende Schichten, Tausch zwischen Helfern, Warteliste je Schicht, Jahresbericht Helferstunden.
- **App für Android und iPhone** (entschieden, in drei Stufen): Die App ist die Web-Anwendung selbst – kein zweiter Programmstand, keine
  eigene Schnittstelle. Rechte, Mandantentrennung, Sitzungsregeln und Protokoll gelten dadurch unverändert.
  1. **Installierbar und app-tauglich** – _umgesetzt (29.09.2026)_: Manifest `display: "standalone"`, sichere Bereiche (Kamera-Aussparung,
     Home-Indikator), Service Worker mit Offline-Seite (speichert keine Daten), `/.well-known/assetlinks.json` für die Android-App
     (siehe [OPERATIONS.md](OPERATIONS.md#app-ansicht-android-app-und-iphone)).
  2. **Android-App** als Trusted Web Activity (Bubblewrap, Paket `com.vereinsflow.app`), lädt `https://app.vereins-flow.com`; im Play Store.
     Die dafür verlangte öffentliche Seite zur Kontolöschung (`/konto-loeschen`, Link für die Play Console) ist _umgesetzt (30.09.2026)_
     (siehe [PRIVACY.md](PRIVACY.md#kontolöschung)).
  3. **Push-Benachrichtigungen** – _umgesetzt (30.09.2026)_: Standard-Web-Push mit VAPID (Paket `web-push`, kein Firebase) zusätzlich zu Benachrichtigungscenter und
     E-Mail. `Notification` bleibt die einzige Quelle; ein Versandkanal mehr, nicht ein zweites System. Die Nachricht enthält **keine**
     Personendaten, Namen oder Inhalte – nur einen kurzen, allgemeinen Text und den internen Pfad (sie erscheint auf dem Sperrbildschirm und
     läuft über den Push-Dienst des Browser-Herstellers). Auf dem iPhone ab iOS 16.4 für die Web-App auf dem Home-Bildschirm.
     Umgesetzt: Tabelle `PushSubscription` je Gerät, `Notification.pushStatus`, Job `push` (Wiederholung, Bereinigung erloschener Abos), Schalter im
     Profil, Service Worker, Format „Declarative Web Push“ (iOS 18.4+); Betrieb: [OPERATIONS.md](OPERATIONS.md#push-benachrichtigungen), Datenschutz:
     [PRIVACY.md](PRIVACY.md#cookie-konzept). Noch offen: Gruppierung/Ersetzen mehrerer Meldungen, Push-Einstellungen je Art der Benachrichtigung.

  Auf dem iPhone ist die App vorerst die Web-App auf dem Home-Bildschirm; eine eigene Hülle für den App Store folgt später. In der App gibt
  es keine Preise und keine Kauflinks. Erst für eine **native** App (eigene Oberfläche statt Web-Anwendung) bräuchte es einen versionierten
  API-Zugang mit Token-Anmeldung, der denselben `TenantContext` aufbaut.

- **Mehrsprachigkeit:** Die Oberfläche ist Deutsch (Zeichenketten stehen im Code). Für weitere Sprachen müssen sie in Sprachdateien wandern.
- **Barrierefreiheit von Hand prüfen:** ein Durchgang mit Screenreader (NVDA, VoiceOver) und ausschließlich mit der Tastatur. Die automatische Prüfung (axe, WCAG 2.1 A/AA) läuft bereits in den E2E-Tests (`tests/e2e/a11y.spec.ts`), findet aber nur einen Teil der Probleme.
- **Beobachtbarkeit:** strukturierte Protokolle, Metriken (Anfragen, Jobdauer, Warteschlangen), Fehlerberichte.
- **Vereinsdaten-Export** (Umzug zu einem anderen Anbieter, Kündigung) als vollständiger, maschinenlesbarer Export je Verein.
- **Zeilensicherheit (Row-Level-Security)** in PostgreSQL als vierte Schicht der Mandantentrennung (siehe [ADR-0002](adr/0002-mandantentrennung.md)).
- **Datensicherung in der Anwendung** (geplante Sicherung mit Verschlüsselung), sofern der Betreiber das nicht extern löst.

## Finanzen – Entwurf

Ziel: Mitgliedsbeiträge, Kassenbuch und Spendenbescheinigungen, mandantenfähig und revisionssicher. **Umgesetzt ist bisher nur der erste
Baustein:** Eingangsrechnungen (Modell `Invoice` zu einem Dokument) mit Betrag, Fälligkeit und „bezahlt“, dazu die Dashboard-Karte „Offene
Zahlungen“ (siehe [DESIGN.md](DESIGN.md#rechnungen-und-offene-zahlungen)). Der Rest dieses Entwurfs hält die Entscheidungen fest, damit sie später
nicht neu erfunden werden. Rechnungen sind dabei ausdrücklich **keine** Buchungen: Sie lassen sich ändern und auf „wieder offen“ setzen; das
Kassenbuch mit Stornoregel und Abschlusssperre kommt erst mit Schritt 4 und kann bezahlte Rechnungen als Belege übernehmen.

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

1. Rechte, Modelle, Migration (Trigger für Abschlusssperre und Stornoregel), `MODEL_SCOPE`, Audit-Labels. **Teilweise erledigt:** Rechte
   `finance:read`/`finance:manage`, Rechnungen, Protokollbereich; offen sind `finance:export` und die Buchungsmodelle.
2. Beitragsarten und Zuordnung; Beitragslauf mit Vorschau (wie beim CSV-Import: erst zeigen, dann ausführen).
3. Zahlungseingang erfassen und zuordnen; offene Posten; Erinnerungsschreiben (Vorlage, per Nachricht/E-Mail).
4. Kassenbuch mit Belegen (vorhandene Dokumentenablage, neue Zugriffsstufe „Nur Finanzen“).
5. SEPA-Lastschriftdatei (pain.008) und CSV/DATEV-Export; Jahresübersicht je Abteilung/Veranstaltung.
6. Zuwendungsbestätigungen als PDF.
7. Tests wie bei den Schichten: Mandantentrennung, parallele Buchungen, Abschlusssperre, Rundung, Aufbewahrung vs. Löschantrag.

## Bekannte Grenzen (Stand heute)

- Finanzen nur als Rechnungen mit offenen Zahlungen (keine Beiträge, kein Kassenbuch), keine Zwei-Faktor-Anmeldung, keine öffentliche Veranstaltungsseite, kein Virenscan – siehe oben.
- App: installierbar, mit Offline-Seite und Push-Benachrichtigungen (Web Push, Einrichtung durch den Betreiber nötig); die Android-App im Play Store und eine App-Store-Hülle fürs iPhone fehlen noch; ohne Verbindung zeigt die App bewusst keine Daten. Push ist je Gerät ein- oder ausgeschaltet, nicht je Art der Benachrichtigung; auf dem iPhone geht es nur für die Web-App auf dem Home-Bildschirm.
- Das Docker-Image ist nicht in einer Docker-Umgebung gestartet worden (siehe [OPERATIONS.md](OPERATIONS.md)).
- Die Oberfläche ist nur Deutsch; Zeiten stets in `Europe/Berlin` (auch für Vereine in anderen Zeitzonen).
- Die Barrierefreiheit ist beim Bau berücksichtigt (Beschriftungen, Tastatur, Fokus, Fehlertexte, Farbe nie als einziger Hinweis) und wird automatisch mit axe
  geprüft (WCAG 2.1 A/AA, hell und dunkel, keine Verstöße auf den Hauptseiten). Ein Durchgang mit Screenreader und reiner Tastaturbedienung ist **nicht** erfolgt.
- E-Mails (Text und schlichtes HTML) gibt es nur auf Deutsch.
- Suche ist eine einfache Teilstring-Suche (kein Volltextindex); bei sehr großen Datenbeständen wäre ein Index (`pg_trgm`) sinnvoll.
