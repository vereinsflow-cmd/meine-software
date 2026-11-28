# VereinsFlow – Logo-Paket

Alle Dateien des neuen Logos, sortiert nach Einsatzort. Farben:
Schwarz `#1A1A1A` · Vereinsblau `#3A6BEA` · Himmel `#8FB0FF` (Blau auf dunklem Grund) · Signalorange `#FF8A5E` · Tinte `#0F1C2E` (dunkler Hintergrund) · Papier `#F6F3EC`.
Schrift im Logo: Manrope ExtraBold, 9° geneigt – in allen Dateien bereits in Pfade umgewandelt.

## 01-logo – Master-Dateien
| Datei | Wofür |
|---|---|
| `svg/vereinsflow-logo.svg` | Hauptlogo für helle Hintergründe (Standard) |
| `svg/vereinsflow-logo-weiss.svg` | Hauptlogo für dunkle Hintergründe |
| `svg/vereinsflow-logo-slogan(-weiss).svg` | mit „Bringt Vereinsarbeit in Fluss“ – Flyer, Präsentationen |
| `svg/vereinsflow-logo-gestapelt(-weiss).svg` | Symbol über dem Namen – Anmeldung, Plakate, quadratische Flächen |
| `svg/vereinsflow-symbol(-weiss).svg` | nur das V |
| `png/…` | dieselben Fassungen als PNG (2400 px breit, `-klein` = 800 px) |
| `pdf/…` | Vektor-PDF für Druckereien (Flyer, Banner, Trikots) |
| `mit-hintergrund/…` | fertig auf Dunkel bzw. Vereinsblau – z. B. für Präsentationen |

Regel: SVG überall, wo es geht (bleibt scharf). PNG nur, wo kein SVG möglich ist. PDF für den Druck.

## 02-website – Dateien mit denselben Namen wie im Ordner `website/`
Einfach in `website/` kopieren und vorhandene Dateien ersetzen:
`favicon.svg`, `favicon.ico`, `apple-touch-icon.png`, `assets/img/logo.svg`, `assets/img/logo-dark.svg`,
`assets/img/og-image.png` (Vorschaubild beim Teilen von Links, 1200 × 630), `assets/img/logo-mail.png` (E-Mail-Kopf, 570 × 87, dazu `@2x`),
`assets/brand/logo-horizontal(-dark).svg`, `assets/brand/logo-stacked(-dark).svg`, `assets/brand/logo-stacked.png`.
Zusätzlich `android-chrome-192.png` / `-512.png` für ein Web-Manifest.
Hinweis: Das neue Logo ist breiter als das alte – die `width`/`height`-Angaben der `<img>`-Tags in den HTML-Dateien anpassen.

## 03-software – Dateien für die VereinsFlow-App (Next.js)
Gleiche Pfade wie im Projekt: `src/app/icon.svg`, `src/app/apple-icon.png`, `src/app/favicon.ico`,
`public/app-icon-192.png`, `public/app-icon-512.png`, `public/app-icon-maskable-512.png`.
Unter `public/brand/` liegen die Logos als SVG für Kopfzeile, Anmeldung und Menü.
Hinweis: Das Logo in der Kopfzeile wird aktuell im Code gezeichnet (`src/components/shared/brand-logo.tsx`) – dort muss es durch die neuen SVGs ersetzt werden.

## 04-app-ios
`AppIcon.appiconset` komplett in Xcode in `Assets.xcassets` ziehen (ersetzt den alten Ordner). Alle Größen inkl. 1024 px für den App Store, ohne Transparenz, iOS rundet die Ecken selbst ab.

## 05-app-android
Inhalt von `res/` in `app/src/main/res/` kopieren: klassische Icons (`ic_launcher`, `ic_launcher_round`) für alle Dichten und das adaptive Icon (Vordergrund + Hintergrundfarbe Tinte). `play-store-icon-512.png` für den Play Store.

## 06-instagram
| Datei | Wofür |
|---|---|
| `profilbild-1080.png` | Profilbild (dunkel, Empfehlung) – im runden Zuschnitt geprüft |
| `profilbild-hell-1080.png` | Profilbild auf hellem Grund |
| `beitrag-1080x1080-*.png` | quadratischer Beitrag |
| `beitrag-1080x1350-*.png` | Hochformat-Beitrag (4:5) |
| `story-1080x1920-*.png` | Story / Reel-Titel – Inhalt in der sicheren Mitte |
| `highlight-cover-*.png` | Cover für Story-Highlights |

## Kleine Größen
Bis 32 px (Favicon, kleine App-Symbole) wird automatisch eine ruhigere Form verwendet: zwei statt drei Etappen, ohne Tempo-Striche – so bleibt das V auch im Browser-Tab klar erkennbar.
