# VereinsFlow – Website

Werbeseite für VereinsFlow: eine Startseite (`index.html`) mit Impressum, Datenschutzerklärung und Fehlerseite. Reines HTML
und CSS mit einem eigenen Skript (Menü, aktiver Abschnitt, Start der Geräte-Vorführungen), **keine Cookies, keine
Bibliotheken, keine Webfonts, nichts von fremden Servern**. Einzige Ausnahme vom rein Statischen: die Anmeldung „Beim Start
benachrichtigen“ (`newsletter.php`, braucht PHP – siehe „Benachrichtigung zum Start“). Gestaltung „Pro“ (seit 16.11.2026,
nach den Apple-Pro-Entwürfen): durchgehend Nacht, Glas-Kopfleiste, große Schrift, die App in Glas-Ebenen, Metall-Zahlen
(siehe „Gestaltung und Bewegung“); die Farben hängen nicht von der Einstellung des Geräts ab. Die Bilder sind echte
Aufnahmen der Anwendung (Demo-Daten).

Die Website liegt als Ordner `website/` im VereinsFlow-Repository, neben der Anwendung im Hauptordner. Beide haben getrennte
Werkzeuge und Prüfungen: Die Anwendung ignoriert `website/` (Prettier, ESLint, Docker, CI), die Website prüft sich selbst
(`node tools/check-site.mjs`, in der CI als `website.yml`).

> **Stand:** Die Seite ist **noch nicht veröffentlicht**. Alle Angaben sind eingetragen (siehe unten). Auf dem Branch
> `website-pro` läuft der Umbau auf die Pro-Gestaltung: Grundgerüst in der Endlage fertig (16.11.2026), die neuen
> Bewegungen (Explosion, Aussage, Metall-Zahlen, großes Telefon) folgen.

## Inhalt

| Datei / Ordner                        | Zweck                                                                                       |
| ------------------------------------- | ------------------------------------------------------------------------------------------- |
| `index.html`                          | Startseite in elf Kapiteln: Einstieg „Schicht für Schicht.“, Ausgangslage, die Geräte von heute, Funktionen, Helferplanung, Unterwegs, Finanzen, Sicherheit, So starten Sie, Fragen, Kontakt (mit der Anmeldung „Beim Start benachrichtigen“) – siehe „Gestaltung und Bewegung“ |
| `ueber-uns.html`                      | Über uns: „Mission & Leitbild“ und „Wer wir sind“, verlinkt in der Fußzeile                 |
| `impressum.html`, `datenschutz.html`  | Rechtstexte (ausgefüllt, Stand 26.09.2026)                                                 |
| `404.html`                            | Fehlerseite                                                                                 |
| `assets/css/site.css`                 | Die ganze Gestaltung, eine Datei für alle Seiten; Farben, Schrift, Abstände und Kurven als Variablen oben in `:root`, das Inhaltsverzeichnis im Kopfkommentar. Laptop und Telefon stehen darin **wörtlich** wie im Stand `c112a20` (zwischen den Markern `@@geraete-…`, Keyframes am Dateiende) |
| `assets/js/frueh.js`                  | Nur Startseite: setzt `html.js` vor dem ersten Zeichnen – die Strecken der gepinnten Bühnen haben dann schon ihre Höhe, wenn der Browser die Scrollposition wiederherstellt (keine Verschiebung) |
| `assets/js/bewegung.js`               | Nur Startseite: startet die selbstlaufende Explosion (Schwellen 20 / 4 px, vor- und rückwärts, umkehrbar) und begleitet die Bewegung beim Scrollen (die Bewegung selbst steht in `site.css`): Bilder vorab dekodieren, `will-change` nur nahe am Fenster, Rückfall für Browser ohne scroll-driven animations (`currentTime` je Bild), Leseposition beim Umschalten von „Bewegung anhalten“ bzw. „Bewegung reduzieren“ halten |
| `assets/js/site.js`                   | Alle Seiten: Menü (unter 900 px, mit `inert`, Esc, Fokus zurück), aktiver Abschnitt in Kopfleiste und Menü (`aria-current`), Einblenden (`.erscheint`), Frage per Sprungmarke öffnen, E-Mail-Adresse kopieren, Schalter „Bewegung anhalten“ (`html.ist-ruhig`, Ereignis `vf:ruhe`); dazu wörtlich der Start der Geräte-Bewegung (Zeilen 107–140 aus `c112a20`). Ohne Skript bleibt alles nutzbar |
| `assets/img/app/`                     | Aufnahmen der Anwendung: in den Geräten von heute die hellen Bilder vom 22.10.2026 (`…-light-…`, `tools/capture-screenshots.mjs`), dazu die Bilder der Pro-Gestaltung aus den Original-Aufnahmen vom 16.11.2026 (Ebenen der Explosion, Schichtkarte, Helferplan, dunkle Telefonbilder; `tools/bilder-pro.mjs`) – je Bild die Breiten, die die Seite zeigt (siehe „Hinweise zu den Aufnahmen“) |
| `assets/img/`, `assets/brand/`        | Logo (Seite, `logo.svg`), Logo für die Bestätigungs-E-Mail (`logo-mail.png`, `@2x`), Logo-Vorlagen (Presse, Präsentationen) und Vorschaubild `og-image.png` – alles aus dem Logo-Paket (siehe „Logo“) |
| `favicon.svg`, `favicon.ico`, `apple-touch-icon.png`, `android-chrome-*.png`, `site.webmanifest` | Symbole für Browser-Tab, Lesezeichen und Startbildschirm (aus dem Logo-Paket); das Web-Manifest nennt Name und Symbole |
| `robots.txt`, `sitemap.xml`           | Für Suchmaschinen (Domain `https://vereins-flow.com`)                                         |
| `_headers`, `.htaccess`               | Sicherheits- und Cache-Header für Netlify/Cloudflare Pages bzw. Apache-Webspace              |
| `Vorschau-starten.cmd`, `.command`    | Windows bzw. Mac: Doppelklick startet die Vorschau und öffnet den Browser                   |
| `tools/`                              | Werkzeuge (siehe unten); müssen nicht hochgeladen werden                                    |
| `upload/vereinsflow-website.zip`      | Fertiges Paket zum Hochladen auf den IONOS-Webspace (erzeugt von `tools/paket-bauen.mjs`, siehe „Veröffentlichen“) |
| `upload/entpacken.php`                | Einmal-Helfer, der das Paket auf dem Webspace auspackt und sich danach selbst löscht         |
| `THIRD-PARTY-NOTICES.md`              | Lizenzhinweise der Symbole (lucide, ISC) und der Abteilungsfotos in den Aufnahmen (Unsplash) – bitte mit veröffentlichen |

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

1. **Angaben sind eingetragen** (Stand 26.09.2026): VereinsFlow GbR (Luis Heidecker (geschäftsführender Gesellschafter) und Ben Bleckert (Gesellschafter)),
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
  Nummer, derzeit `?v=2026112801` an der Stildatei und `?v=2026111602` an `site.js`, `?v=20260927-2` an `frueh.js`; Module, die andere
  Module importieren, tragen die Nummer auch dort). Sonst liefern Browser und der Zwischenspeicher von
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
| `node tools/bilder-pro.mjs`                | Erzeugt die Bilder der Pro-Gestaltung (Ebenen der Explosion, Schichtkarte, Helferplan, dunkle Telefonbilder) als WebP in den Breiten der Seite aus den Original-Aufnahmen (PNG) des Entwurfs `apple-pro/_bilder` (`--quelle`, `VF_BILDER`); Ausschnitte der Ebenen wie im Entwurf 02; `--nur <Name>`, `--pruefen` |
| `node tools/capture-screenshots.mjs`       | Nimmt die Anwendungsbilder neu auf (Demo-App muss laufen: `npm run dev:all` oder eine zweite Instanz, siehe unten, mit `VF_APP_URL`; Demo vorbereitet; `--only dashboard`; Bilder, die die Seite nicht zeigt, nur mit `--only <Name>`; `--scheme dark` nimmt dunkel auf, wird derzeit nicht verwendet). Die Seite zeigt davon seit 16.11.2026 nur noch `dashboard`, `phone-schichten` (182–624) und `laptop-finanzen-uebersicht` in den Geräten |
| `node tools/make-logo-assets.mjs <Logo-Paket>` | Übernimmt Logo-Dateien, Favicons, Vorschaubild und Mail-Logo aus dem Logo-Paket (Ordner `02-website`) und prüft Bildgrößen und die `width`/`height` der Logo-`<img>` (siehe „Logo“); `--pruefen` nur prüfen; ohne Abhängigkeiten |
| `node tools/make-og-image.mjs <ziel.png>`  | Erzeugt eine zweite Fassung des Vorschaubilds mit den beiden Telefonen (`tools/og-template.html`, mit `site.css`, dem Logo und den Telefonbildern); `--ersetzen` statt eines Ziels ersetzt `assets/img/og-image.png` aus dem Logo-Paket. Braucht `phone-dashboard` und `phone-helferplanung`, die die Seite seit 16.11.2026 nicht mehr zeigt – vorher mit `capture-screenshots.mjs --only …` erzeugen; die Vorlage nutzt noch Klassen der Gestaltung B4 |
| `node tools/make-showcase-keyframes.mjs`   | Erzeugt die Keyframes der Vorführungen (Laptop und Telefon drehen sich beim Scrollen) aus den Bewegungsformeln und ersetzt sie am Ende von `assets/css/site.css`; ohne Abhängigkeiten |
| `node tools/geraete-css.mjs [--pruefen]`   | Setzt Laptop und Telefon **wörtlich** aus dem Stand `c112a20` in `assets/css/site.css` ein (sieben Bereiche zwischen den Markern `@@geraete-…`, Keyframes am Dateiende); `--pruefen` prüft nur. Die Bewegung der Geräte bleibt so unverändert, die Gestaltung legt nur die Hüllen `.geraet`, `.pose` und `.k03-buehne` fest |
| `node tools/geraete-pruefen.mjs`           | Prüft, dass Laptop und Telefon sich wie in `c112a20` bewegen: Bereiche und 51 Keyframes wörtlich, 162 Transformwerte gleich, keine eigene Regel bewegt die Geräte, kein Skript in `assets/js/` bewegt sie (außer den wörtlichen Zeilen 107–140 in `site.js`), Markup der Geräte gleich, dazu die Matrizen zur Laufzeit in Chromium und WebKit (Kapitel 3: Laptop und Telefon, Kapitel 7: Laptop der Finanzen; Playwright aus dem Hauptordner) |
| `node tools/geraete-standbild.mjs`         | (Seit 16.11.2026 nicht mehr auf der Seite.) Rendert das Schlussbild des früheren Finales aus dem Markup der Startseite und der wörtlichen Gerätebewegung: Laptop zugeklappt bei 1,08 s, Telefon in der Endlage mit ausgeschaltetem Bildschirm, durchsichtiger Hintergrund, WebP mit Alpha in 720, 1080 und 1440 px (jede Breite eigens gezeichnet); meldet die Lage des Zeichens auf dem Deckel in Prozent (für `.zeichen-ziel`/`.zeichen-licht` in `site.css`). `--vorschau <Ordner>` schreibt nur PNG-Bilder |
| `node tools/kopf-fuss-pruefen.mjs`         | Prüft, dass Kopfleiste und Fußzeile auf allen fünf Seiten gleich sind (bis auf Pfade, `data-navi`/`data-kapitel` und den Schalter „Bewegung anhalten“ der Startseite), die Symbole dafür in jeder Seite stehen und im Markup von `newsletter.php` kein Hochkomma steht |
| `node tools/fahrt-messen.mjs`              | Misst, wie flüssig die gepinnten Bühnen laufen (Explosion in Kapitel 1, großes Telefon in Kapitel 6; `--strecke explosion\|telefon\|beide`): Chrome (headless mit GPU, Spur über CDP; der Energiesparmodus von Chrome ist im Messprofil aus, sonst 30 Bilder/s im Akkubetrieb unter 20 %) und WebKit, kalter und warmer Zwischenspeicher. Explosion (selbstlaufend): ein kleiner Anstoß mit dem Mausrad, dann die gezeigten Bilder, bis der Ablauf fertig ist (`anstoss`, rückwärts `anstoss-zurueck`, mit Weiterscrollen `anstoss-weiter`). Telefon: Mausrad wie ein Trackpad und schnell, Gesten des Browsers (`geste`, `geste-schnell`) und rückwärts (`trackpad-zurueck`, `schnell-zurueck`), je von kurz vor dem Pinnen bis hinter das Lösen der Bühne. Tabellen: gezeigte Bilder und Lücken > 16,7 / 33 / 100 ms, verpasste Bilder je Abschnitt der Strecke (Phasen wie die Keyframes; Explosion nach der Zeit ihres Ablaufs) und je Ursache, Hauptthread je Bild (BeginMainFrame, PrePaint), Long Animation Frames, Rasterung, Dekodierung, Pipeline-Kompilierung im GPU-Prozess, Ebenen mit Gründen, Neuzeichnen und Neurastern nach einem ersten Durchgang (Explosion: auch nach dem Ende des Ablaufs), Animationen der Bühnen außerhalb des Compositors. Die Gegenprobe `ohnebewegung` lässt in der Explosion statt ihrer einen winzigen Taktgeber gleicher Dauer laufen (sonst zeichnete der Browser nach dem Anstoß nichts). `--gegenprobe a,b` (Liste: `--gegenproben`) misst zusätzlich mit abgeschalteter Wirkung, nur im eingebauten Server; weitere Schalter (`--browser`, `--fenster 1280x740@2`, `--runden`, `--json`, `--trace`) im Kopfkommentar |
| `node tools/b4-pruefen.mjs [schnell]`      | Browserprüfung der Startseite in Chromium, WebKit und „ohne scroll-driven Animationen“, mit und ohne „Bewegung reduzieren“, 320 bis 1920 px: Konsole und CSP, seitliches Scrollen, Text im Fenster bzw. Kasten (je Zeile, auch auf den Unterseiten und in Zwischenstufen der Bewegung), je Kapitel genau ein passender Eintrag mit `aria-current` in der Kopfleiste, Geräte in Ruhe, CLS, eine h1; die selbstlaufende Explosion (oben zerlegt mit Beschriftung, nach kleinem Scrollen nach 1 s dazwischen und im Gleichschritt, danach zusammengesetzt, gelöst hinter der kurzen Strecke, oben rückwärts wieder zerlegt, Richtungswechsel mitten im Ablauf ohne Sprung, Laden mitten auf der Seite sofort zusammengesetzt, Bühne klebt unter der Kopfleiste); die Bewegung beim Scrollen an mehreren Stellen jeder Zeitleiste (Telefon gedreht → gerade, Schichtliste, Feld der Glocke; Wörter der Aussage hellen nacheinander auf; Metall-„13“ neigt sich); Endlage und eingeklappte Strecken bei „Bewegung reduzieren“ und ohne JavaScript; „Bewegung anhalten“ und „Bewegung reduzieren“ zur Laufzeit an mehreren Stellen ohne Sprung; dazu die Größe aller Skripte in `assets/js/` und der Stildatei im Paket (über dem Ziel ein Fehler) |

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
- **Was die Seite zeigt** (seit 16.11.2026):
  - In den Geräten von heute die hellen Aufnahmen vom 22.10.2026 (Demo-Daten wie am 18.10.2026 vorbereitet: 233
    Mitglieder, „Sommerfest 2027“): `dashboard` (720 bis 2880 px; Laptop in Kapitel 3 – Vereins-Bühne mit Begrüßung,
    Fotos der Abteilungen, Glas-Chips „233 Mitglieder · 18 Termine · 15 Helferplätze“, Reiter und Kennzahlkarten),
    `phone-schichten` (182 bis 624; Telefon in Kapitel 3, „3 von 4 … Anna Adler (du)“) und
    `laptop-finanzen-uebersicht` (720 bis 1760; Laptop in Kapitel 7 – die Karte „Kontostand · alle Konten“ und die
    Kontokarten; die Zahl daneben ist deshalb der Kontostand „13.944,47 €“).
  - Die Bilder der Pro-Gestaltung kommen aus den Original-Aufnahmen des Entwurfs `apple-pro/_bilder` vom 16.11.2026
    (Seed-Daten ohne `demo-vorbereiten.mjs`: 24 Mitglieder, „Sommerfest 2026“ am 28.11.2026, „9 von 21 Plätzen besetzt“;
    Namen wie unten nur im Bild ersetzt), erzeugt mit `tools/bilder-pro.mjs`: die fünf Ebenen und die Grundplatte der
    Explosion (`ebene-*-light`, `uebersicht-light`), die Schichtkarte (Kapitel 4), der Helferplan (Kapitel 5) und die
    dunklen Telefonbilder (`handy-tagesablauf-dark`, `handy-schichtliste-dark`, Kapitel 6). Lossy WebP (Qualität 82 bzw.
    86), leicht nachgeschärft.
  - Damit zeigen die Bilder Demo-Daten aus **zwei Ständen** (Geräte von heute: 22.10.2026, Pro-Bilder: 16.11.2026). Wer
    das angleichen will, nimmt die Bilder der Geräte am selben Tag wie die Pro-Bilder neu auf (und passt Alt-Texte und
    „13.944,47 €“ an).
  - Nicht mehr auf der Seite (seit 16.11.2026 gelöscht, mit `--only <Name>` wieder herstellbar): `phone-dashboard`,
    `phone-helferplanung`, `phone-schichten-live-1`, `helferplan-druck` und das Schlussbild `finale-geraete`.
- Die Bilder gibt es genau in den Breiten, in denen sie auf der Seite stehen (je Pixeldichte eine Datei), damit der Browser
  sie Pixel für Pixel zeichnet und die kleine Schrift scharf bleibt. Wer die Größe eines Geräts in `site.css` ändert
  (`--sw`, `--pw`, `--hw`), gleicht die Breiten im Skript (`widths`, bei Bildfolgen `frameWidths`) und `srcset`/`sizes` im
  HTML an. Neue Telefonbilder sind 390 × 760 Punkte groß – genau der sichtbare Teil des Bildschirms zwischen Statusleiste
  und Home-Balken –, damit der Rahmen nichts abschneidet.
- **Datum in den Bildern:** Die Aufnahmen zeigen, was die Anwendung am Aufnahmetag ausrechnet – beim Laptop „Stand
  22.10.2026“, „+25,80 € seit 1. Oktober“, die Einnahmen und Ausgaben des Monats und die Fälligkeit der beiden offenen
  Rechnungen des Seeds („davon 2 überfällig“ in Rot; ihre Fälligkeit rechnet der Seed vom Tag seines Laufs aus,
  `finanzen-demo.mjs` lässt sie unverändert), im Laptop von Kapitel 3 das Datum auf der Bühne („Donnerstag, 22. Oktober 2026“), die
  Zahlen der Glas-Chips und „Termine in 30 Tagen“ samt „Nächster Termin heute“, auf dem Aushang „Erstellt am …“, am
  Telefon Angaben wie „in 233 Tagen“. Wer die Bilder später erneuert, nimmt sie deshalb alle am selben Tag neu auf. Die
  Bühne hat eine feste Höhe: Rolle und Datum kürzen sich notfalls mit „…“, darunter verrutscht nichts mehr (bis 20.10.2026
  brach am Smartphone die Zeile mit dem Datum um). Ruhiger wirkte der Laptop mit Rechnungen, die noch nicht fällig sind
  (das hieße, die Fälligkeiten in der Aufnahme-Datenbank in die Zukunft zu legen – sie teilt sich das Reel-Projekt, daher
  bisher nicht geändert).
- Nach neuen Aufnahmen nachziehen: (1) die Zahlen im Text mit den Bildern abgleichen (Kontostand „13.944,47 €“ neben dem
  Finanz-Laptop, „Sommerfest 2026“ und „21 Plätze“ in Kapitel 5 und am großen Telefon, Glockenfeld in Kapitel 6) und die
  Alt-Texte; (2) ändert sich der Helferplan, die Lage der drei Marken darauf (`.bp-1` bis `.bp-3` in `site.css`, Prozent
  der Aufnahme); ändern sich die Ausschnitte der Ebenen, stimmen die Beschriftungen der Explosion trotzdem (sie hängen
  nur an der Geometrie); (2a) zeigen die Bilder Fotos der Abteilungen, deren Fotografen in `THIRD-PARTY-NOTICES.md`
  nennen; (3) `width`/`height`, wenn sich ein Ausschnitt geändert hat; (4) an allen Bild-Links in `index.html` `?v=`
  erhöhen: Browser dürfen Bilder 7 Tage zwischenspeichern (siehe `.htaccess`) und zeigen unter gleicher Adresse sonst
  noch die alten.
- Eigene Demo-Datenbank nur mit Seed-Daten (so kommen keine eigenen Testeinträge ins Bild):
  `PGDATABASE=vf_website DATABASE_URL=postgresql://vereinsflow:vereinsflow@localhost:5432/vf_website npm run dev:all -- --seed`.
  Läuft im App-Ordner schon ein Entwicklungsserver, eine zweite Instanz mit eigenem Build-Ordner danebenstellen (wie die
  E2E-Tests), z. B. `PORT=3200 NEXT_DIST_DIR=.next-leer DATABASE_URL=… MIGRATION_DATABASE_URL=… APP_URL=http://localhost:3200
  node node_modules/next/dist/bin/next dev -p 3200` (vorher `prisma migrate deploy` mit derselben `MIGRATION_DATABASE_URL`),
  und beim Aufnehmen `VF_APP_URL=http://localhost:3200` setzen. **Der Build-Ordner muss in `.gitignore` stehen**
  (`.next-leer`, `.next-e2e`, `.next-website` – nur diese drei, nie einen neuen Namen erfinden): Tailwind liest jeden
  nicht ignorierten Ordner im Projekt mit und baute sonst bei jedem Schreiben der zweiten Instanz die Stile beider
  Server neu – am 21.10.2026 hat ein nicht ignoriertes `.next-website` so beide Server lahmgelegt.
- Beim Aufnehmen entstehen Anmelde-Einträge im Änderungsprotokoll der Demo. Parallel laufende E2E-Tests der Anwendung nicht
  stören: Aufnahme und Tests belasten denselben Rechner.

## Logo

Das Logo „Punktring“ (seit 28.11.2026, vorher das „V“ aus drei Etappen vom Oktober 2026): vier Ringe aus Punkten (die
Mitglieder) bilden eine Sprechblase – unten links öffnet sich der Ring, drei kleiner werdende Punkte laufen als Zipfel heraus –,
in der Mitte ein Kleeblatt-Knoten (alles ist verbunden). Farben rundum Grün `#34D399` → Türkis `#22D3EE` → Vereinsblau
`#3A6BEA`, der Knoten Grün → Vereinsblau; daneben die Wortmarke „VereinsFlow“ (Manrope ExtraBold, gerade, ohne Unterstrich),
„Vereins“ weiß auf dunklem Grund, „Flow“ im Verlauf Türkis → Vereinsblau. Das Logo ist **größenabhängig** (seit 28.11.2026,
wie bei großen Marken): je kleiner, desto weniger Punktringe mit größeren Punkten, damit überall Punkte sichtbar bleiben.
Die **kompakte Fassung** stellt das Zeichen neben einen etwas größeren Namen. Einzelheiten und Mindestgrößen:
`docs/brand/vereinsflow-logo-paket/LIESMICH.md` („Welche Fassung bei welcher Größe“).

| Einsatz auf der Website                         | Größe                              | Fassung                         | Datei                                |
| ----------------------------------------------- | ---------------------------------- | ------------------------------- | ------------------------------------ |
| Browser-Tab                                     | 16 px (ICO 16 / 32 / 48)           | P1 · 1 Ring, Tinte-Kachel       | `favicon.svg`, `favicon.ico`         |
| Kopfleiste (Handy) / Kopfleiste / Fußzeile      | 115 × 28 / 124 × 30 / 148 × 36 px  | kompakt mit P2 · 2 Ringe        | `assets/img/logo-dark.svg`           |
| Kopf der Bestätigungs-E-Mail                    | gezeigt 300 × 46 px                | kompakt mit P3 · 3 Ringe        | `assets/img/logo-mail.png` (+ `@2x`) |
| Startbildschirm, Web-Manifest                   | 180 / 192 / 512 px                 | Original · 4 Ringe              | `apple-touch-icon.png`, `android-chrome-*.png` |
| Vorschaubild beim Teilen, Vorlagen              | groß                               | Original · 4 Ringe              | `assets/img/og-image.png`, `assets/brand/*` |

- **Quelle aller Logo-Dateien ist das Logo-Paket** der Gestaltung (Ordner `02-website`, Dateien mit denselben Namen wie hier):
  `favicon.svg`/`.ico`, `apple-touch-icon.png`, `android-chrome-192/512.png`, `assets/img/logo.svg`, `logo-dark.svg`,
  `og-image.png`, `logo-mail.png` (+ `@2x`) und `assets/brand/*`. Nicht selbst nachzeichnen oder umfärben; ein neues Paket
  übernimmt `node tools/make-logo-assets.mjs <Ordner des Pakets>` (prüft auch Bildgrößen und die `<img>`-Angaben). Danach
  `?v=` an den Links der geänderten Dateien erhöhen (heute `?v=2026112802` an `favicon.svg`, `favicon.ico`, `logo-dark.svg`
  und dem Link auf `site.webmanifest`; `?v=2026112801` an `apple-touch-icon.png`, `og-image.png` und den Symbolen in
  `site.webmanifest`, die sich am 28.11. nicht mehr geändert haben).
- **Favicons und Startbildschirm:** `favicon.svg`/`favicon.ico` (16, 32, 48 px) zeigen P1 (1 Ring) auf einer Kachel in
  Tinte `#0F1C2E` – der Knoten dort in aufgehellten Tönen, damit er bei 16 px nicht in der Kachel absäuft;
  `apple-touch-icon.png` (180) und `android-chrome-192/512.png` (Manifest) zeigen das Original mit den Punktringen.
- **Kopf- und Fußzeile:** Alle Seiten sind dunkel; dort steht `logo-dark.svg`, die **kompakte** Fassung (P2 + Name,
  viewBox 840,24 × 204 ≈ 4,12 : 1) – in der Kopfleiste mit `width="124" height="30"` (unter 480 px per CSS 115 × 28), in der
  Fußzeile mit `148 × 36` (`.kopf-marke img`, `.fuss-marke img` in `site.css`). Das Original mit vier feinen Punktringen
  verschwämme in dieser Höhe. Die helle Fassung `logo.svg` zeigt keine Seite mehr (sie bleibt für die Werkzeuge und
  Vorlagen). Kopien von Kopf und Fuß: `index.html`, `impressum.html`, `datenschutz.html`, `404.html`, `newsletter.php`
  (gleich gehalten, `tools/kopf-fuss-pruefen.mjs`).
- **Pinnnadel:** Der orange Punkt mit den Tempo-Strichen aus dem Logo war in der Gestaltung B4 Schlusspunkt der großen
  Überschriften und Spitze des Kapitel-Fadens; die Pro-Gestaltung setzt einen gewöhnlichen Punkt („Schicht für
  Schicht.“) und nutzt die Symbole nicht mehr.
- **Laptop-Deckel und Telefon-Rückseite** der Vorführungen zeigen seit 28.11.2026 das **neue Zeichen** (vorher das alte V)
  – wie bei großen Marken **einfarbig im Material** des Geräts: spiegelpoliert auf dem Deckel (Metallverlauf, Knoten
  dunkler), als glänzende Einlage im warmen Rückglas des Telefons, mit feiner Lichtkante und leichter Weichzeichnung.
  Ring-Stufe nach der gezeichneten Größe: Deckel **P3** (bei 1440 px Fensterbreite etwa 38–43 px hoch, bei 390 px etwa
  19–22 px – 2- bzw. 3-fach 58–87 Gerätepixel), Rückseite **P1** (etwa 27 bzw. 12 px). Weil die Punkte viel weniger
  Fläche tragen als das V, ist der Metallverlauf des Deckels 20 % dunkler als beim V und die Punkte sind etwas kräftiger
  gezeichnet (sonst bei 390 px nur ein grauer Schleier); auf der Rückseite ist der Knoten heller und etwas dünner und
  der Ring kräftiger (sonst lief der Knoten bei 390 px zu einem dunklen Klumpen zu). Symbole `i-mark-mirror` und
  `i-mark-gloss` am Anfang von `index.html`, in derselben Box wie das V (viewBox im Seitenverhältnis von `.device-mark`,
  das Zeichen mittig, 92 % der Höhe, auf der Rückseite 95 %) – `site.css` und die Bewegung der Geräte sind unverändert.
  Erzeugt mit dem Generator des Logo-Pakets (`geraetezeichen.mjs` neben `lib.mjs`, Kopie in
  `VereinsFlow-Medien/logo-punktring/generator/`; ohne Schalter erzeugt er genau den Stand in `index.html`).
- **Aufnahmen der Anwendung** zeigen das Logo der Anwendung. Seit 28.11.2026 ist dort das **neue Zeichen** eingesetzt (nur im
  Bild, keine neue Aufnahme): in der schmalen Symbolleiste oben links `symbol-klein.svg` (P1) im weißen Kreis wie in
  `src/components/layout/sidebar.tsx`, in Chromium in der Pixeldichte des Bildes gezeichnet, nur das Innere des Kreises
  ersetzt – in `uebersicht-light` und `helferplan-light` (über bearbeitete Kopien der Original-Aufnahmen
  `rechner-dashboard-hell.png` und `rechner-helferplanung-hell.png` in `VereinsFlow-Medien/website-entwurf/apple-pro/_bilder-logo-punktring/`
  und `tools/bilder-pro.mjs --quelle <dieser Ordner> --nur <Name>`; mit den unveränderten Originalen käme das alte V zurück)
  und in `laptop-finanzen-uebersicht-light` (jede Breite einzeln, WebP Qualität 92 wie bisher). Die übrigen Bilder zeigen
  kein Logo (Ausschnitte ohne Seitenleiste, Telefon-Kopfzeile ohne Logo). Ändert sich das Logo der Anwendung wieder, die
  Bilder neu aufnehmen (siehe „Hinweise zu den Aufnahmen“) oder genauso ersetzen; danach `?v=` an den Bildern erhöhen
  (heute `?v=2026112803` an diesen drei Motiven).

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
  (570 × 87 mit der kompakten Fassung des Logos – P3, 3 Ringe – in der Mitte, gezeigt 300 px breit und mittig; für hohe Pixeldichte `logo-mail@2x.png` per `srcset`)
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
  VereinsFlow GbR, vertreten durch Luis Heidecker (geschäftsführender Gesellschafter) und Ben Bleckert (Gesellschafter)
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
- **Seiten des Skripts** (`vf_seite`): dieselbe Kopf- und Fußzeile wie Impressum und Datenschutz (dunkel wie alle Seiten;
  bei Änderungen an Kopf oder Fuß der Startseite alle Kopien nachziehen: `datenschutz.html`, `impressum.html`,
  `404.html`, `newsletter.php` – `tools/kopf-fuss-pruefen.mjs` vergleicht sie). Das Markup steht dort in einem PHP-String in
  einfachen Hochkommas: kein `'` hineinschreiben (die Prüfung meldet es).
  Der optionale letzte Wert `$symbol` („mail“ oder „circle-check“) setzt ein großes Zeichen über die Überschrift. Nach
  „Fast geschafft“ und „Danke, Sie sind angemeldet“ steht neben „Zur Startseite“ ein zweiter Knopf „Demo anfragen“
  (`vf_start_demo_links`). „Fast geschafft“ nennt zum Wiederfinden der E-Mail Absender, Betreff und Frist
  (`vf_mail_hinweise`; der Betreff steht dort ein zweites Mal – bei einer Änderung in `vf_mail_bestaetigen` mitziehen).
- **Lokale Vorschau:** `tools/serve.mjs` führt kein PHP aus; ein Absenden zeigt dort nur einen Hinweis. Getestet wurde das
  Skript mit PHP als WebAssembly (`@php-wasm/node`, PHP 7.4 und 8.3).

## Gestaltung und Bewegung („Pro“, seit 16.11.2026)

Umgesetzt ist die „Mischung“ aus den Apple-Pro-Entwürfen vom 16.11.2026 (Luis: „baue die website so um wie in der letzten
Übersicht“): Entwurf 02 „Explosion“ als Einstieg, dazu die Metall-Zahlen aus 05 „Zahlen-Kino“ und das große Telefon aus
06 „Handy zuerst“. Die Geräte der bisherigen Seite (Laptop und Telefon, die sich von selbst ins Bild drehen) bleiben mit
genau ihrer Bewegung („baue beides ein“). Durchgehend Nacht (tiefes Nachtblau bis Schwarz, `--nacht-0` `#02040B`), weiße
Schrift, große eng gesetzte Überschriften mit Punkt, ruhige Unterzeilen in Grau, viel Raum, Pillen-Knöpfe (Hauptaktion
in Vereinsblau), Kacheln aus Glas. Entfallen sind mit der Gestaltung B4 die Papier-Kapitel, der Kapitel-Faden, der
Lichtfluss (`fluss.js`), die Kamerafahrt (`buehne.js`) und das Finale mit dem Standbild der Geräte. Die Geschichte bleibt
der Beispiel-Verein TSV Musterstadt 1898 e.V.; die 21 Plätze sind ausdrücklich als Beispiel aus der Demo gekennzeichnet.

### Die elf Kapitel

| Kap. | Anker | Inhalt | Bewegung beim Scrollen → Endlage |
| --- | --- | --- | --- |
| 1 Einstieg | `#top` | h1 „Schicht für Schicht.“; die App als sechs Glas-Ebenen aus echten Aufnahmen (01 Mitglieder, 02 Termine, 03 Helferschichten, 04 Finanzen, 05 Nachrichten, 06 Übersicht – beschriftet, am Handy als Legende), die sich zum Laptop `.rechner` zusammensetzen; „Alles greift ineinander.“; darunter „Demo anfragen“, „Beim Start benachrichtigen“ und der Hinweis auf die Demodaten | selbstlaufend (seit 26.11.2026): oben zerlegt; sobald man ein kleines Stück scrollt, läuft der Zusammenbau von selbst ab (2,5 s: Beschriftung aus, Ebenen fahren zusammen – isometrisch → frontal –, Laptop entsteht, „Alles greift ineinander.“ erscheint), ganz oben wieder rückwärts auseinander; die Bühne klebt dabei eine halbe Fensterhöhe lang unter der Kopfleiste → zusammengesetzt |
| 2 Ausgangslage | `#ausgangslage` | „Vereinsarbeit ist Ehrenamt. Die Verwaltung sollte es nicht schwerer machen. Aus Listen, Chats und Rundmails …“ als große Aussage | Wörter (`.aw`) hellen auf → alle hell |
| 3 Die Geräte von heute | (Tafel `#im-detail`) | „Bringt Vereinsarbeit in Fluss.“, Laptop und Telefon wörtlich (drehen sich ins Bild, sobald sie zur Hälfte sichtbar sind, dann ihre Pose −17° bzw. −24°), drei Aussagen, Tafel „Zahlen, die dem Vorstand helfen“ | wie bisher (CSS-Animationen, `site.js`) |
| 4 Funktionen | `#funktionen` | Metall-„13“, „Bereiche, die zusammenarbeiten.“, dreizehn Kacheln (Helferschichten groß, mit der Schichtkarte) | Neigung und Glanz der Zahl → ruhig |
| 5 Helferplanung | `#helferschichten` | Metall-„21“ „Plätze beim Sommerfest.“ (Beispiel aus der Demo), der Helferplan mit drei Marken (Neue Schicht, Eintragen, Drucken), drei Schritte | wie Kapitel 4 |
| 6 Unterwegs | `#unterwegs` | großes Telefon `.telefon` mit dunklen Aufnahmen, „Ein Tipp. Eingetragen.“ und der Text von heute, das aufgeklappte Feld der Glocke (eine Benachrichtigung **in** VereinsFlow, keine Mitteilung des Telefons); Metall-„24“ „Stunden vorher: die Erinnerung.“ mit dem Hinweis auf Glocke und E-Mail | am Rechner gepinnt (anderthalb Fensterhöhen): Telefon richtet sich auf, Bildschirm wechselt zur Schichtliste, fast gerade klappt das Feld der Glocke auf; am Handy ohne Pinnen beim Durchscrollen → gerade |
| 7 Finanzen | `#finanzen` | Laptop der Finanzen wörtlich (dreht sich ins Bild, steht frontal), Text, Kontostand, vier Punkte | wie bisher |
| 8 Sicherheit | `#sicherheit`, `#rollen` | „Mitgliederdaten verdienen mehr als einen Passwortschutz.“, Datenblatt (vier Punkte), Metall-„5“ mit den fünf Rollen und ihrer Reichweite, „Mehr dazu“ | wie Kapitel 4 |
| 9 So starten Sie | `#ablauf` | Metall-„3“ „Schritte bis zur ersten Einladung.“ und die drei Schritte | wie Kapitel 4 |
| 10 Fragen | `#faq` (`#ausprobieren`) | fünf Fragen; eine Sprungmarke öffnet die Frage (`site.js`) | – |
| 11 Kontakt | `#kontakt`, `#benachrichtigen` | „Eine Demo für Ihren Verein.“, Demo-Knopf (E-Mail, vorausgefüllt), Anruf, Adresse kopieren; darunter die Anmeldung „Beim Start benachrichtigt werden“ | – |

**Kopfleiste:** eine Glasleiste über die ganze Breite (`backdrop-filter`), Marke, die Links „Helferplanung“ (Kapitel 5–6),
„Funktionen“ (4), „Finanzen“ (7), „Sicherheit“ (8), „Fragen“ (9–10) und die Pille „Demo anfragen“ (11); die Marke steht für
1–3. Das Kapitel unter der Mitte des Fensters (Band bei 45 %) markiert seinen Eintrag mit `aria-current` (`data-navi` ↔
`data-kapitel`, `site.js`). Unter 900 px Marke, „Demo“ und Menüknopf; das Menü bedeckt das Fenster. **Fußzeile:** Marke,
Kontakt, „Social Media“ (Knöpfe zu Instagram `vereinsflow.de` und TikTok `@vereinsflow`: reine Links in einem neuen Tab, Rand und Symbol in den Farben
der Apps, Verlauf `#ig-verlauf` im Symbol-Sprite jeder Seite; `check-site.mjs` lässt genau diese Profile als Links nach
außen zu), Spalten Produkt/Kontakt/Über uns (Über uns → `ueber-uns.html#mission-leitbild` und `#wer-wir-sind`), Impressum und
Datenschutz, der Hinweis auf die Demodaten und – nur auf der
Startseite – der Schalter „Bewegung anhalten“.

### Bewegung

- **Bewegung (Bau 2, 16.11.2026; Explosion selbstlaufend seit 26.11.2026):** Explosion (Kapitel 1), Aussage (2),
  Metall-Zahlen (4, 5, 6, 8, 9) und großes Telefon (6). Bewegt werden nur `transform` und `opacity`, direkt in Keyframes
  (`site.css` Abschnitt 17, Namen `ex-*`, `tf-*`, `aw-*`, `mz-*`) – keine animierten Variablen, keine Layout-Abfragen je
  Bild. In 3D ändert sich die Deckkraft nur an Blättern (Bilder, Kanten, Schatten, Glanz, Laptop), nie an den Hüllen mit
  `preserve-3d`.
- **Explosion, selbstlaufend:** Ihre CSS-Animationen laufen auf der Zeitleiste des Dokuments (2,5 s, in `site.css`
  angehalten = zerlegt), nicht am Scrollstand – in Chromium, Safari und Firefox gleich, ohne `animation-timeline`. Steht
  die Seite oben, liegt sie zerlegt; überschreitet die Leseposition 20 px (Mausrad, Trackpad, Tastatur, Finger), startet
  `bewegung.js` den Zusammenbau, der von selbst bis zum Ende läuft; unter 4 px läuft er rückwärts (dieselben Animationen
  mit `playbackRate` −1). Dazwischen bleibt das Ziel (Hysterese); ein Richtungswechsel mitten im Ablauf kehrt vom
  aktuellen Stand um. Gestartet wird über eine gemeinsame Startzeit (`startTime` aus `performance.now()`): alle 44 Teile
  im Gleichschritt, auf dem Compositor, keine Arbeit je Bild im Skript. Phasen (Anteil der Dauer): 0–13 % Beschriftung
  aus, 6,5–76 % fährt der Stapel zusammen (`cubic-bezier(0.32, 0, 0.18, 1)`: sanft an, lang und weich aus), 46–74 %
  tauchen die Ebenen in die Grundplatte, 54–82 % entsteht der Laptop, 69–100 % „Alles greift ineinander.“. Die Bühne klebt
  nur eine halbe Fensterhöhe lang (Strecke = Bühne + 50 vh), die Seite scrollt nie von selbst, Eingaben werden nicht
  abgefangen. Wird die Seite mitten geladen (Neuladen, Sprungmarke) oder springt man weit hinter die Bühne, steht sie
  gleich zusammengesetzt da. `will-change` hängt nur an der Nähe zum Fenster (`.ist-nah`), nicht am Ablauf – am Ende
  wird nichts neu gerastert.
- **Zeitleisten (Aussage, Telefon, Metall-Zahlen):** je Bühne eine benannte `view-timeline` (Kopfleiste über
  `view-timeline-inset` abgezogen): `--tf` an `.tf-strecke`, `--aw` an `.aussage`, `--mz` an jeder `.metall`. Alle Teile
  einer Bühne laufen über dieselbe Spanne (gepinnt `contain 0–100 %` = genau solange die Bühne klebt; sonst `cover`), die
  Phasen sind Keyframe-Offsets, jedes Segment beginnt und endet weich (`cubic-bezier(0.33, 0, 0.67, 1)` = smoothstep), und
  die Endlage des Telefons steht still, bevor die Bühne sich löst (ab 80 %). Die Wörter der Aussage haben je eine
  versetzte Spanne (`cover 11–21 %` … `44–54 %`), die Metall-Zahl neigt sich über ihre ganze Spanne (±12° um die
  Grundneigung, in der Fenstermitte genau die Grundneigung) und ihr Glanz wandert in drei überblendeten Lagen.
- **Ohne scroll-driven animations** (Firefox, Safari vor 26): dieselben Animationen stehen mit 1 s Dauer still
  (`paused`), `assets/js/bewegung.js` setzt je Bild `currentTime = Fortschritt × 1 s` (rAF-gebündelt, passive
  Scroll-Ereignisse, Lage der Bühnen zwischengespeichert und nur bei Größenänderung neu gemessen, nur für Bühnen nahe am
  Fenster). Die Wörter der Aussage bekommen dort statt der Spanne eine Verzögerung.
- **`bewegung.js`** außerdem: dekodiert die Bilder der Explosion vorab (`img.decode()`), die des Telefons, sobald es nahe
  ist; `will-change` nur an Bühnen nahe am Fenster (`.ist-nah`); hält beim Umschalten zur Laufzeit die Leseposition (die
  Explosion steht danach ohne Ablauf in dem Zustand, der zur Leseposition passt).
- **„Bewegung reduzieren“, „Bewegung anhalten“ (`html.ist-ruhig`, Ereignis `vf:ruhe`) und ohne Skript:** keine Bewegung, die
  Endlage – Explosion zusammengesetzt, Telefon gerade, Zahlen ruhig, Aussage hell –, die Strecken sind eingeklappt (kein
  leerer Scrollweg). Am Handy ist der Einstieg dann so hoch wie sein Inhalt (Laptop direkt über „Alles greift
  ineinander.“). Wechselt der Zustand zur Laufzeit, rechnet `bewegung.js` die Leseposition um (zwischen den Strecken
  bleibt alles, wo es war; in einer Strecke bleibt die Bühne oben bzw. steht in der Endlage) – Safari kennt kein
  Scroll-Anchoring. Die Geräte von heute (Kapitel 3 und 7) bewegen sich wie bisher.
- Kurven `--ease-out`, `--ease-in-out`; Dauern: Druck 120 ms, Hover 150 ms, Pose 0,9 s.

### Laptop und Telefon

- Markup, CSS und Bewegung **wörtlich wie `c112a20`**: `tools/geraete-css.mjs` setzt die sieben Gerätebereiche zwischen die
  Marker `@@geraete-…` in `site.css` (Keyframes am Dateiende, `tools/make-showcase-keyframes.mjs` funktioniert unverändert),
  `site.js` startet sie mit denselben Zeilen wie bisher. Lage und Pose nur über die Hüllen `.geraet`, `.pose` und
  `.k03-buehne` (Bühne in Kapitel 3, schneidet senkrecht ab, was beim Hereindrehen von unten kommt); an `.showcase*`,
  `.laptop*`, `.iphone*` und `.phone` setzt `site.css` außerhalb der wörtlichen Bereiche nur Größen (`--sw`, `--pw`,
  `--rim`), Raster, `object-position` und – bewusste Ausnahme in der Ruhelage – die Eckstreifen des gedrehten Telefons
  (`.iphone-rim` sichtbar). Spiegelung im Boden an den Hüllen. `tools/geraete-pruefen.mjs` prüft das, auch zur Laufzeit in
  Chromium und WebKit.
- Die neuen Geräte heißen deshalb anders: der Laptop der Explosion `.rechner` (einfaches CSS-Gerät in Silber um die
  Grundplatte), das große Telefon `.telefon` (Titanrahmen wie im Entwurf 06).
- **WebKit in Playwright zeigt kein 3D:** Bildschirmfotos aus Playwright-WebKit werden ohne Compositing gezeichnet – jede
  3D-Transformation erscheint flach. Das ist eine Grenze des Werkzeugs, kein Fehler der Seite; die Matrizen prüft
  `tools/geraete-pruefen.mjs` trotzdem in WebKit. Gegenprobe auf echtem Safari (Mac, iPhone, iPad) steht aus.

### Leistung und Größen

- Bilder mit `width`/`height` und `srcset`/`sizes` in den gezeigten Breiten, `loading="lazy"` außer im ersten Bildschirm
  (dort die Grundplatte mit `fetchpriority="high"`; die fünf Glas-Ebenen braucht erst die Bewegung).
- `backdrop-filter` nur an der Kopfleiste; die Tiefe der Metall-Zahlen ist fest vorberechnet (16 Schatten in em), bewegt
  wird nur ihre Neigung (transform) und die Deckkraft der Glanz-Lagen.
- Flüssigkeit: `node tools/fahrt-messen.mjs` (Messwerte vom 16.11.2026 im Protokoll des Umbaus): Die Bewegung läuft in
  Chromium auf dem Compositor (Hauptthread je Bild um 1 ms, keine Long Animation Frames), nach einem ersten Durchgang wird
  beim Scrollen keine große Ebene neu gerastert.
- **Größen** (16.11.2026, mit Bewegung): Skripte 19 KB Quelltext, im Paket 10,8 KB, übertragen (gzip) 3,9 KB; Stildatei
  240 KB Quelltext, im Paket 158 KB, übertragen 30 KB (davon gut 95 KB im Paket die wörtlichen Gerätebereiche).
  `tools/b4-pruefen.mjs` meldet einen Fehler, wenn das Paket die Ziele überschreitet (Skripte 80 / 26 KB, Stildatei
  215 / 45 KB).

### Prüfen

`node tools/check-site.mjs --strict` (Verweise, Bilder, CSP-Regeln), `node tools/geraete-pruefen.mjs` (Geräte wie bisher),
`node tools/geraete-css.mjs --pruefen` (Gerätebereiche wörtlich), `node tools/kopf-fuss-pruefen.mjs` (Kopf und Fuß auf allen
Seiten gleich) und `node tools/b4-pruefen.mjs` (Browser-Matrix: Chromium, WebKit, ohne scroll-driven Animationen, mit und
ohne „Bewegung reduzieren“, 320 bis 1920 px; je Textzeile, ob sie aus dem Fenster oder aus einem abschneidenden Kasten
läuft – auch auf Impressum, Datenschutz und Fehlerseite und in Zwischenstufen der Bewegung –, die Zustände der Bühnen an
mehreren Scroll-Stellen, Endlage ohne Bewegung und ohne JavaScript, Umschalten zur Laufzeit ohne Sprung und die Größe des
Pakets; `schnell` nur 390 und 1440 px). Flüssigkeit: `node tools/fahrt-messen.mjs` (siehe „Werkzeuge“).
Hinweis zu WebKit in Playwright: Bildschirmfotos dort fügen ein eigenes Stylesheet ein, das die CSP der Seite ablehnt –
die Meldung „Refused to apply a stylesheet …“ kommt dann vom Werkzeug, nicht von der Seite.

## Entscheidungen, die sich leicht ändern lassen

- **Ansprache:** „Sie“ (die Anwendung selbst duzt). Texte stehen direkt in den HTML-Dateien.
- **Handlungsaufforderung:** „Demo anfragen“ per E-Mail – die Plattform ist geschlossen, neue Vereine richtet der Betreiber ein
  (siehe `/registrieren` der Anwendung). Ein Kontaktformular gibt es bewusst nicht; das einzige Formular ist die Anmeldung
  „Beim Start benachrichtigen“ (siehe unten).
- **Schrift:** Systemschrift des Geräts (auf Apple-Geräten SF Pro, unter Windows Segoe UI). Die Wortmarke des Logos (Manrope
  ExtraBold, gerade) liegt als Vektorgrafik vor.
- **Farben:** Vereinsblau `#3A6BEA` (auch im Logo) und Himmel `#8FB0FF` (Signalorange gehörte zum alten Logo, es kommt nicht mehr vor) –
  dazu die Nacht von Tiefblau bis Schwarz (`--nacht-0` `#02040B` bis `--nacht-3` `#0C1A3C`). Vereinsblau trägt die
  Hauptaktion („Demo anfragen“, weiße Schrift 4,7 : 1), Himmel ist Licht und Akzent. Textfarben mit gemessenem Kontrast
  (Werte und Verhältnisse oben in `site.css`, `:root`). Die Seite folgt bewusst nicht der hellen oder dunklen Einstellung
  des Geräts.
- **Bewegung:** siehe „Gestaltung und Bewegung“. Leicht zu ändern: Pose der Geräte in Kapitel 3 (`--pose` an
  `.pose-laptop`/`.pose-handy`), Lage und Neigung der Metall-Zahlen (`--mz-groesse`, `--mz-ry`, `--mz-rx` je Zahl), Größe
  des Laptops der Explosion (`--ex-bw`) und des großen Telefons (`--tb`).
