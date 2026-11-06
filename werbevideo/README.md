# Werbevideo VereinsFlow (60 s, Hochformat 9 : 16)

Das Video entsteht vollständig aus diesem Ordner: echte Bilder der App, eine Szenen-Seite (HTML), die jedes Einzelbild
nur aus der Zeit berechnet, selbst erzeugte Musik und die Mac-Stimme als Platzhalter. Keine fremde Musik, keine
Videoschnitt-Software, kein ffmpeg – nur Node, Playwright und macOS (AVFoundation).

Fertiges Video: `ausgabe/VereinsFlow-Werbevideo-9x16.mp4` (nicht im Repository, siehe unten „Neu bauen“).

## Ablauf (Drehbuch)

| Zeit       | Szene                                                                                           |
| ---------- | ----------------------------------------------------------------------------------------------- |
| 0–3 s      | Zettelchaos auf dem Schreibtisch, Handy brummt mit Gruppenchat – „Dein Verein verdient mehr als Zettelchaos.“ |
| 3–10 s     | grau: Mitgliederlisten (Ordner voller Excel-Dateien, 23:47 Uhr), Beiträge (rote „offen“), Termine (verpasste Sitzung) |
| 10–14 s    | drei schräge Balken (wie im Logo) fegen das Grau weg, das Logo baut sich auf, der Laptop öffnet das Dashboard |
| 14–19 s    | Dashboard: Kennzahlen ploppen auf, 233 zählt hoch – „Alles auf einen Blick.“                       |
| 19–24 s    | „Neues Mitglied“: Mia Schröder wird eingetippt und angelegt                                     |
| 24–29 s    | Beitragslauf (231 Beiträge automatisch), zwei überfällige Rechnungen werden grün „bezahlt“      |
| 29–34 s    | Kalender füllt sich, Sommerfest: Zusagen und Helfer zählen hoch                                |
| 34–38,5 s  | Handy dreht sich ins Bild, Benachrichtigung „Freie Helferschichten beim Sommerfest“              |
| 38,5–44 s  | Antippen → Helferplan, Anna trägt sich in den Abbau ein                                        |
| 44–54 s    | Fotos: Team, Chor, Anstoßen, Handy mit VereinsFlow in der Hand – „Mehr Zeit für das, was zählt.“ |
| 54–60 s    | Logo, Knopf „Demo anfragen“, vereins-flow.com                                                   |

Alle Zeiten stehen in `werkzeuge/drehbuch.mjs` – Bild, Stimme, Untertitel und Musik richten sich danach (120 BPM,
Schnitte auf Schlägen).

## Neu bauen

Voraussetzung: im App-Ordner `npm ci` (Playwright, sharp) und Xcode bzw. die Command Line Tools (für `swiftc`).

```bash
node werbevideo/werkzeuge/sprecher.mjs        # Stimme (Mac „Anna“ oder eigene Aufnahmen) + szenen/drehbuch.js
node werbevideo/werkzeuge/musik.mjs           # Musik, Geräusche, Mischung → ausgabe/ton/mischung.wav
node werbevideo/werkzeuge/rendern.mjs         # 1.800 Einzelbilder → ausgabe/bilder/ (dauert einige Minuten)
swiftc -O werbevideo/werkzeuge/kodieren.swift -o werbevideo/ausgabe/kodieren
werbevideo/ausgabe/kodieren werbevideo/ausgabe/bilder werbevideo/ausgabe/ton/mischung.wav werbevideo/ausgabe/VereinsFlow-Werbevideo-9x16.mp4
```

Zum Ansehen ohne Ton im Browser: `werbevideo/szenen/index.html?play` (oder `?t=14.5` für ein Standbild);
Standbilder zum Prüfen: `node werbevideo/werkzeuge/rendern.mjs --standbild 14.5,22`.

### Eigene Stimme statt Mac-Stimme

Die zwölf Sätze stehen in `werkzeuge/drehbuch.mjs` (`SPRECHER`). Jede Aufnahme als Sprachmemo unter
`werbevideo/stimme/<id>.m4a` ablegen, z. B. `stimme/07-ein-ort.m4a` – `sprecher.mjs` nimmt dann diese. Ist eine
Aufnahme länger als vorgesehen, meldet das Skript die Überschneidung; dann den Beginn im Drehbuch verschieben.

### App-Bilder neu aufnehmen

`werkzeuge/aufnehmen.mjs` meldet sich als Demo-Administratorin an und klickt die Abläufe durch. Es **ändert Daten**
(legt ein Mitglied an und archiviert es wieder, richtet Kassenbuch und Beitragsarten ein, erstellt einen Beitragslauf,
markiert Rechnungen als bezahlt, trägt Anna in eine Schicht ein) – deshalb nur gegen eine Kopie der Website-Demo:

```bash
node scripts/dev-db.mjs   # eingebettete Datenbank, falls nicht schon läuft
```

Kopie anlegen (`CREATE DATABASE vf_video TEMPLATE vf_website;`, danach `prisma migrate deploy` mit
`DATABASE_URL=…/vf_video`), App mit eigenem Build-Ordner auf Port 3200 starten (`PORT=3200 NEXT_DIST_DIR=.next-website
DATABASE_URL=…/vf_video … next dev -p 3200`, siehe `website/README.md`), dann:

```bash
node werbevideo/werkzeuge/aufnehmen.mjs            # alle Bilder; --only name1,name2 für einzelne
```

Seed-Namen werden wie bei den Website-Bildern nur im Bild ersetzt (das Repository ist öffentlich).

## Was das Video bewusst (noch) nicht zeigt

- **Push-Nachrichten:** gibt es in der App noch nicht (siehe `docs/ROADMAP.md`). Das Handy zeigt deshalb die echte
  Benachrichtigung aus der App (Glocke), nicht eine Push-Nachricht des Telefons.
- **Beiträge als bezahlt markieren:** kommt mit Etappe 8 (Zahlungen). Das Video zeigt stattdessen den echten
  Beitragslauf („231 Beiträge erstellt“) und das echte „Bezahlt“ bei Rechnungen (rot → grün).

## Fotos (Szene 5)

Von [Unsplash](https://unsplash.com) unter der [Unsplash-Lizenz](https://unsplash.com/de/lizenz) (kostenlos, auch für
Werbung, ohne Pflicht zur Namensnennung; nicht erlaubt: die Fotos unverändert verkaufen). Abgebildete Personen dürfen
nicht als Fürsprecher von VereinsFlow erscheinen – im Video stehen sie nur für Vereinsleben. Heruntergeladen am 06.11.2026.

| Datei                  | Motiv                         | Fotograf             | Foto                                     |
| ---------------------- | ----------------------------- | -------------------- | ---------------------------------------- |
| `fotos/team.jpg`       | Mannschaft im Kreis           | Maximilian Müller    | https://unsplash.com/de/fotos/TdjvE-SnB34 |
| `fotos/chor.jpg`       | Chor beim Singen              | Green Liu            | https://unsplash.com/de/fotos/ZaZcvU_WuF8 |
| `fotos/anstossen.jpg`  | Anstoßen mit Krügen           | Drew Farwell         | https://unsplash.com/de/fotos/9RLk3ZpulUk |
| `fotos/handy.jpg`      | Hand mit Smartphone           | CoinView App         | https://unsplash.com/de/fotos/h7a6g0ua6LM |

Logo und Instagram-Vorlage: `docs/brand/vereinsflow-logo-paket`. Musik und Geräusche: selbst berechnet
(`werkzeuge/musik.mjs`).
