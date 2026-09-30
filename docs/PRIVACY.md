# Datenschutz (DSGVO)

VereinsFlow verarbeitet personenbezogene Daten von Vereinsmitgliedern. Dieses Dokument beschreibt, **welche** Daten das sind, **wie lange**
sie gespeichert werden und **welche Funktionen** die Betroffenenrechte umsetzen. Es ist eine technische Beschreibung und **keine
Rechtsberatung**; die rechtliche Bewertung (Rechtsgrundlagen, Datenschutzbeauftragter, Verarbeitungsverzeichnis) liegt beim Verein.

## Rollen

- **Verantwortlicher** ist der jeweilige **Verein** (Mandant).
- Der **Betreiber der Plattform** verarbeitet die Daten im Auftrag des Vereins – dafür ist ein
  **Auftragsverarbeitungsvertrag** (Art. 28 DSGVO) nötig. Betreibt ein Verein VereinsFlow selbst, entfällt das.

## Welche Daten, wozu

| Datenart                                                                           | Zweck                                                                        | Übliche Rechtsgrundlage (Prüfung durch den Verein) | Sichtbar für                                                                                      |
| ---------------------------------------------------------------------------------- | ---------------------------------------------------------------------------- | -------------------------------------------------- | ------------------------------------------------------------------------------------------------- |
| Stammdaten (Name, Anschrift, Kontakt)                                              | Mitgliederverwaltung                                                         | Art. 6 Abs. 1 lit. b (Mitgliedschaft)              | Nach Recht: Verein, eigene Abteilung, nur eigene Daten                                            |
| Geburtsdatum                                                                       | Altersgrenzen (Jugend, Mindestalter bei Schichten), Geburtstagsliste         | lit. b / lit. f                                    | Nur mit Recht „private Daten“ (Vorstand, Abteilungsleiter für eigene Abteilung)                   |
| Interne Notizen, Funktion                                                          | Vereinsorganisation                                                          | lit. f                                             | Nur Berechtigte (Recht „private Daten“); für die Person selbst im Datenexport enthalten           |
| Teilnahme, Helferschichten, Stunden                                                | Organisation und Nachweis von Einsätzen                                      | lit. b / lit. f                                    | Veranstalter, Betroffene                                                                          |
| Konto (E-Mail, Passwort-Hash)                                                      | Anmeldung                                                                    | lit. b / lit. f                                    | Nur die Person selbst (Hash: niemand)                                                             |
| Sitzungen (Gerät, gekürzte IP)                                                     | Sicherheit, Übersicht eigener Anmeldungen                                    | lit. f                                             | Nur die Person selbst                                                                             |
| Änderungsprotokoll (Akteur, gekürzte IP)                                           | Nachvollziehbarkeit, Sicherheit                                              | lit. f                                             | Berechtigte (Recht „Protokoll lesen“)                                                             |
| Einwilligungen (Newsletter, Fotos, …)                                              | Nachweis freiwilliger Zustimmung                                             | Art. 6 Abs. 1 lit. a                               | Berechtigte; die Person selbst für Newsletter/Foto                                                |
| Nachrichten, Benachrichtigungen                                                    | Kommunikation                                                                | lit. b / lit. f                                    | Absender, Empfänger                                                                               |
| Push-Geräte (Adresse und Schlüssel des Abos, Gerätebezeichnung, letzte Zustellung) | Push-Benachrichtigungen auf dem Gerät, nur nach Einschalten durch die Person | Art. 6 Abs. 1 lit. a, § 25 Abs. 1 TDDDG            | Nur die Person selbst; der Server sendet damit (Adresse und Schlüssel nie in Export oder Anzeige) |
| Meldungen an die Vereinsverwaltung                                                 | Beantwortung von Fragen und Störungen                                        | lit. b / lit. f                                    | Meldende Person, Vereinsverwaltung (`club:update`)                                                |
| Dokumente                                                                          | Vereinsunterlagen                                                            | lit. f                                             | Nach Zugriffsstufe                                                                                |
| Vereinslogo                                                                        | Erkennbarkeit des Vereins in der Anwendung (keine Personendaten)             | lit. f                                             | Alle aktiven Mitglieder des Vereins                                                               |

**Nicht erhoben:** keine besonderen Kategorien (Art. 9) als eigene Felder, kein Tracking, keine Analyse- oder Werbedienste, keine
Einbindung externer Inhalte (Schriften, Karten, Skripte). Die Anwendung lädt nichts von Drittanbietern nach.

**Minderjährige:** Für Kinder und Jugendliche ist üblicherweise die Einwilligung der Erziehungsberechtigten nötig. VereinsFlow bildet das
über Einwilligungen ab (Nachweis mit Zeitpunkt und Quelle); die Einholung selbst organisiert der Verein.

## Betroffenenrechte – was die Anwendung bietet

Alle Funktionen finden Angemeldete unter **„Datenschutz“** (Menü „Persönlich“). Wie die Löschung abläuft, erklärt zusätzlich eine
öffentliche Seite ohne Anmeldung: **`/konto-loeschen`** (siehe [Kontolöschung](#kontolöschung)).

| Recht                                          | Umsetzung                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| ---------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Auskunft und Übertragbarkeit** (Art. 15, 20) | **Datenexport** als JSON: alle eigenen Daten je Verein (Konto, Stammdaten, Einwilligungen, Anmeldungen, Schichten, Aufgaben, Benachrichtigungen, selbst geschriebene Nachrichten, Meldungen an die Vereinsverwaltung, Kalender-Abos, Sitzungen, Push-Geräte (nur Bezeichnung und Zeitpunkte), eigene Protokoll­aktionen). Enthält **nichts über andere Personen** und keine Geheimnisse (Passwort-Hash, Token). Mit Rate-Limit, nie zwischengespeichert.                                                                                                                                                                                            |
| **Berichtigung** (Art. 16)                     | Profil bearbeiten; Berechtigte pflegen Stammdaten                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| **Löschung** (Art. 17)                         | **Löschantrag** mit Passwort-Bestätigung und **14 Tagen Bedenkzeit** (jederzeit zurückziehbar). Danach: Konto und Sitzungen werden gelöscht, verknüpfte Mitgliedsdatensätze **anonymisiert**, Namen im Änderungsprotokoll **geschwärzt**. Eigene Entwürfe werden gelöscht; gesendete Nachrichten in Gruppen bleiben für die Empfänger lesbar, aber ohne Absender („Früheres Mitglied“) – wie in einer WhatsApp-Gruppe. Wer das nicht möchte, ruft seine Nachrichten vorher zurück. Nicht möglich, wenn die Person **letzter Administrator** ihres Vereins ist – dann zuerst Verantwortung übergeben. Im Einzelnen: [Kontolöschung](#kontolöschung). |
| **Einwilligung widerrufen** (Art. 7)           | Newsletter und Fotoveröffentlichung selbst in „Datenschutz“; jede Änderung wird als neues Ereignis gespeichert (Nachweis bleibt)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| **Einschränkung, Widerspruch** (Art. 18, 21)   | Mitglied sperren (Status „gesperrt“) bzw. Löschantrag; im Einzelfall über den Verein                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                |

**Anonymisierung** heißt: Der Datensatz bleibt als leere Hülle („Gelöschtes Mitglied“) bestehen, damit Statistiken (Helferstunden,
Teilnehmerzahlen vergangener Veranstaltungen) und Verweise heil bleiben – aber Name, Kontakt, Adresse, Geburtsdatum, Notizen,
Einwilligungen, Gruppen- und Abteilungszugehörigkeiten und Dokumente der Person sind entfernt bzw. im Papierkorb. Die Umsetzung
(`src/server/privacy/`) läuft in einer Transaktion und ist mehrfach ausführbar.

## Kontolöschung

Was mit einem Löschantrag geschieht, beschreibt für Betroffene auch die **öffentliche Seite `/konto-loeschen`** – ohne Anmeldung
erreichbar, verlinkt von der Anmeldung, den Rechtstexten (Fußzeile, Datenschutzerklärung „Ihre Rechte“) und von „Datenschutz“ in der
Anwendung. Google Play verlangt eine solche Seite für Apps mit Benutzerkonten; ihre Adresse steht in der Play Console (siehe
[OPERATIONS.md](OPERATIONS.md#app-ansicht-android-app-und-iphone)). Sie nennt App und Entwickler („VereinsFlow“), die Schritte in der App
und im Browser, die Bedenkzeit samt Zurückziehen, was gelöscht wird und was aus welchem Grund bleibt, und was ohne Zugang zu tun ist:
Passwort zurücksetzen, sonst an den Verein wenden – und, nur wenn `SUPPORT_EMAIL` gesetzt ist, an den Support des Betreibers. Die Seite
gibt genau die Umsetzung in `src/server/privacy/deletion.ts` und `anonymize.ts` wieder (Fristen aus denselben Konstanten). **Ändert sich
dort etwas, muss `src/app/(legal)/konto-loeschen/page.tsx` mit** – und diese Tabelle:

| Daten                                                                                                                                        | Bei Ausführung des Antrags (nach 14 Tagen)                                                                                                                                                                 | Warum                                                                                                                              |
| -------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------- |
| Konto: Name, E-Mail-Adresse, Passwort-Hash, Sitzungen, Reset- und Bestätigungs-Token                                                         | gelöscht                                                                                                                                                                                                   | –                                                                                                                                  |
| Mitgliedschaften (Zugang und Rolle je Verein) samt Benachrichtigungen und Kalender-Abo-Links; Push-Geräte; offene Einladungen an die Adresse | gelöscht                                                                                                                                                                                                   | –                                                                                                                                  |
| Mit dem Konto verknüpfte Mitgliedsdatensätze – in **allen** Vereinen der Person                                                              | **anonymisiert:** Name, Mitgliedsnummer, Kontakt, Anschrift, Geburtsdatum, Funktion und Notizen entfernt; Einwilligungen, Abteilungen, Gruppen gelöscht; Anmerkungen bei Zu-/Absagen und Schichten geleert | Die leere Hülle mit Ein-/Austrittsdatum, Teilnahmen, Schichten samt Stunden und Zuständigkeiten hält Statistiken und Verweise heil |
| Dokumente zum Mitgliedsdatensatz (z. B. Aufnahmeantrag)                                                                                      | Papierkorb, nach 30 Tagen samt Datei entfernt                                                                                                                                                              | –                                                                                                                                  |
| Eigene Meldungen an die Vereinsverwaltung                                                                                                    | gelöscht; als Bearbeiter eingetragene Verweise auf das Konto gelöst                                                                                                                                        | freie Texte, möglicher Personenbezug                                                                                               |
| Nachrichten                                                                                                                                  | Entwürfe gelöscht; gesendete bleiben ohne Absender („Früheres Mitglied“); zurückgerufene sieht niemand mehr, sie bleiben aber ohne Absender gespeichert                                                    | für die Empfänger lesbar wie in einer WhatsApp-Gruppe; wer das nicht will, ruft vorher zurück                                      |
| Vom Konto angelegte Inhalte des Vereins (Veranstaltungen, Aufgaben, Dokumente)                                                               | bleiben                                                                                                                                                                                                    | gehören dem Verein                                                                                                                 |
| Rechnungen                                                                                                                                   | bleiben; Verweise „erfasst von“ und „bezahlt markiert von“ gelöst                                                                                                                                          | gesetzliche Aufbewahrungspflichten                                                                                                 |
| Änderungsprotokoll                                                                                                                           | Namen geschwärzt („Gelöschtes Mitglied“); Einträge bleiben bis zur Frist des Vereins (Vorgabe 36 Monate)                                                                                                   | Nachvollziehbarkeit und Sicherheit                                                                                                 |
| Der Löschantrag selbst                                                                                                                       | bleibt: Zeitpunkte, Ergebnis und ein freiwillig angegebener Grund – ohne Name und E-Mail-Adresse                                                                                                           | Nachweis, dass und wann gelöscht wurde                                                                                             |
| Datensicherungen                                                                                                                             | bis zum Ablauf der jeweiligen Sicherung                                                                                                                                                                    | liegen außerhalb der Anwendung (siehe [OPERATIONS.md](OPERATIONS.md#datensicherung))                                               |

Die Verantwortlichen des Datenschutzes (Recht `privacy:manage`) werden über den Antrag benachrichtigt und sehen ihn in „Datenschutz“, müssen
aber nichts tun. **Ohne Anmeldung** (Passwort und E-Mail-Zugang verloren, oder „Kein aktiver Verein“, weil die Mitgliedschaft gesperrt oder
der Verein deaktiviert ist) gibt es keinen Selbstbedienungsweg: Der Verein kann den Zugang entziehen und den Mitgliedsdatensatz löschen
(Papierkorb, danach anonymisiert) – das Konto selbst bleibt dann aber bestehen. Ein Werkzeug, mit dem der Betreiber ein Konto auf eine
Anfrage über `SUPPORT_EMAIL` hin löscht, gibt es noch nicht (siehe [ROADMAP.md](ROADMAP.md#weitere-vorhaben)).

## Aufbewahrung und automatische Löschung

Der Aufbewahrungsjob (`retention`) läuft mit den **Fristen des jeweiligen Vereins** (Vereinseinstellungen). Vorgaben und Grenzen:

| Daten                                                                                          | Vorgabe                             | Einstellbar          | Wirkung                      |
| ---------------------------------------------------------------------------------------------- | ----------------------------------- | -------------------- | ---------------------------- |
| Mitglieder im **Papierkorb**                                                                   | 30 Tage                             | 7 – 365 Tage         | anonymisiert                 |
| **Ausgetretene** Mitglieder                                                                    | 24 Monate                           | 0 (nie) – 120 Monate | anonymisiert                 |
| **Änderungsprotokoll**                                                                         | 36 Monate                           | 6 – 120 Monate       | Einträge gelöscht            |
| Gelöschte **Dokumente**                                                                        | 30 Tage                             | fest                 | Datei und Datensatz entfernt |
| Ersetztes oder entferntes **Vereinslogo**                                                      | sofort                              | fest                 | Datei gelöscht               |
| Erledigte **Meldungen** an die Vereinsverwaltung (Hilfe & Support)                             | 12 Monate nach der letzten Änderung | fest                 | gelöscht                     |
| Benachrichtigungen                                                                             | gelesen 90, ungelesen 180 Tage      | fest                 | gelöscht                     |
| Abgelaufene oder lange inaktive Sitzungen, Rate-Limit-Zähler, benutzte/abgelaufene Reset-Token | mit Ablauf (Token: nach 7 Tagen)    | fest                 | gelöscht                     |
| Widerrufene Kalender-Abo-Links                                                                 | 30 Tage                             | fest                 | gelöscht                     |
| **Push-Geräte** mit fehlgeschlagener Zustellung und ohne Erfolg seit 30 Tagen                  | 30 Tage                             | fest                 | gelöscht                     |

Gesetzliche Aufbewahrungspflichten (z. B. steuerrechtlich für Rechnungen und Beitragsbelege, i. d. R. 10 Jahre) gehen vor und sind
vom Verein zu beachten: Rechnungen sind Dokumente und landen beim Löschen wie diese im Papierkorb (nach 30 Tagen entfernt) – der Verein
sollte sie deshalb archivieren statt löschen. Löscht jemand sein Konto, bleiben die Rechnungen des Vereins erhalten; nur die Verweise
„erfasst von“ und „bezahlt markiert von“ werden gelöst. Die Vorgaben oben sind **Voreinstellungen**, keine Rechtsempfehlung – der Verein legt sie fest.

## Cookie-Konzept

- **Ein Cookie:** das technisch notwendige **Sitzungs-Cookie** (`vf_session`, in Produktion `__Host-vf_session`) mit zufälliger Kennung. `HttpOnly`,
  `SameSite=Lax`, `Secure` in Produktion. Es enthält keine Personendaten und dient nicht dem Tracking.
- **Lokale Speicherung:** der Browser merkt sich die gewählte Darstellung (hell/dunkel) – nur auf dem Gerät, ohne Personenbezug.
- **App-Ansicht (Service Worker):** Er legt auf dem Gerät nur die statische Offline-Seite ab – **keine** Seiten, Vereins- oder Personendaten,
  auch nicht in der Android-App oder auf dem Home-Bildschirm. Ohne Verbindung ist deshalb nichts zu sehen; ein verlorenes Gerät enthält
  nach dem Abmelden nichts Lesbares aus VereinsFlow. Die vorbereitete Erkennung der Android-App (`src/lib/app-mode.ts`) merkt sich im
  Sitzungsspeicher des Tabs höchstens den Wert „android-app“ (ohne Personenbezug, endet mit dem Tab).
- **Push-Benachrichtigungen (Web Push):** freiwillig und standardmäßig aus; sie werden erst nach einem Klick der Person im Profil (und
  der Erlaubnis im Browser) für **dieses Gerät** eingeschaltet – Einwilligung nach Art. 6 Abs. 1 lit. a DSGVO, § 25 Abs. 1 TDDDG. Gespeichert wird
  je Gerät ein Abo (Adresse beim Push-Dienst des Browser-Herstellers, zwei Schlüssel, kurze Gerätebezeichnung aus dem User-Agent, Zeitpunkt
  der letzten Zustellung, Zähler der Fehlversuche). Die Adresse ist ein Geheimnis: Sie wird nie protokolliert, nie ausgeliefert und nur zum
  Senden benutzt; Server und Push-Dienst nehmen nur Adressen der bekannten Dienste an (Google/FCM, Apple, Mozilla, Microsoft). **Inhalt:** Die
  Meldung enthält keine Namen, Personendaten oder Nachrichtentexte, nur einen festen, allgemeinen Satz je Art der Benachrichtigung („Neue
  Nachricht“) und den internen Link (`src/modules/notifications/push-payload.ts`, per Test abgesichert); sie ist nach dem Standard Web Push
  Ende-zu-Ende verschlüsselt, der Hersteller sieht nur Zeit und Empfängergerät. **Ende:** Ausschalten im Profil, Abmelden von diesem Gerät,
  Kontolöschung, Fehlermeldung „Gerät abgemeldet“ des Push-Dienstes (404/410) und die automatische Bereinigung nach 30 Tagen ohne Erfolg
  löschen das Abo. Die Datenschutzerklärung (Punkt 3) nennt das für die Nutzer.
- **Keine Drittanbieter:** keine Analyse, keine Werbung, keine eingebetteten Inhalte. Damit ist **kein Einwilligungsbanner** erforderlich
  (§ 25 Abs. 2 Nr. 2 TDDDG: unbedingt erforderlich für den ausdrücklich gewünschten Dienst).
- Bindet ein Verein später Dienste Dritter ein, ist die Einwilligungsfrage neu zu bewerten.

## Technische und organisatorische Maßnahmen (Art. 32)

Ausführlich in [SECURITY.md](SECURITY.md). Kurzfassung: Mandantentrennung (Kontext, gefilterter Datenbank-Client, zusammengesetzte
Fremdschlüssel), Rollen- und Abteilungsrechte, Argon2id-Passwörter, Sitzungs-Timeout, Rate-Limits, unveränderliches
Änderungsprotokoll, gekürzte IP-Adressen, sichere Uploads, Verschlüsselung der Übertragung (HTTPS/HSTS in Produktion), Datensparsamkeit
durch automatische Löschung. **Vom Betreiber zu verantworten:** Verschlüsselung der Datenträger, Datensicherung, Zugriffskontrolle
auf Server und Datenbank, Aktualisierungen (siehe [OPERATIONS.md](OPERATIONS.md)).

## Checkliste für Vereine (Hinweise, keine Rechtsberatung)

1. **Impressum und Datenschutzerklärung** ausfüllen – die Seiten `/impressum` und `/datenschutzerklaerung` enthalten Platzhalter in eckigen Klammern.
2. **Verarbeitungsverzeichnis** (Art. 30) anlegen; die Tabelle „Welche Daten, wozu“ dient als Grundlage.
3. **Auftragsverarbeitungsvertrag** mit dem Betreiber und dem Hosting-/Mail-Anbieter abschließen.
4. Prüfen, ob ein **Datenschutzbeauftragter** zu benennen ist (Schwellenwerte im BDSG), und die zuständige **Aufsichtsbehörde** in die Erklärung eintragen.
5. **Aufbewahrungsfristen** in den Vereinseinstellungen an die eigenen Vorgaben anpassen.
6. **Einwilligungen** (Foto, Newsletter, Minderjährige) einholen und in VereinsFlow festhalten.
7. **Mitarbeitende und Ehrenamtliche** auf das Datengeheimnis verpflichten und Rollen sparsam vergeben („so wenig Rechte wie nötig“).
8. Ablauf für **Datenpannen** (Meldung binnen 72 Stunden, Art. 33) festlegen.
