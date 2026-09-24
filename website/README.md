# VereinsFlow – Website

Werbeseite für VereinsFlow: eine Startseite (`index.html`) mit Impressum, Datenschutzerklärung und Fehlerseite. Reines HTML und
CSS, ein kleines Skript (Menü, Einblenden beim Scrollen, aktiver Abschnitt), **keine Cookies, keine Bibliotheken, keine Webfonts,
nichts von fremden Servern**. Die Seite ist bewusst immer weiß (auch bei dunkel eingestelltem Gerät); die Bilder sind echte Aufnahmen der Anwendung
(Demo-Daten).

Die Website liegt als Ordner `website/` im VereinsFlow-Repository, neben der Anwendung im Hauptordner. Beide haben getrennte
Werkzeuge und Prüfungen: Die Anwendung ignoriert `website/` (Prettier, ESLint, Docker, CI), die Website prüft sich selbst
(`node tools/check-site.mjs`, in der CI als `website.yml`).

> **Stand:** Die Seite ist fertig gebaut, aber **noch nicht veröffentlicht**. Vorher müssen Angaben ergänzt werden (siehe unten).

## Inhalt

| Datei / Ordner                        | Zweck                                                                                       |
| ------------------------------------- | ------------------------------------------------------------------------------------------- |
| `index.html`                          | Startseite (Abschnitte: Einstieg, Laptop- und Telefon-Vorführung, Kennzahlen, Ausgangslage, Funktionen, Helferschichten mit Helferplan-Aushang, Im Detail mit Suche/Mitglieder/Veranstaltungen/Auswertungen als Reiter, Rollen, Sicherheit, FAQ mit Ausblick, Kontakt mit den drei Schritten zum Start) |
| `impressum.html`, `datenschutz.html`  | Rechtstexte als **Muster** mit Platzhaltern (`[[…]]`)                                        |
| `404.html`                            | Fehlerseite                                                                                 |
| `assets/css/site.css`                 | Gestaltung; Farben und Größen stehen als Variablen oben in `:root`                          |
| `assets/js/site.js`                   | Handy-Menü, Kopfzeile, Ein- und Ausblenden beim Scrollen, aktiver Abschnitt, Slider für Funktionen sowie – auf dem Smartphone – Rollen und Sicherheit (Pfeile, Wischen, Pfeiltasten), Reiter „Im Detail“, Ladezustand der Bilder (ohne JavaScript bleibt alles nutzbar; Karten stehen dann als Raster, die Themen untereinander) |
| `assets/img/app/`                     | Aufnahmen der Anwendung (helle Darstellung, `…-light-…`), je zwei Größen                     |
| `assets/img/`, `assets/brand/`        | Logo (Seite) und Logo-Vorlagen (Profilbilder, Präsentationen); Vorschaubild `og-image.png`   |
| `robots.txt`, `sitemap.xml`           | Für Suchmaschinen (enthalten die Musterdomain)                                              |
| `_headers`, `.htaccess`               | Sicherheits- und Cache-Header für Netlify/Cloudflare Pages bzw. Apache-Webspace              |
| `Vorschau-starten.cmd`                | Windows: Doppelklick startet die Vorschau und öffnet den Browser                            |
| `tools/`                              | Werkzeuge (siehe unten); müssen nicht hochgeladen werden                                    |
| `THIRD-PARTY-NOTICES.md`              | Lizenzhinweise der Symbole (lucide, ISC) – bitte mit veröffentlichen                        |

## Ansehen

**Windows: Doppelklick auf `Vorschau-starten.cmd`.** Das Fenster bleibt offen, solange die Vorschau läuft; beendet wird mit
Strg+C (Rückfrage mit „J“ beantworten). Der Browser öffnet sich von selbst.

Oder von Hand in einem Terminal im Ordner der Website (Windows 11: Rechtsklick auf den Ordner → „Im Terminal öffnen“):

```bash
node tools/serve.mjs          # Vorschau auf http://localhost:4173
node tools/serve.mjs --open   # ... und den Browser öffnen
```

Der Vorschau-Server setzt dieselben Sicherheits-Header wie später der Webserver – Verstöße gegen die Content-Security-Policy
erscheinen in der Konsole des Browsers. (`index.html` lässt sich zur schnellen Ansicht auch per Doppelklick öffnen.)

## Vor der Veröffentlichung

1. **Platzhalter ersetzen.** `node tools/check-site.mjs` listet alle offenen Stellen mit Datei und Zeile:
   - `[[E-MAIL]]` – Kontaktadresse in Impressum und Datenschutz. Die Demo-Anfrage auf der Startseite geht bereits an
     `vereinsflow@gmail.com` (Schaltfläche „Demo per E-Mail anfragen“ und Adresse darunter im Abschnitt „Kontakt“).
   - Betreiberangaben im **Impressum** (Name, Anschrift, Telefon, ggf. Register und USt-IdNr.).
   - Angaben in der **Datenschutzerklärung** (Verantwortlicher, Hosting-Anbieter, Speicherdauer der Server-Logs, Aufsichtsbehörde).
2. **Domain eintragen:** `node tools/set-domain.mjs https://www.ihre-domain.de` (ersetzt `https://vereinsflow.example` in Seiten,
   `robots.txt` und `sitemap.xml`).
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

Der Ordner (ohne `tools/`, `README.md` und `Vorschau-starten.cmd`) ist eine fertige statische Website und läuft bei jedem Anbieter, der Dateien ausliefert:

- **Netlify** oder **Cloudflare Pages**: Ordner `website/` hochladen oder das Repository verbinden (Basisverzeichnis und
  Ausgabeordner `website`, kein Build-Befehl); `_headers` wird automatisch gelesen. Beide unterstützen auch private Repositories.
- **GitHub Pages**: veröffentlicht nur den Hauptordner oder `docs/`, für `website/` wäre ein eigener Workflow nötig (nicht
  eingerichtet); private Repositories brauchen dafür einen bezahlten GitHub-Tarif. Die Header (`_headers`) wirken dort nicht.
- **Klassischer Webspace** (IONOS, Strato, all-inkl u. a., Apache): per FTP hochladen; `.htaccess` liefert Fehlerseite und Header.
- **nginx** – Beispiel:

  ```nginx
  server {
    root /var/www/vereinsflow-website;
    index index.html;
    error_page 404 /404.html;
    add_header Content-Security-Policy "default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self'; font-src 'self'; connect-src 'none'; object-src 'none'; base-uri 'self'; form-action 'none'; frame-ancestors 'none'" always;
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
| `node tools/set-domain.mjs <https://…>`    | Trägt die echte Domain ein                                                                                |
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
- Beim Aufnehmen entstehen Anmelde-Einträge im Änderungsprotokoll der Demo. Parallel laufende E2E-Tests der Anwendung nicht
  stören: Aufnahme und Tests belasten denselben Rechner.

## Entscheidungen, die sich leicht ändern lassen

- **Ansprache:** „Sie“ (die Anwendung selbst duzt). Texte stehen direkt in den HTML-Dateien.
- **Handlungsaufforderung:** „Demo anfragen“ per E-Mail – die Plattform ist geschlossen, neue Vereine richtet der Betreiber ein
  (siehe `/registrieren` der Anwendung). Ein Kontaktformular gibt es bewusst nicht (würde einen Dienst und Datenschutzhinweise erfordern).
- **Schrift:** Systemschrift des Geräts (auf Apple-Geräten SF Pro, unter Windows Segoe UI). Die Wortmarke des Logos (Poppins)
  liegt als Vektorgrafik vor.
- **Farben:** ruhige, kühle Flächen wie in der Anwendung; Schaltflächen in deren Hauptfarbe (`--accent`), das Logo-Blau
  (`--brand`) für Schrift-Akzente. Alle Werte oben in `site.css` (`:root`). Eine dunkle Darstellung gibt es bewusst nicht (weißes Design).
- **Bewegung:** kurze Ladeanimation des Einstiegs (reines CSS), sanftes Ein- und Ausblenden beim Scrollen (`.reveal`, gesteuert
  von `site.js`), leichte Parallaxe der Bilder (`.plx`) und Scroll-Effekte im Einstieg über CSS-Scroll-Timelines – Browser ohne
  Unterstützung zeigen feste Bilder. Bewegt werden nur Transparenz und Transformationen, nie das Layout. Mit „Bewegung
  reduzieren“ im Betriebssystem ist alles sofort und ohne Animation sichtbar.
