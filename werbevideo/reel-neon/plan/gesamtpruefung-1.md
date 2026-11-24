# Gesamtprüfung 1 (2026-11-02)

Fehlerliste zum 45-s-Reel, vollständig gesichtet: Raster 0–1349 alle 10 Frames, alle 7 Szenengrenzen ±10 Frames in 2er-Schritten, 14 Standbilder in Originalgröße und einige Einzelstellen. Ich habe keine Datei im Projekt geändert und nur nach /tmp gerendert. Alle Pfade beziehen sich auf `~/VereinsFlow-Medien/reel-45s/video/`.

## Muss behoben werden

**1. Fakten: Trend-Chips der Startseite sind zu sehen (reveal f≈215–240, sicherheit f≈1028–1140, bei f1100 gestochen scharf).**
- Zu sehen sind „▲ +23 (+11,0 %) in 12 Monaten“, „+4 gegenüber dem Vormonat“ und auf der Termine-Kachel „▼ −2 (…“.
- `public/screens/manifest.json` verlangt ausdrücklich, diese Chips im Spot auszublenden.
- Lösung: in `src/ui/dashboard.tsx` bei `MembersKpiCard` und `EventsKpiCard` die Trend-Chips abschaltbar machen (z. B. `hideTrends`). Dann in `src/scenes/reveal/startseite.tsx` den Chip-Pop (`DASH.chip`) weglassen und im `DashScreen` von sicherheit den Schalter setzen.
- Zu klären: Laut Manifest soll auch der Wert „Überschuss“ ausgeblendet werden. Gezeigt wird f945–1000 „Überschuss 2026 +5.286,30 €, seit 01.07.2026“. Dieser Betrag steht nicht in der Faktenliste. Entweder vom Kunden bestätigen lassen oder die Karte ohne Betrag zeigen.

**2. Zeile 2 der Überschrift steht an drei Stellen viel zu kurz.**

| Stelle | Voll lesbar | Danach |
|---|---|---|
| mitglieder „An einem Ort.“ | ≈ f288–299 (0,35 s) | Zeile geht wieder raus |
| nachrichten „Oder gezielt.“ | ≈ f790–801 | f802–814 gar keine Überschrift |
| finanzen „Kassenbuch.“ | ≈ f1004–1010 (0,2 s) | Zeile geht wieder raus |

- Mit der echten, eher späteren Stimme wird „Kassenbuch.“ noch kürzer, weil die Szene fest bei 1020 endet.
- mitglieder, `src/scenes/mitglieder/zeit.ts`: Zeile 2 früher starten, z. B. `head1Line2 = mitglieder-Cue + 6` (≈ 266). Alternativ `head1Out = ihre − 2` und `head2 = ihre + 2`.
- nachrichten, `src/scenes/nachrichten/zeit.ts`: `head1Out = head2 − 6` (≈ 808) statt `min(back+2, und−4)`.
- finanzen, `src/scenes/finanzen/zeit.ts`: `headlineOut = max(E − 10, CUE.kassenbuch + 24)` und in `src/scenes/finanzen.tsx` `tail` auf ca. 14 setzen. Die Überschrift von sicherheit kommt erst bei f≈1040, Platz ist also da.
- Allgemein: Zeile 2 sollte mindestens 24 Frames stehen.

**3. Der Kassenbuch-Moment ist zu kurz und zu klein (f1000–1020).**
- Nach dem Push steht das Kassenbuch nur etwa 10 Frames in Ruhegröße da. Die Schrift ist dort rund 20 px groß, die Beleg-Links sind unlesbar. Dann kommt schon der Schwung.
- Lösung in `src/scenes/finanzen/zeit.ts` (`cameraAt`): auf `CUE.kassenbuch` wie beim Kontostand auf 1,3 heranfahren, auf die ersten zwei Buchungen mit Beleg-Link.
- Alternativ, wie im Storyboard vorgeschlagen: die zwei Buchungszeilen nach dem Vorbild von `SchwebendeRechnung` aus dem Display heben.
- Die Rückfahrt in die Ruhelage erst in die Überblendung legen (bis S.to + 4).

**4. Nach dem Tipp liegt der Punkt auf dem Gegen-Knopf.**
- termine f503–508: „Zusagen“ wird in 2 Frames zu „Abmelden“, Punkt und Ring liegen genau darauf. Das liest sich wie „Abmelden getippt“. Der Haken ist nur ≈ 20 px groß, dass er sich „zeichnet“, sieht man nicht.
- helfer f568–575: dasselbe mit „Austragen“.
- termine: in `src/scenes/termine/plan.ts` `rsvp = TAP2 + 9`. In `src/scenes/termine/Front.tsx` den Punkt ab `tapAt + 1` in 6 Frames abheben lassen, mit etwa +60/−60 px Versatz. Dazwischen einen eigenen Zustand: der Knopf wird grün mit großem Haken, der sich etwa 10 Frames lang zeichnet.
- helfer, `src/scenes/helfer.tsx`: `signedUp = appear(f, T_TAP + 10, 8)` und beim `TapDot` `leaveAt = T_TAP + 3`.

**5. Der Zoom in mitglieder schneidet die Kopfzeile ab, die Kamera-Insel liegt auf der Oberfläche.**
- f280–312: Die Insel sitzt auf dem Suchfeld, rechts steht abgeschnitten „…E-Mail su“, die Status-Spalte fehlt.
- f360–398: Die Insel liegt auf „Neues Mitglied / Anträge“, „233 Einträge“ ist halb verdeckt, bei f380 wieder auf dem Suchfeld.
- In helfer und nachrichten wird genau das bewusst vermieden.
- Lösung in `src/scenes/mitglieder.tsx`: `ROWS_ZOOM` und `NEW_ZOOM` durch ein Heranfahren des Handys ersetzen (Skalierung 1,35–1,4, dy wie `dyFor` in helfer) und die App scrollen lassen.
- Alternativ: den Zoom behalten, aber mit `cx ≈ 585` und einer deckenden Kopfzeile bzw. einem Verlauf unter der Insel, wie `visibleTop` in nachrichten.

**6. Nachrichten ist zu dicht (f754–882).**
- In 128 Frames passieren zehn Dinge: Auffächern, Ring, Zurück, Tipp, Push, Heranfahrt auf 1,68, Senden, Blase, Chip hebt sich, Zählen, Chip zurück, Rückfahrt.
- Der Ring „gezielt“ steht etwa 10 Frames, „✓✓ 4/5“ etwa 13 Frames. Das verletzt die Ruhe-Regel von 8–15 Frames nach jeder Aktion.
- Lösung in `src/scenes/nachrichten/zeit.ts`: `back = gezielt + 22`, `tapRow = back + 14`, `chipBack = to − 8`, `out` in die Überblendung legen. Die Heranfahrt (`HERO`) auf 1,35 reduzieren.

## Wäre schöner

**7. Finanzen zeigt einen falschen App-Zustand (f943–1000).** Die Reiter-Pille steht auf „Beiträge“ bzw. „Rechnungen“, darunter bleibt aber die Übersicht mit Kontostand, Offene Rechnungen und Überschuss. Der Kunde kennt seine App. Lösung: in `src/scenes/finanzen/zeit.ts` (`tabAt`) die Pille bis „Kassenbuch“ auf Übersicht lassen und Beiträge/Rechnungen nur als kurzes Aufleuchten der Reiter-Beschriftung zeigen.

**8. Die Kamera arbeitet in jeder Szene anders.**
- Handygröße: mitglieder Zoom im Display, termine und finanzen 1,3, helfer 1,55, nachrichten 1,68 plus 1,09 Zoom. In nachrichten bleiben links und rechts nur noch etwa 36 px Rand.
- In helfer fährt die Kamera f546–566 direkt nach dem Schwung bei f540 heran: zwei große Bewegungen in 25 Frames.
- Lösung: einheitlich 1,3–1,4 (`HERO.scale` in nachrichten, `SC` in `src/scenes/helfer.tsx`), Heranfahrt frühestens ab S.from + 10.

**9. Nach jedem Schwung ist das Display kurz leer und weiß** (f242–250, f422–428, f722–728, f902–908, f1022–1026). Das wirkt fünfmal wie ein Ladebildschirm. Lösung: den Seitenaufbau (`build` / `pageIn`) schon bei S.from − 8 starten.

**10. helfer f655–695:** Der orange Ring um „0 von 3 · 3 frei“ schneidet durch die Zeile „Noch niemand eingetragen“. Lösung in `src/scenes/helfer/ShiftList.tsx`: vertikales Polster des Rings auf höchstens 8 px.

**11. nachrichten f760–800:** In den großen schwebenden Karten stehen Auslassungspunkte, sogar im Gruppennamen („Teilnehmer · Sommerfest 2…“). Lösung in `src/scenes/nachrichten/faecher.tsx`: Karten breiter oder kleiner skalieren, Vorschautext kürzen, den Namen nie abschneiden.
- Dazu ein Logikfehler: Die Vorschau „Bernd: Super Sache! Farbrollen und A…“ antwortet schon auf den Arbeitseinsatz, der erst bei f840 gesendet wird. Die Vorschau besser auf die Willkommensnachricht setzen.

**12. mitglieder f348–357:** Die Datei-Karte verschwindet im Import-Knopf, danach erscheint ein eigener Punkt und tippt noch einmal. Das wirkt wie ein Doppel-Tipp ohne sichtbare Verwandlung. Lösung in `src/scenes/mitglieder/Datei.tsx`: die Karte in den letzten 4 Frames zum orangen Punkt (44 px) werden lassen, der direkt tippt.

**13. Zahlen passen nicht zusammen:** Nach dem Import stehen „238 Einträge“, die Startseite in sicherheit (f1100) zeigt „Mitglieder 233“. Lösung: dort 238 anzeigen oder das Nachzählen weglassen.

**14. sicherheit → outro f1140–1154:**
- Rahmen und Schloss am Haupthandy verschwinden 2–3 Frames vor denen der Seitengeräte.
- Bis f1154 bleibt ein Rest des Handys am unteren Bildrand sichtbar.
- Lösung in `src/scenes/sicherheit.tsx`: den Rahmen mit der Pose absinken lassen statt ihn früh auszublenden (`fade` ab `T.sink − 2`), schneller absinken bzw. die Deckkraft mitnehmen.

**15. Loop:**
- f0–1 sind leer, nur Hintergrund.
- f1349 (Endkarte) schneidet hart auf diesen dunklen Anfang; auch Leuchten und Hintergrund passen nicht zusammen.
- Lösung: „Ein“ oder den Punkt schon in f0 zeigen (`src/scenes/hook/schrift.tsx`) und f1335–1349 das Leuchten der Endkarte auf das Niveau des Hooks dämpfen.

**16. Der Schwung an allen sechs Grenzen ist identisch** (±30° Drehung, Unschärfe) und damit vorhersehbar. Optional in `src/film.ts` (`swingAt`): die Stärke variieren (18–30°) oder den Schwung bei 1020 weglassen.

Ohne Befund geprüft: Überschriften (Position HEAD_TOP 300, Farben, oranger Schlusspunkt, Schriftart), Tipp-Punkte überall gleich (44 px, gleicher Ring), Ruhelage des Handys, Safe Zones (nichts Wichtiges über y 250 oder unter y 1570), deutsche Schreibung, Textgrößen der schwebenden Karten (≥ 34 px), keine Blitzer oder doppelten Überschriften an den Grenzen.

Die Prüfbilder liegen in `/tmp`: Raster `g-1s.png`–`g-6s.png`, Szenengrenzen `t-1s.png`–`t-4s.png`, Detailstellen `h-1s.png`–`h-6s.png`, Standbilder `k-<frame>.png`.