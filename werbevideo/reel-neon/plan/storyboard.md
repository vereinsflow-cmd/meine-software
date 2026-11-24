# VereinsFlow – Instagram-Reel 60 s im Neon-Stil

Stand 2026-11-24. 1080 × 1920, 30 fps, 1800 Frames. Luis' Auftrag: „ein neues Reel, ca. 60 Sekunden, das so aussieht wie im
angehängten Video, aber auf VereinsFlow abgestimmt“. Entscheidungen: **bildschirmfüllend** (keine Monitor-Szene) und
**echte Stimme „Jonas“** (die komplette, faktengeprüfte Aufnahme des 60-s-Reels) **plus Musik**.

## Das Vorbild (plan/referenz/)

14-s-Werbefilm für eine KI-App „Flow.ai“ (abgefilmt von einem Monitor, das übernehmen wir NICHT). Seine Gestaltung:
fast schwarzer Grund, leuchtende Lichtbänder, die durchs Bild fegen; ein Funkelstern mit Logo; große Leuchtschrift in
einer leuchtenden Pille, die sich mit Cursor eintippt („Still answeri|“); kleine Schrift in der Mitte, um die herum
dunkle Glas-Karten in 3D schweben (Tiefenunschärfe); eine Such-/Befehlsleiste, in die eine Frage getippt wird; eine
Antwort-Karte, die aufklappt; Kennzahl-Karten (Ringe, Balken, Kurve) um einen Satz; eine gebogene 3D-Wand aus Karten;
eine ruhige Dreiwort-Zeile; Logo mit Lichtschein am Boden. Alles fließt, Kamerafahrten statt Schnitte.

**Auf VereinsFlow abgestimmt:** Vereinsblau #3A6BEA und Himmel #8FB0FF statt Lila, der orange VereinsFlow-Punkt
#FF8A5E statt Funkelstern (als Lichtpunkt, der Szenen verbindet), Logo aus components/LogoMark.tsx. Die App erscheint
in ihrem **echten Dunkelmodus** (src/ui ist auf Dunkel umgestellt) auf schwebenden Glas-Bildschirmen (neon/ScreenPanel).

## Qualitätsmaßstab

1. Sieht aus wie ein hochwertiger Motion-Graphics-Film (After-Effects-Niveau), nicht wie eine Webseite.
2. Durchgehende Bewegung mit Absicht: Kamerafahrten durch den Raum, Karten in Tiefe, sanftes Leuchten. Höchstens 2–3
   Dinge bewegen sich gleichzeitig; nach jeder Aktion 8–15 Frames Ruhe zum Lesen.
3. Alles über Springs (springs.ts, ui/motion.ts) bzw. die Neon-Bausteine; nichts linear; Abgänge schneller als Auftritte.
4. Die Leuchtschrift spricht die Kernaussage mit (wer ohne Ton schaut, versteht alles) – kurz, groß, gut lesbar
   (mindestens ~48 px), oben (LAYOUT.headTop ≈ 290) wenn darunter Karten sind, sonst in der Mitte.
5. Safe Zones: nichts Wichtiges über y 250 oder unter y 1570.
6. Nur Fakten aus der Faktenliste unten; Demo-Daten des „TSV Musterstadt“.

## Technik

- Vertrag: `src/scenes/types.ts` (NeonScene: Comp, mood). Grenzen und Übergänge: `src/film.ts` (S, LEAD/TAIL, TRANSITION, LAYOUT).
  Eine Szene = `src/scenes/<id>.tsx` (+ Ordner `src/scenes/<id>/`). Hintergrund und Übergänge macht `src/Video.tsx`.
- Zeiten: absolute Frames; Sprachgebundenes nur über `cue("wort", { section: n })` / `cueEnd(...)`.
- Bausteine: `src/neon/` (Neon-Hintergrund, Glas-Karten, ScreenPanel für App-Seiten, Leuchtschrift/Pille mit Cursor,
  Befehlsleiste, Kennzahlen, gebogene Wand, Lichtpunkt, Logo-Auftritt, Lichtboden, Übergänge – API im Bericht in
  `plan/neon-bausteine.md`), `src/ui/` (App-Oberfläche im Dunkelmodus – API in `plan/ui-baukasten.md`, Farben in
  `plan/ui-dunkel.md`), `components/LogoMark.tsx`, `springs.ts`, `lib/motion.ts`.
- Prüfen: `npx remotion still Pruefbogen /tmp/x.png --props='{"frames":[…],"cols":6,"scale":0.25}' --log=error`
  oder `npx remotion render S-<id> /tmp/x.mp4` für eine Szene.

## Ablauf (Stimme = Aufnahme des 60-s-Reels, Wort-Frames unten)

| Szene | Frames | Zeit | Stimme (Abschnitt) |
|---|---|---|---|
| hook | 0–75 | 0–2,5 s | (0) Ihr Verein läuft immer noch über Excel? |
| problem | 75–240 | 2,5–8 s | (1) Dienstagabend, nach der Arbeit. Die Liste gibt es dreimal. Im Chat zweihundert Nachrichten. |
| frage | 240–300 | 8–10 s | (2) Und wer kommt am Donnerstag? |
| mitglieder | 300–540 | 10–18 s | (3) Mit VereinsFlow sind alle Mitglieder an einem Ort. Ihre Excel-Liste nehmen Sie mit. Fehler fallen schon vor dem Speichern auf. |
| termine | 540–780 | 18–26 s | (4) Das Training am Donnerstag steht im Kalender. Wer kommt, sagt zu. Wer nicht kann, – Ganz ohne Rundfrage im Chat. |
| helfer | 780–960 | 26–32 s | (5) Fürs Sommerfest tragen sich die Helfer per Fingertipp selbst ein. Und wo noch jemand fehlt, erkennen Sie auf einen Blick. |
| nachrichten | 960–1155 | 32–38,5 s | (6) Ihre Nachricht geht an alle, an eine Abteilung oder nur an die Helfer. Und Sie sehen, wie viele schon gelesen haben. |
| finanzen | 1155–1380 | 38,5–46 s | (7) Bleibt noch die Kasse. Beiträge, Rechnungen und das Kassenbuch mit Belegen. Offene Rechnungen sehen Sie sofort. |
| feierabend | 1380–1425 | 46–47,5 s | (8) Dann ist Feierabend. |
| leitsatz | 1425–1545 | 47,5–51,5 s | (9) Vereinsarbeit ist Ehrenamt. Die Verwaltung sollte es nicht schwerer machen. |
| logo | 1545–1665 | 51,5–55,5 s | (10) VereinsFlow. Bringt Vereinsarbeit in Fluss. |
| endkarte | 1665–1800 | 55,5–60 s | (11) Jetzt Demo anfragen. |

Hinweis Termine: In der Aufnahme fehlt „sagt ab“ – gesprochen wird „Wer nicht kann,“ und direkt „Ganz ohne Rundfrage im Chat.“
Die Leuchtschrift darf „Wer nicht kann, sagt ab.“ zeigen (das kann die App), die Stimme sagt es nur verkürzt.

Wort-Frames (Wortanfang; immer über cue() verwenden):
s0 ihr@10 verein@16 läuft@25 immer@33 noch@41 über@48 excel@55 ·
s1 dienstagabend@89 nach@109 arbeit@123 die@142 liste@149 gibt@158 es@166 dreimal@171 im@185 chat@191 zweihundert@198 nachrichten@216 ·
s2 und@260 wer@265 kommt@270 am@278 donnerstag@283 ·
s3 mit@321 vereinsflow@328 sind@346 alle@354 mitglieder@362 an@378 einem@383 ort@393 ihre@410 excel-liste@418 nehmen@436 sie@447 mit@454 fehler@476 fallen@484 schon@493 vor@501 dem@506 speichern@512 auf@524 ·
s4 das@553 training@561 am@578 donnerstag@584 steht@605 im@616 kalender@623 wer@643 kommt@650 sagt@670 zu@685 wer@698 nicht@702 kann@709 ganz@728 ohne@735 rundfrage@743 im@756 chat@761 ·
s5 fürs@790 sommerfest@796 tragen@809 sich@818 die@824 helfer@829 per@838 fingertipp@843 selbst@856 ein@865 und@875 wo@880 noch@885 jemand@891 fehlt@900 erkennen@908 sie@919 auf@924 einen@930 blick@938 ·
s6 ihre@970 nachricht@977 geht@990 an@997 alle@1002 an@1013 eine@1018 abteilung@1025 oder@1040 nur@1047 an@1053 die@1058 helfer@1064 und@1087 sie@1092 sehen@1097 wie@1104 viele@1109 schon@1116 gelesen@1124 haben@1133 ·
s7 bleibt@1168 noch@1176 die@1182 kasse@1187 beiträge@1207 rechnungen@1231 und@1247 das@1254 kassenbuch@1260 mit@1277 belegen@1283 offene@1309 rechnungen@1320 sehen@1336 sie@1345 sofort@1351 ·
s8 dann@1388 ist@1395 feierabend@1401 ·
s9 vereinsarbeit@1437 ist@1458 ehrenamt@1465 die@1487 verwaltung@1492 sollte@1504 es@1512 nicht@1516 schwerer@1523 machen@1534 ·
s10 vereinsflow@1565 bringt@1603 vereinsarbeit@1616 in@1640 fluss@1646 · s11 jetzt@1676 demo@1688 anfragen@1698
(Mehrdeutige Wörter mit `nth`, z. B. `cue("mit", { section: 3, nth: 1 })` für das zweite „mit“.)

## Szenen

### hook (0–75) – wie der Anfang des Vorbilds
Lichtbänder fegen in den ersten Frames durchs Bild (Swoosh), der orange Punkt blitzt auf. Dann die leuchtende Pille mit
Tipp-Cursor, groß in der Bildmitte: „Ihr Verein läuft immer noch über Excel?“ tippt sich Wort für Wort im Takt der
Stimme ein (lange Zeile → Pille wächst, ggf. zweizeilig oder Text verkleinert sich wie im Vorbild t03.25, wo die große
Pillen-Schrift zu kleiner Mittelschrift schrumpft). Frame 0 darf nicht leer sein (Loop von der Endkarte).

### problem (75–240) – Übergabe „cut“ von hook (gleicher Agent)
Die Frage schrumpft zu kleiner Mittelschrift, um sie herum schweben dunkle Glas-Karten in die Tiefe (wie Vorbild t03.75–
t04.25). „Dienstagabend, nach der Arbeit.“ als kurze Leuchtschrift. Auf „dreimal“ fächern drei fast gleiche Tabellen-Karten
(„Mitglieder_final.xlsx“, „Mitglieder_final2.xlsx“, „Mitglieder_NEU.xlsx“ – stilisierte Tabellen, Zeilen leicht
unterschiedlich) auf. Auf „zweihundert Nachrichten“ stapeln sich Chat-Blasen (Gruppenchat, stilisiert, ohne App-Bezug,
z. B. „Wer kommt Do??“, „Liste aktuell?“, „Ich hab die alte Version…“) und ein Zähler-Abzeichen springt hoch bis 200.
Das Chaos darf leicht unruhig sein, aber geordnet in der Tiefe gestaffelt.

### frage (240–300)
Das Chaos verschwimmt nach hinten. Eine Glas-Befehlsleiste (wie Vorbild t05.25) gleitet in die Mitte, in sie tippt sich
„Und wer kommt am Donnerstag?“ im Takt der Stimme, der Cursor blinkt kurz nach. Ruhig, klar.

### mitglieder (300–540) – Übergang „sweep“
Lichtstreif, der orange Punkt schießt herein und wird auf „VereinsFlow“ kurz zum Logo-Moment (kleines Logo/Wortmarke
leuchtet auf, Punkt bleibt als Lichtpunkt). Dann ein großer Glas-Bildschirm (ScreenPanel) mit der Mitgliederseite der App
im Dunkelmodus, leicht schräg im Raum; Zeilen fahren auf „alle Mitglieder“ ein, „233 Einträge“ zählt hoch. Leuchtschrift:
„Alle Mitglieder. An einem Ort.“ Auf „Excel-Liste“ fliegt die Datei-Karte „mitglieder.csv – aus Excel gespeichert“ (aus
dem Baukasten) herein auf „Import“. Auf „Fehler fallen schon vor dem Speichern auf“ schiebt sich die Import-Vorschau
(Baukasten: ImportPage/ImportPreviewTable) nach vorn, die fehlerhafte Zeile leuchtet rot auf mit dem echten Hinweis
„Bitte gib eine gültige E-Mail-Adresse ein.“. Leuchtschrift z. B. „Fehler? Schon vor dem Speichern.“

### termine (540–780)
Kalender der App (dunkel) auf Glas; Karte „Fußball-Training D-Jugend · Donnerstag, 3. Juni 2027“ leuchtet auf
„Kalender“. Auf „Wer kommt, sagt zu“: Terminseite, Karte „Deine Teilnahme“ hebt sich, der Punkt tippt „Zusagen“ →
„Du hast zugesagt.“ + „Abmelden“ (echter Zustand). Auf „Wer nicht kann“: daneben eine zweite Karte mit „Absagen“ →
„Du hast abgesagt.“ (echter Zustand). Auf „Ganz ohne Rundfrage im Chat“ treibt eine alte Chat-Blase „Wer kommt Do??“ aus
der Problem-Szene herein und zerfällt in Lichtpartikel. Leuchtschrift „Wer kommt, sagt zu.“ → „Ohne Rundfrage im Chat.“

### helfer (780–960)
Schichtenplan „Sommerfest 2027“ (dunkel) auf Glas, daneben schwebende Neon-Kennzahl-Karten (Werte nur aus den
Demo-Schichten im Baukasten berechnet, z. B. Besetzung je Schicht als Balken). Auf „per Fingertipp selbst ein“: Punkt tippt
„Eintragen“ beim Getränkestand → „3 von 4 · 1 frei“, „Anna Adler (du)“, „Austragen“. Auf „wo noch jemand fehlt … auf einen
Blick“: Kamera fährt auf den Grillstand „0 von 3 · 3 frei“ (orange), Lichtring pulsiert. Leuchtschrift „Ein Tipp.
Eingetragen.“ → „Lücken auf einen Blick.“

### nachrichten (960–1155)
Die vier Gruppen der Nachrichtenliste als Glas-Karten im Raum (Fächer in die Tiefe); auf „alle“ leuchten alle, auf
„eine Abteilung“ nur „Abteilung Fußball“, auf „nur an die Helfer“ nur „Helfer · Sommerfest 2027“ (blauer Leuchtring).
Auf „wie viele schon gelesen haben“: Chat mit Ankündigung „Arbeitseinsatz am Vereinsheim“, Lesezahl zählt ✓✓ 1/5 → 4/5,
groß als leuchtende Zahl (nur Zahl, keine Namen). Leuchtschrift „An alle. Oder gezielt.“ → „4 von 5 gelesen.“

### finanzen (1155–1380) und feierabend (1380–1425) – Übergabe „cut“ (gleicher Agent)
Finanz-Übersicht (dunkel) mit Karten „Kontostand gesamt 13.944,47 €“ (zählt hoch, Kurve zeichnet sich) und „Offene
Rechnungen 1.549,50 € · 2 Rechnungen zu bezahlen · davon 1 überfällig“. Auf „Beiträge, Rechnungen und das Kassenbuch mit
Belegen“: die Reiter leuchten im Takt auf, Buchungszeilen mit Beleg-Link (Kassenbuch) schweben heraus. Auf „Offene Rechnungen
sehen Sie sofort“: die Karte hebt sich mit Leuchten nach vorn. KEIN Überschuss-Betrag, keine Spenden.
Feierabend: alles fährt ruhig herunter – Karten sinken in die Tiefe, Lichtbänder werden langsam und warm (mood.warm),
Leuchtschrift „Dann ist Feierabend.“ ruhig in der Mitte.

### leitsatz (1425–1545) – Übergang „zoom“
Die gebogene 3D-Wand aus App-Bildschirmen (Mitglieder, Termin, Schichten, Nachrichten, Finanzen – kleine echte Seiten im
Dunkelmodus) dreht sich langsam um die Mitte (wie Vorbild t09.25–t09.75); in der Mitte ruhig: „Vereinsarbeit ist Ehrenamt.“
→ „Die Verwaltung sollte es nicht schwerer machen.“

### logo (1545–1665) und endkarte (1665–1800) – Übergabe „cut“ (gleicher Agent)
Die Wand zieht sich in den orangen Punkt zusammen, Lichtbänder kreisen ruhig (wie Vorbild t10.25–t11.25), auf „VereinsFlow“
der Logo-Auftritt (LogoReveal + Lichtboden), darunter „Bringt Vereinsarbeit in Fluss“ Wort für Wort. Auf „Jetzt Demo
anfragen“ eine leuchtende Pille/Knopf „Jetzt Demo anfragen“ mit Tipp, darunter „vereins-flow.com“ und klein „Link in der Bio“.
Die letzten 20 Frames ruhig und dunkel genug, dass der Loop zu Frame 0 (Lichtbänder + Punkt) nicht hart wirkt.

## Faktenliste

- Mitglieder: alle Mitglieder an einem Ort; vorhandene Excel-Listen (als CSV gespeichert) mit Vorschau übernehmen; Fehler werden vor dem Speichern gezeigt (es gibt KEINE Korrektur in der Vorschau).
- Termine: Kalender; Mitglieder sagen zu oder ab („Du hast zugesagt.“/„Du hast abgesagt.“, „Abmelden“).
- Helfer: tragen sich per Fingertipp selbst ein; der Vorstand sieht auf einen Blick, wo noch jemand fehlt („x von y · z frei“, „voll“).
- Nachrichten: an Verein, Abteilung, Teilnehmer oder Helfer; Lesestatistik als Zahl (4/5) – keine Namen, wer gelesen hat.
- Finanzen: Beiträge, Rechnungen, Kassenbuch mit Belegen; „Offene Rechnungen“, „Kontostand gesamt“. Kein Überschuss-Betrag, keine Spenden, keine Trendzahlen der Startseite.
- Datentrennung: „Daten jedes Vereins strikt getrennt“ (nur falls gezeigt).
- Aufruf: „Jetzt Demo anfragen“, vereins-flow.com.
- NICHT behaupten: KI-Funktionen, E-Mail-Versand, Zusagenzahlen, Uhrzeiten, die laufen, App-Store-App, Kundenzahlen.

## Vor dem Veröffentlichen

- [ ] Stimme stammt aus dem Gratis-Tarif (Test) – für Werbung mit bezahltem Tarif neu erzeugen (gleicher Text)
- [ ] Website-FAQ zur Finanzverwaltung anpassen (sagt noch „Noch nicht“), Demo-Daten freigeben, als Anzeige kennzeichnen
