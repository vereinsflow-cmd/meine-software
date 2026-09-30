# VereinsFlow – Website

Werbeseite für VereinsFlow: eine Startseite (`index.html`) mit Impressum, Datenschutzerklärung und Fehlerseite. Reines HTML und
CSS, ein kleines Skript (Menü, Einblenden beim Scrollen, aktiver Abschnitt), **keine Cookies, keine Bibliotheken, keine Webfonts,
nichts von fremden Servern**. Einzige Ausnahme vom rein Statischen: die Anmeldung „Beim Start benachrichtigen“ (`newsletter.php`,
braucht PHP – siehe „Benachrichtigung zum Start“). Die Seite ist bewusst immer weiß (auch bei dunkel eingestelltem Gerät); die Bilder sind echte Aufnahmen der Anwendung
(Demo-Daten).

Die Website liegt als Ordner `website/` im VereinsFlow-Repository, neben der Anwendung im Hauptordner. Beide haben getrennte
Werkzeuge und Prüfungen: Die Anwendung ignoriert `website/` (Prettier, ESLint, Docker, CI), die Website prüft sich selbst
(`node tools/check-site.mjs`, in der CI als `website.yml`).

> **Stand:** Die Seite ist fertig gebaut, aber **noch nicht veröffentlicht**. Alle Angaben sind eingetragen (siehe unten).

## Inhalt

| Datei / Ordner                        | Zweck                                                                                       |
| ------------------------------------- | ------------------------------------------------------------------------------------------- |
| `index.html`                          | Startseite (Abschnitte: Einstieg, Laptop- und Telefon-Vorführung, Kennzahlen, Ausgangslage, Funktionen, Helferschichten mit Helferplan-Aushang, Im Detail mit Suche/Mitglieder/Veranstaltungen/Auswertungen als Reiter, Rollen, Sicherheit, FAQ mit Ausblick, Kontakt mit den drei Schritten zum Start) |
| `impressum.html`, `datenschutz.html`  | Rechtstexte (ausgefüllt, Stand 26.09.2026)                                                 |
| `404.html`                            | Fehlerseite                                                                                 |
| `assets/css/site.css`                 | Gestaltung; Farben und Größen stehen als Variablen oben in `:root`                          |
| `assets/js/site.js`                   | Handy-Menü, Kopfzeile, Ein- und Ausblenden beim Scrollen, aktiver Abschnitt, Slider für Funktionen sowie – auf dem Smartphone – Rollen und Sicherheit (Pfeile, Wischen, Pfeiltasten), Reiter „Im Detail“, Ladezustand der Bilder (ohne JavaScript bleibt alles nutzbar; Karten stehen dann als Raster, die Themen untereinander) |
| `assets/img/app/`                     | Aufnahmen der Anwendung (helle Darstellung, `…-light-…`), je zwei Größen                     |
| `assets/img/`, `assets/brand/`        | Logo (Seite) und Logo-Vorlagen (Profilbilder, Präsentationen); Vorschaubild `og-image.png`   |
| `robots.txt`, `sitemap.xml`           | Für Suchmaschinen (Domain `https://vereins-flow.com`)                                         |
| `_headers`, `.htaccess`               | Sicherheits- und Cache-Header für Netlify/Cloudflare Pages bzw. Apache-Webspace              |
| `Vorschau-starten.cmd`, `.command`    | Windows bzw. Mac: Doppelklick startet die Vorschau und öffnet den Browser                   |
| `tools/`                              | Werkzeuge (siehe unten); müssen nicht hochgeladen werden                                    |
| `upload/vereinsflow-website.zip`      | Fertiges Paket zum Hochladen auf den IONOS-Webspace (siehe „Veröffentlichen“)               |
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
   (rotes Schloss = noch kein HTTPS); erst danach die HSTS-Zeile in `.htaccess` einschalten. Für eine andere Domain `https://vereins-flow.com` in den Seiten,
   `robots.txt`, `sitemap.xml` und `.htaccess` (Weiterleitung auf HTTPS ohne „www.“) per Suchen/Ersetzen austauschen – `tools/set-domain.mjs` ersetzt nur die ursprüngliche
   Musterdomain `https://vereinsflow.example`.
3. **Rechtstexte prüfen lassen.** Impressum und Datenschutzerklärung sind Muster, keine Rechtsberatung. Wer später Statistik,
   Karten, Videos oder Schriften von fremden Servern einbindet, muss die Datenschutzerklärung **und** die Content-Security-Policy
   (`_headers` / `.htaccess`) anpassen.
4. **Aussagen abgleichen.** Alle Aussagen stammen aus dem Stand der Anwendung vom 22.09.2026 (`README.md`, `docs/SECURITY.md`,
   `docs/PRIVACY.md`, `docs/DESIGN.md`, `src/server/permissions/defaults.ts`, `src/lib/search/registry.ts`,
   `src/app/(app)/helferplanung/drucken/page.tsx`, `src/server/jobs/reminders.ts`, `src/modules/dashboard/compare.ts`). Kommen
   Funktionen hinzu (z. B. Finanzen), die FAQ (auch die Frage zur Planung), die Zahl der Bereiche („12 Bereiche“) und den Stand in der
   Fußzeile anpassen. Preise und Vertragsbedingungen stehen bewusst **nicht** auf der Seite.
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
  Nach Änderungen an der Seite das Paket neu packen (im Ordner `website/`):
  `rm -f upload/vereinsflow-website.zip && zip -r -X upload/vereinsflow-website.zip . -x "tools/*" "upload/*" "README.md" "Vorschau-starten.*" "_headers" "*.DS_Store"`
  Wurden `assets/css/site.css` oder die Skripte in `assets/js/` geändert, vorher die Versionsnummer an ihren Links in allen
  HTML-Dateien erhöhen (`?v=` mit dem Datum, z. B. `site.css?v=20260926`) – sonst liefern Browser und der Zwischenspeicher von
  IONOS bis zu einen Tag lang die alte Datei aus (sie dürfen CSS und JS einen Tag lang zwischenspeichern, siehe `.htaccess`).
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
Repositories (`npm install` dort; änderbar mit `VF_APP_DIR`) und starten Edge (`VF_BROWSER_CHANNEL`, Standard `msedge`).

| Befehl                                     | Wirkung                                                                                                   |
| ------------------------------------------ | --------------------------------------------------------------------------------------------------------- |
| `node tools/serve.mjs`                     | Vorschau-Server mit Produktions-Headern                                                                   |
| `node tools/check-site.mjs [--strict]`     | Prüft Verweise, Bilder, Symbole, fremde Server, Inline-Skripte/-Stile und listet offene Platzhalter       |
| `node tools/set-domain.mjs <https://…>`    | Ersetzt die Musterdomain `https://vereinsflow.example` (bereits erledigt)                                   |
| `node tools/hochladen.mjs <Server> <Benutzer>` | Lädt die Website per SFTP nach `/public` (Passwort wird im Terminal abgefragt, auf dem Server wird nichts gelöscht) |
| `node tools/capture-screenshots.mjs`       | Nimmt die Anwendungsbilder neu auf (Demo-App muss laufen: `npm run dev:all`; `--only dashboard`; `--scheme dark` nimmt dunkel auf, wird derzeit nicht verwendet) |
| `node tools/make-og-image.mjs`             | Erzeugt das Vorschaubild für das Teilen (`tools/og-template.html`)                                        |
| `node tools/make-logo-assets.mjs`          | Erzeugt Logo-Dateien und Favicons aus den Vektordaten der Anwendung                                       |
| `node tools/make-showcase-keyframes.mjs`   | Erzeugt die Keyframes der Vorführungen (Laptop und Telefon drehen sich beim Scrollen) aus den Bewegungsformeln und ersetzt sie am Ende von `assets/css/site.css`; ohne Abhängigkeiten |

Hinweise zu den Aufnahmen:

- Sie entstehen mit dem Demo-Administrator der Entwicklungsdatenbank. Namen werden **nur im Bild** (nicht in der Datenbank)
  ersetzt: Die Seed-Personen tragen ihre Rolle als Nachnamen („Hans Helfer“, „Claudia Abteilungsleiterin“) und heißen im Bild
  „Hans Hellwig“, „Claudia Abel“ usw. (gleicher Anfangsbuchstabe, Sortierung und Initialen bleiben); Anmeldeadressen
  `…@demo-verein.local` werden zu `…@example.org`. Von Hand angelegte Einträge, die nicht aus dem Seed stammen, bekommen
  ebenfalls einen erfundenen Namen (Liste `DEMO_RENAME` im Skript) – das Repository ist öffentlich.
- Die Detailbilder (Mitglieder, Kalender, Auswertungen) sind Ausschnitte rechts neben der Seitenleiste, die Suche ein Ausschnitt
  um den geöffneten Dialog; der Helferplan-Aushang ist die Druckansicht (A4, nur hell – Papier ist weiß).
- Die Telefonbilder gibt es genau in den Breiten, in denen sie auf der Seite stehen (je Pixeldichte eine Datei), damit der
  Browser sie Pixel für Pixel zeichnet und die kleine Schrift scharf bleibt. Wer die Größe eines Handys in `site.css` ändert,
  gleicht die Breiten im Skript (`PHONE.widths` bzw. `widths` am Bild) und `srcset`/`sizes` im HTML an.
- Nach neuen Aufnahmen zwei Dinge nachziehen: (1) Die Bildfolgen melden `Positionen:` (wo Knöpfe und Felder liegen) – diese
  Werte in `LIVE_SCENES` in `assets/js/site.js` übernehmen, sonst klickt der Mauszeiger daneben, wenn sich die Oberfläche
  verschoben hat (danach `site.js?v=` erhöhen). (2) An allen Bild-Links in `index.html` `?v=` auf das Datum setzen: Browser dürfen
  Bilder 7 Tage zwischenspeichern (siehe `.htaccess`) und zeigen unter gleicher Adresse sonst noch die alten.
- Eigene Demo-Datenbank nur mit Seed-Daten (so kommen keine eigenen Testeinträge ins Bild):
  `PGDATABASE=vf_website DATABASE_URL=postgresql://vereinsflow:vereinsflow@localhost:5432/vf_website npm run dev:all -- --seed`
- Beim Aufnehmen entstehen Anmelde-Einträge im Änderungsprotokoll der Demo. Parallel laufende E2E-Tests der Anwendung nicht
  stören: Aufnahme und Tests belasten denselben Rechner.

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
  `vf_mail_bestaetigen` und `vf_mail_bestaetigen_html`. Das Logo darin ist `assets/img/logo-mail.png` (erzeugt von
  `tools/make-logo-assets.mjs`) und wird von der Website geladen – die Datei nicht umbenennen oder löschen, sonst fehlt es auch in
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
- **Lokale Vorschau:** `tools/serve.mjs` führt kein PHP aus; ein Absenden zeigt dort nur einen Hinweis. Getestet wurde das
  Skript mit PHP als WebAssembly (`@php-wasm/node`, PHP 7.4 und 8.3).

## Entscheidungen, die sich leicht ändern lassen

- **Ansprache:** „Sie“ (die Anwendung selbst duzt). Texte stehen direkt in den HTML-Dateien.
- **Handlungsaufforderung:** „Demo anfragen“ per E-Mail – die Plattform ist geschlossen, neue Vereine richtet der Betreiber ein
  (siehe `/registrieren` der Anwendung). Ein Kontaktformular gibt es bewusst nicht; das einzige Formular ist die Anmeldung
  „Beim Start benachrichtigen“ (siehe unten).
- **Schrift:** Systemschrift des Geräts (auf Apple-Geräten SF Pro, unter Windows Segoe UI). Die Wortmarke des Logos (Poppins)
  liegt als Vektorgrafik vor.
- **Farben:** ruhige, kühle Flächen wie in der Anwendung; Schaltflächen in deren Hauptfarbe (`--accent`), das Logo-Blau
  (`--brand`) für Schrift-Akzente. Alle Werte oben in `site.css` (`:root`). Eine dunkle Darstellung gibt es bewusst nicht (weißes Design).
- **Bewegung:** kurze Ladeanimation des Einstiegs (reines CSS), sanftes Ein- und Ausblenden beim Scrollen (`.reveal`, gesteuert
  von `site.js`), leichte Parallaxe der Bilder (`.plx`), Live-Fenster im Kapitel „Helferschichten“ und in den vier Reitern „Im Detail“ (ein Mauszeiger bedient die Anwendung – Bildfolgen aus der Demo-App, aufgenommen mit `tools/capture-screenshots.mjs --only schichten,suche,mitglieder,kalender,auswertung`; die Abläufe stehen in `site.js`, `LIVE_SCENES`) und Scroll-Effekte im Einstieg über CSS-Scroll-Timelines – Browser ohne
  Unterstützung zeigen feste Bilder. Bewegt werden nur Transparenz und Transformationen, nie das Layout. Mit „Bewegung
  reduzieren“ im Betriebssystem ist alles sofort und ohne Animation sichtbar.
