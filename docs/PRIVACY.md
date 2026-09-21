# Datenschutz (DSGVO)

VereinsFlow verarbeitet personenbezogene Daten von Vereinsmitgliedern. Dieses Dokument beschreibt, **welche** Daten das sind, **wie lange**
sie gespeichert werden und **welche Funktionen** die Betroffenenrechte umsetzen. Es ist eine technische Beschreibung und **keine
Rechtsberatung**; die rechtliche Bewertung (Rechtsgrundlagen, Datenschutzbeauftragter, Verarbeitungsverzeichnis) liegt beim Verein.

## Rollen

- **Verantwortlicher** ist der jeweilige **Verein** (Mandant).
- Der **Betreiber der Plattform** verarbeitet die Daten im Auftrag des Vereins – dafür ist ein
  **Auftragsverarbeitungsvertrag** (Art. 28 DSGVO) nötig. Betreibt ein Verein VereinsFlow selbst, entfällt das.

## Welche Daten, wozu

| Datenart                                 | Zweck                                                                | Übliche Rechtsgrundlage (Prüfung durch den Verein) | Sichtbar für                                                                            |
| ---------------------------------------- | -------------------------------------------------------------------- | -------------------------------------------------- | --------------------------------------------------------------------------------------- |
| Stammdaten (Name, Anschrift, Kontakt)    | Mitgliederverwaltung                                                 | Art. 6 Abs. 1 lit. b (Mitgliedschaft)              | Nach Recht: Verein, eigene Abteilung, nur eigene Daten                                  |
| Geburtsdatum                             | Altersgrenzen (Jugend, Mindestalter bei Schichten), Geburtstagsliste | lit. b / lit. f                                    | Nur mit Recht „private Daten“ (Vorstand, Abteilungsleiter für eigene Abteilung)         |
| Interne Notizen, Funktion                | Vereinsorganisation                                                  | lit. f                                             | Nur Berechtigte (Recht „private Daten“); für die Person selbst im Datenexport enthalten |
| Teilnahme, Helferschichten, Stunden      | Organisation und Nachweis von Einsätzen                              | lit. b / lit. f                                    | Veranstalter, Betroffene                                                                |
| Konto (E-Mail, Passwort-Hash)            | Anmeldung                                                            | lit. b / lit. f                                    | Nur die Person selbst (Hash: niemand)                                                   |
| Sitzungen (Gerät, gekürzte IP)           | Sicherheit, Übersicht eigener Anmeldungen                            | lit. f                                             | Nur die Person selbst                                                                   |
| Änderungsprotokoll (Akteur, gekürzte IP) | Nachvollziehbarkeit, Sicherheit                                      | lit. f                                             | Berechtigte (Recht „Protokoll lesen“)                                                   |
| Einwilligungen (Newsletter, Fotos, …)    | Nachweis freiwilliger Zustimmung                                     | Art. 6 Abs. 1 lit. a                               | Berechtigte; die Person selbst für Newsletter/Foto                                      |
| Nachrichten, Benachrichtigungen          | Kommunikation                                                        | lit. b / lit. f                                    | Absender, Empfänger                                                                     |
| Meldungen an die Vereinsverwaltung       | Beantwortung von Fragen und Störungen                                | lit. b / lit. f                                    | Meldende Person, Vereinsverwaltung (`club:update`)                                      |
| Dokumente                                | Vereinsunterlagen                                                    | lit. f                                             | Nach Zugriffsstufe                                                                      |

**Nicht erhoben:** keine besonderen Kategorien (Art. 9) als eigene Felder, kein Tracking, keine Analyse- oder Werbedienste, keine
Einbindung externer Inhalte (Schriften, Karten, Skripte). Die Anwendung lädt nichts von Drittanbietern nach.

**Minderjährige:** Für Kinder und Jugendliche ist üblicherweise die Einwilligung der Erziehungsberechtigten nötig. VereinsFlow bildet das
über Einwilligungen ab (Nachweis mit Zeitpunkt und Quelle); die Einholung selbst organisiert der Verein.

## Betroffenenrechte – was die Anwendung bietet

Alle Funktionen finden Angemeldete unter **„Datenschutz“** (Menü „Persönlich“).

| Recht                                          | Umsetzung                                                                                                                                                                                                                                                                                                                                                                 |
| ---------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Auskunft und Übertragbarkeit** (Art. 15, 20) | **Datenexport** als JSON: alle eigenen Daten je Verein (Konto, Stammdaten, Einwilligungen, Anmeldungen, Schichten, Aufgaben, Benachrichtigungen, Meldungen an die Vereinsverwaltung, Kalender-Abos, Sitzungen, eigene Protokoll­aktionen). Enthält **nichts über andere Personen** und keine Geheimnisse (Passwort-Hash, Token). Mit Rate-Limit, nie zwischengespeichert. |
| **Berichtigung** (Art. 16)                     | Profil bearbeiten; Berechtigte pflegen Stammdaten                                                                                                                                                                                                                                                                                                                         |
| **Löschung** (Art. 17)                         | **Löschantrag** mit Passwort-Bestätigung und **14 Tagen Bedenkzeit** (jederzeit zurückziehbar). Danach: Konto und Sitzungen werden gelöscht, verknüpfte Mitgliedsdatensätze **anonymisiert**, Namen im Änderungsprotokoll **geschwärzt**. Nicht möglich, wenn die Person **letzter Administrator** ihres Vereins ist – dann zuerst Verantwortung übergeben.               |
| **Einwilligung widerrufen** (Art. 7)           | Newsletter und Fotoveröffentlichung selbst in „Datenschutz“; jede Änderung wird als neues Ereignis gespeichert (Nachweis bleibt)                                                                                                                                                                                                                                          |
| **Einschränkung, Widerspruch** (Art. 18, 21)   | Mitglied sperren (Status „gesperrt“) bzw. Löschantrag; im Einzelfall über den Verein                                                                                                                                                                                                                                                                                      |

**Anonymisierung** heißt: Der Datensatz bleibt als leere Hülle („Gelöschtes Mitglied“) bestehen, damit Statistiken (Helferstunden,
Teilnehmerzahlen vergangener Veranstaltungen) und Verweise heil bleiben – aber Name, Kontakt, Adresse, Geburtsdatum, Notizen,
Einwilligungen, Gruppen- und Abteilungszugehörigkeiten und Dokumente der Person sind entfernt bzw. im Papierkorb. Die Umsetzung
(`src/server/privacy/`) läuft in einer Transaktion und ist mehrfach ausführbar.

## Aufbewahrung und automatische Löschung

Der Aufbewahrungsjob (`retention`) läuft mit den **Fristen des jeweiligen Vereins** (Vereinseinstellungen). Vorgaben und Grenzen:

| Daten                                                                                          | Vorgabe                             | Einstellbar          | Wirkung                      |
| ---------------------------------------------------------------------------------------------- | ----------------------------------- | -------------------- | ---------------------------- |
| Mitglieder im **Papierkorb**                                                                   | 30 Tage                             | 7 – 365 Tage         | anonymisiert                 |
| **Ausgetretene** Mitglieder                                                                    | 24 Monate                           | 0 (nie) – 120 Monate | anonymisiert                 |
| **Änderungsprotokoll**                                                                         | 36 Monate                           | 6 – 120 Monate       | Einträge gelöscht            |
| Gelöschte **Dokumente**                                                                        | 30 Tage                             | fest                 | Datei und Datensatz entfernt |
| Erledigte **Meldungen** an die Vereinsverwaltung (Hilfe & Support)                             | 12 Monate nach der letzten Änderung | fest                 | gelöscht                     |
| Benachrichtigungen                                                                             | gelesen 90, ungelesen 180 Tage      | fest                 | gelöscht                     |
| Abgelaufene oder lange inaktive Sitzungen, Rate-Limit-Zähler, benutzte/abgelaufene Reset-Token | mit Ablauf (Token: nach 7 Tagen)    | fest                 | gelöscht                     |
| Widerrufene Kalender-Abo-Links                                                                 | 30 Tage                             | fest                 | gelöscht                     |

Gesetzliche Aufbewahrungspflichten (z. B. steuerrechtlich für Beitragsbelege, sobald das Finanzmodul kommt) gehen vor und sind
vom Verein zu beachten. Die Vorgaben oben sind **Voreinstellungen**, keine Rechtsempfehlung – der Verein legt sie fest.

## Cookie-Konzept

- **Ein Cookie:** das technisch notwendige **Sitzungs-Cookie** (`vf_session`, in Produktion `__Host-vf_session`) mit zufälliger Kennung. `HttpOnly`,
  `SameSite=Lax`, `Secure` in Produktion. Es enthält keine Personendaten und dient nicht dem Tracking.
- **Lokale Speicherung:** der Browser merkt sich die gewählte Darstellung (hell/dunkel) – nur auf dem Gerät, ohne Personenbezug.
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
