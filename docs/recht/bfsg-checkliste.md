# BFSG / WCAG 2.1 AA – Prüfung der Website vereins-flow.com

Entwurf, Stand 17. Oktober 2026. Reine Code-Prüfung (nur gelesen, nichts geändert) der Dateien in
`/Users/luisheidecker/VereinsFlow/website/`: `index.html`, `impressum.html`, `datenschutz.html`, `404.html`,
`newsletter.php` (erzeugte Seiten), `assets/css/site.css`, `assets/js/site.js`, `assets/js/frueh.js`.
Fundstellen als `Datei:Zeile`. Kontraste nach WCAG-Formel aus den Farbwerten in `site.css` berechnet.

Maßstab: EN 301 549 (harmonisierte Norm) → WCAG 2.1, Stufen A und AA. Rechtsrahmen: § 3 Abs. 1 BFSG, § 12 Nr. 3 und
§ 19 BFSGV (Websites und Zahlungsfunktionen „wahrnehmbar, bedienbar, verständlich, robust“), § 14 Abs. 1 Nr. 2 i. V. m.
Anlage 3 Nr. 1 BFSG (Information zur Barrierefreiheit). Hinweis: Als Kleinstunternehmen (§ 2 Nr. 17 BFSG) ist der
Betreiber nach § 3 Abs. 3 BFSG derzeit von der Pflicht für Dienstleistungen ausgenommen; die Prüfung ist freiwillig
und greift verbindlich, sobald zehn Beschäftigte oder 2 Mio. € Umsatz/Bilanzsumme erreicht werden.

Legende: **✔ erfüllt** · **◐ teilweise / mit Einschränkung** · **✘ nicht erfüllt** · **○ nicht anwendbar** · **? manuell prüfen** (nur im Browser/mit Hilfsmitteln prüfbar)

---

## 1. Kurzfazit

- Keine harten Verstöße (✘) im Code gefunden. Die Seite ist ungewöhnlich sorgfältig gebaut: Skip-Link, semantische
  Struktur, Alt-Texte, ARIA-Rollen für Reiter/Dialoge, Tastaturbedienung mit Pfeiltasten, Fokusrückgabe, `inert`,
  `prefers-reduced-motion`, Pausenschalter, relative Schriftgrößen, kein Zoom-Verbot.
- Drei Punkte mit Einschränkung (◐): Fokusrahmen der Funktionskacheln hängt an CSS `:has()`; Formularfehler nur per
  Browser-Standardmeldung; Rahmenkontrast des Zweitknopfs (`.btn-quiet`) unter 3 : 1 (nur Rand, nicht der Knopf selbst).
- Offen (?): Prüfung mit Screenreadern (NVDA/VoiceOver), Reflow bei 320 px / 400 % Zoom, Textabstände (1.4.12),
  HTML-Validierung. Vor dem Start von Kundenkonto/Checkout: diese Bereiche komplett prüfen (§ 19 BFSGV).
- Empfohlene Formulierung für die Erklärung bis zur Hilfsmittelprüfung: **„teilweise vereinbar“**.

---

## 2. Checkliste nach den geforderten Schwerpunkten

### 2.1 Kontraste (1.4.3 Text, 1.4.11 Nicht-Text, 1.4.1 Farbe)

| Element | Farben | Kontrast | Status | Fundstelle |
|---|---|---|---|---|
| Fließtext `--text` auf Weiß | #2e2e2e / #ffffff | ≈ 13,5 : 1 | ✔ | site.css:36 |
| Überschriften/Knöpfe `--ink` | #1a1a1a / #ffffff | ≈ 16,6 : 1 | ✔ | site.css:35 |
| Nebentext `--muted` auf Weiß | #616161 / #ffffff | ≈ 6,2 : 1 | ✔ | site.css:37 |
| Nebentext `--muted` auf `--bg-alt` | #616161 / #f4f4f4 | ≈ 5,6 : 1 | ✔ | site.css:31, 37 |
| Linkfarbe `--brand` | #3a6bea / #ffffff | ≈ 4,7 : 1 | ✔ (Kommentar im CSS bestätigt) | site.css:45 |
| Dunkle Abschnitte `.nacht`: Text `--n-text` | #d3dbe7 auf Karte #162740 | ≈ 10,8 : 1 (CSS-Kommentar) | ✔ | site.css:8093–8097 |
| Dunkle Abschnitte: Nebentext `--n-muted` | #a7b3c6 | ≈ 7,1–8,1 : 1 (CSS-Kommentar) | ✔ | site.css:8097 |
| Einstieg: „in Fluss“ in der h1 | gemessen 3,9 : 1 (README:232) | großer Text ≥ 3 : 1 | ✔ (nur weil h1 = großer Text; bei Verkleinerung neu messen) | index.html:207, README.md:232 |
| Placeholder im Formular | #6b6b6b / #ffffff | ≈ 5,3 : 1 | ✔ | site.css:6272–6275 |
| Eingabefeld-Rahmen (1.4.11) | #858585 / #ffffff | ≈ 3,7 : 1 | ✔ | site.css:6255 |
| Fokusrahmen `--ring` (1.4.11) | #3f7fd6 / #ffffff | ≈ 4,0 : 1 | ✔ | site.css:52, 189–191 |
| Zweitknopf-Rahmen `.btn-quiet` (`--frame-strong`) | rgb(26 26 26 / 18 %) ≈ #d6d6d6 / #ffffff | ≈ 1,45 : 1 | ◐ Rand allein unter 3 : 1; Knopf durch Text (≥ 4,5 : 1) erkennbar – 1.4.11 verlangt den Rand nur, wenn er die einzige Kennzeichnung ist. Empfehlung: Rand auf ≥ #949494 oder gefüllte Fläche | site.css:41, 747–752 |
| Linien `--line-strong` (#d4d4d4), laut Kommentar für „Tasten, Felder“ | ≈ 1,5 : 1 | ? prüfen, an welchen Bedienelementen sie als einzige Begrenzung dient | site.css:39 |
| Entwurfskasten `.draft-notice` (`--warn` auf `--warn-soft`) | #8a5a00 / #fcefd0 | ≈ 5,2 : 1 | ✔ (nur Entwurf) | site.css:53–54, 6680–6697 |
| Farbe als einziges Mittel (1.4.1) | Links unterstrichen (`text-decoration-color`), Ampel in den Kacheln dekorativ mit Text „5/5“ daneben | – | ✔ | site.css:178–181; index.html:481–485 |

### 2.2 Alternativtexte (1.1.1)

| Prüfpunkt | Befund | Status | Fundstelle |
|---|---|---|---|
| Alle `<img>` haben `alt` | 39 Bilder, 39 mit `alt`-Attribut | ✔ | index.html (gesamt) |
| Informative Bilder beschrieben | 15 Bilder mit ausführlichen, inhaltlich passenden Alt-Texten (Dashboard, Suche, Mitgliederliste, Kalender, Auswertungen, Nachrichten, Helferplan, Druckansicht …) | ✔ | index.html:233, 272, 293, 312, 330, 349, 366, 385, 401, 428, 689, 710, 724, 840, 959 |
| Dekorative Bilder leer | 24 Bilder mit `alt=""`, alle in `aria-hidden`-Hüllen oder reine Schmuck-/Animationsrahmen (`.live-frame`, `.feat-bild`) | ✔ | index.html:146, 276–280, 316–319, 353–355, 389–390, 486, 502, 577, 694–698, 716 |
| Logo in der Kopfzeile | `alt=""`, der umschließende Link trägt `aria-label="VereinsFlow – zur Startseite"` | ✔ | index.html:144–146 |
| Logo in der Fußzeile | `alt="VereinsFlow"` | ✔ | index.html:959 |
| SVG-Symbole (`<use>`) | durchgängig `aria-hidden="true"`; Text daneben oder `sr-only` (z. B. „Schließen“, „Anrufen:“) | ✔ | index.html:492, 913; Sprite `focusable="false"` |
| Hero-Zeichen (Schmuck-SVG) | `aria-hidden="true" focusable="false"` | ✔ | index.html:188 |
| Bilder von Text (1.4.5) | Screenshots der Anwendung enthalten Text; zulässig, da Darstellung des Produkts wesentlich ist und Alt-Text den Inhalt wiedergibt | ✔ | index.html:233 ff. |

### 2.3 Tastaturbedienung (2.1.1, 2.1.2, 2.1.4, 2.4.3)

| Prüfpunkt | Befund | Status | Fundstelle |
|---|---|---|---|
| Alle Funktionen per Tastatur | Native `<a>`, `<button>`, `<details>/<summary>`, `<input>`; keine klickbaren `<div>` | ✔ | index.html gesamt |
| Reiter „Abläufe“ | `role="tablist"/"tab"`, `aria-controls`; Pfeiltasten wechseln, `aria-selected` und `inert` der Panels per JS | ✔ | index.html:253–257; site.js:806–812, 836 |
| Funktionskacheln | Popover-Dialoge (`popover`, `role="dialog"`, `aria-labelledby`, `aria-describedby`), Schließen-Knopf mit `autofocus`, Esc schließt, Pfeiltasten/Pos1/Ende zwischen Kacheln | ✔ | index.html:488–496; site.js:570–704 |
| Fokusrückgabe nach Dialog | Nach Esc/× zurück auf die Kachel (auch Safari) | ✔ | site.js:596–612 |
| Menü am Smartphone | `aria-expanded`, `aria-controls`, Esc schließt, Fokus auf ersten Menüpunkt, Rest der Seite `inert` | ✔ | index.html:153; site.js:14–52 |
| Keine Tastaturfalle (2.1.2) | Esc/Schließen bei Dialog und Menü; Popover-API | ✔ | site.js:46–49, 596 |
| Zeichen-Tastenkürzel (2.1.4) | keine | ○ | site.js |
| Fokusreihenfolge (2.4.3) | DOM-Reihenfolge, unsichtbare Panels `inert`, Honeypot `tabindex="-1"` + `aria-hidden` | ✔ | index.html:945; site.js:806 |

### 2.4 Fokus sichtbar (2.4.7)

| Prüfpunkt | Befund | Status | Fundstelle |
|---|---|---|---|
| Globaler Fokusstil | `:focus-visible { outline: 3px solid var(--ring); outline-offset: 3px }` | ✔ | site.css:189–191 |
| Skip-Link erscheint bei Fokus | `.skip-link:focus { top: 12px }` | ✔ | site.css:254–256 |
| Funktionskacheln | `.feat-btn:focus-visible { outline: none }` – Rahmen stattdessen auf der Kachel über `.feat:has(.feat-btn:focus-visible)` | ◐ In Browsern ohne `:has()` (ältere Firefox < 121, Safari < 15.4) ist der Fokus auf 12 Schaltflächen unsichtbar. Empfehlung: Rückfall per `@supports not selector(:has(a))` mit Outline direkt auf `.feat-btn` | site.css:4657–4664, 8351–8359 |
| Pausenschalter | `outline: none`, Rahmen über `::before` | ✔ (Rahmen vorhanden) | site.css:5863–5869 |
| Eingabefelder | eigener sichtbarer Fokusrahmen | ✔ | site.css:6278–6282 |
| Fokus in dunklen Abschnitten | `--ring` wird auf `--sky` umgestellt (Kontrast zum dunklen Grund) | ✔, Wert ? messen | site.css:8101 |

### 2.5 Überschriftenstruktur (1.3.1, 2.4.6, 2.4.10)

| Prüfpunkt | Befund | Status | Fundstelle |
|---|---|---|---|
| Genau eine h1 | „Bringt Vereinsarbeit in Fluss“ | ✔ | index.html:207 |
| Keine übersprungenen Ebenen | Folge h1 → h2 → h3 → h2 → h3 … (geprüft: `h1 h2 h3 h2 h3 h2 h3 h2 h3 h2 h3 h2`) | ✔ | index.html:207–980 |
| Abschnitte mit `aria-labelledby` | jede `<section>` auf ihre h2 bezogen | ✔ | index.html:182, 243, 416, 469, 667, 755, 801, 854, 903 |
| Fußzeile | h2 „Produkt“, „Kontakt“ – passend unterhalb h1 | ✔ | index.html:970, 980 |
| Rechtsseiten | h1 + h2 je Abschnitt; Inhaltsverzeichnis als `<nav aria-label>` | ✔ | impressum.html, datenschutz.html |
| Listen als Listen (`role="list"` für Safari bei `list-style: none`) | ✔ | index.html:476, 728, 730, 763, 778 |

### 2.6 Formular-Labels (1.3.1, 1.3.5, 3.3.1, 3.3.2, 3.3.3, 4.1.2)

| Prüfpunkt | Befund | Status | Fundstelle |
|---|---|---|---|
| Sichtbare Beschriftung | `<label>` umschließt `<span>`-Text und `<input>` (E-Mail, Verein) | ✔ | index.html:936–943 |
| Pflicht/optional erkennbar | „Verein (freiwillig)“, E-Mail `required` | ✔ | index.html:940 |
| Eingabezweck (1.3.5) | `autocomplete="email"`, `autocomplete="organization"` | ✔ | index.html:938, 942 |
| Einwilligungstext zugeordnet | `aria-describedby="benachrichtigen-einwilligung"` am E-Mail-Feld | ✔ | index.html:938, 948 |
| Placeholder nicht als Label | Placeholder nur Beispiel, Label vorhanden | ✔ | index.html:938 |
| Honeypot für Hilfsmittel unsichtbar | `aria-hidden="true"`, `tabindex="-1"`, `autocomplete="off"` | ✔ | index.html:950 |
| Fehlererkennung/-korrektur (3.3.1/3.3.3) | nur Browser-Validierung (`type="email"`, `required`); Serverfehler als eigene Seiten (`vf_seite`) | ◐ zulässig, aber keine eigenen Hinweise im Seitentext; für Checkout eigene Fehlermeldungen am Feld vorsehen | index.html:938; newsletter.php:vf_seite |
| Fehlervermeidung bei rechtlichen/finanziellen Vorgängen (3.3.4) | Newsletter: Double-Opt-in = Bestätigungsschritt ✔. Checkout: Prüfseite vor „zahlungspflichtig bestellen“ (§ 312j Abs. 3 BGB) einplanen | ✔ / ? (geplant) | newsletter.php:5–9 |
| Name/Rolle/Wert (4.1.2) | `aria-expanded` am Menüknopf, `aria-label` am Pausenschalter („Vorführung anhalten“, enthält sichtbares „Anhalten“ → 2.5.3 ✔), `aria-live` für „Adresse kopiert“ | ✔ | index.html:153, 269, 917–918 |

### 2.7 Bewegung und Animation (2.2.2, 2.3.1, 2.3.3 AAA, `prefers-reduced-motion`)

| Prüfpunkt | Befund | Status | Fundstelle |
|---|---|---|---|
| Systemeinstellung „Bewegung reduzieren“ | JS liest `matchMedia("(prefers-reduced-motion: reduce)")`; CSS-Animationen stehen in `@media (prefers-reduced-motion: no-preference)`-Blöcken (15 Stellen) | ✔ | site.js:9, 537, 561; site.css:22, 6932–6938, 7666, 7712, 7742, 7868, 7896, 8729, 8791, 9047, 9244, 9283, 9387, 9484 |
| Pausieren/Stoppen laufender Inhalte (2.2.2) | Pausenschalter „Anhalten“ an jeder Live-Vorführung (5×), nur mit JS sichtbar | ✔ | index.html:269, 309, 346, 382, 686 |
| Einblendungen beim Scrollen (`.reveal`) | einmalig, kurz, nur bei no-preference; Dialog öffnet erst nach Ende der Animation (`animation.finish()`) | ✔ | site.css:6932 ff.; site.js:620–630 |
| Scroll-gesteuerte Vorführungen (Laptop/Telefon) | `animation-timeline: scroll()/view()` nur in `@supports` + no-preference; dekorativ, Inhalte als Text/Bilder daneben | ✔ (2.3.3 AAA nicht Maßstab; freiwilliger Schalter „Bewegung aus“ empfohlen) | site.css:7665–7681, 9282–9323 |
| Autoplay-Video/-Audio | keines vorhanden | ○ | index.html (kein `<video>/<audio>/autoplay`) |
| Blitzen (2.3.1) | keine blinkenden Inhalte | ✔ | – |
| Hover-Parallaxe | nur bei `(hover: hover) and (pointer: fine)` und no-preference | ✔ | site.css:8729, 9484; site.js:537 |

### 2.8 Sprache (3.1.1, 3.1.2)

| Prüfpunkt | Befund | Status | Fundstelle |
|---|---|---|---|
| Seitensprache | `<html lang="de">` auf allen Seiten, auch in `vf_seite` | ✔ | index.html:2; impressum.html:2; datenschutz.html:2; newsletter.php:73 |
| Sprachwechsel im Text (3.1.2) | nur eingedeutschte Fachwörter („Dashboard“, „Demo“, „CSV“), kein `lang`-Wechsel nötig | ○ | – |

### 2.9 Skip-Link / Blöcke umgehen (2.4.1)

| Prüfpunkt | Befund | Status | Fundstelle |
|---|---|---|---|
| Skip-Link als erstes fokussierbares Element | `<a class="skip-link" href="#inhalt">Zum Inhalt springen</a>` | ✔ | index.html:85; impressum.html, datenschutz.html, 404.html, newsletter.php |
| Ziel vorhanden und fokussierbar | `<main id="inhalt">` (Sprungziel per Fragment; Browser setzen den sequenziellen Fokus hinter das Ziel) | ✔ | index.html:176 |
| Landmarken | `header`, `nav aria-label`, `main`, `footer`, `section aria-labelledby` | ✔ | index.html:141–176, 955 |

### 2.10 Zoom 200 % / Reflow / Textabstände (1.4.4, 1.4.10, 1.4.12, 1.3.4)

| Prüfpunkt | Befund | Status | Fundstelle |
|---|---|---|---|
| Zoom nicht gesperrt | Viewport ohne `maximum-scale`/`user-scalable=no` | ✔ | index.html:5 |
| Schriftgrößen relativ | 59 `font-size`-Angaben in rem/em/clamp, 0 in px; Eingabefeld `max(1rem, 16px)` | ✔ | site.css (gesamt), 6260 |
| Reflow 320 px ohne horizontales Scrollen (1.4.10) | Media-Queries und `clamp()`-Layout vorhanden; README dokumentiert Prüfung 320–1920 px | ? im Browser bei 400 % bzw. 320 px prüfen (insbesondere Vorführungen, Reiterleiste, Fußzeile) | site.css:70–79; README.md:232 |
| Textabstände (1.4.12) | keine festen Höhen an Textcontainern erkennbar; `overflow: hidden` an Schmuckelementen | ? mit Bookmarklet (Zeilenhöhe 1,5, Absatz 2, Buchstaben 0,12, Wort 0,16) prüfen | site.css |
| Orientierung (1.3.4) | nicht gesperrt; Vorführungen reagieren auf Hoch-/Querformat | ✔ | site.css:1896–1904, 3012 |

---

## 3. Weitere WCAG-2.1-Kriterien (A/AA) – Kurzdurchgang

| Kriterium | Status | Befund / Fundstelle |
|---|---|---|
| 1.2.1–1.2.5 Zeitbasierte Medien | ○ | kein Audio/Video |
| 1.3.2 Sinnvolle Reihenfolge | ✔ | ohne JS alle Reiter untereinander (index.html:243–249 Kommentar), Panels unsichtbar = `inert` |
| 1.3.3 Sensorische Eigenschaften | ✔ | keine Anweisungen „rechts/grün“ ohne Text |
| 1.4.2 Audio-Steuerung | ○ | kein Audio |
| 1.4.13 Inhalt bei Hover/Fokus | ✔ | Popover nur per Klick/Enter, mit Esc schließbar, bleibt stehen (site.js:570 ff.) |
| 2.2.1 Zeitbegrenzung | ✔ | keine Zeitlimits auf der Seite; Bestätigungslink 7 Tage gültig (Server, kein Interaktionslimit) |
| 2.4.2 Seitentitel | ✔ | „… – VereinsFlow“ auf jeder Seite (index.html:6; impressum.html:6) |
| 2.4.4 Linkzweck | ✔ | eindeutige Linktexte; Kontext per `sr-only` („So sieht es aus: Helferschichten“, index.html:496) |
| 2.4.5 Mehrere Wege | ✔ | Navigation, Fußzeile, Inhaltsverzeichnis auf Rechtsseiten (Einseiter) |
| 2.5.1 Zeigergesten | ✔ | keine Mehrfinger-/Pfadgesten |
| 2.5.2 Zeiger-Abbruch | ✔ | Standard-Click-Events |
| 2.5.3 Beschriftung im Namen | ✔ | `aria-label="Vorführung anhalten"` enthält „Anhalten“ (index.html:269) |
| 2.5.4 Bewegungsaktivierung | ○ | keine |
| 2.5.5 Zielgröße (AAA) / 2.5.8 (WCAG 2.2 AA) | ✔ freiwillig | `min-height: 44–48px` an Links/Knöpfen/Feldern (site.css:320, 414, 630, 701, 792, 918, 978, 1294, 5042, 6253, 6749) |
| 3.2.1/3.2.2 Bei Fokus/Eingabe | ✔ | keine automatischen Kontextwechsel |
| 3.2.3/3.2.4 Konsistente Navigation/Bezeichnung | ✔ | identische Kopf-/Fußzeile auf allen Seiten (README: Kopien nachziehen) |
| 3.3.2 Beschriftungen | ✔ | siehe 2.6 |
| 4.1.1 Syntax (in WCAG 2.2 entfallen) | ? | HTML-Validator laufen lassen (Popover/`inert`-Attribute sind valide HTML Living Standard) |
| 4.1.3 Statusmeldungen | ✔ | `aria-live="polite"` für Kopier-Status (index.html:918); Formularergebnis als neue Seite mit h1 (newsletter.php:vf_seite) |

---

## 4. Bezüge zur BFSGV, die über WCAG hinausgehen

| Anforderung | Status | Anmerkung |
|---|---|---|
| § 12 Nr. 2 BFSGV: Informationen zur Dienstleistung über mehr als einen Sinneskanal, als Text, mit Kontrast, barrierefrei | ✔ | gesamte Website ist HTML-Text; Erklärung zur Barrierefreiheit (neu) beschreibt Dienstleistung und Bedienung |
| § 12 Nr. 3 BFSGV: Website wahrnehmbar, bedienbar, verständlich, robust | ◐ | siehe oben; Hilfsmittelprüfung offen |
| § 12 Nr. 4 BFSGV: Unterstützungsdienste informieren über barrierefreie Kommunikationsmittel | ✔ | E-Mail und Telefon; Feedback-Kontakt in der Erklärung |
| § 19 Nr. 1 BFSGV: Informationen zur Barrierefreiheit der angebotenen Dienstleistung (hier: der Anwendung VereinsFlow) | ? | für die App eine eigene Erklärung vorsehen (Plattform-Erklärung) |
| § 19 Nr. 2/3 BFSGV: Identifizierung, Authentifizierung, Sicherheit, Zahlung barrierefrei | ? | Kundenkonto/Checkout existieren noch nicht; gehostete Bezahlseiten (Stripe Checkout, Mollie) vor dem Start mit Tastatur/Screenreader prüfen; § 1 Abs. 4 Nr. 4 BFSG (Inhalte Dritter) entlastet nicht von § 19 für die eigene Zahlungsfunktion |
| Anlage 3 Nr. 1 BFSG: Information der Allgemeinheit (Beschreibung, Erläuterungen, Erfüllung, Marktüberwachungsbehörde) | ✔ (Entwurf) | `barrierefreiheit.html`; Link in der Fußzeile aller Seiten (footer-vorschlag.html) |
| § 14 Abs. 2 BFSG: Aufbewahrung der Information, solange die Dienstleistung angeboten wird | ✔ (Hinweis in der Erklärung) | Versionen der Erklärung archivieren (z. B. im Repo) |

---

## 5. Empfohlene nächste Schritte (Reihenfolge)

1. **Automatische Prüfung** im Browser: axe DevTools oder Lighthouse (Accessibility) auf `index.html`, `datenschutz.html`,
   `impressum.html`, `barrierefreiheit.html`, einer `newsletter.php`-Ergebnisseite; HTML-Validator (validator.w3.org).
2. **Manuelle Prüfung**: Tastatur-Durchgang (Tab/Shift+Tab/Pfeile/Esc) ohne Maus; Zoom 200 % und 400 % (Reflow bei
   1280 px → 320 px); Textabstands-Bookmarklet; „Bewegung reduzieren“ an/aus; Windows-Hochkontrastmodus.
3. **Screenreader**: VoiceOver (macOS/iOS, Safari) und NVDA (Windows, Firefox/Chrome): Überschriften-Navigation,
   Reiter, Kacheln/Dialoge, Formular, Ergebnisseiten, Menü am Smartphone.
4. **Fixes** (klein): `:has()`-Rückfall für `.feat-btn`-Fokus; `.btn-quiet`-Rand ≥ 3 : 1; eigene Fehlertexte am
   E-Mail-Feld (`aria-describedby` + `aria-invalid`); optional Schalter „Bewegung aus“.
5. **Checkout/Kundenkonto** vor dem Start komplett nach dieser Liste prüfen; Bezahlseite des Zahlungsdienstleisters
   mit Tastatur/Screenreader testen; Alternative (Rechnung, E-Mail) anbieten; `barrierefreiheit.html` aktualisieren
   (Stand, Datum, Einschränkungen).
6. **Erklärung pflegen**: nach jeder wesentlichen Änderung und mindestens jährlich prüfen; Datum der letzten Prüfung
   eintragen; alte Fassungen aufbewahren (§ 14 Abs. 2 BFSG).
