# VereinsFlow – Logo-Paket „Punktring“

Das neue Logo (November 2026), sortiert nach Einsatzort. Es ersetzt das „V aus drei Etappen“ vom Oktober 2026 – das alte
Paket liegt unverändert unter `docs/brand/alt-2026-10-logo-paket/`.

## Bedeutung

Vier Ringe aus Punkten – die Mitglieder – bilden eine Sprechblase: Unten links öffnet sich der Ring, drei kleiner werdende
Punkte laufen als Zipfel heraus (Kommunikation). In der Mitte liegt ein Kleeblatt-Knoten aus einer einzigen geschlossenen
Linie: alles ist miteinander verbunden. Die Farben laufen rundum von Grün (oben) über Türkis (seitlich) zu Vereinsblau (unten).

## Farben

| Name            | Wert      | Verwendung                                                                    |
| --------------- | --------- | ----------------------------------------------------------------------------- |
| Grün            | `#34D399` | Ring oben, Querband des Knotens – auf dunklem Grund                           |
| Türkis          | `#22D3EE` | Ring links und rechts, Zipfel – auf dunklem Grund                             |
| Vereinsblau     | `#3A6BEA` | Ring unten, obere Schlaufe des Knotens, Ende von „Flow“ (hell und dunkel)     |
| Grün auf Weiß   | `#10A877` | statt Grün auf hellem Grund (mehr Kontrast)                                   |
| Türkis auf Weiß | `#0895B8` | statt Türkis auf hellem Grund (mehr Kontrast)                                 |
| Tinte           | `#0F1C2E` | „Vereins“ auf hellem Grund, einfarbige Druckfassung, Hintergrund App-Symbole  |
| Weiß            | `#FFFFFF` | „Vereins“ auf dunklem Grund, einfarbig weiße Fassung                          |
| Slogan hell     | `#4F5E73` | Slogan auf hellem Grund                                                       |
| Slogan dunkel   | `#A8B5CF` | Slogan auf dunklem Grund (= Textfarbe der Website)                            |
| Hell (Social)   | `#F2F5FB` | heller Hintergrund der Instagram-Dateien (= `--hell` der Website)             |
| Nachtblau       | `#050A18` → `#0C1A3C` | Hintergrund des Vorschaubilds `og-image.png` (wie die Website)    |

„Flow“: ein Verlauf Grün → Türkis → Vereinsblau über die ganze Wortmarke (wie in der Vorlage) – sichtbar wird in „Flow“
der Abschnitt Türkis → Vereinsblau. Auf hellem Grund mit den dunkleren Tönen „auf Weiß“.

## Schrift

Wortmarke: **Manrope ExtraBold**, gerade (die Neigung des alten Logos ist zurückgenommen, kein Unterstrich), in allen
Dateien bereits in Pfade umgewandelt – es muss keine Schriftdatei geladen werden. Slogan: Manrope in Versalien, gesperrt,
genau so breit wie die Wortmarke („BRINGT VEREINSARBEIT IN FLUSS“). Text neben dem Logo (z. B. im `og-image.png`) steht in
der Systemschrift der Website (SF Pro, Segoe UI …).

## Fassungen

| Datei (in `01-logo/svg/`)                   | Wofür                                                                                     |
| ------------------------------------------- | ----------------------------------------------------------------------------------------- |
| `vereinsflow-logo.svg`                      | **Hauptlogo** – Zeichen links, Name rechts, auf Versalhöhe ausgerichtet                   |
| `vereinsflow-logo-slogan.svg`               | mit „Bringt Vereinsarbeit in Fluss“ – Flyer, Präsentationen, Briefkopf                    |
| `vereinsflow-logo-gestapelt.svg`            | Zeichen über dem Namen – Anmeldung, Plakate, quadratische Flächen                         |
| `vereinsflow-symbol.svg`                    | nur das Zeichen (Ring, Zipfel, Knoten)                                                    |
| `vereinsflow-logo-kompakt.svg`              | kleine Form + etwas größerer Name – Kopf- und Seitenleisten, E-Mail-Kopf (Zeichen **unter 100 px**) |
| `vereinsflow-symbol-klein.svg`              | **kleine Form** für 16–48 px (Favicon, Browser-Tab, kleine Kopfleiste)                    |

Zusätze im Dateinamen:

- ohne Zusatz – für **hellen** Grund (Name in Tinte, dunklere Verlaufstöne)
- `-weiss` – für **dunklen** Grund (Name in Weiß, helle Verlaufstöne)
- `-einfarbig-tinte` / `-einfarbig-weiss` – alles in einer Farbe: Druck, Stempel, Prägung, Folie, Textil; einfarbig weiß
  auch auf Vereinsblau, Fotos und farbigen Flächen

## Kleine Form (16 bis gut 100 px)

Bei etwa 100 px Zeichenhöhe und darunter verschwimmen die feinen Halbtonpunkte zu einem blassen Dunst. Dann gilt die kleine
Form: der Ring als durchgehender Bogen mit der Lücke unten links, der Zipfel aus zwei Punkten, ein kräftigerer Knoten –
gleiche Farben, gleiche Lage. Sie
wurde aus drei Entwürfen gewählt (Punktkranz aus 12 Punkten · Bogen · Knoten im Punktkranz), weil der geschlossene Bogen
auch bei 16 px noch als Sprechblase erkennbar ist, während einzelne Punkte dort zu Rauschen zerfallen.

Die App-Symbole folgen dieser Regel automatisch (Grenze: Zeichen unter 112 Bildpunkten): Favicon immer kleine Form; iOS bis 167 px (also auch Spotlight 120 und
iPad 152/167) und Android mdpi bis xxhdpi kleine Form; das Original ab iOS 180 px, Android 192 px (xxxhdpi), den 512er-Symbolen
und dem App-Store-Symbol 1024 px.

Favicon (`favicon.svg`, `favicon.ico`, `src/app/icon.svg`): Damit der Knoten auch bei 16 px als Knoten erkennbar bleibt
(und nicht zum Fleck wird), ist er dort größer, der Ring etwas schmaler, und der Knoten läuft in **aufgehellten** Tönen von
Grün und Vereinsblau (`#5EE6B8` → `#6F95FF`) – nur im Favicon, alle Größen gleich (16, 32, 48 px und Vektor).

## Schutzraum und Mindestgrößen

Schutzraum: rundum mindestens die **Versalhöhe des Namens** (Höhe des „V“) frei lassen; beim Zeichen allein mindestens ein
Drittel seiner Breite. Alle Master-Dateien (SVG, PNG, PDF) haben einen schmalen Rand von 10 Einheiten (gut 5 % der
Zeichenhöhe), damit kein Punkt auf der Kante liegt; den eigentlichen Schutzraum gibt das Layout. Das Zeichen allein
(`vereinsflow-symbol*`, `vereinsflow-symbol-klein*`) ist quadratisch.

| Fassung                | Bildschirm (mindestens)   | Druck (mindestens) |
| ---------------------- | ------------------------- | ------------------ |
| Zeichen (Original)     | gut 100 px hoch           | 15 mm hoch         |
| kleine Form            | 16 px                     | 5 mm               |
| horizontal             | 400 px breit              | 55 mm breit        |
| mit Slogan             | 400 px breit              | 80 mm breit        |
| gestapelt              | 250 px breit              | 35 mm breit        |
| kompakt                | 20 px hoch (82 px breit)  | 5 mm hoch          |

Am Bildschirm gilt: Wird das Zeichen deutlich kleiner als 100 px (horizontal unter 400 px breit), die kompakte Fassung bzw.
die kleine Form nehmen. Für die festen App-Symbole ist die Grenze 112 Bildpunkte (siehe „Kleine Form“).

### Maße gegenüber dem alten Paket (Oktober 2026)

Das neue Zeichen ist rund und fast so hoch wie breit – die Fassungen sind deshalb weniger breit als früher. Wer eine alte
Datei 1 : 1 tauscht, muss `width`/`height` anpassen:

| Datei                                       | alt                  | neu                    |
| ------------------------------------------- | -------------------- | ---------------------- |
| `vereinsflow-logo(-slogan).svg` (viewBox)   | 1324,7 × 297,6 (4,45 : 1) | 705,35 × 210,4 (3,35 : 1) |
| `vereinsflow-logo-kompakt.svg` (neu)        | –                    | 840,24 × 204 (4,12 : 1) |
| `vereinsflow-logo-gestapelt.svg`            | 818,8 × 484,8        | 461,95 × 303,73        |
| `vereinsflow-symbol.svg`                    | 1000 × 1000          | 210,4 × 210,4 (quadratisch wie bisher) |
| `vereinsflow-symbol-klein.svg` (neu)        | –                    | 204 × 204              |
| `png/vereinsflow-logo*.png`                 | 2400 × 540           | 2400 × 716             |
| `png/…-klein.png` (horizontal)              | 800 × 180            | 800 × 239              |
| `png/vereinsflow-logo-gestapelt*.png`       | 2400 × 1421          | 2400 × 1578            |
| `png/vereinsflow-symbol*.png`               | 1024 × 1024          | 1024 × 1024            |
| `mit-hintergrund/*.png`                     | 2400 × 540           | 2400 × 913 (Versalhöhe rundum) |
| `02-website/assets/brand/logo-stacked.png`  | 1200 × 711           | 1200 × 789             |

Alle anderen Dateien (Favicons, App-Symbole, Instagram, `og-image.png`, `logo-mail*.png`) haben genau die alten Maße.

## 01-logo – Master-Dateien

| Ordner             | Inhalt                                                                                         |
| ------------------ | ---------------------------------------------------------------------------------------------- |
| `svg/`             | alle Fassungen als Vektor (Standard – bleibt in jeder Größe scharf)                            |
| `png/`             | dieselben Fassungen, 2400 px breit, transparent; `-klein` = 800 px breit; Zeichen allein 1024 × 1024 |
| `pdf/`             | Vektor-PDF für Druckereien (Flyer, Banner, Trikots)                                            |
| `mit-hintergrund/` | fertig auf Tinte (`-auf-dunkel`, auch mit Slogan) und auf Vereinsblau (`-auf-blau`, einfarbig weiß) |

Regel: SVG überall, wo es geht. PNG nur, wo kein SVG möglich ist. PDF für den Druck.

## 02-website – gleiche Namen wie im Ordner `website/`

In `website/` kopieren und vorhandene Dateien ersetzen:

| Datei                                                   | Wofür                                                                              |
| ------------------------------------------------------- | ---------------------------------------------------------------------------------- |
| `favicon.svg`, `favicon.ico` (16, 32, 48 px)            | Browser-Tab – kleine Form auf Tinte-Kachel                                         |
| `apple-touch-icon.png` (180)                            | Home-Bildschirm iPhone/iPad                                                        |
| `android-chrome-192.png`, `-512.png`                    | Web-Manifest (`site.webmanifest`)                                                  |
| `assets/img/logo.svg`, `logo-dark.svg`                  | Kopf- und Fußzeile – **kompakte** Fassung (840,24 × 204); die `<img>`-Maße anpassen, z. B. 124 × 30 (Kopf) und 148 × 36 (Fuß) |
| `assets/img/og-image.png` (1200 × 630)                  | Vorschaubild beim Teilen von Links – Nachtblau wie die Website                     |
| `assets/img/logo-mail.png` (570 × 87), `logo-mail@2x.png` | Kopf der Newsletter-Mails (`newsletter.php`) – kompakte Fassung (die Mail zeigt das Bild nur 300 × 46 px) |
| `assets/brand/logo-horizontal(-dark).svg`, `logo-stacked(-dark).svg`, `logo-stacked.png` | volle horizontale bzw. gestapelte Fassung (`-dark` = für dunklen Grund) |

Nach dem Austausch die Versionsangabe in den Links hochzählen (`?v=2026100401` → z. B. `?v=2026112801`), damit Browser die
neuen Symbole laden.

## 03-software – Dateien für die VereinsFlow-App (Next.js)

Gleiche Pfade wie im Projekt:

| Datei                                                   | Wofür                                                                              |
| ------------------------------------------------------- | ---------------------------------------------------------------------------------- |
| `src/app/icon.svg`, `src/app/favicon.ico`               | Browser-Tab (kleine Form auf Tinte-Kachel; ICO mit 16, 32, 48 px)                  |
| `src/app/apple-icon.png` (180)                          | Home-Bildschirm iPhone/iPad, randlos                                               |
| `public/app-icon-192.png`, `-512.png`                   | Web-App-Manifest                                                                   |
| `public/app-icon-maskable-512.png`                      | Android, runde/tropfenförmige Masken – Zeichen liegt im Sicherheitskreis           |
| `public/brand/logo.svg`, `logo-weiss.svg`               | Kopfzeile, Seitenleiste, Smartphone-Menü (40–44 px hoch) – **kompakte** Fassung    |
| `public/brand/logo-gestapelt.svg`, `-weiss.svg`         | Anmelde- und Hinweisseiten                                                         |
| `public/brand/symbol.svg`, `-weiss.svg`                 | nur das Zeichen (Original, ab gut 100 px)                                          |
| `public/brand/symbol-klein.svg`, `-weiss.svg`           | kleine Form – z. B. die schmale Symbolleiste (28 px)                               |

`-weiss` = für dunklen Grund. Maße für `src/components/shared/brand-logo.tsx` (Seitenverhältnisse haben sich geändert):
horizontal (kompakt) 840 × 204, gestapelt 462 × 304, Zeichen 210 × 210, kleine Form 204 × 204. Beim Einbau
`docs/brand/README.md` nachziehen.

## 04-app-ios

`AppIcon.appiconset` komplett in Xcode in `Assets.xcassets` ziehen (ersetzt den alten Ordner). Alle Größen inkl. 1024 px
für den App Store, ohne Transparenz; iOS rundet die Ecken selbst ab.

## 05-app-android

Inhalt von `res/` nach `app/src/main/res/` kopieren: klassische Symbole (`ic_launcher`, `ic_launcher_round`) für alle
Dichten und das adaptive Symbol (Vordergrund transparent, Hintergrundfarbe Tinte `#0F1C2E`; der äußerste Punkt liegt bei
0,30 × Breite, knapp innerhalb des Sicherheitskreises von 66 dp = 0,306 × Breite). `play-store-icon-512.png` für
den Play Store.

## 06-instagram (und TikTok)

| Datei                        | Wofür                                                                  |
| ---------------------------- | ---------------------------------------------------------------------- |
| `profilbild-1080.png`        | Profilbild (dunkel, Empfehlung) – Zeichen samt Zipfel liegt ganz im Kreis |
| `profilbild-hell-1080.png`   | Profilbild auf hellem Grund                                            |
| `tiktok-profilbild-1080.png` | Profilbild für TikTok (wie `profilbild-1080.png`)                      |
| `beitrag-1080x1080-*.png`    | quadratischer Beitrag (dunkel, hell)                                   |
| `beitrag-1080x1350-*.png`    | Hochformat-Beitrag 4 : 5 (dunkel, hell)                                |
| `story-1080x1920-*.png`      | Story / Reel-Titel (dunkel, hell, blau) – Inhalt in der sicheren Mitte |
| `highlight-cover-*.png`      | Cover für Story-Highlights (dunkel, hell, blau)                        |

`docs/brand/vereinsflow-instagram-profilbild.png` ist dasselbe Bild wie `profilbild-1080.png`.

## Bitte nicht

- Farben oder Verläufe ändern, das Zeichen drehen, verzerren, mit Schatten oder Leuchten versehen.
- Den Namen neigen oder unterstreichen, eine andere Schrift setzen.
- Punkte neu anordnen, den Zipfel weglassen oder die Lücke schließen.
- Die helle Fassung auf dunklen Grund setzen (oder umgekehrt); auf Fotos und farbigen Flächen die einfarbig weiße Fassung.

## Geometrie (zum Nachbauen)

Ringe mit Radius 88 / 78 / 68 / 58, je 44 / 40 / 36 / 32 Punkte (Radius 3,4 / 3 / 2,6 / 2,2), Lücke zwischen 58 % und 66 %
des Umlaufs (von oben im Uhrzeigersinn); Zipfel: Punkte mit Radius 5 / 4 / 3. Knoten: x = s · (sin u + 2 sin 2u),
y = s · (cos u − 2 cos 2u), s = 12, Strichstärke 7. Wortmarke: Versalhöhe = 31 % des Ringdurchmessers, Abstand zum Ring
gut eine Versalhöhe. Alle Koordinaten sind fest eingerechnet (keine Transformationen), auf zwei Nachkommastellen gerundet.
