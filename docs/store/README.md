# Veröffentlichung im Google Play Store (und iPhone)

Alles, was für die Veröffentlichung der VereinsFlow-Android-App in Google Play vorbereitet ist – und die Anleitung, wie du es Schritt für Schritt in der Play Console einträgst. Übrig bleibt technisch nur noch der **HTTPS-Server** (`https://app.vereins-flow.com`). Stand: 30.09.2026. Für den Betrieb des Servers gilt [OPERATIONS.md](../OPERATIONS.md), für das Android-Projekt [android/README.md](../../android/README.md).

## Wo wir stehen

| Was            | Stand                                                                                                                                                                                                                                                     |
| -------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| App-Paket      | `~/Downloads/vereinsflow-1.0.0-1.aab` (1,1 MB, mit dem Upload-Schlüssel signiert): Paket `com.vereinsflow.app`, Version 1.0.0 (Code 1), Ziel-API 36, Mindest-API 24 (Android 7). **Nicht verändern oder verschieben.**                                    |
| Schlüssel      | Upload-Schlüssel und Server-Konfiguration in `~/VereinsFlow-Schluessel` (Sicherung im Passwortmanager!).                                                                                                                                                  |
| Texte          | [eintrag.md](eintrag.md) – Name, Kurz- und Langbeschreibung, Neuerungen, Kategorie, Kontakt                                                                                                                                                               |
| Formulare      | [datensicherheit.md](datensicherheit.md) und [app-inhalte.md](app-inhalte.md) – Antwortentwürfe für alle Erklärungen                                                                                                                                      |
| Grafiken       | [grafiken/](grafiken/) – Symbol (vollflächige Fassung, Begründung in [eintrag.md](eintrag.md#grafiken)), Feature-Grafik, acht Telefon-Screenshots                                                                                                         |
| iPhone         | [iphone.md](iphone.md) – Anleitung für Mitglieder („Zum Home-Bildschirm“, Push) und Hinweis zum späteren App Store                                                                                                                                        |
| **Noch offen** | Server mit HTTPS · **fertige Datenschutzerklärung** ([eintrag.md](eintrag.md#datenschutzerklärung--offener-punkt)) · Google-Entwicklerkonto · Demo-Verein für die Prüfer · Entscheidungen im Abschnitt [Offene Punkte](#offene-punkte-und-entscheidungen) |

## Der Weg im Überblick

Die wichtigste Erkenntnis: **Die AAB lässt sich schon vor dem Server in den internen Test hochladen.** Dabei legt Google den Signaturschlüssel der App an, dessen Fingerabdruck der Server für den Vollbild-Modus braucht (Schritt 5). Deshalb beginnt alles mit dem Konto.

| Phase                  | Schritte | Was                                                                                             | Dauer (Schätzung)                                                   |
| ---------------------- | -------- | ----------------------------------------------------------------------------------------------- | ------------------------------------------------------------------- |
| A – jetzt, ohne Server | 1–7      | Konto, App anlegen, interner Test, Fingerabdruck holen, Erklärungen und Store-Eintrag ausfüllen | wenige Stunden Arbeit + Wartezeit der Identitätsprüfung (Tage)      |
| B – Server             | 8–9      | Server mit HTTPS starten, Demo-Verein und Zugänge für die Prüfer                                | bei dir                                                             |
| C – geschlossener Test | 10       | mindestens 12 Tester, **14 Tage in Folge**                                                      | 14 Tage ab dem Zeitpunkt, an dem 12 Tester dabei sind, plus Vorlauf |
| D – Produktion         | 11–12    | Zugriff beantragen (Google prüft, meist bis 7 Tage), Release einreichen (weitere Prüfung)       | eine bis zwei Wochen                                                |

Frühestens etwa **vier Wochen nach dem Start des Servers** ist die App öffentlich. Wer den geschlossenen Test früher startet (Tester werben, sobald der Server läuft), spart Zeit.

## Schritt für Schritt

Die Menünamen der Konsole ändern sich gelegentlich. Die hier genannten stammen aus Googles deutscher Hilfe (Stand 30.09.2026); im Zweifel hilft das Suchfeld oben in der Konsole.

### 1. Vorbereiten (Personenkonto)

Bereitlegen:

- ein **Google-Konto**, das du dauerhaft behältst (**Bestätigung in zwei Schritten** einschalten – an diesem Konto hängt die App),
- eine **Kredit- oder Debitkarte** für die einmalige Gebühr von **25 US$**,
- einen amtlichen **Lichtbildausweis** und einen **Nachweis der Wohnanschrift** (z. B. aktuelle Rechnung oder Kontoauszug; die Konsole nennt, was sie annimmt),
- eine **Telefonnummer** und eine **E-Mail-Adresse** für Rückfragen von Google,
- ein **echtes Android-Handy** (kein Emulator) mit installierter App „Google Play Console“ für die Geräteprüfung.

Voraussetzung: Du bist mindestens **18 Jahre** alt.

Drei Dinge vorher klären:

- **Entwicklername** (öffentlich in Google Play): kann vom Klarnamen abweichen. Vorschlag: **VereinsFlow**. Was Google außerdem öffentlich zeigt (Entwicklername, Kontakt-E-Mail, Land …), siehst du im Bereich „Entwicklerprofil“ – vor der Veröffentlichung dort nachsehen. Als E-Mail eine Adresse der Domain nehmen: `kontakt@vereins-flow.com`.
- **Händlerstatus (EU):** VereinsFlow wird gewerblich angeboten (VereinsFlow GbR). Die Konsole fragt bei Vertrieb in der EU nach dem Händlerstatus; Händler-Angaben (Anschrift, Telefon, E-Mail) können öffentlich im Store-Eintrag erscheinen. Nimm dann die **Geschäftsanschrift aus dem Impressum**, nicht deine Privatadresse. **Nicht geprüft:** Googles Hilfeseite dazu war beim Erstellen dieser Anleitung nicht abrufbar – die Konsole zeigt dir, was verlangt und veröffentlicht wird.
- **Kontotyp:** Google beschreibt das Personenkonto als gedacht für persönliche Zwecke (z. B. Studierende, Hobby-Entwickler) und das Organisationskonto für eine Organisation oder ein Unternehmen. Die Entscheidung für das **Personenkonto** ist getroffen (kein D-U-N-S nötig; der Preis dafür ist der Test mit 12 Personen). Falls es bei der Prüfung Rückfragen gibt, ist der Wechsel auf ein Organisationskonto der GbR der Ausweg (D-U-N-S: kostenlos, bis zu 30 Tage; dann entfällt der 12-Personen-Test).

### 2. Entwicklerkonto anlegen

1. Auf <https://play.google.com/console> mit dem Google-Konto anmelden und **„Entwicklerkonto erstellen“** wählen.
2. Kontotyp **persönlich** („für mich selbst“) wählen; Angaben wie im Ausweis (Name, Anschrift), Entwicklername, Kontakt-E-Mail und -Telefon eintragen.
3. **25 US$** mit der Karte bezahlen.
4. Identität bestätigen: Ausweis und Adressnachweis hochladen, Telefonnummer per Code bestätigen, dann auf dem Handy die **Play-Console-App** installieren, mit demselben Konto anmelden und der Geräteprüfung folgen.
5. Auf die Freigabe warten (E-Mail). Bis die Prüfung durch ist, kann man Apps anlegen, aber nicht veröffentlichen.

### 3. App anlegen

Konsole → **„App erstellen“**:

- **App-Name:** `VereinsFlow` (öffentlich, später änderbar).
- **Standardsprache:** **Deutsch (Deutschland)** – Google schlägt „Englisch (USA)“ vor, das umstellen.
- **App oder Spiel:** **App**.
- **Kostenlos oder kostenpflichtig:** **Kostenlos** – eine kostenlose App lässt sich später nicht in eine kostenpflichtige umwandeln; VereinsFlow verkauft nichts in der App.
- Die beiden Erklärungen (Entwicklerrichtlinien, US-Exportgesetze) bestätigen – die App nutzt nur Standard-Verschlüsselung über HTTPS.

Den Paketnamen (`com.vereinsflow.app`) liest die Konsole beim ersten Upload aus der AAB; er lässt sich danach **nicht mehr ändern**.

### 4. AAB in den internen Test hochladen (auch ohne Server)

1. **„Testen und veröffentlichen“ → „Testen“ → „Interner Test“ → „Neuen Release erstellen“.**
2. Bei der Frage nach **Play App-Signatur** bestätigen (Google verwaltet den Signaturschlüssel; dein Schlüssel ist der **Uploadschlüssel**).
3. `~/Downloads/vereinsflow-1.0.0-1.aab` in das Feld **„App Bundles“** ziehen. Release-Name (`1 (1.0.0)`) stehen lassen; bei den **Versionshinweisen** den Text aus [eintrag.md](eintrag.md#neuerungen-für-version-100-höchstens-500-zeichen-je-sprache) einfügen.
4. **Speichern → „Release prüfen“ → „Einführung starten“** für den internen Test. Verlangt die Konsole hier Angaben (etwa aus „App-Inhalte“), nimm die aus Schritt 6 vor.
5. Reiter **„Tester“** → **„E-Mail-Liste erstellen“** → deine Google-Adresse eintragen (die, mit der das Handy im Play Store angemeldet ist) → speichern und die Liste für den Test auswählen. Der interne Test fasst bis zu 100 Tester und braucht keine Google-Prüfung; die erste Version steht sofort bereit.
6. **Teilnahmelink** kopieren, auf dem Handy öffnen, **„Tester werden“**, dann installieren.

Bis der Server läuft, zeigt die App nur eine Fehlerseite („Seite nicht erreichbar“) – das ist normal und beweist nur, dass sie installiert ist.

### 5. App-Signatur-Fingerabdruck in die Server-Konfiguration eintragen

Damit Android die App **ohne Adresszeile** zeigt, muss der Server (`/.well-known/assetlinks.json`) bestätigen, dass die App zu `app.vereins-flow.com` gehört. Dafür braucht er den **SHA-256-Fingerabdruck des Zertifikats, mit dem Google die App signiert** – nicht den des Upload-Schlüssels.

1. In der Konsole die App öffnen → **„Mit Google Play geschützt“** (englisch „Protected with Play“; in älteren Fassungen „Test und Veröffentlichung → App-Integrität“ bzw. „Einrichten → App-Signatur“) → **„Google Play Store-Vertrieb“** → **„Play App-Signatur aufrufen“**.
2. Im Abschnitt **„App-Signaturschlüssel“** den **SHA-256-Zertifikatfingerabdruck** kopieren (Kopier-Symbol; Form `AB:12:…`, 32 Zweierblöcke). Nicht SHA-1, nicht MD5, nicht den Abschnitt „Uploadschlüssel“ (der steht schon in der Konfiguration).
3. Bei neuen Apps kann dort **mehr als ein Fingerabdruck** stehen: Google signiert neue Apps neuerdings hybrid mit einem klassischen RSA-Schlüssel und einem Post-Quanten-Schlüssel. Trage dann **alle SHA-256-Fingerabdrücke aus dem Abschnitt „App-Signaturschlüssel“** ein – zusätzliche Einträge schaden in `assetlinks.json` nicht.
4. Die Datei `~/VereinsFlow-Schluessel/env.production` in einem Texteditor öffnen (sie enthält Geheimnisse: nicht teilen, nicht ins Repository, nicht in Chats einfügen). In der Zeile `ANDROID_APP_CERT_SHA256=` steht schon der Fingerabdruck des Upload-Schlüssels. **Dahinter mit einem Komma** den neuen Wert anhängen:

   ```text
   ANDROID_APP_CERT_SHA256=<bisheriger Fingerabdruck>,<Fingerabdruck des App-Signaturschlüssels>
   ```

   Leerzeichen um die Kommas sind erlaubt, Kleinbuchstaben werden zu Großbuchstaben, doppelte Einträge fallen weg. Ein ungültiger Eintrag lässt den Server **nicht starten**; die Meldung nennt nur die Position, nicht den Wert.

5. Sobald der Server läuft (Schritt 8), neu starten und prüfen:

   ```bash
   curl -i https://app.vereins-flow.com/.well-known/assetlinks.json
   ```

   Erwartet: `200`, `content-type: application/json`, **keine Weiterleitung**, Paket `com.vereinsflow.app` und alle Fingerabdrücke. Zur Gegenprobe zeigt Googles öffentliche Schnittstelle, was Google sieht: `https://digitalassetlinks.googleapis.com/v1/statements:list?source.web.site=https://app.vereins-flow.com&relation=delegate_permission/common.handle_all_urls`.

6. Auf dem Handy die Testversion (Schritt 4) **neu installieren** und öffnen. **Kein** Balken mit Adresse oben = die Verknüpfung stimmt. Erscheint oben doch eine Leiste: falscher Fingerabdruck (meist nur der Upload-Schlüssel eingetragen), Server nicht neu gestartet, `assetlinks.json` liefert eine Weiterleitung oder einen Fehler, oder die Antwort liegt noch bis zu einer Stunde im Zwischenspeicher (`max-age=3600`). App löschen, nach einer Weile neu installieren.

### 6. Erklärungen unter „App-Inhalte“ ausfüllen

Konsole → **„Richtlinie und Programme“ → „App-Inhalte“**. Der Reiter „Erfordert Aktion“ zeigt, was fehlt. Die Antworten stehen fertig in den Entwürfen:

| Erklärung                                                               | Antwortentwurf                                                                                                                             |
| ----------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------ |
| Datenschutzerklärung                                                    | Adresse eintragen – **erst wenn der Text fertig ist** ([eintrag.md](eintrag.md#datenschutzerklärung--offener-punkt))                       |
| Anzeigen                                                                | Keine Werbung ([app-inhalte.md](app-inhalte.md#2-anzeigen-werbung))                                                                        |
| App-Zugriff                                                             | Englischer Text mit Demo-Zugängen – **erst nach Schritt 9** ([app-inhalte.md](app-inhalte.md#1-app-zugriff-app-access--text-auf-englisch)) |
| Zielgruppe und Inhalte                                                  | 16–17 und ab 18, **deine Entscheidung** ([app-inhalte.md](app-inhalte.md#3-zielgruppe-und-inhalte))                                        |
| Altersfreigaben                                                         | Fragebogen mit Kategorie „Kommunikation“ ([app-inhalte.md](app-inhalte.md#4-altersfreigabe-inhaltseinstufung))                             |
| Datensicherheit                                                         | Formular in [datensicherheit.md](datensicherheit.md); Löschlink: `https://app.vereins-flow.com/konto-loeschen`                             |
| Nachrichten-Apps, Behörden-Apps, Finanzfunktionen, Gesundheit, Werbe-ID | jeweils „Nein“ bzw. „keine“ ([app-inhalte.md](app-inhalte.md#6-nachrichten-apps-news))                                                     |

Ein **Prüfpunkt** vor dem Produktionsantrag: [Nutzergenerierte Inhalte](app-inhalte.md#5-nutzergenerierte-inhalte-und-kinderschutz-richtlinie) (Nutzungsregeln und Meldefunktion für den Chat).

### 7. Store-Eintrag ausfüllen

Konsole → **„Mehr Nutzer gewinnen“ → „App-Präsenz im Play Store“ → „Store-Haupteintrag“** (Texte und Grafiken) und **„Play Store-Einstellungen“** (Kategorie, Kontaktdaten). Alle Texte zum Kopieren stehen in [eintrag.md](eintrag.md), alle Bilder in [grafiken/](grafiken/):

- App-Name, Kurzbeschreibung (78 von 80 Zeichen), vollständige Beschreibung (2394 von 4000 Zeichen),
- App-Symbol `grafiken/icon-512.png`, Feature-Grafik `grafiken/feature-grafik-1024x500.png`, Telefon-Screenshots `grafiken/screenshots/01-…` bis `08-…` (in dieser Reihenfolge),
- Kategorie **Geschäftlich**, E-Mail `kontakt@vereins-flow.com`, Website `https://vereins-flow.com`.

### 8. Server live schalten

Dem Server-Betrieb dient [OPERATIONS.md](../OPERATIONS.md#erste-inbetriebnahme). Für Google und die App muss zusätzlich stimmen:

- `APP_URL=https://app.vereins-flow.com`, gültiges Zertifikat, **keine Weiterleitung** auf den fünf Adressen `/manifest.webmanifest`, `/sw.js`, `/offline.html`, `/.well-known/assetlinks.json`, `/konto-loeschen` (Tabelle „App-Ansicht“ in OPERATIONS.md); dazu `/datenschutzerklaerung` und `/impressum` öffentlich und **ausgefüllt**.
- `ANDROID_APP_CERT_SHA256` mit **beiden** Fingerabdrücken (Schritt 5), `SUPPORT_EMAIL=kontakt@vereins-flow.com` (Anlaufstelle für Löschanfragen ohne Zugang), `VAPID_PUBLIC_KEY`/`VAPID_PRIVATE_KEY`/`VAPID_SUBJECT` (sonst kein Push), funktionierender Mailversand (Einladungen!) und der Cron-Aufruf alle 15 Minuten.
- Nicht aus Ländern sperren: Prüfer sitzen weltweit.
- Ende-zu-Ende auf dem Handy mit der Testversion aus dem internen Test: Vollbild ohne Adresszeile, Anmeldung, Helferplanung, Nachricht senden, **Push im Profil einschalten** (Android 13+ fragt einmal nach der Erlaubnis) und mit einem zweiten Konto eine Nachricht schicken.

### 9. Demo-Verein und Zugänge für die Prüfer

Anleitung mit allen Einzelschritten: [app-inhalte.md](app-inhalte.md#demo-zugänge-vorbereiten-nach-dem-start-des-servers). Kurz: zwei Postfächer für die Einladungen anlegen, als Plattform-Administrator den Verein „Demo-Verein (Google Play Prüfung)“ anlegen, dort einen **Vorstands-** und einen **Mitglieds-Zugang** erzeugen, ausschließlich **erfundene Daten** anlegen und beide Zugänge selbst ausprobieren. Danach den **englischen Text** unter „App-Zugriff“ mit den echten Zugangsdaten eintragen. Die Zugänge dürfen nie ablaufen oder gelöscht werden, solange die App veröffentlicht ist.

### 10. Geschlossener Test mit mindestens 12 Testern

Für neue Personenkonten verlangt Google vor dem Produktionszugriff einen **geschlossenen Test mit mindestens 12 Testpersonen, die mindestens 14 Tage lang fortlaufend angemeldet sind**. Wer sich früher abmeldet, zählt nicht; wer aus- und wieder eintritt, beginnt die Zählung von vorn. Die 14 Tage laufen also **je Tester ab seinem Beitritt**; der Antrag geht, sobald 12 Personen 14 Tage am Stück dabei waren. **Wirb 15 bis 20 Tester** als Puffer.

**Voraussetzungen:** Server läuft, die App öffnet im Vollbild, Demo-Verein mit Zugängen steht, Datenschutzerklärung ist fertig, alle App-Inhalte sind erledigt, der Store-Eintrag ist vollständig.

**Track einrichten:**

1. **„Testen und veröffentlichen“ → „Testen“ → „Geschlossener Test“** → **„Track erstellen“** (Name z. B. „Vereins-Tester“) bzw. den vorhandenen Track öffnen → **„Track verwalten“**.
2. Reiter **„Tester“**: **„E-Mail-Liste erstellen“** und/oder eine **Google-Gruppe** eintragen (Vergleich unten).
3. Reiter **„Länder/Regionen“**: Deutschland (dazu Österreich und die Schweiz, wenn dort Tester wohnen).
4. **„Neuen Release erstellen“** → **„Aus Bibliothek hinzufügen“** und die hochgeladene Version 1.0.0 (Code 1) wählen – **nicht neu bauen**. Versionshinweise aus [eintrag.md](eintrag.md) einfügen. Speichern, prüfen, **„Einführung starten“**.
5. Als Feedback-Kanal `kontakt@vereins-flow.com` angeben. Ein geschlossener Test durchläuft in der Regel eine Prüfung durch Google (Stunden bis wenige Tage), anders als der interne Test.
6. Unter „Tester“ den **Teilnahmelink** kopieren („Wie Tester beitreten“) und verschicken.

**E-Mail-Liste oder Google-Gruppe?**

|          | E-Mail-Liste                                                                                     | Google-Gruppe                                                                                                                                 |
| -------- | ------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------- |
| Grenzen  | bis zu 200 Listen mit je bis zu 2.000 Personen, bis zu 50 je Track                               | eine Gruppe reicht für alle                                                                                                                   |
| Aufwand  | jede Adresse von Hand oder als CSV eintragen (Achtung: eine neue CSV **überschreibt** die Liste) | Gruppe auf <https://groups.google.com> anlegen, Adresse der Gruppe einmal in der Konsole eintragen; danach Mitglieder in der Gruppe verwalten |
| Vorteil  | einfach, übersichtlich                                                                           | Tester treten selbst bei (Einladung per Link), du musst die Konsole nicht mehr anfassen                                                       |
| Nachteil | jede Änderung in der Konsole                                                                     | die Zuordnung kann einige Zeit dauern                                                                                                         |

**Was Tester brauchen:** ein **Google-Konto** (die Adresse, die auf der Liste steht oder in der Gruppe ist), ein **Android-Handy** mit Play Store (Android 7 oder neuer). Sie öffnen den Teilnahmelink **mit diesem Konto**, tippen **„Tester werden“**, installieren die App und melden sich mit dem **Demo-Zugang** an (ein gemeinsamer Mitglieds-Zugang genügt und erspart 15 Einladungen). Sie sollen **die 14 Tage lang Tester bleiben** und die App ab und zu öffnen und ausprobieren.

**Vorlage für die Einladung** (per WhatsApp oder E-Mail; in Du-Form, passe sie an):

```text
Hallo …,

ich veröffentliche gerade die Android-App „VereinsFlow“ (Vereinsverwaltung: Termine, Helferschichten, Nachrichten). Google verlangt dafür einen Test mit mindestens 12 Personen über 14 Tage. Hilfst du mit? So geht es (3 Minuten):

1. Öffne diesen Link auf deinem Android-Handy, auf dem du mit deinem Google-Konto angemeldet bist: [TEILNAHMELINK]
2. Tippe auf „Tester werden“ und dann auf den Knopf zum Herunterladen bei Google Play.
3. Melde dich in der App mit diesem Testzugang an: [E-MAIL] / [PASSWORT] (ein Demo-Verein mit erfundenen Daten).
4. Schau dir in den nächsten zwei Wochen ab und zu die App an – Termine, Helferschichten, Nachrichten – und schreib mir Fehler oder Wünsche an kontakt@vereins-flow.com.

Wichtig: Bitte bleib die ganzen 14 Tage Tester (nicht wieder austreten) und lass die App installiert. Vorab bräuchte ich die E-Mail-Adresse deines Google-Kontos: […]

Danke dir!
```

**Während des Tests:** Feedback beantworten und Fehler beheben; die Zahl der angemeldeten Tester in der Konsole beobachten (Reiter „Tester“) und Ausfälle nachbesetzen. Neue Versionen können im selben Test laufen, ohne dass die Zählung neu beginnt.

### 11. Produktionszugriff beantragen

Sobald die Bedingung erfüllt ist, erscheint im **Dashboard** der Knopf **„Produktionszugriff beantragen“**. Das Formular hat drei Teile (in Googles Wortlaut): **„Dein geschlossener Test“**, **„Deine App“** und **„Deine Produktionsbereitschaft“**. Google entscheidet meist innerhalb von sieben Tagen, gelegentlich später. Die Antworten schreibst du am besten auf Englisch. Entwurf mit Platzhaltern – ersetze sie durch echte Angaben, denn Google wertet aus, was tatsächlich getestet wurde:

```text
About your closed test
We recruited [NUMBER] testers (board members, helpers and members of [NUMBER] clubs, plus friends) and let them run the app for 14 days on a demo club with fictional data. Testers signed in, signed up for helper shifts, read and wrote group messages, viewed the calendar and events and switched push notifications on and off. Recruiting was [easy/moderately hard] because [REASON]. We collected feedback by e-mail (kontakt@vereins-flow.com) and [CHANNEL]. Main feedback: [SUMMARY, e.g. "text too small on old phones", "push explanation unclear"].

About your app
VereinsFlow is the mobile view of a club-management service for German associations: members, events and calendar, helper shifts with protection against overbooking, tasks, group messages and documents. It is used by members of clubs that have been invited; there is no public sign-up. It solves the coordination work of volunteers (who helps when, who is informed). Expected installs in the first year: [RANGE - number of clubs x members with an account].

About your production readiness
Based on the test we [CHANGES, e.g. "fixed X and Y"]. Before applying we verified sign-in, helper shifts, messages, push notifications, account deletion (in the app and at https://app.vereins-flow.com/konto-loeschen), the data safety form and the privacy policy, and we set up a demo club for reviewers. The server is monitored and backed up daily.
```

### 12. Produktion veröffentlichen

1. **„Testen und veröffentlichen“ → „Produktion“ → „Neuen Release erstellen“** → **„Aus Bibliothek hinzufügen“** (Version 1.0.0, Code 1) → Versionshinweise aus [eintrag.md](eintrag.md).
2. Länder/Regionen wählen (Deutschland, Österreich, Schweiz; die Oberfläche ist Deutsch).
3. **„Prüfen“ → zur Überprüfung senden.** Die erste Prüfung kann bei neuen Konten mehrere Tage dauern. Wer den Zeitpunkt selbst bestimmen will, schaltet in der **Veröffentlichungsübersicht** die verwaltete Veröffentlichung („Managed publishing“) ein und gibt die App nach der Freigabe selbst frei.
4. Nach der Freigabe steht die App unter `https://play.google.com/store/apps/details?id=com.vereinsflow.app` (Link und QR-Code für die Vereine).

Häufige Gründe für Ablehnungen und Rückfragen:

| Grund                                                                                                 | Vorbeugen                                                                                                                               |
| ----------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------- |
| Datenschutzerklärung mit Platzhaltern, ohne Entwickler, nicht erreichbar                              | fertigstellen und in der App verlinkt lassen (Login-Fußzeile)                                                                           |
| Anmeldung für Prüfer scheitert (Passwort falsch, Demo gelöscht, Server aus, aus dem Ausland gesperrt) | Schritt 9, Zugänge selbst testen, keine Ländersperre                                                                                    |
| Oben in der App steht eine Browser-Leiste (wirkt wie eine Webseite)                                   | Fingerabdruck prüfen (Schritt 5); eine bloße Website-Hülle ist nur mit Erlaubnis des Website-Eigentümers zulässig – hier gehört sie dir |
| Angaben im Formular „Datensicherheit“ passen nicht zur App oder zur Erklärung                         | [datensicherheit.md](datensicherheit.md) und Datenschutzerklärung gemeinsam prüfen                                                      |
| Nachrichten-Modul ohne Nutzungsregeln oder Meldefunktion                                              | [app-inhalte.md](app-inhalte.md#5-nutzergenerierte-inhalte-und-kinderschutz-richtlinie)                                                 |
| Irreführende Angaben im Store-Eintrag (Funktionen, die es nicht gibt)                                 | Texte in [eintrag.md](eintrag.md) halten sich an die README                                                                             |

### 13. Nach der Veröffentlichung

- **Web-Änderungen brauchen keine neue Store-Version**: Die App lädt die Website; jede Änderung am Server ist sofort in der App.
- **Neue Store-Version** nur bei Änderungen am Android-Projekt: `appVersionCode` in `android/twa-manifest.json` erhöhen (Google akzeptiert nur höhere Nummern), dann `android/signieren.sh` ausführen (schreibt `vereinsflow-<Version>-<Code>.aab` nach `~/Downloads`) und die Datei zuerst in den internen oder geschlossenen Test, dann in die Produktion hochladen.
- **Upload-Schlüssel und Passwort** (`~/VereinsFlow-Schluessel`) doppelt sichern. Geht er verloren, lässt er sich über Google zurücksetzen – der Signaturschlüssel bleibt bei Google ([android/README.md](../../android/README.md#signieren-für-den-play-store)).
- **Demo-Verein und seine Zugänge** unverändert lassen, **Fingerabdrücke** in `ANDROID_APP_CERT_SHA256` nicht entfernen, **E-Mails von Google** an die Entwickleradresse und an `kontakt@vereins-flow.com` lesen (Richtlinienhinweise haben Fristen).
- Nach jeder Funktionsänderung prüfen, ob [datensicherheit.md](datensicherheit.md) und [app-inhalte.md](app-inhalte.md) noch stimmen.

## Screenshots neu erzeugen

Die Screenshots und die Feature-Grafik zeigen die echte Anwendung mit den Demo-Daten aus `prisma/seed.ts`. Ändert sich die Oberfläche merklich, erzeugst du sie neu – im Ordner der Anwendung (Node.js 22 oder neuer, `npx playwright install chromium` einmalig):

```bash
# 1) Eigene Wegwerf-Datenbank in der eingebetteten PostgreSQL (die Entwicklungsdatenbank bleibt unberührt)
PGDATABASE=vf_store_screens npm run db:embedded &          # oder in einem eigenen Fenster; warten, bis „PostgreSQL läuft“ erscheint
sleep 8
export DATABASE_URL="postgresql://vereinsflow:vereinsflow@localhost:5432/vf_store_screens"
export STORAGE_DIR="./.local/store-screens-storage"
npm run db:deploy && npm run db:seed

# 2) Produktions-Build und Server nur auf 127.0.0.1, Konfiguration wie playwright.prod.config.ts
npm run build
NODE_ENV=production APP_URL=https://localhost:3411 MAIL_TRANSPORT=smtp SMTP_HOST=localhost SMTP_PORT=1 \
  APP_SECRET="$(node -e "console.log(require('crypto').randomBytes(36).toString('base64url'))")" \
  CRON_SECRET="$(node -e "console.log(require('crypto').randomBytes(24).toString('base64url'))")" \
  SUPPORT_EMAIL="" npm run start -- -p 3411 -H 127.0.0.1 &
sleep 5

# 3) Bilder erzeugen (das Demo-Passwort liest das Skript aus SEED_PASSWORD in der .env und gibt es nie aus)
export VF_APP_URL=http://localhost:3411
node docs/store/grafiken/werkzeuge/screenshots.mjs chat    # einmalig, ca. 6 Minuten: Demo-Unterhaltung im Chat
node docs/store/grafiken/werkzeuge/screenshots.mjs         # acht Screenshots, 1080 × 1920
node docs/store/grafiken/werkzeuge/feature-grafik.mjs      # Feature-Grafik, 1024 × 500

# 4) Aufräumen: Server und Datenbank beenden
pkill -f next-server
pkill -TERM -f scripts/dev-db.mjs
```

Details (Ausschnitte, Namen der Demo-Personen, undurchsichtige Kopfzeile, Prüfung von Größe und Alpha-Kanal) stehen als Kommentare in `grafiken/werkzeuge/`. Die Demo-Daten beziehen ihre Termine auf das Datum des Seeds („nächster Samstag“). Vor einer späteren Aufnahme deshalb mit `npm run db:reset` (mit derselben `DATABASE_URL`) frische Daten einspielen und die Unterhaltung im Chat neu anlegen; die Wegwerf-Datenbank bleibt sonst in `.local/pgdata` liegen (nicht im Repository).

## Offene Punkte und Entscheidungen

Diese Punkte sind Entscheidungen des Inhabers (oder brauchen eine Rechtsprüfung) – deshalb ist manches oben mit „deine Entscheidung“ oder „noch offen“ markiert.

1. **Datenschutzerklärung des Betreibers** (blockiert die Einreichung): Die Seite in der App ist eine Vereinsvorlage mit Platzhaltern, die Website-Erklärung gilt nur für die Website. Siehe [eintrag.md](eintrag.md#datenschutzerklärung--offener-punkt). Rechtsprüfung nötig; ändert Code (die Texte stehen in `src/app/(legal)/`).
2. **Nutzungsregeln und Meldefunktion für den Chat** (Risiko bei der Prüfung): [app-inhalte.md](app-inhalte.md#5-nutzergenerierte-inhalte-und-kinderschutz-richtlinie).
3. **Zielgruppe** (16–17 und ab 18 empfohlen) und der Umgang mit Konten unter 16: [app-inhalte.md](app-inhalte.md#3-zielgruppe-und-inhalte).
4. **Kontotyp**: Personenkonto (entschieden) – aber Google empfiehlt Unternehmen ein Organisationskonto; Händlerstatus und öffentliche Angaben in der Konsole prüfen (Schritt 1).
5. **Löschanfragen ohne Zugang**: Es gibt noch kein Werkzeug für den Betreiber, ein Konto auf Zuruf zu löschen; `SUPPORT_EMAIL` muss gesetzt sein ([datensicherheit.md](datensicherheit.md#5-löschung-und-aufbewahrung)).
6. **App-Name** (`VereinsFlow` empfohlen) und der Satz mit dem Link zur Website in der Beschreibung ([eintrag.md](eintrag.md#vollständige-beschreibung-höchstens-4000-zeichen)).
7. **Hosting-Angaben** (Anbieter, Standort, Auftragsverarbeitungsvertrag): Sie gehören in die Datenschutzerklärung und in die Beschreibung, sobald der Server feststeht.
8. **Platzhalterseite „Finanzen – In Vorbereitung“** im Menü des Vereinsadministrators: ehrlich gekennzeichnet; den Prüfern deshalb den Vorstands-Zugang als Hauptzugang geben (so in [app-inhalte.md](app-inhalte.md) vorgesehen).
9. **App Store für das iPhone** ist ein späterer, eigener Schritt ([iphone.md](iphone.md)).

## Checkliste

**Konto und App**

- [ ] Google-Konto mit Bestätigung in zwei Schritten, Karte, Ausweis, Adressnachweis, Android-Handy bereit
- [ ] Entwicklerkonto (Personenkonto) angelegt, 25 US$ bezahlt, Identität und Gerät bestätigt
- [ ] App „VereinsFlow“ angelegt (Deutsch, App, kostenlos)
- [ ] `vereinsflow-1.0.0-1.aab` im internen Test, Tester-Liste mit eigener Adresse, App auf dem Handy installiert
- [ ] Fingerabdruck des App-Signaturschlüssels (SHA-256, alle aufgeführten) in `ANDROID_APP_CERT_SHA256` eingetragen

**Server**

- [ ] `https://app.vereins-flow.com` mit HTTPS erreichbar, fünf öffentliche Adressen ohne Weiterleitung, `/api/health` liefert `{"ok":true}`
- [ ] `assetlinks.json` enthält beide Fingerabdrücke; App öffnet ohne Adresszeile
- [ ] `SUPPORT_EMAIL`, VAPID-Schlüssel, Mailversand, Cron laufen; Push im Profil getestet
- [ ] Datenschutzerklärung und Impressum ausgefüllt (keine Platzhalter mehr)
- [ ] Demo-Verein mit erfundenen Daten, Vorstands- und Mitglieds-Zugang, beide selbst ausprobiert

**Play Console**

- [ ] Store-Eintrag: Texte, Symbol, Feature-Grafik, 8 Screenshots, Kategorie, Kontakt
- [ ] App-Inhalte: Datenschutzerklärung (URL), Anzeigen, App-Zugriff (Englisch, echte Zugänge), Zielgruppe, Altersfreigabe, Datensicherheit (mit Löschlink), Finanzfunktionen, Gesundheit, Werbe-ID, News/Behörden „Nein“
- [ ] Nutzungsregeln und Meldeweg für den Chat geklärt (oder bewusst zurückgestellt)
- [ ] Geschlossener Test mit 15–20 Testern gestartet; 12 davon 14 Tage in Folge dabei
- [ ] Produktionszugriff beantragt und gewährt
- [ ] Produktions-Release eingereicht und freigegeben; Store-Link an die Vereine
