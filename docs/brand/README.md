# Logo

Das VereinsFlow-Logo „Punktring“ (seit 28. November 2026): Vier Ringe aus Punkten – die Mitglieder – bilden eine Sprechblase.
Unten links öffnet sich der Ring, drei kleiner werdende Punkte laufen als Zipfel heraus (Kommunikation). In der Mitte liegt ein
Kleeblatt-Knoten aus einer einzigen geschlossenen Linie: alles ist miteinander verbunden. Daneben bzw. darunter die Wortmarke
„VereinsFlow“ in Manrope ExtraBold, gerade und ohne Unterstrich; „Flow“ im Farbverlauf.

Alle Dateien stammen aus dem Logo-Paket `vereinsflow-logo-paket/` (Ordner `03-software` für die App, `02-website` für die
Website; Anleitung, Geometrie und Mindestgrößen in dessen `LIESMICH.md`) und sind unverändert übernommen. Die Schrift ist dort
bereits in Pfade umgewandelt – es muss keine Schriftdatei geladen werden. Das Logo vom Oktober 2026 (das „V“ aus drei Etappen
mit orangem Punkt) ist in App und Website ersetzt; sein Paket liegt unter `alt-2026-10-logo-paket/`.

## Farben

| Name            | Wert                  | Verwendung                                                                                |
| --------------- | --------------------- | ----------------------------------------------------------------------------------------- |
| Grün            | `#34D399`             | Ring oben, Querband des Knotens – auf dunklem Grund                                       |
| Türkis          | `#22D3EE`             | Ring links und rechts, Zipfel, Anfang von „Flow“ – auf dunklem Grund                      |
| Vereinsblau     | `#3A6BEA`             | Ring unten, obere Schlaufe des Knotens, Ende von „Flow“ (hell wie dunkel)                 |
| Grün auf Weiß   | `#10A877`             | statt Grün auf hellem Grund (mehr Kontrast)                                               |
| Türkis auf Weiß | `#0895B8`             | statt Türkis auf hellem Grund (mehr Kontrast)                                             |
| Tinte           | `#0F1C2E`             | „Vereins“ auf hellem Grund, einfarbige Druckfassung, Kachel der App-Symbole               |
| Weiß            | `#FFFFFF`             | „Vereins“ auf dunklem Grund (`-weiss`), einfarbig weiße Fassung                           |
| Favicon-Knoten  | `#5EE6B8` → `#6F95FF` | nur im Favicon: aufgehelltes Grün → Vereinsblau, damit der Knoten bei 16 px lesbar bleibt |

Der Ring läuft rundum von Grün (oben) über Türkis (seitlich) zu Vereinsblau (unten), der Knoten von Grün nach Vereinsblau.
Die Farben gehören nur zum Logo; die Farbpalette der Oberfläche (`src/app/globals.css`) ist davon unabhängig.

## Fassungen

- **Original** (mit den feinen Punktringen) – ab gut 100 px Zeichenhöhe: gestapeltes Logo, Zeichen allein, große App-Symbole.
- **Kleine Form** – darunter: der Ring als durchgehender Bogen mit der Lücke unten links, der Zipfel aus zwei Punkten, ein
  kräftigerer Knoten; gleiche Farben, gleiche Lage. Die Halbtonpunkte verschwämmen in kleinen Größen zu Dunst.
- **Kompakt** – die kleine Form neben dem Namen, für Kopfzeilen und Seitenleisten (40–44 px hoch).

## Logo in der Oberfläche (`public/brand/`)

| Datei                                            | Fassung                                  | Maße (viewBox)  | Wofür                                                |
| ------------------------------------------------ | ---------------------------------------- | --------------- | ---------------------------------------------------- |
| `logo.svg`, `logo-weiss.svg`                     | kompakt (kleine Form links, Name rechts) | 840,24 × 204    | Seitenleiste, Smartphone-Menü, Kopfzeilen, Anmeldung |
| `logo-gestapelt.svg`, `logo-gestapelt-weiss.svg` | Original über dem Namen                  | 461,95 × 303,73 | Anmelde- und Hinweisseiten                           |
| `symbol.svg`, `symbol-weiss.svg`                 | nur das Zeichen (Original), quadratisch  | 210,4 × 210,4   | `BrandLogo variant="icon"` (derzeit nicht verwendet) |
| `symbol-klein.svg`, `symbol-klein-weiss.svg`     | nur das Zeichen in der kleinen Form      | 204 × 204       | schmale Symbolleiste (weißer Kreis)                  |

`-weiss` ist jeweils die Fassung für dunklen Grund (Name weiß, hellere Verlaufstöne). Alle Dateien haben rundum einen schmalen
Rand (10 Einheiten), damit kein Punkt an der Kante liegt.

Eingebunden werden die Dateien über die Komponente `BrandLogo` ([`src/components/shared/brand-logo.tsx`](../../src/components/shared/brand-logo.tsx)),
meist über `Brand` ([`brand.tsx`](../../src/components/shared/brand.tsx)) als Link zur Startseite:

- `variant`: `horizontal` (Standard, kompakte Fassung), `stacked` (gestapelt) oder `icon` (nur das Zeichen). Die Maße in
  `LOGOS` (`width`/`height`: 840 × 204, 462 × 304, 210 × 210) entsprechen dem Seitenverhältnis der Dateien – der Browser hält
  damit schon vor dem Laden den richtigen Platz frei.
- Hell und dunkel: Beide Bilder stehen im HTML, CSS zeigt je nach Darstellung (`.dark`) das passende – ohne Nachladen beim Umschalten.
- Beschriftung: `alt="VereinsFlow"`; mit `decorative` (wenn z. B. der umgebende Link schon „VereinsFlow – Startseite“ heißt) leer.

Wo das Logo steht:

- **Anmelde- und Hinweisseiten** (Registrierung, Passwort vergessen/zurücksetzen, Einladung): gestapelte Fassung, 16 rem breit,
  mittig über der Karte.
- **Anmeldebühne** (`/anmelden`, immer Nacht): kompakte Fassung in Weiß, 2,5–2,75 rem hoch, oben links.
- **Seitenleiste, Smartphone-Menü, Impressum, Datenschutzerklärung, Einrichtung, Plattformverwaltung, Seite „nicht gefunden“:**
  kompakte Fassung (die breite Seitenleiste folgt der Darstellung der Seite). Die schmale, dunkle Symbolleiste (Standard seit
  17.10.2026) zeigt `symbol-klein.svg` – immer die helle Fassung – in einem weißen Kreis (2,75 rem, Zeichen 1,75 rem; direkt in
  [`sidebar.tsx`](../../src/components/layout/sidebar.tsx)).
- E-Mails und Ausdrucke (Helferplan, Aushang „Mitglied werden“) zeigen kein VereinsFlow-Logo, nur das Vereinslogo.

## App-Symbole (Browser-Tab, Lesezeichen, Startbildschirm)

Das Zeichen auf der dunklen Kachel (Tinte `#0F1C2E`) – auf hellen wie dunklen Tab-Leisten gut sichtbar.

| Datei                              | Wofür                                                                                                       |
| ---------------------------------- | ----------------------------------------------------------------------------------------------------------- |
| `src/app/icon.svg`                 | Browser-Tab in aktuellen Browsern (Vektor, kleine Form, Knoten aufgehellt)                                  |
| `src/app/favicon.ico`              | Safari, Windows, ältere Browser – 16, 32 und 48 px (wie `icon.svg`)                                         |
| `src/app/apple-icon.png`           | Home-Bildschirm von iPhone und iPad (180 px, Original mit Punktringen, randlos – iOS rundet selbst ab)      |
| `public/app-icon-192.png`, `-512`  | Android und Chrome, über das Web-App-Manifest (`src/app/manifest.ts`), Original                             |
| `public/app-icon-maskable-512.png` | Android-Startbildschirme mit runden oder tropfenförmigen Symbolen – Zeichen samt Zipfel im Sicherheitskreis |

Next.js bindet sie über die Dateinamen selbst in jede Seite ein; der Name unter dem Symbol auf dem iPhone ist „VereinsFlow“
(`src/app/layout.tsx`). Das Manifest öffnet VereinsFlow vom Startbildschirm aus bewusst im Browser (`display: "browser"`), nicht
als eigenständige App ohne Adresszeile; seine Farben (`background_color`/`theme_color` Weiß) zeigen sich in dieser Ansicht nicht
– die dunkle Kachel steckt in den Symbolen selbst. Symbole, Logo-Dateien und Manifest sind ohne Anmeldung abrufbar
(`src/proxy.ts`), geprüft in `tests/e2e/app-symbol.spec.ts`.

## Website

Die Website (`website/`) nimmt die Dateien aus `02-website` des Pakets (`node website/tools/make-logo-assets.mjs
docs/brand/vereinsflow-logo-paket`): Kopf- und Fußzeile zeigen `assets/img/logo-dark.svg` (kompakte Fassung, weiß) mit 124 × 30
bzw. 148 × 36 px, dazu Favicons, `apple-touch-icon.png`, `android-chrome-192/512.png`, `og-image.png` und das Logo der
Bestätigungs-E-Mail (`logo-mail.png`, kompakt). Einzelheiten in `website/README.md` („Logo“).

## Änderungen am Logo

Neue Fassungen kommen als Paket aus der Gestaltung: die Dateien aus `03-software` an dieselben Pfade kopieren (Dateinamen wie
oben). Ändert sich das Seitenverhältnis, die Maße (`width`/`height`) in `brand-logo.tsx` und beim Symbol in `sidebar.tsx`
anpassen. Der Test `tests/e2e/logo.spec.ts` prüft, dass das Logo erscheint, beschriftet ist und in der dunklen Darstellung die
helle Fassung zeigt.

## Logo-Paket und Entwürfe (`docs/brand/`)

- `vereinsflow-logo-paket/` (und dasselbe als `vereinsflow-logo-paket.zip` zum Weitergeben) – das Paket des Logos „Punktring“,
  sortiert nach Einsatzort: Master-Dateien als SVG, PNG und Druck-PDF (`01-logo`), Website (`02-website`), Software
  (`03-software`), App-Symbole für iOS (`04-app-ios`) und Android (`05-app-android`), Instagram und TikTok (`06-instagram`);
  Anleitung, Mindestgrößen, Maße gegenüber dem alten Paket und Geometrie in `LIESMICH.md`. Quelle für alle Logo-Dateien von App
  und Website.
- `vereinsflow-instagram-profilbild.png` – Profilbild für Instagram (dasselbe wie `06-instagram/profilbild-1080.png`).
- `alt-2026-10-logo-paket/` (und `alt-2026-10-logo-paket.zip`) – das Paket des Logos vom 4. Oktober 2026 („V“ aus drei Etappen),
  gleich aufgebaut; nur noch zum Nachschlagen (das Werbevideo nutzt es noch, siehe `werbevideo/README.md`).
- Der Weg zum alten Logo, in zeitlicher Reihenfolge: `entwuerfe/` (vier erste Richtungen), `entwuerfe-2/`, `feinschliff/`,
  `logo-final/`, `logo-v2/`, `logo-final-v3/` bis `logo-final-v7/` (je mit Übersichtsbild `0-…png`), `logo-ideen/`. Nur zum
  Nachschlagen.
