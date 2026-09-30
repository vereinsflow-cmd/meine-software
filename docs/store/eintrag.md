# Store-Eintrag – Texte für die Google Play Console

Alle Texte für den Eintrag von **VereinsFlow** in Google Play, zum Kopieren. Sie richten sich an Vereine und ihre Mitglieder und sprechen deshalb mit „Sie“; die Hinweise drumherum sind für dich. Stand: 30.09.2026. Inhaltlich gedeckt ist alles durch die [README](../../README.md) (Funktionsumfang), [PRIVACY.md](../PRIVACY.md) und den Code – **nichts** bewirbt Funktionen, die es nicht gibt (Finanzen, Zwei-Faktor-Anmeldung, öffentliche Veranstaltungsseite und Offline-Betrieb fehlen bewusst in den Texten).

Wo die Angaben in der Konsole stehen: **App auswählen → „Mehr Nutzer gewinnen“ → „App-Präsenz im Play Store“ → „Store-Haupteintrag“** (Name, Beschreibungen, Grafiken) bzw. **„Play Store-Einstellungen“** (Kategorie, Kontaktdaten). So nennt Google die Menüpunkte in seiner deutschen Hilfe (Stand 30.09.2026); die Namen ändern sich von Zeit zu Zeit – im Zweifel oben in das Suchfeld der Konsole „Store-Eintrag“ eingeben. Standardsprache der App: **Deutsch (Deutschland)** – Google legt beim Anlegen „Englisch (USA)“ vor, das musst du umstellen (Schritt 3 in der [README](README.md)).

## Übersicht

| Feld                       | Wert                                                                                                                                  | Zeichen | Grenze                               |
| -------------------------- | ------------------------------------------------------------------------------------------------------------------------------------- | ------: | ------------------------------------ |
| App-Name                   | VereinsFlow                                                                                                                           |      11 | 30                                   |
| Kurzbeschreibung           | siehe unten                                                                                                                           |      78 | 80                                   |
| Vollständige Beschreibung  | siehe unten                                                                                                                           |    2394 | 4000                                 |
| Neuerungen (Version 1.0.0) | siehe unten                                                                                                                           |     298 | 500 je Sprache                       |
| Kategorie                  | Geschäftlich (Business)                                                                                                               |       – | –                                    |
| Kontakt-E-Mail             | kontakt@vereins-flow.com                                                                                                              |       – | Pflicht                              |
| Website                    | https://vereins-flow.com                                                                                                              |       – | empfohlen                            |
| Datenschutzerklärung       | `https://app.vereins-flow.com/datenschutzerklaerung` – **noch nicht verwendbar, siehe [unten](#datenschutzerklärung--offener-punkt)** |       – | Pflicht                              |
| Konto löschen (Web)        | `https://app.vereins-flow.com/konto-loeschen`                                                                                         |       – | Pflicht (Formular „Datensicherheit“) |

Gezählt sind Unicode-Zeichen einschließlich Leerzeichen und Zeilenumbrüchen, so wie die Konsole zählt (Skript: `[...text].length`).

## App-Name

```text
VereinsFlow
```

11 von 30 Zeichen. Das ist der Markenname und heißt auch das App-Symbol auf dem Handy (`launcherName` in `android/twa-manifest.json`).

**Alternative für die Suche:** `VereinsFlow: Vereinsverwaltung` (30 Zeichen, genau an der Grenze). Ein Zusatz wie „Vereinsverwaltung“ macht die App in der Play-Suche besser auffindbar, kann aber Erwartungen wecken, die die App nicht erfüllt: Sie ist **geschlossen** – ohne Einladung eines Vereins kommt niemand hinein, und Vereine legt der Betreiber an. Erst recht keine Werbewörter („beste“, „Nr. 1“, „kostenlos“) und keine Emojis im Namen – das verbietet die Richtlinie zu Metadaten. Empfehlung: bei `VereinsFlow` bleiben.

## Kurzbeschreibung (höchstens 80 Zeichen)

```text
Termine, Helferschichten und Nachrichten Ihres Vereins – Zugang per Einladung.
```

78 von 80 Zeichen. Der Zusatz „Zugang per Einladung“ ist Absicht: Er verhindert enttäuschte Bewertungen von Menschen, die sich selbst registrieren wollen (eine Registrierung gibt es nicht).

Alternative ohne Hinweis auf die Einladung: `Termine, Helferschichten, Nachrichten und Aufgaben Ihres Vereins in einer App.` (78 Zeichen).

## Vollständige Beschreibung (höchstens 4000 Zeichen)

Reiner Text: Absätze und die Aufzählungspunkte „•“ bleiben in der Konsole erhalten. Bewusst ohne Emojis und ohne Formatierungs-Tags, damit die Darstellung überall gleich aussieht.

```text
VereinsFlow bringt Vereinsarbeit in Fluss: Termine, Helferschichten, Nachrichten und Aufgaben Ihres Vereins – immer griffbereit auf dem Smartphone.

WICHTIG: Der Zugang erfolgt ausschließlich per Einladung Ihres Vereins. Eine eigene Registrierung in der App ist nicht möglich. Vereine, die VereinsFlow nutzen möchten, finden Informationen unter vereins-flow.com.

DAS KÖNNEN SIE MIT DER APP

• Termine im Blick
Veranstaltungen und Kalender in Monats-, Wochen-, Tages- und Listenansicht. Zusagen und Absagen mit wenigen Tipps, Warteliste bei begrenzten Plätzen, persönliches Kalender-Abo (iCal) für Ihren Handykalender.

• Helferschichten
Freie Schichten sehen und sich eintragen – mit Schutz vor Überbuchung und Doppelbelegung. Ampelanzeige für besetzte und offene Plätze, Erinnerungen vor dem Einsatz und Übersicht der geleisteten Stunden.

• Nachrichten wie im Gruppenchat
Ein Chat je Gruppe: ganzer Verein, Abteilung, Veranstaltung oder Helferteam. Ankündigungen von Vorstand, Verwaltung und Abteilungsleitung, Lesestatus für Absender.

• Aufgaben und Checklisten
Wer kümmert sich um was und bis wann? Zuständige, Fristen und Prioritäten auf einen Blick.

• Mitglieder und Abteilungen
Für berechtigte Personen: Mitgliederliste mit Suche, Abteilungen und Gruppen, Telefonnummern zum Anrufen per Tipp.

• Dokumente
Satzung, Protokolle und Formulare an einem Ort – mit Zugriffsstufen je Dokument.

• Benachrichtigungen
Auf Wunsch als Push-Nachricht aufs Handy, je Gerät im Profil ein- und ausschaltbar. Die Meldungen enthalten keine Namen und keine Nachrichtentexte.

• Hilfe & Support
Ansprechpartner Ihres Vereins, Bedienungsanleitung passend zur Rolle und Problem melden.

RECHTE UND DATENSCHUTZ

• Rollen und Rechte: Jede und jeder sieht nur, was die eigene Rolle erlaubt – Vereinsadmin, Vorstand, Abteilungsleitung, Helfer oder Mitglied.
• Vereine sind strikt voneinander getrennt.
• DSGVO-Funktionen in der App: Datenexport, Einwilligungen verwalten und das eigene Konto löschen (mit Bedenkzeit).
• Keine Werbung, kein Tracking, keine Analysedienste.
• Verschlüsselte Übertragung (HTTPS).

HINWEISE

• Die App ist die mobile Ansicht von VereinsFlow. Für die Nutzung ist eine Internetverbindung nötig; ohne Netz zeigt die App bewusst keine Vereinsdaten an.
• Die App ist kostenlos. Verträge und Preise für Vereine gibt es nicht in der App.
• Fragen und Anregungen: kontakt@vereins-flow.com
```

**2394 von 4000 Zeichen.** Was die Beschreibung ausdrücklich **nicht** verspricht: Finanzen und Beiträge (es gibt nur eine Platzhalterseite und die Ablage von Rechnungen), Zwei-Faktor-Anmeldung, eine öffentliche Veranstaltungsseite, Virenscan, Nutzung ohne Internet. Sobald eines davon gebaut ist, darf es hinein – und die Erklärungen unter „App-Inhalte“ müssen dann neu geprüft werden (siehe [app-inhalte.md](app-inhalte.md)).

Zwei Sätze, die du bewusst entscheiden solltest:

- „Vereine, die VereinsFlow nutzen möchten, finden Informationen unter vereins-flow.com.“ – ein Hinweis auf die Website des Herstellers, wie ihn jeder Store-Eintrag hat. Es stehen weder Preise noch Kauflinks im Eintrag oder in der App; die Vertragsanbahnung läuft über die Website und ist nicht Teil der App – VereinsFlow verkauft in der App nichts, Play Billing wird nicht gebraucht. Wer ganz sicher gehen will, streicht den Satz.
- „Hosting“ oder „Server in Deutschland“ steht **nicht** im Text, weil der Server noch nicht gemietet ist. Steht der Standort fest (und ist ein Auftragsverarbeitungsvertrag mit dem Anbieter geschlossen), ist ein Satz wie „Betrieb auf Servern in Deutschland“ ein gutes Verkaufsargument für Vereine.

## Neuerungen für Version 1.0.0 (höchstens 500 Zeichen je Sprache)

```text
Erste Veröffentlichung von VereinsFlow für Android: Termine und Kalender, Helferschichten mit Schutz vor Überbuchung, Nachrichten als Gruppenchat, Aufgaben, Mitglieder und Dokumente. Push-Benachrichtigungen lassen sich im Profil je Gerät einschalten. Der Zugang erfolgt per Einladung Ihres Vereins.
```

298 von 500 Zeichen. Dieselbe Angabe passt für die Testversionen (interner und geschlossener Test); die Konsole fragt sie bei jedem Release ab. Bei späteren Versionen genügt ein Satz, z. B. „Kleine Verbesserungen und Fehlerbehebungen.“ – Änderungen an der Web-Oberfläche brauchen gar keine neue Store-Version (siehe [README](README.md), Schritt 13).

## Kategorie, Tags, Kontakt

- **Kategorie:** **Geschäftlich** (Business). Verwaltung eines Vereins ist Organisationsarbeit; „Produktivität“ passt als zweite Wahl. **Nicht** „Finanzen“ (löst zusätzliche Prüfungen aus, obwohl es keine Finanzfunktion gibt) und nicht „Soziale Netzwerke“ (dort gelten strengere Vorgaben zum Kinderschutz, siehe [app-inhalte.md](app-inhalte.md#5-nutzergenerierte-inhalte-und-kinderschutz-richtlinie)).
- **Tags:** Die Konsole bietet je nach Kategorie eine feste Liste an. Wähle, was zu Terminplanung, Zusammenarbeit und Organisation passt; die Auswahl beeinflusst nur die Auffindbarkeit.
- **Kontakt-E-Mail:** `kontakt@vereins-flow.com` (Pflicht, im Store-Eintrag öffentlich sichtbar; das Postfach muss bei IONOS eingerichtet sein und regelmäßig gelesen werden – Google und Nutzer schreiben dorthin).
- **Website:** `https://vereins-flow.com`.
- **Telefon:** freiwillig. Die Nummer im Impressum der Website müsste nicht im Store stehen; lass das Feld leer, wenn du keine Anrufe von Fremden möchtest.
- **Entwicklername** (öffentlich, beim Anlegen des Kontos): Google erlaubt einen Namen, der vom Klarnamen abweicht. Vorschlag: **VereinsFlow**. Welche weiteren Angaben öffentlich erscheinen, zeigt die Konsole unter „Entwicklerprofil“ – dort vor der Veröffentlichung nachsehen (siehe [README](README.md), Schritt 1).

## Grafiken

Alle Dateien liegen in [`grafiken/`](grafiken/) und erfüllen die Vorgaben der Konsole (geprüft am 30.09.2026 gegen die Hilfeseiten von Google).

| Feld in der Konsole                                    | Datei                                                                                                     | Format                                             |
| ------------------------------------------------------ | --------------------------------------------------------------------------------------------------------- | -------------------------------------------------- |
| App-Symbol                                             | [`grafiken/icon-512.png`](grafiken/icon-512.png)                                                          | 512 × 512, 32-Bit-PNG, vollflächiges Quadrat, 9 KB |
| Feature-Grafik                                         | [`grafiken/feature-grafik-1024x500.png`](grafiken/feature-grafik-1024x500.png)                            | 1024 × 500, 24-Bit-PNG ohne Alpha, 172 KB          |
| Screenshots (Telefon), in dieser Reihenfolge hochladen | [`grafiken/screenshots/01-dashboard.png`](grafiken/screenshots/01-dashboard.png) bis `08-datenschutz.png` | je 1080 × 1920, 24-Bit-PNG ohne Alpha, 119–166 KB  |

Die Screenshots zeigen die echte App mit den Demo-Daten des „TSV Musterstadt 1898 e.V.“ (deutsche Oberfläche, hell, ohne Rahmen und Einblendungen; Namen der Demo-Personen sind gewöhnlich gewählt):

| Nr. | Datei                     | Zeigt                                                                          | Warum                              |
| --: | ------------------------- | ------------------------------------------------------------------------------ | ---------------------------------- |
|   1 | `01-dashboard.png`        | Dashboard „Termine & Helfer“: kommende Veranstaltungen mit Datumskacheln       | Überblick auf einen Blick          |
|   2 | `02-helferplan.png`       | Helferplan zum Sommerfest: „Voll besetzt“, „Mein Einsatz“, eingetragene Helfer | Kern des Produkts: Helferschichten |
|   3 | `03-kalender.png`         | Kalender mit Ansicht Monat / Woche / Tag / Liste                               | Termine                            |
|   4 | `04-nachrichten.png`      | Gruppenchat „Alle Mitglieder“ mit gelesen-Häkchen                              | Kommunikation im Verein            |
|   5 | `05-mitglieder.png`       | Mitgliederliste mit Status                                                     | Verwaltung (für Berechtigte)       |
|   6 | `06-aufgaben.png`         | Aufgaben mit Reitern, Priorität und Fristen                                    | Aufgaben                           |
|   7 | `07-offene-schichten.png` | Offene Schichten mit Ampelbalken und Knopf „Eintragen“                         | Eintragen mit einem Tipp           |
|   8 | `08-datenschutz.png`      | „Meine Daten herunterladen“ und „Konto und Daten löschen“                      | Datenschutz (DSGVO) in der App     |

Google verlangt mindestens **zwei** Screenshots je unterstütztem Gerätetyp und erlaubt bis zu **acht**; ab **vier** Screenshots mit mindestens 1080 Pixeln kommt die App für Empfehlungen in Frage. Vorhanden sind acht Telefon-Screenshots. Tablet-Screenshots (7 und 10 Zoll) und ein Video sind freiwillig – die App läuft auf Tablets, die Konsole weist dann nur auf fehlende Großbild-Screenshots hin. Wie die Bilder entstanden sind und wie man sie neu erzeugt: [README](README.md#screenshots-neu-erzeugen).

**Symbol:** Nicht `public/app-icon-512.png`, sondern die vollflächige Fassung `public/app-icon-maskable-512.png` (byte-gleich als `icon-512.png` abgelegt). Google verlangt „Full square“ ohne eigene Rundung und ohne Schatten, weil die Konsole die Ecken (30 % Radius) und einen Schatten selbst anlegt; `app-icon-512.png` hat abgerundete, durchsichtige Ecken und würde doppelt gerundet aussehen. Die Kreise liegen weit genug innen, die Maske schneidet nichts ab.

## Datenschutzerklärung – offener Punkt

**Das ist die größte offene Frage vor der Einreichung.** Google verlangt eine Datenschutzerklärung, die

- unter einer öffentlichen, dauerhaft erreichbaren Adresse steht (keine PDF-Datei, ohne Anmeldung, aus keinem Land gesperrt),
- **in der App selbst** verlinkt ist,
- den im Store-Eintrag genannten Entwickler nennt (oder die App „VereinsFlow“ ausdrücklich nennt),
- beschreibt, welche personenbezogenen Daten erhoben werden, mit wem sie geteilt werden, wie sie geschützt werden und **wie lange sie gespeichert und wie sie gelöscht werden**,

und zu den Angaben im Formular „Datensicherheit“ ([datensicherheit.md](datensicherheit.md)) passt.

**Was es heute gibt:**

| Adresse                                              | Was das ist                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    | Reicht für Google?                                                                                                                 |
| ---------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------- |
| `https://app.vereins-flow.com/datenschutzerklaerung` | Die Seite in der Anwendung (`src/app/(legal)/datenschutzerklaerung/page.tsx`), verlinkt von der Anmeldung, der Einladung und dem Menüpunkt „Datenschutz“. **Eine Vorlage für den Verein mit Platzhaltern:** oben der Kasten „Platzhalter – vor dem Produktivbetrieb ausfüllen“, im Text u. a. „[Name und Anschrift des Vereins …]“, „[Name des Plattformbetreibers]“, „[Auftragsverarbeitungsvertrag abschließen]“, „[Aufbewahrungsfrist]“, „[zuständige Behörde eintragen]“. Sie ist aus Sicht **eines** Vereins geschrieben („Verantwortlich ist der Verein, dem Sie angehören“), nicht aus Sicht des Betreibers, der viele Vereine bedient. | **Nein.** Mit Platzhaltern und ohne Nennung des Entwicklers riskiert man Ablehnung oder spätere Sperrung.                          |
| `https://vereins-flow.com/datenschutz.html`          | Ausgefüllte Erklärung der **Website** (VereinsFlow GbR, IONOS, LDI NRW, Stand 26.09.2026). Sie sagt ausdrücklich: „Diese Erklärung gilt für die Website von VereinsFlow.“                                                                                                                                                                                                                                                                                                                                                                                                                                                                      | **Nein, so nicht:** Sie beschreibt Anmeldung, Sitzungen, Mitglieder-, Helfer- und Chatdaten, Push und Kontolöschung der App nicht. |

**Was zu tun ist (Entscheidung und Rechtsprüfung beim Betreiber – nicht beim Autor dieser Datei):**

1. **Eine** Erklärung für die Plattform „VereinsFlow“ schreiben lassen, die der Betreiber als Entwickler verantwortet – und klären, wer wofür Verantwortlicher ist: In der Regel ist der **Verein** Verantwortlicher für Mitgliedsdaten und die VereinsFlow GbR **Auftragsverarbeiter** ([PRIVACY.md](../PRIVACY.md#rollen)); für Konto- und Anmeldedaten sowie Server-Protokolle kann die GbR selbst Verantwortliche sein. Das gehört in den Auftragsverarbeitungsvertrag und in die Erklärung.
2. Die Seite `/datenschutzerklaerung` der Produktivinstallation entsprechend ausfüllen (und `/impressum`, ebenfalls Platzhalter). Es gibt dafür **keine Oberfläche**: Die Texte stehen im Code und werden mit einer neuen Version ausgeliefert. Damit erfüllt dieselbe Adresse beide Vorgaben – Link in der App **und** Adresse in der Konsole.
3. Mindestens ergänzen (Abgleich mit der tatsächlichen Verarbeitung, [PRIVACY.md](../PRIVACY.md#welche-daten-wozu)): Nachrichten und Chatinhalte, Dokumente, Aufgaben, Sitzungen (Gerät, gekürzte IP-Adresse), Kalender-Abo-Links, Hosting-Anbieter und E-Mail-Versand (Empfänger), Push-Dienste von Google, Apple und Mozilla, Speicherfristen (Tabelle „Aufbewahrung“ in PRIVACY.md), Kontolöschung mit Bedenkzeit 14 Tage, Datensicherungen, Aufsichtsbehörde (LDI NRW, wie auf der Website).
4. Erst danach die Adresse in der Konsole eintragen: „App-Inhalte → Datenschutzerklärung“.

Für den **internen Test** (Schritt 4 der [README](README.md)) verlangt Google noch keine fertige Erklärung – **für den geschlossenen Test und die Produktion muss sie fertig sein.**
