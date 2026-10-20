# VereinsFlow – Website

Werbeseite für VereinsFlow: eine Startseite (`index.html`) mit Impressum, Datenschutzerklärung und Fehlerseite. Reines HTML
und CSS mit eigenen Skripten (Kopfzeile und Menü auf allen Seiten, dazu auf der Startseite die Bühnen und der
Lichtfluss), **keine Cookies, keine Bibliotheken, keine Webfonts, nichts von fremden Servern**. Einzige Ausnahme vom rein
Statischen: die Anmeldung „Beim Start benachrichtigen“ (`newsletter.php`, braucht PHP – siehe „Benachrichtigung zum Start“).
Gestaltung „B4 Spektakel“: Nacht und Papier im Wechsel, Studiolicht, ein Lichtfluss als roter Faden (siehe „Gestaltung und
Bewegung“); die Farben hängen nicht von der Einstellung des Geräts ab. Die Bilder sind echte Aufnahmen der Anwendung
(Demo-Daten).

Die Website liegt als Ordner `website/` im VereinsFlow-Repository, neben der Anwendung im Hauptordner. Beide haben getrennte
Werkzeuge und Prüfungen: Die Anwendung ignoriert `website/` (Prettier, ESLint, Docker, CI), die Website prüft sich selbst
(`node tools/check-site.mjs`, in der CI als `website.yml`).

> **Stand:** Die Seite ist fertig gebaut, aber **noch nicht veröffentlicht**. Alle Angaben sind eingetragen (siehe unten).

## Inhalt

| Datei / Ordner                        | Zweck                                                                                       |
| ------------------------------------- | ------------------------------------------------------------------------------------------- |
| `index.html`                          | Startseite in zehn Kapiteln: Einstieg mit Kamerafahrt, Ausgangslage, Helferplanung, Unterwegs, Funktionen, Finanzen, Vertrauen, So starten Sie, Fragen, Demo (mit der Anmeldung „Beim Start benachrichtigen“) – siehe „Gestaltung und Bewegung“ |
| `impressum.html`, `datenschutz.html`  | Rechtstexte (ausgefüllt, Stand 26.09.2026)                                                 |
| `404.html`                            | Fehlerseite                                                                                 |
| `assets/css/site.css`                 | Die ganze Gestaltung, eine Datei für alle Seiten; Farben, Schrift, Abstände und Kurven als Variablen oben in `:root`, das Inhaltsverzeichnis im Kopfkommentar. Laptop und Telefon stehen darin **wörtlich** wie im Stand `c112a20` (zwischen den Markern `@@geraete-…`, Keyframes am Dateiende) |
| `assets/js/frueh.js`                  | Nur Startseite: setzt `html.js` vor dem ersten Zeichnen – die Höhe der Bühnen stimmt dann schon, wenn der Browser die Scrollposition wiederherstellt |
| `assets/js/site.js`                   | Alle Seiten: Menü (unter 900 px, mit `inert`, Esc, Fokus zurück), Kopfzeile (Glas hell über Papier, dunkel über der Nacht), Kapitel-Faden mit Pinnnadel und `aria-current`, Einblenden (`.erscheint`), Frage per Sprungmarke öffnen, E-Mail-Adresse kopieren, Fokus-Rückgabe der Popovers, Schalter „Bewegung anhalten“; dazu wörtlich der Start der Geräte-Bewegung (Zeilen 107–140 aus `c112a20`). Ohne Skript bleibt alles nutzbar |
| `assets/js/buehne.js`                 | Nur Startseite, als Modul: Posen der Geräte in Ruhe, Kamerafahrt, Wortwalze, magnetische Knöpfe, Lichtkanten, Zählwerke, Spur der Helferplanung, Umlaufbahn, Karten unter dem Zeiger, Lichtstreif, Rollen, Startlinie, Aufklappen der Fragen, Finale, Sprungmarken in die Bögen. Liest die Geräte nur (`.is-rest`), bewegt sie nie; nur den Start des Finanz-Laptops zieht es vor (ein Fünftel im Bild statt der Hälfte) |
| `assets/js/fluss.js`                  | Der Lichtfluss (Canvas 2D, eigener Code), von `buehne.js` geladen; Optionen als `data-…` am `<canvas>` (Liste im Kopfkommentar) |
| `assets/img/finale-geraete-*.webp`    | Schlussbild des Finales: Laptop und Telefon als Standbild mit durchsichtigem Hintergrund (`tools/geraete-standbild.mjs`) |
| `assets/img/app/`                     | Aufnahmen der Anwendung (helle Darstellung, `…-light-…`), je Bild genau die Breiten, die die Seite zeigt (siehe „Hinweise zu den Aufnahmen“) |
| `assets/img/`, `assets/brand/`        | Logo (Seite, `logo.svg`), Logo für die Bestätigungs-E-Mail (`logo-mail.png`, `@2x`), Logo-Vorlagen (Presse, Präsentationen) und Vorschaubild `og-image.png` – alles aus dem Logo-Paket (siehe „Logo“) |
| `favicon.svg`, `favicon.ico`, `apple-touch-icon.png`, `android-chrome-*.png`, `site.webmanifest` | Symbole für Browser-Tab, Lesezeichen und Startbildschirm (aus dem Logo-Paket); das Web-Manifest nennt Name und Symbole |
| `robots.txt`, `sitemap.xml`           | Für Suchmaschinen (Domain `https://vereins-flow.com`)                                         |
| `_headers`, `.htaccess`               | Sicherheits- und Cache-Header für Netlify/Cloudflare Pages bzw. Apache-Webspace              |
| `Vorschau-starten.cmd`, `.command`    | Windows bzw. Mac: Doppelklick startet die Vorschau und öffnet den Browser                   |
| `tools/`                              | Werkzeuge (siehe unten); müssen nicht hochgeladen werden                                    |
| `upload/vereinsflow-website.zip`      | Fertiges Paket zum Hochladen auf den IONOS-Webspace (erzeugt von `tools/paket-bauen.mjs`, siehe „Veröffentlichen“) |
| `upload/entpacken.php`                | Einmal-Helfer, der das Paket auf dem Webspace auspackt und sich danach selbst löscht         |
| `THIRD-PARTY-NOTICES.md`              | Lizenzhinweise der Symbole (lucide, ISC) – bitte mit veröffentlichen                        |

## Ansehen

**Windows: Doppelklick auf `Vorschau-starten.cmd`, Mac: Doppelklick auf `Vorschau-starten.command`.** Das Fenster bleibt offen, solange die Vorschau läuft; beendet wird mit
Strg+C (unter Windows die Rückfrage mit „J“ beantworten). Der Browser öffnet sich von selbst.

Oder von Hand in einem Terminal im Ordner der Website (Windows 11: Rechtsklick auf den Ordner → „Im Terminal öffnen“; Mac: Rechtsklick auf den Ordner → Dienste →
„Neues Terminal beim Ordner“):

```bash
node tools/serve.mjs          # Vorschau auf http://localhost:4173
node tools/serve.mjs --open   # ... und den Browser öffnen
```

Der Vorschau-Server setzt dieselben Sicherheits-Header wie später der Webserver – Verstöße gegen die Content-Security-Policy
erscheinen in der Konsole des Browsers. (`index.html` lässt sich zur schnellen Ansicht auch per Doppelklick öffnen.)

## Vor der Veröffentlichung

1. **Angaben sind eingetragen** (Stand 26.09.2026): VereinsFlow GbR (Gesellschafter Ben Bleckert und Luis Heidecker),
   Oberschlesienstraße 6a, 45711 Datteln, `kontakt@vereins-flow.com` (auch für die Demo-Anfrage auf der Startseite),
   Hosting bei IONOS, Aufsichtsbehörde LDI NRW, Domain `https://vereins-flow.com`. Damit die Texte stimmen:
   - **IONOS WebAnalytics abschalten.** Es ist bei IONOS standardmäßig an; die Seite verspricht aber „kein Tracking“.
   - **IONOS-CDN nicht aktivieren** (Cloudflare, USA) – sonst stimmt „innerhalb der Europäischen Union“ nicht mehr.
   - **Auftragsverarbeitung prüfen:** Die AVV ist Teil der IONOS-AGB (Verträge ab 19.07.2022); nachzulesen unter IONOS-Konto →
     Mein Konto → „Datenschutz & Privatsphäre“. Der IONOS-Vertrag sollte auf die GbR laufen.
   - **Postfach `kontakt@vereins-flow.com`** muss bei IONOS eingerichtet sein (die Datenschutzerklärung nennt IONOS als Mail-Anbieter).
   - **Wirtschafts-Identifikationsnummer** (kommt nach der steuerlichen Erfassung ins ELSTER-Postfach) bzw. eine spätere
     USt-IdNr. sofort ins Impressum aufnehmen. Bei Eintragung ins Gesellschaftsregister wird aus „GbR“ „eGbR“ mit Registerangaben.
   - Den Namen „VereinsFlow GbR“ überall gleich schreiben (Gewerbeanmeldung, Finanzamt, Rechnungen).
2. **Domain:** eingetragen (`https://vereins-flow.com` – **mit Bindestrich**, so steht sie im IONOS-Vertrag; `vereinsflow.com`
   ohne Bindestrich gehört euch nicht). Bei IONOS unter „Domains & SSL“ das **SSL-Zertifikat für `vereins-flow.com` aktivieren**
   (rotes Schloss = noch kein HTTPS). `.htaccess` schickt HSTS (`max-age=31536000`, nur für die Domain selbst, ohne
   `includeSubDomains` und `preload`): Browser rufen die Seite danach ein Jahr lang nur über HTTPS auf – das Zertifikat deshalb
   nie auslaufen lassen. Für eine andere Domain `https://vereins-flow.com` in den Seiten,
   `robots.txt`, `sitemap.xml` und `.htaccess` (Weiterleitung auf HTTPS ohne „www.“) per Suchen/Ersetzen austauschen – `tools/set-domain.mjs` ersetzt nur die ursprüngliche
   Musterdomain `https://vereinsflow.example`.
3. **Rechtstexte prüfen lassen.** Impressum und Datenschutzerklärung sind Muster, keine Rechtsberatung. Wer später Statistik,
   Karten, Videos oder Schriften von fremden Servern einbindet, muss die Datenschutzerklärung **und** die Content-Security-Policy
   (`_headers` / `.htaccess`) anpassen.
4. **Aussagen abgleichen.** Alle Aussagen stammen aus dem Stand der Anwendung vom 22.09.2026 (`README.md`, `docs/SECURITY.md`,
   `docs/PRIVACY.md`, `docs/DESIGN.md`, `src/server/permissions/defaults.ts`, `src/lib/search/registry.ts`,
   `src/app/(app)/helferplanung/drucken/page.tsx`, `src/server/jobs/reminders.ts`, `src/modules/dashboard/compare.ts`), die
   Finanzen (Kapitel „Finanzen“ mit dem Laptop, Karte „Finanzen“ unter „Funktionen“, FAQ „Gibt es eine Finanzverwaltung …“) und die
   Zwei-Faktor-Anmeldung (Sicherheit, „Mehr dazu“, auch der Satz zu den Cookies: bei Zwei-Faktor kurzzeitig ein zweites,
   notwendiges Cookie, `docs/PRIVACY.md` „Cookie-Konzept“) aus dem Stand vom 18.10.2026 (`src/app/(app)/finanzen/`, `src/modules/finance`, `src/modules/fees`,
   `src/modules/donations`, `docs/SECURITY.md`). Noch geplant und deshalb in der FAQ als „geplant“: Zuwendungsbestätigungen
   (die Anwendung hat bisher nur den „Beleg bis 300 €“), öffentliche Veranstaltungsseite, Push und mobile Apps; Lastschrift
   (SEPA) nennt die Seite bewusst nicht. Kommen Funktionen hinzu, die FAQ (auch die Frage zur Planung) und die Zahl der
   Bereiche anpassen („13“ und „Dreizehn Bereiche“ unter „Funktionen“: neun Karten und vier Chips unter „Dazu“, je Bereich
   ein Popover). Preise und Vertragsbedingungen stehen bewusst **nicht** auf der Seite. Die Fußzeile nennt Absender, E-Mail und
   Telefon wie das Impressum – ändern sie sich, alle Kopien der Fußzeile nachziehen (siehe „Seiten des Skripts“).
5. `node tools/check-site.mjs --strict` muss ohne Meldung durchlaufen.

## Veröffentlichen

Der Ordner (ohne `tools/`, `upload/`, `README.md`, `Vorschau-starten.cmd` und `Vorschau-starten.command`) ist eine fertige statische Website und läuft bei jedem Anbieter, der Dateien ausliefert – bis auf die Anmeldung „Beim Start benachrichtigen“: Sie braucht PHP (bei IONOS vorhanden). Auf Netlify, Cloudflare Pages oder GitHub Pages läuft kein PHP; dort den Abschnitt `#benachrichtigen` samt Knopf und Links aus `index.html` entfernen.

- **Netlify** oder **Cloudflare Pages**: Ordner `website/` hochladen oder das Repository verbinden (Basisverzeichnis und
  Ausgabeordner `website`, kein Build-Befehl); `_headers` wird automatisch gelesen. Beide unterstützen auch private Repositories.
- **GitHub Pages**: veröffentlicht nur den Hauptordner oder `docs/`, für `website/` wäre ein eigener Workflow nötig (nicht
  eingerichtet); private Repositories brauchen dafür einen bezahlten GitHub-Tarif. Die Header (`_headers`) wirken dort nicht.
- **Klassischer Webspace** (IONOS, Strato, all-inkl u. a., Apache): per FTP hochladen; `.htaccess` liefert Fehlerseite und Header.
  **Fertiges Paket für IONOS:** `upload/vereinsflow-website.zip` enthält genau die Dateien für den Webspace (die Domain zeigt bereits
  auf `/public`). Weil der Webspace Explorer kein „Entpacken“ anbietet, liegt `upload/entpacken.php` daneben: beide Dateien im
  Webspace Explorer nach `/public` hochladen, `https://vereins-flow.com/entpacken.php` im Browser aufrufen – der Helfer packt das ZIP
  aus (danach liegt `index.html` direkt in `/public`) und löscht sich selbst. Anschließend die ZIP-Datei im Webspace Explorer löschen.
  **Einfacher per SFTP** (einmal bei IONOS unter Hosting → SFTP einen Benutzer anlegen, Verzeichnis „/“): im Ordner `website/`
  `node tools/hochladen.mjs <Server> <Benutzer>` – lädt alles direkt nach `/public`, ohne ZIP und Entpack-Helfer.
  Nach Änderungen an der Seite das Paket neu packen (im Ordner `website/`, ohne zip-Programm, auch unter Windows):
  `node tools/paket-bauen.mjs` – schreibt `upload/vereinsflow-website.zip` mit denselben Dateien wie früher der Befehl
  `zip -r -X … -x "tools/*" "upload/*" "README.md" "Vorschau-starten.*" "_headers" "*.DS_Store"` (also mit `.htaccess`).
  Paket und SFTP-Upload (`tools/hochladen.mjs`) nehmen `assets/css/site.css` und die Skripte in `assets/js/` **ohne
  Entwicklerkommentare, Einrückung und Leerzeilen** mit (gut ein Drittel kleiner) – der kommentierte Quelltext im Ordner
  bleibt unverändert; Regeln, Werte, Zeichenketten, reguläre Ausdrücke und `url(…)` bleiben gleich, nichts wird umbenannt,
  Zeilenumbrüche im Skript bleiben stehen (`tools/paket.mjs`; jedes Skript wird danach mit `node --check` geprüft).
  Darum nie Stildatei oder Skripte vom Webspace zurück in den Ordner kopieren.
  Wurden `assets/css/site.css` oder die Skripte in `assets/js/` geändert, vorher die Versionsnummer an ihren Links in allen
  HTML-Dateien und in `newsletter.php` (`VF_STYLESHEET`, `VF_SKRIPT`) erhöhen (`?v=` mit dem Datum und einer laufenden
  Nummer, derzeit `?v=2026102101` an der Stildatei und `?v=2026102001` an den Skripten) – `buehne.js` lädt `fluss.js` selbst (Zeile `import … from "./fluss.js?v=…"`), dort
  ebenfalls. Sonst liefern Browser und der Zwischenspeicher von
  IONOS bis zu einen Tag lang die alte Datei aus (sie dürfen CSS und JS einen Tag lang zwischenspeichern, siehe `.htaccess`).
  HTML-Seiten fragt der Browser dagegen bei jedem Aufruf nach (`Cache-Control: no-cache`, unverändert kommt nur „304“) –
  so kommen auch die neuen `?v=`-Adressen sofort an.
- **nginx** – Beispiel:

  ```nginx
  server {
    root /var/www/vereinsflow-website;
    index index.html;
    error_page 404 /404.html;
    add_header Content-Security-Policy "default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self'; font-src 'self'; connect-src 'none'; object-src 'none'; base-uri 'self'; form-action 'self'; frame-ancestors 'none'" always;
    add_header X-Content-Type-Options nosniff always;
    add_header Referrer-Policy strict-origin-when-cross-origin always;
  }
  ```

HTTPS ist Pflicht (bei den genannten Anbietern meist kostenlos). Danach die Seite in der Google Search Console anmelden und
`sitemap.xml` einreichen.

## Werkzeuge

Alle laufen mit Node ohne weitere Installation. Die Bild-Werkzeuge leihen sich Playwright und sharp aus dem Hauptordner des
Repositories (`npm install` dort; änderbar mit `VF_APP_DIR`) und starten Edge (`VF_BROWSER_CHANNEL`, Standard `msedge`;
fehlt Edge, nimmt `capture-screenshots.mjs` das Chromium von Playwright).

| Befehl                                     | Wirkung                                                                                                   |
| ------------------------------------------ | --------------------------------------------------------------------------------------------------------- |
| `node tools/serve.mjs`                     | Vorschau-Server mit Produktions-Headern                                                                   |
| `node tools/check-site.mjs [--strict]`     | Prüft Verweise, Bilder, Symbole, fremde Server, Inline-Skripte/-Stile und listet offene Platzhalter       |
| `node tools/set-domain.mjs <https://…>`    | Ersetzt die Musterdomain `https://vereinsflow.example` (bereits erledigt)                                   |
| `node tools/paket-bauen.mjs`               | Baut `upload/vereinsflow-website.zip` für den Webspace Explorer (Stildatei und Skripte ohne Kommentare; ohne Abhängigkeiten) |
| `node tools/hochladen.mjs <Server> <Benutzer>` | Lädt die Website per SFTP nach `/public` – dieselben Dateien wie das Paket, die Stildatei ebenso bereinigt (Passwort wird im Terminal abgefragt, auf dem Server wird nichts gelöscht) |
| `node tools/demo-vorbereiten.mjs`          | Füllt den Demo-Verein der Aufnahme-Datenbank `vf_website` für die Bilder auf (siehe unten); `--entfernen` nimmt alles wieder heraus. Arbeitet mit keiner anderen Datenbank |
| `node tools/capture-screenshots.mjs`       | Nimmt die Anwendungsbilder neu auf (Demo-App muss laufen: `npm run dev:all`, Demo vorbereitet; `--only dashboard`; Bilder, die die Seite nicht zeigt, nur mit `--only <Name>`; `--scheme dark` nimmt dunkel auf, wird derzeit nicht verwendet) |
| `node tools/make-logo-assets.mjs <Logo-Paket>` | Übernimmt Logo-Dateien, Favicons, Vorschaubild und Mail-Logo aus dem Logo-Paket (Ordner `02-website`) und prüft Bildgrößen und die `width`/`height` der Logo-`<img>` (siehe „Logo“); `--pruefen` nur prüfen; ohne Abhängigkeiten |
| `node tools/make-og-image.mjs <ziel.png>`  | Erzeugt eine zweite Fassung des Vorschaubilds mit den beiden Telefonen (`tools/og-template.html`, mit `site.css`, dem Logo und den Telefonbildern); `--ersetzen` statt eines Ziels ersetzt `assets/img/og-image.png` aus dem Logo-Paket |
| `node tools/make-showcase-keyframes.mjs`   | Erzeugt die Keyframes der Vorführungen (Laptop und Telefon drehen sich beim Scrollen) aus den Bewegungsformeln und ersetzt sie am Ende von `assets/css/site.css`; ohne Abhängigkeiten |
| `node tools/geraete-css.mjs [--pruefen]`   | Setzt Laptop und Telefon **wörtlich** aus dem Stand `c112a20` in `assets/css/site.css` ein (sieben Bereiche zwischen den Markern `@@geraete-…`, Keyframes am Dateiende); `--pruefen` prüft nur. Die Bewegung der Geräte bleibt so unverändert, die neue Gestaltung (B4) bewegt nur die Hüllen `.pose`, `.kamera`, `.geraet` |
| `node tools/geraete-pruefen.mjs`           | Prüft, dass Laptop und Telefon sich wie in `c112a20` bewegen: Bereiche und 51 Keyframes wörtlich, 162 Transformwerte gleich, keine eigene Regel bewegt die Geräte, `site.js` 107–140 wörtlich, Markup der Geräte gleich, dazu die Matrizen zur Laufzeit in Chromium und WebKit (Playwright aus dem Hauptordner) |
| `node tools/geraete-standbild.mjs`         | Rendert das Schlussbild des Finales aus dem Markup der Startseite und der wörtlichen Gerätebewegung: Laptop zugeklappt bei 1,08 s, Telefon in der Endlage mit ausgeschaltetem Bildschirm, durchsichtiger Hintergrund, WebP mit Alpha in 720, 1080 und 1440 px (jede Breite eigens gezeichnet); meldet die Lage des Zeichens auf dem Deckel in Prozent (für `.zeichen-ziel`/`.zeichen-licht` in `site.css`). `--vorschau <Ordner>` schreibt nur PNG-Bilder |
| `node tools/kopf-fuss-pruefen.mjs`         | Prüft, dass Kopf- und Fußzeile auf allen fünf Seiten gleich sind (bis auf Pfade, Kapitel-Faden und Schalter der Startseite), die Symbole dafür in jeder Seite stehen und im Markup von `newsletter.php` kein Hochkomma steht |
| `node tools/fahrt-messen.mjs`              | Misst, wie flüssig die Kamerafahrt (Kapitel 1) ab der Ruhelage der Geräte läuft: Chrome (headless mit GPU, Spur über CDP) und WebKit, kalter und warmer Zwischenspeicher, Mausrad wie ein Trackpad und schnell. Tabellen: gezeigte Bilder und Lücken > 16,7 / 33 / 100 ms, verpasste Bilder je Abschnitt der Fahrt und je Ursache, Hauptthread je Bild (BeginMainFrame, PrePaint), Long Animation Frames, Rasterung, Dekodierung, Pipeline-Kompilierung im GPU-Prozess, Ebenen mit Gründen, Animationen außerhalb des Compositors. `--gegenprobe a,b` (Liste: `--gegenproben`) misst zusätzlich mit abgeschalteter Wirkung, nur im eingebauten Server (`kegelalt`, `titelalt`, `handyalt`, `spiegelaus` stellen je eine frühere Wirkung wieder her, `leer` ändert nichts und zeigt nur, was die Auslieferung einer Gegenprobe selbst ausmacht); weitere Schalter (`--browser`, `--fenster 1280x740@2`, `--runden`, `--json`, `--trace`) im Kopfkommentar |
| `node tools/b4-pruefen.mjs [schnell]`      | Browserprüfung der Startseite in Chromium, WebKit und „ohne scroll-driven Animationen“, mit und ohne „Bewegung reduzieren“, 320 bis 1920 px: Konsole und CSP, seitliches Scrollen, Text im Fenster bzw. Kasten (je Zeile, auch auf den Unterseiten), Kapitel-Faden (`aria-current`), Einblenden, Geräte in Ruhe, CLS; dazu die Größe von Skripten und Stildatei im Paket (über dem Ziel ein Fehler) |

Hinweise zu den Aufnahmen:

- **Reihenfolge:** Demo-App mit eigener Datenbank starten (siehe unten), `node tools/demo-vorbereiten.mjs`, für die
  Laptop-Bilder der Finanzen danach `finanzen-demo.mjs` (Kassenbuch mit Belegen, Rechnungen, Beitragslauf – liegt im
  Reel-Projekt `VereinsFlow-Medien`, nicht im Repository; arbeitet ebenfalls nur mit `vf_website`, vor einem erneuten
  `demo-vorbereiten.mjs` erst mit `--entfernen`), dann `node tools/capture-screenshots.mjs` und die Nacharbeiten
  weiter unten (Marken, Zahlen, `?v=`). Das Vorschaubild
  `og-image.png` kommt aus dem Logo-Paket und zeigt keine Aufnahmen; nur wer die Fassung mit den Telefonen nutzt
  (`node tools/make-og-image.mjs --ersetzen`), erzeugt es danach neu. Für Bilder in genau dem Stand der Website am selben Tag vorbereiten und aufnehmen
  (Eintritte, Helferstunden und Hinweise wie „dringend“ rechnet die Anwendung vom heutigen Tag aus).
- **`tools/demo-vorbereiten.mjs`** macht aus dem kleinen Seed einen lebendigen Verein und arbeitet nur mit der Datenbank
  `vf_website` (bricht bei jedem anderen Namen ab; Verbindung über `VF_DATABASE_URL`, Standard
  `postgresql://vereinsflow:vereinsflow@localhost:5432/vf_website`). Es blendet im Dashboard des Demo-Administrators die
  Karten „Erste Schritte“ (Einrichtungs-Checkliste) und „Offene Zahlungen“ aus – wie über „Anpassen“ in der Anwendung.
  „Offene Zahlungen“ bleibt bewusst aus: Der Einstieg zeigt den Vereinsüberblick (Mitglieder, Termine, Helfer), die Marken
  am Ende der Kamerafahrt sind auf die Kennzahl-Karten abgestimmt, und mit den Finanz-Demodaten stünden dort rote
  Hinweise auf überfällige Rechnungen; die Finanzen zeigt der Laptop im eigenen Kapitel. Außerdem legt es rund 210 erfundene Mitglieder mit leichtem Wachstum über zwölf Monate an
  (Bestand etwa 213 → 232), wöchentliche Trainings seit gut drei Monaten bis nach dem Sommerfest (sonst zeigte der Verlauf der Kennzahl „Termine in 30 Tagen“ einen Sprung von 1 auf 16), einzelne Termine rund um das Sommerfest,
  abgeschlossene Einsätze mit Helferstunden und einige Nachrichten der Seed-Konten (kein eigenes Bild mehr; bis Oktober 2026
  zeigte der Laptop die Nachrichten). **Termine:** Der Seed
  legt Sommerfest, Arbeitseinsatz & Co. ein bis zwei Wochen nach seinem Lauf an – auf der Website wären sie nach wenigen
  Tagen vorbei. Das Skript verschiebt deshalb alle kommenden Termine des Seeds (mit Schichten, Anmeldeschluss und
  Aufgaben) so, dass das Sommerfest auf `FEST_DAY` fällt (derzeit Samstag, 12. Juni 2027, „Sommerfest 2027“;
  Arbeitseinsatz Vereinsheim eine Woche davor). Rückt der Tag näher als zwei Monate, bricht es ab: dann `FEST_DAY` und
  `FEST_TITLE` im Skript, `FEST_WEEK` in `capture-screenshots.mjs` und die Angaben in `index.html` („Sommerfest 2027 ·
  12. Juni“, „Plätzen besetzt · Sommerfest 2027“) anpassen. Jeder Lauf ersetzt, was frühere Läufe angelegt haben (feste IDs); `--entfernen` stellt den
  Seed-Stand wieder her (auch die Termine des Seeds). Die Namen sind zufällig kombinierte, übliche Vor- und Nachnamen (keine mit „hel“ oder „Koch“ – die Bildfolgen
  suchen „Hel“ und filtern „Koch“), Anschriften in „Musterstadt“, E-Mail-Adressen unter `example.org`.
  `capture-screenshots.mjs` bricht ab, solange das Dashboard noch „Erste Schritte“ zeigt.
- Sie entstehen mit dem Demo-Administrator der Entwicklungsdatenbank. Namen werden **nur im Bild** (nicht in der Datenbank)
  ersetzt: Die Seed-Personen tragen ihre Rolle als Nachnamen („Hans Helfer“, „Claudia Abteilungsleiterin“) und heißen im Bild
  „Hans Hellwig“, „Claudia Abel“ usw. (gleicher Anfangsbuchstabe, Sortierung und Initialen bleiben); Anmeldeadressen
  `…@demo-verein.local` werden zu `…@example.org`. Von Hand angelegte Einträge, die nicht aus dem Seed stammen, bekommen
  ebenfalls einen erfundenen Namen (Liste `DEMO_RENAME` im Skript) – das Repository ist öffentlich.
- **Bildqualität:** Jede Datei wird in ihrer Breite eigens gezeichnet – der Browser rendert den Ausschnitt mit genau der
  Pixeldichte, die diese Breite ergibt (680 px aus 960 CSS-Pixeln = 0,708-fach), statt ein großes Bild herunterzurechnen –,
  und verlustfrei gespeichert (WebP lossless bzw. near-lossless). Nur Einzelbilder mit großen Farbverläufen (Dashboard,
  Finanz-Übersicht, Suche am Smartphone) nehmen Qualität 92, wenn verlustfrei mehr als 1,5-mal so groß wäre; Bildfolgen
  bleiben immer verlustfrei, damit unveränderte Flächen beim Überblenden nicht flimmern. Weiche Muster kosten verlustfrei
  viel: Hinter dem Suchdialog ist die Abdunkelung im Bild deshalb eine ruhige, deckende Fläche in ihrer Farbe (statt der
  weichgezeichneten Seite; `flatBackdrop` im Skript) – die Bildfolge der Suche wiegt so bei doppelter Dichte gut 150 statt
  über 700 KB.
- **Seitenleiste:** Ganze Fenster (Laptop, Dashboard) zeigen die Seitenleiste der Anwendung, wie sie eingestellt ist; die
  optionalen Ausschnitte rechts daneben entstehen mit der breiten Leiste (`sidebar: "breit"` im Skript).
- **Was die Seite zeigt** (Stand 19.10.2026, neu aufgenommen nach dem Dashboard im Stil „Vertix“: 43 Dateien, 2,0 MB):
  - `dashboard` (720 bis 2880 px): Laptop im Einstieg und in der Kamerafahrt, die flache Aufnahme am Ende der Fahrt und
    „Im Detail“ ohne Fahrt. Die flache Aufnahme wählt zuerst dieselbe Datei wie der Bildschirm (eine Anfrage); sobald die
    Fahrt beginnt, lädt und dekodiert `buehne.js` genau eine große Fassung (fensterbreit: 1440 bzw. 2880 px, `data-gross`)
    und setzt sie dann an beiden Bildern ein.
  - `phone-dashboard` (312 bis 1170): „Im Detail“ am Smartphone, im Telefon.
  - `phone-schichten` (182 bis 780): Telefon im Einstieg (Bildschirm 182/208 CSS-Pixel) und flaches Telefon in Kapitel 3
    (260/312), dazu `phone-schichten-live-1` (260 bis 780) als Stand vor Annas Eintrag (Kapitel 3, Schritt 1) – gefunden
    über den Listeneintrag „Schicht Getränkestand“ und die Knöpfe „In Getränkestand eintragen“ bzw. „… austragen“.
  - `helferplan-druck` (240 bis 800): der Aushang in Kapitel 3.
  - `phone-helferplanung` (260 bis 780): Telefon in „Unterwegs“ (ab „Meine Einsätze“, damit „Eintragen“ ganz zu sehen ist).
  - `laptop-finanzen-uebersicht` (720 bis 1760): Laptop in „Finanzen“.
  - Nicht mehr auf der Seite und deshalb `optional` (entstehen nur mit `--only <Name>`): `einstieg-dashboard`, die
    Browserfenster und Bildfolgen von `schichten`, `suche`, `mitglieder`, `kalender`, `auswertung`, die Telefonbilder
    `phone-suche`, `phone-mitglieder`, `phone-kalender`, `phone-auswertung` und die übrigen Finanz-Laptops.
- Die Bilder gibt es genau in den Breiten, in denen sie auf der Seite stehen (je Pixeldichte eine Datei), damit der Browser
  sie Pixel für Pixel zeichnet und die kleine Schrift scharf bleibt. Wer die Größe eines Geräts in `site.css` ändert
  (`--sw`, `--pw`, `--hw`), gleicht die Breiten im Skript (`widths`, bei Bildfolgen `frameWidths`) und `srcset`/`sizes` im
  HTML an. Neue Telefonbilder sind 390 × 760 Punkte groß – genau der sichtbare Teil des Bildschirms zwischen Statusleiste
  und Home-Balken –, damit der Rahmen nichts abschneidet.
- **Datum in den Bildern:** Die Aufnahmen zeigen, was die Anwendung am Aufnahmetag ausrechnet – beim Laptop „Stand
  18.10.2026“ und die Fälligkeiten der beiden offenen Rechnungen des Seeds („davon 2 überfällig“, „seit 21 Tagen
  überfällig“ in Rot; ihre Fälligkeit rechnet der Seed vom Tag seines Laufs aus, `finanzen-demo.mjs` lässt sie unverändert),
  im Einstieg das Datum der Begrüßung, am Telefon Angaben wie „in 230 Tagen“. Wer die Bilder später erneuert, nimmt sie
  deshalb alle am selben Tag neu auf. Ruhiger wirkte der Laptop mit Rechnungen, die noch nicht fällig sind (das hieße,
  die Fälligkeiten in der Aufnahme-Datenbank in die Zukunft zu legen – sie teilt sich das Reel-Projekt, daher bisher
  nicht geändert).
- Nach neuen Aufnahmen nachziehen: (1) die Lage der drei Marken auf dem Dashboard (`.m-suche`, `.m-zahlen`, `.m-termine`
  in `site.css`, in Prozent des Bildes), die Anteile der Kennzahlkarten für den Lichtstreif der Finanzen (`streifMessen()`
  in `buehne.js`) und – ändert sich die Ampel – die Bahn des Stroms zu Annas Platz (`data-pfad` an `#fluss-spur`); (2) die
  Zahlen im Text mit den Bildern abgleichen (233 Mitglieder, „10 von 21“ und Getränkestand 3/4, „+5.286,30 €“) und die
  Alt-Texte; (3) `width`/`height`, wenn sich ein Ausschnitt geändert hat; (4) an allen Bild-Links in `index.html` `?v=`
  erhöhen: Browser dürfen Bilder 7 Tage zwischenspeichern (siehe `.htaccess`) und zeigen unter gleicher Adresse sonst
  noch die alten.
- Eigene Demo-Datenbank nur mit Seed-Daten (so kommen keine eigenen Testeinträge ins Bild):
  `PGDATABASE=vf_website DATABASE_URL=postgresql://vereinsflow:vereinsflow@localhost:5432/vf_website npm run dev:all -- --seed`.
  Läuft im App-Ordner schon ein Entwicklungsserver, eine zweite Instanz mit eigenem Build-Ordner danebenstellen (wie die
  E2E-Tests), z. B. `PORT=3100 NEXT_DIST_DIR=.next-leer DATABASE_URL=… MIGRATION_DATABASE_URL=… APP_URL=http://localhost:3100
  node node_modules/next/dist/bin/next dev -p 3100` (vorher `prisma migrate deploy` mit derselben `MIGRATION_DATABASE_URL`),
  und beim Aufnehmen `VF_APP_URL=http://localhost:3100` setzen.
- Beim Aufnehmen entstehen Anmelde-Einträge im Änderungsprotokoll der Demo. Parallel laufende E2E-Tests der Anwendung nicht
  stören: Aufnahme und Tests belasten denselben Rechner.

## Logo

Das Logo (seit Oktober 2026): ein „V“ aus drei schwarzen (`#1A1A1A`) Etappen links und drei blauen (Vereinsblau `#3A6BEA`)
rechts, darunter ein oranger Punkt (Signalorange `#FF8A5E`) mit Tempo-Strichen; daneben die Wortmarke „VereinsFlow“ (Manrope
ExtraBold, geneigt) mit orangem Unterstrich. Für dunkle Flächen gibt es eine weiße Fassung mit Himmel-Blau (`#8FB0FF`), für
kleine Größen bis 32 px eine ruhigere Form (zwei Etappen je Seite, ohne Tempo-Striche).

- **Quelle aller Logo-Dateien ist das Logo-Paket** der Gestaltung (Ordner `02-website`, Dateien mit denselben Namen wie hier):
  `favicon.svg`/`.ico`, `apple-touch-icon.png`, `android-chrome-192/512.png`, `assets/img/logo.svg`, `logo-dark.svg`,
  `og-image.png`, `logo-mail.png` (+ `@2x`) und `assets/brand/*`. Nicht selbst nachzeichnen oder umfärben; ein neues Paket
  übernimmt `node tools/make-logo-assets.mjs <Ordner des Pakets>` (prüft auch Bildgrößen und die `<img>`-Angaben). Danach
  `?v=` an den Links erhöhen.
- **Kopf- und Fußzeile:** In der Kopfzeile stehen `logo-dark.svg` (über der Nacht) und `logo.svg` (über Papier) mit
  `width="125" height="28"` übereinander und wechseln nur über die Deckkraft; in der Fußzeile (Nacht) `logo-dark.svg` mit
  `160 × 36`. Kopien von Kopf und Fuß: `index.html`, `impressum.html`, `datenschutz.html`, `404.html`, `newsletter.php`
  (gleich gehalten, `tools/kopf-fuss-pruefen.mjs`).
- **Pinnnadel:** Der orange Punkt mit den Tempo-Strichen aus dem Logo ist der Schlusspunkt der großen Überschriften
  („in Fluss●“, „an einem Ort●“, „für Ihren Verein●“), die Spitze des Kapitel-Fadens in der Kopfzeile und die Marke der
  Kapitel und Schritte (Symbole `pin`, `pin-striche`, `pin-punkt` im Sprite von `index.html`, Formen und Maße wie im
  Logo-Paket).
- **Laptop-Deckel und Telefon-Rückseite** der Vorführungen zeigen das V in der ruhigeren Form, spiegelpoliert bzw. als
  glänzende Einlage (Symbole `i-mark-mirror` und `i-mark-gloss` am Anfang von `index.html`; Größe und Lage bestimmen die
  Regeln von `.device-mark` in `site.css`).
- **Aufnahmen der Anwendung** zeigen das Logo der Anwendung (Seitenleiste im Dashboard und im Laptop) – ändert es sich dort,
  die Bilder neu aufnehmen (siehe „Hinweise zu den Aufnahmen“).

## Benachrichtigung zum Start (`newsletter.php`)

Besucher können sich im Abschnitt `#benachrichtigen` für eine E-Mail zum Start und bei wichtigen Neuigkeiten anmelden
(Double-Opt-in: Bestätigungs-E-Mail, erst der Klick auf „Anmeldung bestätigen“ trägt ein). Alles steckt in `newsletter.php`
(PHP ab 7.4, keine Datenbank); Einzelheiten und alle Grenzwerte stehen im Kopfkommentar der Datei.

- **Daten:** außerhalb von `/public` im Ordner `/vereinsflow-daten` des Webspace (legt das Skript beim ersten Aufruf selbst an,
  über das Internet nicht abrufbar). Die Liste für den Versand ist `anmeldungen-bestaetigt.csv` (Excel, mit Spalte
  „Abmeldelink“) – im Webspace Explorer herunterladen. **`schluessel.txt` nie löschen:** Ohne ihn funktionieren die Abmeldelinks
  in bereits verschickten E-Mails nicht mehr; das Skript bricht dann bewusst mit einer Fehlerseite ab. Den ganzen Ordner
  `/vereinsflow-daten` mitsichern und bei einem Umzug mitnehmen. ZIP-Paket, Entpack-Helfer und SFTP-Upload berühren ihn nicht.
- **Bestätigungs-E-Mail:** gestaltet (HTML) und zusätzlich als reiner Text für Programme ohne HTML; Texte in
  `vf_mail_bestaetigen` und `vf_mail_bestaetigen_html`. Das Logo darin ist `assets/img/logo-mail.png` aus dem Logo-Paket
  (570 × 87 mit dem Logo in der Mitte, gezeigt 300 px breit und mittig; für hohe Pixeldichte `logo-mail@2x.png` per `srcset`)
  und wird von der Website geladen – die Dateien nicht umbenennen oder löschen, sonst fehlt das Logo auch in
  bereits verschickten E-Mails. Die Mail enthält bewusst nichts aus dem Formular (auch nicht den Vereinsnamen).
- **Hinweis ans Team:** Je bestätigter Anmeldung geht eine kurze E-Mail an `kontakt@vereins-flow.com` – bewusst ohne Adresse,
  nur mit der Gesamtzahl.
- **Aufräumen:** Unbestätigte Anmeldungen (7 Tage) und Abmeldungen (Nachweis 3 Jahre) werden bei jedem Aufruf des Skripts
  gelöscht; eine unbestätigte Anmeldung, die abgemeldet wird, sofort. Bietet der IONOS-Tarif Cronjobs, zusätzlich täglich `php …/public/newsletter.php aufraeumen` ausführen lassen.
- **Nach dem Hochladen testen:** einmal mit einer eigenen Adresse anmelden, bestätigen, abmelden. Kommt die E-Mail nicht an,
  bei IONOS prüfen, ob für die Domain SPF eingerichtet ist (DNS-Eintrag mit `include:_spf-eu.ionos.com`).
- **Launch-Mail oder Neuigkeiten verschicken:** Jede E-Mail **einzeln** an jeden Empfänger (Serienbrief), nie mehrere Adressen
  in An/CC/BCC. Zum Beispiel Thunderbird mit dem Konto `kontakt@vereins-flow.com` und dem Add-on „Mail Merge“: die CSV als
  Quelle, im Text der Platzhalter `{{Abmeldelink}}` für den persönlichen Link, bei vielen Empfängern in Portionen. Jede E-Mail
  braucht den Abmeldelink und diesen Fuß (Pflichtangaben):

  ```
  --
  VereinsFlow GbR, vertreten durch die Gesellschafter Ben Bleckert und Luis Heidecker
  Oberschlesienstraße 6a · 45711 Datteln · kontakt@vereins-flow.com
  Impressum: https://vereins-flow.com/impressum.html
  Datenschutz: https://vereins-flow.com/datenschutz.html#benachrichtigung
  Abmelden: {{Abmeldelink}}
  ```

  Heruntergeladene Kopien der CSV nach dem Versand wieder löschen.
- **Einwilligungstext** (Fassung `formular-2026-09-27`, wird je Anmeldung mitgespeichert – bei einer Änderung am Formular
  `VF_EINWILLIGUNG` in `newsletter.php` hochzählen und den neuen Wortlaut hier ergänzen):
  „Mit dem Absenden willigen Sie ein, dass die VereinsFlow GbR Ihnen E-Mails zum Start und zu wichtigen Neuigkeiten von
  VereinsFlow schickt – selten, höchstens etwa einmal im Monat. Sie bekommen zuerst eine E-Mail mit einem Bestätigungslink.
  Abmelden können Sie sich jederzeit über den Link in jeder E-Mail. Mehr in der Datenschutzerklärung.“
- **Seiten des Skripts** (`vf_seite`): dieselbe Kopf- und Fußzeile wie Impressum und Datenschutz (Papier mit Fuß auf der
  Nacht; bei Änderungen an Kopf oder Fuß der Startseite alle Kopien nachziehen: `datenschutz.html`, `impressum.html`,
  `404.html`, `newsletter.php` – `tools/kopf-fuss-pruefen.mjs` vergleicht sie). Das Markup steht dort in einem PHP-String in
  einfachen Hochkommas: kein `'` hineinschreiben (die Prüfung meldet es).
  Der optionale letzte Wert `$symbol` („mail“ oder „circle-check“) setzt ein großes Zeichen über die Überschrift. Nach
  „Fast geschafft“ und „Danke, Sie sind angemeldet“ steht neben „Zur Startseite“ ein zweiter Knopf „Demo anfragen“
  (`vf_start_demo_links`). „Fast geschafft“ nennt zum Wiederfinden der E-Mail Absender, Betreff und Frist
  (`vf_mail_hinweise`; der Betreff steht dort ein zweites Mal – bei einer Änderung in `vf_mail_bestaetigen` mitziehen).
- **Lokale Vorschau:** `tools/serve.mjs` führt kein PHP aus; ein Absenden zeigt dort nur einen Hinweis. Getestet wurde das
  Skript mit PHP als WebAssembly (`@php-wasm/node`, PHP 7.4 und 8.3).

## Gestaltung und Bewegung (B4 „Spektakel“)

Umgesetzt ist der abgestimmte Entwurf B4 „Spektakel“ (Jury 19.10.2026) mit den Kapiteln und dem roten Faden aus B3:
Kino-Einstieg mit 3D-Geräten und einer Kamerafahrt in den Laptop, Studiolicht und Lichthöfe statt farbiger Flächen, große
bewegte Schrift, Karten und Knöpfe, die auf den Zeiger reagieren, und ein Lichtfluss, der durch alle Kapitel zieht
(„Bringt Vereinsarbeit in Fluss“). Die Geschichte ist das Sommerfest 2027 des Beispiel-Vereins TSV Musterstadt 1898 e.V.
mit Anna Adler (sie trägt sich am Getränkestand ein, sie ist Vereinsadministratorin). Nacht (`#060B16`) für Einstieg,
Ausgangslage, Unterwegs, Funktionen und Demo, Papier (`#F6F3EC`) für Helferplanung, Finanzen, Vertrauen, „So starten Sie“ und Fragen;
jeder Wechsel ist ein Bogen, der sich beim Scrollen über das Kapitel davor schiebt.

### Die zehn Kapitel

| Kap. | Anker | Fläche | Was geschieht (mit Bewegung) | Ohne Bewegung, ohne Skript, schmal |
| --- | --- | --- | --- | --- |
| 1 Einstieg | `#top` | Nacht | Laptop (−17°, leicht von oben, schwache Spiegelung im Boden) und Telefon (−24°) in 3D-Posen über die Hülle `.pose`, Studiolicht, Lichtkanten am Titanrahmen (gemessen), „Fluss“ hinter der Deckelkante, die Pinnnadel auf der Deckelecke. Raster wie Kopfzeile und Kapitel: Text am Inhaltsrand (`--x0`), Geräte bis an den Seitenrand (`--gx`), Maßstab `--u` so, dass alles passt und die Überschrift 16 px unter der Kopfzeile steht. Bis der Laptop posiert, steht seine Hülle um den Weg weiter rechts, den die Drehung ausmacht (Deckelkante bleibt stehen, läuft nie über den Text). Ab 1024 × 720 klebt die Bühne über `--fahrt-strecke` (220svh) und die Kamera fährt in den Laptop: Überschrift fliegt vorbei, das Telefon zieht in seiner Pose rechts hinaus, ab 58 % frontal, ab 88 % Maßstab 1, dann die flache Aufnahme mit drei Marken und der Tafel „Zahlen, die dem Vorstand helfen“ (`#im-detail`); die Kopfzeile fährt dabei aus | Bühne in Ruhe, „Im Detail“ als eigener Abschnitt (am Smartphone im Telefon); ohne scroll-driven Animationen drei feste Stufen |
| 2 Ausgangslage | `#ausgangslage` | Nacht | Wortwalze „VereinsFlow bündelt …“: das Wort wechselt an vier Scroll-Zonen (kein Zeitgeber), vier Lichtlinien laufen in den Punkt hinter „Ort“; dann schiebt sich der Papierbogen hoch, der Strom färbt sich an der Kante zu Tinte | die vier Wörter untereinander, harter Schnitt |
| 3 Helferplanung | `#helferschichten` | Papier | ab 1200 × 760 eine Spur in drei Schritten: Ampel baut sich auf (9 von 21), ein Lichtkomet (Kopf mit Schein in Signalorange, Schweif aus Tinte, 1,2 s, nur zeitgesteuert) fliegt den Strom entlang in Annas Platz – Ring, Lichthof und Zeile glimmen einmal auf (10 von 21, Telefon und Chips zeigen ihren Eintrag), der Aushang schiebt sich herein | drei Kacheln im Endstand |
| 4 Unterwegs | `#unterwegs` | Nacht | das Telefon dreht sich ins Bild (wie bisher), ab 1200 × 720 kreisen fünf Glas-Chips auf einer geneigten Umlaufbahn aus Licht | Chips als Reihe |
| 5 Funktionen | `#funktionen` | Nacht | „13“ rollt hoch; neun Karten und „Dazu“ mit vier Chips, je Bereich ein Popover (Text wie bisher); mit Maus neigt sich die Karte (≤ 8°), Glanz und Lichtkante folgen dem Zeiger, der Strom weicht ihm aus | Karten ruhig, Popovers ohne Skript |
| 6 Finanzen | `#finanzen` | Papier | ab 1024 px Text links, Laptop rechts (dreht sich wie bisher, steht frontal); einmal ein Lichtstreif über die Kennzahlkarten, „+5.286,30 €“ zählt hoch | untereinander, Zahl steht |
| 7 Vertrauen | `#sicherheit`, `#rollen` | Papier | Datenblatt mit vier Punkten; die fünf Rollen als drei ineinanderliegende, leicht gekippte Milchglas-Rahmen legen sich von außen nach innen, Annas Plakette folgt; „Mehr dazu“ mit sieben Punkten; drei langsame Tintenlinien am Fuß | stehend |
| 8 So starten Sie | `#ablauf` | Papier | die Startlinie zeichnet sich, die Pinnnadel fährt einmal von 1 über 2 nach 3 und füllt die Punkte | Nadel auf 3 (schmal senkrecht, ohne Nadel) |
| 9 Fragen | `#faq` (`#ausprobieren`) | Papier | fünf Fragen; beim Aufklappen gleiten die Fragen darunter, die Antwort blendet ein (Chromium: View Transition, sonst Web Animations); eine Sprungmarke öffnet die Frage | sofort auf |
| 10 Demo | `#kontakt`, `#benachrichtigen` | Nacht | „Eine Demo / für Ihren Verein●“, der leuchtende Demo-Knopf (E-Mail, vorausgefüllt), Anruf, Adresse kopieren; Schlussbild Laptop zugeklappt und Telefon (Standbild); der Strom zieht sich im Pfeil des Knopfs zusammen (1,5 s), der Lichthof atmet einmal, drei Lichtlinien wachsen zum Zeichen auf dem Deckel (0,9 s), das einmal aufleuchtet; darunter die Papier-Insel mit der Anmeldung | Endstand |

Kopfzeile: eine schwebende Glasinsel, über der Nacht dunkel, über Papier hell (gemessen an ihrer Mittellinie, gewechselt nur
über Deckkraft). Darunter der **Kapitel-Faden**: zehn echte Anker mit Namen (bei Hover und Fokus, nach einem Klick auf einen
Rastpunkt 1,5 s beim Einrasten – beim bloßen Scrollen nicht; die Rastpunkte stehen nicht in der Tab-Reihenfolge, dieselben
Ziele haben Navigation und Menü), die Pinnnadel rastet am aktuellen Kapitel ein, je Kapitel genau ein `aria-current` in der Navigation
(Kapitel 2–4 „Helferplanung“, 8–9 „Fragen“, 10 der Demo-Knopf mit Ring). Unter 900 px Logo, „Demo“ und Menüknopf, der
Faden nur als Fortschrittsstrich. Fußzeile auf der Nacht mit dem Schalter „Bewegung anhalten“ (im Einstieg rechts unten im
Seitenrand nur als Zeichen, der Name erscheint bei Zeiger und Fokus).

### Regeln der Bewegung

- Was gelesen wird, erscheint einmal und bleibt; was nur verbindet (Lichtfluss, Licht), darf dauernd laufen. Szenen rasten
  in festen Zuständen ein (IntersectionObserver-Bänder), gescrubbt wird nur die Kamerafahrt. Keine Scroll-Listener.
- Bewegt werden nur `transform` (auch `translate`, `rotate`, `scale`), `opacity` und `filter`, dazu Canvas – nie das
  Layout. Kurven `--ease-out`, `--ease-in-out`, `--ease-drawer` und die Federn `--feder-ruhig`/`--feder-rast` (`linear()`,
  sonst `--ease-out`); Dauern: Druck 120 ms, Hover 150 ms, Zustand 200–250 ms, Auftritt 450–600 ms.
- Bühnen (klebende Szenen) nur mit `(min-width: 1024px) and (min-height: 720px) and (prefers-reduced-motion:
  no-preference)` (Spur und Umlaufbahn ab 1200 px), darunter der „Kompakt-Modus“.
- Vorzustände (unsichtbar, versetzt) gelten nur mit Skript und Bewegung (`html.js`, in Kapitel 7–10 erst mit `.ist-bereit`,
  das `buehne.js` setzt); `:focus-within` hebt sie auf. Ohne Skript steht alles im Endstand.
- **„Bewegung reduzieren“:** alles im Endstand, keine klebenden Bühnen, Kapitel 3 als Kacheln, der Lichtfluss als ein
  einziges Standbild ohne Schleife, keine Neigung, kein Magnet. Dazu `prefers-reduced-transparency` (Glas fast deckend),
  `prefers-contrast: more`, `forced-colors` (Licht und Canvas aus) und Druck (Nacht wird Papier, alles im Endstand).
- **Schalter „Bewegung anhalten“** (WCAG 2.2.2, im Einstieg und in der Fußzeile): hält Lichtfluss, Umlaufbahn und
  Übergänge an; das Finale steht dann gleich im Endstand. Gilt nur für den Besuch – die Seite speichert nichts im Gerät.

### Laptop und Telefon

- Markup, CSS und Bewegung **wörtlich wie `c112a20`**: `tools/geraete-css.mjs` setzt die sieben Gerätebereiche zwischen die
  Marker `@@geraete-…` in `site.css` (Keyframes am Dateiende, `tools/make-showcase-keyframes.mjs` funktioniert unverändert),
  `site.js` startet sie mit denselben Zeilen wie bisher. Neue Posen, die Kamerafahrt und Licht nur über die Hüllen
  `.geraet`, `.kamera` und `.pose` sowie über eigene Ebenen; an `.showcase*`, `.laptop*`, `.iphone*` und `.phone` setzt
  `site.css` außerhalb der wörtlichen Bereiche nur Größen (`--sw`, `--pw`, `--rim`; im Einstieg `--sw` über `--k01-sw`),
  `object-position` und – bewusste Ausnahme in der Ruhelage – die Eckstreifen des gedrehten Telefons im Einstieg
  (`.iphone-rim` sichtbar, sonst klafften an den runden Ecken Lücken; keine Bewegung, die Matrizen bleiben gleich).
  Ausgleich der Pose (`translate` an `.geraet-laptop`, 0,1618 der Bildschirmbreite) und Spiegelung (`-webkit-box-reflect`)
  sitzen an der Hülle. `tools/geraete-pruefen.mjs` prüft das, auch zur Laufzeit in Chromium und WebKit.
- **WebKit in Playwright zeigt kein 3D:** Bildschirmfotos aus Playwright-WebKit werden ohne Compositing gezeichnet –
  jede 3D-Transformation erscheint flach (Gegenprobe: ein einfacher Würfel aus zwei Flächen mit `preserve-3d` ist dort ebenfalls
  flach, in Chromium räumlich). Dem Laptop fehlt dort deshalb scheinbar das Unterteil (die Tastatur steht senkrecht zur
  Bildebene und wird zur Linie) – auch auf der alten Seite. Das ist eine Grenze des Werkzeugs, kein Fehler der Seite; die
  Matrizen prüft `tools/geraete-pruefen.mjs` trotzdem in WebKit. Gegenprobe auf echtem Safari (Mac, iPhone, iPad) steht aus.
- Je Abschnitt lebt höchstens ein Gerätepaar; das Schlussbild des Finales ist ein Standbild aus der echten Bewegung
  (`tools/geraete-standbild.mjs`, nach einer Änderung an den Geräten neu erzeugen und die gemeldete Lage des Zeichens in
  `site.css` bei `.zeichen-ziel`/`.zeichen-licht` eintragen).

### Lichtfluss, Zählwerke und Leistung

- **Lichtfluss** (`fluss.js`): ein Strom aus Fasern entlang einer Bahn (`data-pfad`, Anteile der Fläche; schmal
  `data-pfad-kompakt`), auf der Nacht leuchtend, auf Papier als Tinte; dazu Lichtlinien mit Pulsen, Ziel und Start an
  Elementen (`data-ziel`, `data-start`), Zwillinge (gleicher Strom in zwei Ebenen: Wechsel Nacht → Papier, Umlaufbahn),
  Zeiger (weicht aus), Flug (Kapitel 3), Sammeln und Wachsen (Finale). Alle Optionen im Kopfkommentar der Datei.
- **Leistung:** eine gemeinsame Schleife nur für sichtbare Flächen, angehalten bei verborgenem Tab und mit dem Schalter;
  Pixeldichte höchstens 1,5 und höchstens 2 Millionen Bildpunkte je Fläche; einen Bildpuffer haben nur Flächen in der Nähe
  des Fensters (eine Fensterhöhe davor und danach), weiter weg wird er freigegeben (`width = 0`); die ruhigen Grundlinien
  der Lichtlinien werden in Leerlaufzeit vorgezeichnet, bevor sie ins Bild kommen, und ohne Schatten-Unschärfe (ein breiter,
  schwacher Strich darunter ist der Schein) – vorher stand die Seite beim ersten Zeichnen bis zu 1,9 s (mit GPU) bzw. 4 s
  (ohne); je Faser ein vorgezeichneter Strich; auf schwachen Geräten (höchstens 4 Kerne oder 4 GB) halbe Faserzahl und 30
  Bilder je Sekunde; bei „Daten sparen“ ein Standbild. Über Text leuchtet der Strom gedämpft (`data-leise`: Überschrift im
  Einstieg, Zahl und Schritte der Helferplanung). Der Strom im Finale läuft an der Kante weich aus (Maske).
  `backdrop-filter` nur an Kopfzeile, Ampel, Tafel und Popovers (das Bento hat eine Tönung ohne Unschärfe). Bilder mit
  `width`/`height` und `srcset` in den gezeichneten Breiten, `loading="lazy"` außer im ersten Bildschirm.
- **Kamerafahrt (Kapitel 1)** – gemessen mit `tools/fahrt-messen.mjs` (20.10.2026, MacBook Air M5, 60 Hz; ab der Ruhelage
  der Geräte durch die ganze Fahrt bis in Kapitel 2, Mausrad in 16-ms-Schritten). In der Fahrt bewegen sich nur Hüllen
  über `transform`/`opacity` auf dem Compositor, ohne Live-Filter, und beim Losfahren wird keine Ebene umgebaut. Vier
  Maßnahmen, die man nicht oder kaum sieht:
  1. **Lichtkegel ohne `filter: blur(28px)`** – `clip-path` schneidet erst nach dem Filter, die Unschärfe wirkte nur an
     der Oberkante (höchstens 4/255); diese weiche Kante steht jetzt im Verlauf. Der Filter kostete WebKit beim Abblenden
     des Lichts (ab 60 %) eine Lücke von 110–120 ms.
  2. **Spiegelung des Laptops bleibt in der Fahrt** – früher `-webkit-box-reflect: none` beim Losfahren. Chromium kennt
     diesen Wert nicht (es behielt die Spiegelung also schon immer), WebKit baute dafür die Spiegel-Ebenen neu auf: eine
     Lücke von 45–130 ms genau beim ersten Scrollen. Jetzt zeigen beide Browser dasselbe; die Spiegelung fährt mit dem
     Laptop aus dem Bild. (Zum Abschalten in Gegenproben `unset` schreiben, nicht `none`.)
  3. **Telefon dreht beim Losfahren nicht mehr weg** – es bleibt bei −24° und zieht wie bisher rechts hinaus, wächst und
     blendet aus. Jede Drehung weg von der Kamera macht Eckstreifen des Rahmens sichtbar, die Chromium erst in diesem
     Moment rastert: je ein verpasstes Bild (3 von 4). Eine Drehung zur Kamera hin oder gar keine kostet nichts; als flache
     Hülle gedreht war das Telefon unscharf, an die Fahrt gebunden half die Drehung nicht.
  4. **Überschrift ohne `filter: blur`** in `fahrt-titel` (höchstens 2 px bei einem Fünftel Deckkraft) – mit Filter lief
     die Animation in Chromium nicht auf dem Compositor und wurde bis 42 % in jedem Bild neu gerastert.

  Der Übergang des Laptops in die Frontalansicht (0,9 s) bleibt: Er kostet in Chromium je Bild gut 4 ms PrePaint, ohne ihn
  (Sprung) wird WebKit aber deutlich schlechter. Verpasste Bilder je Durchgang (kalt, Mittel aus drei Läufen, vorher →
  nachher): Chrome 1440 × 900 @2 Trackpad 4 → 1 (99,3 % der Bilder ≤ 16,7 ms, längste Lücke 33 ms, keine Long Animation
  Frames, keine langen Aufgaben), 1280 × 740 @2 3 → 1; WebKit 1440 × 900 @2 Trackpad 11 → 4 (längste Lücke 110 → 46 ms),
  schnell 9 → 1, 1280 × 740 @2 Trackpad 15 → 11, schnell 11 → 3; mit warmem Zwischenspeicher WebKit 11 → 2 bzw. 6 → 3.
  Grenze: Playwright-WebKit stockt in etwa jedem dritten Lauf (auch mit dem alten Stand, häufiger bei Gegenproben) bei
  0 %, 42 % und 88 % für 70–130 ms bei freiem Hauptthread – vorher 13–20, jetzt 8–12 verpasste Bilder. Das lässt sich mit
  keiner einzelnen Wirkung abschalten (die Gegenprobe `leer` zeigt es auch) und ist in echtem Safari gegenzuprüfen (Web
  Inspector → Timelines → Rendering Frames). Beim allerersten Zeichnen eines Effekts kompiliert Chrome einmalig eine
  Pipeline im GPU-Prozess (80–160 ms je Effekt, danach im Shader-Speicher von Metal) – zwei Live-Filter weniger heißt zwei
  solche Stopps weniger.
- **Zählwerke** (`data-zahl`: „10“, „13“, „+5.286,30“): `buehne.js` baut nur mit Bewegung je Ziffer ein Fenster mit einer
  Rolle; gerollt wird in ganzen Zeilen, in Ruhe steht immer die ganze Endziffer. Während des Rollens laufen die Fenster
  oben und unten weich aus (Maske `--zw-f`, immer mindestens so breit wie der Versatz der Ziffer) und die Rolle ist
  verwischt – beides folgt dem verbleibenden Weg und ist bei der Ankunft null; die vorderen Stellen rasten früh ein, nur
  die hinteren rollen lange. Bis zum Start ist die Zahl unsichtbar (keine „+0.000,00 €“). Ohne Skript und ohne Bewegung
  steht die Zahl als Text; für Screenreader steht sie daneben als Satz (`.sr-only`). Kein Layout-Springen (CLS 0 gemessen,
  auch beim Neuladen mitten auf der Seite: Kapitel 4 behält mit Umlaufbahn seine Höhe, `--chips-h`; Schalter und
  Kopierknopf stehen mit JavaScript von Anfang an im Layout).
- **Größen** (20.10.2026): Skripte zusammen 98 KB Quelltext, im Paket 68 KB (ohne Kommentare und Einrückung), übertragen
  (gzip) 21 KB; Stildatei 302 KB Quelltext, 204 KB im Paket, 39 KB übertragen. `tools/b4-pruefen.mjs` meldet einen Fehler,
  wenn das Paket die Ziele überschreitet (Skripte 72 / 26 KB, Stildatei 215 / 45 KB).

### Prüfen

`node tools/check-site.mjs --strict` (Verweise, Bilder, CSP-Regeln), `node tools/geraete-pruefen.mjs` (Geräte wie bisher),
`node tools/b4-pruefen.mjs` (Browser-Matrix: Chromium, WebKit, ohne scroll-driven Animationen, mit und ohne „Bewegung
reduzieren“, 320 bis 1920 px; dazu je Textzeile, ob sie aus dem Fenster oder aus einem abschneidenden Kasten läuft – auch
auf Impressum, Datenschutz und Fehlerseite, denn `overflow-x: clip` an html/body verdeckte das sonst – und die Größe des
Pakets) und `node tools/kopf-fuss-pruefen.mjs` (Kopf und Fuß auf allen Seiten gleich). Hinweis zu
WebKit in Playwright: Bildschirmfotos dort fügen ein eigenes Stylesheet ein, das die CSP der Seite ablehnt – die Meldung
„Refused to apply a stylesheet …“ kommt dann vom Werkzeug, nicht von der Seite.

## Entscheidungen, die sich leicht ändern lassen

- **Ansprache:** „Sie“ (die Anwendung selbst duzt). Texte stehen direkt in den HTML-Dateien.
- **Handlungsaufforderung:** „Demo anfragen“ per E-Mail – die Plattform ist geschlossen, neue Vereine richtet der Betreiber ein
  (siehe `/registrieren` der Anwendung). Ein Kontaktformular gibt es bewusst nicht; das einzige Formular ist die Anmeldung
  „Beim Start benachrichtigen“ (siehe unten).
- **Schrift:** Systemschrift des Geräts (auf Apple-Geräten SF Pro, unter Windows Segoe UI). Die Wortmarke des Logos (Manrope
  ExtraBold, geneigt) liegt als Vektorgrafik vor.
- **Farben:** die Farben des Logos – Tinte `#0F1C2E`, Vereinsblau `#3A6BEA`, Himmel `#8FB0FF`, Signalorange `#FF8A5E`,
  Papier `#F6F3EC` – dazu die Nacht `#060B16`. Signalorange trägt die Hauptaktion („Demo anfragen“, Text in Tinte 7,4 : 1)
  und die Pinnnadel; Himmel und Vereinsblau sind Licht und Akzent. Textfarben je Fläche mit gemessenem Kontrast (Werte und
  Verhältnisse oben in `site.css`, `:root`). Die Seite folgt bewusst nicht der hellen oder dunklen Einstellung des Geräts.
- **Bewegung:** siehe „Gestaltung und Bewegung“. Leicht zu ändern: die Länge der Kamerafahrt (`--fahrt-strecke`, derzeit
  220svh), die Dauern im Finale (`buehne.js`, „Kapitel 10 · Finale“), ob Kapitel 5 Nacht bleibt (Klasse `nacht` statt
  `papier` am Abschnitt, Farben folgen den Variablen).
