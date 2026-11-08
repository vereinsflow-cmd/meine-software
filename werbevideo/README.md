# Werbevideo VereinsFlow (60 s, Hochformat 9 : 16 und Querformat 16 : 9)

Das Video entsteht vollständig aus diesem Ordner: echte Bilder der App, eine Szenen-Seite (HTML), die jedes Einzelbild
nur aus der Zeit berechnet, selbst erzeugte Musik und die Mac-Stimme als Platzhalter. Keine fremde Musik, keine
Videoschnitt-Software, kein ffmpeg – nur Node, Playwright und macOS (AVFoundation).

Fertige Videos (nicht im Repository, siehe unten „Neu bauen“): `ausgabe/VereinsFlow-Werbevideo-9x16.mp4` (Hochformat
für Instagram/TikTok), `ausgabe/VereinsFlow-Werbevideo-16x9.mp4` (Querformat für YouTube und die Website) und
`ausgabe/VereinsFlow-Nacht-9x16.mp4` (60 s, dunkel, siehe „Spot Nacht“).

## Spot „Nacht“ (60 s, dunkel, für TikTok und Instagram Reels)

Nach dem Vorbild eines dunklen Marken-Spots (Logo mit Lichtstreifen, Handy mit schwebenden Karten, Stadtkarte mit
Leuchtspur, 3D-Objekt, große Sätze, Logo mit Schein) – mit VereinsFlow und den Kapiteln des 60-s-Drehbuchs. Bis zum
08.11.2026 war er ein Kurzspot von 22,5 s (Stand im Commit 003b1d5).

| Zeit        | Szene                                                                                          |
| ----------- | ---------------------------------------------------------------------------------------------- |
| 0–2,5 s     | Logo baut sich mit einem Lichtstreifen auf, die Kamera fliegt durch das V                       |
| 2,5–7 s     | Handy fliegt mit einer Drehung aus der Tiefe ein (erst Rückseite, dann Bildschirm), Karten springen heraus – „Alles auf einen Blick.“, dann Flug in den Bildschirm |
| 7–12 s      | „Mitglieder in Sekunden.“ – Mia Schröder wird eingetippt, die Karte dreht sich um: angelegt      |
| 12–17 s     | „Beiträge automatisch.“ – wischt herein, Beitragslauf, Kennzahlen klappen hoch, 7.240,00 € zählen hoch |
| 17–21,5 s   | „Termine, die jeder sieht.“ – Kalender klappt hoch, Termine ploppen als Welle auf, Flug ins Sommerfest |
| 21,5–24,5 s | „Zusagen“ zum Sommerfest, Häkchen, Teilnehmer 11 → 12                                          |
| 24,5–28,5 s | Kamera über der 3D-Musterstadt, Leuchtspuren, Pin fällt auf den Sportplatz, dann Sturz hinein   |
| 28,5–33,5 s | „Helfer tragen sich selbst ein.“ – Anna trägt sich in den Abbau ein, die Kamera fährt heran      |
| 33,5–37,5 s | „Alles im Vereins-Chat.“ – „Wer bringt den Grill mit? 🔥“ fliegt in den Verlauf, die Antwort kommt |
| 37,5–40,5 s | App-Symbol dreht sich zweieinhalbmal aus der Tiefe herein – „Auch unterwegs.“                   |
| 40,5–49,5 s | Fotos (Team, Chor, Anstoßen) – „Mehr Zeit für das, was zählt.“ „Weniger Verwaltung.“ „Mehr Verein.“ |
| 49,5–53,5 s | „Mitglieder. Beiträge. Termine.“ schlagen auf den Takt ein → „Alles in einem Flow.“, Flug hinein |
| 53,5–60 s   | Logo, vereins-flow.com, „Jetzt Demo anfragen“, Lichtschein                                     |

Kein Sprecher, nur Musik; 1080 × 1920, 30 Bilder/s, H.264 und AAC (passt für TikTok und Reels). Die Zeiten stehen in
`werkzeuge/drehbuch-nacht.mjs` (Musik, Geräusche) und in `szenen/nacht.html` (`T`, Bild) – bei Änderungen beide anpassen.

**Bewegungsunschärfe:** Jedes Bild ist der Mittelwert aus 12 Zeitpunkten innerhalb einer halben Bilddauer (an
schnellen Stellen 32) – wie bei einer Filmkamera; schnelle Flüge und Wischer wirken dadurch weich statt ruckelig.
Das Rendern dauert so rund 15 Minuten (5 Browser gleichzeitig, `--parallel`). Zum schnellen Prüfen ohne Unschärfe:
`--unschaerfe 1`. Übergänge, Stöße im Takt, Blitze, Lichtstreifen und Funken stehen in `nacht.html` (`AUFTRITT`,
`STOESSE`, `BLITZE`, `STREIFEN`, `REGEN`, schnelle Stellen in `SCHNELL`).

```bash
node werbevideo/werkzeuge/aufnehmen.mjs --dunkel        # nur nötig für neue App-Bilder (nacht-…, Dunkelmodus)
node werbevideo/werkzeuge/musik.mjs --nacht             # → ausgabe/ton/mischung-nacht.wav (drehbuch-nacht.mjs)
node werbevideo/werkzeuge/rendern.mjs --seite nacht     # → ausgabe/bilder-nacht/
werbevideo/ausgabe/kodieren werbevideo/ausgabe/bilder-nacht werbevideo/ausgabe/ton/mischung-nacht.wav werbevideo/ausgabe/VereinsFlow-Nacht-9x16.mp4 30 12000000
```

Vorschau im Browser: `werbevideo/szenen/nacht.html?play` bzw. `?t=9`. Fürs Handy: `… VereinsFlow-Nacht-9x16-handy.mp4 30 3300000`.

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

Querformat 16 : 9 (YouTube, Website) – dieselben Szenen, Zeiten und derselbe Ton, nur anders angeordnet (Überschrift
links, Gerät rechts):

```bash
node werbevideo/werkzeuge/rendern.mjs --format quer   # → ausgabe/bilder-quer/
werbevideo/ausgabe/kodieren werbevideo/ausgabe/bilder-quer werbevideo/ausgabe/ton/mischung.wav werbevideo/ausgabe/VereinsFlow-Werbevideo-16x9.mp4
```

Zum Ansehen ohne Ton im Browser: `werbevideo/szenen/index.html?play` (oder `?t=14.5` für ein Standbild, mit
`&format=quer` im Querformat); Standbilder zum Prüfen: `node werbevideo/werkzeuge/rendern.mjs --standbild 14.5,22`
(dazu `--format quer`).

Fürs Handy (Vorschau unter 30 MB): mit niedrigerer Bitrate kodieren, z. B. `… VereinsFlow-Werbevideo-9x16-handy.mp4 30 3300000`.

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
