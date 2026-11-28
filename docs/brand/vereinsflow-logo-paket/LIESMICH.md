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
| `vereinsflow-symbol.svg`                    | nur das Zeichen (Ring, Zipfel, Knoten) – Original mit 4 Ringen                            |
| `vereinsflow-logo-kompakt-mittel.svg`       | Zeichen mit **3 Ringen** (P3) + etwas größerer Name – App-Seitenleiste, Mail-Kopf (40–119 px hoch) |
| `vereinsflow-logo-kompakt.svg`              | Zeichen mit **2 Ringen** (P2) + etwas größerer Name – Website-Kopf- und Fußzeile (24–39 px hoch) |
| `vereinsflow-symbol-gross.svg`              | nur das Zeichen mit **3 Ringen** (P3) – 40–111 px                                         |
| `vereinsflow-symbol-mittel.svg`             | nur das Zeichen mit **2 Ringen** (P2) – 30–39 px                                          |
| `vereinsflow-symbol-klein.svg`              | nur das Zeichen mit **1 Ring** (P1) – 16–29 px (Favicon, schmale Symbolleiste)            |

Zusätze im Dateinamen:

- ohne Zusatz – für **hellen** Grund (Name in Tinte, dunklere Verlaufstöne)
- `-weiss` – für **dunklen** Grund (Name in Weiß, helle Verlaufstöne)
- `-einfarbig-tinte` / `-einfarbig-weiss` – alles in einer Farbe: Druck, Stempel, Prägung, Folie, Textil; einfarbig weiß
  auch auf Vereinsblau, Fotos und farbigen Flächen

## Welche Fassung bei welcher Größe (responsives Logo)

Wie bei großen Marken gibt es **ein** Logo in mehreren Fassungen: Je kleiner es gezeigt wird, desto weniger Punktringe mit
desto größeren Punkten – so bleiben überall **Punkte** sichtbar (statt eines Dunsts aus zu feinen Punkten). Aufbau, Lücke
unten links, die drei Zipfel-Punkte, der Kleeblatt-Knoten und der Farbverlauf sind in allen Fassungen gleich.

| Fassung              | Aufbau (Punkte je Ring, außen → innen) | Zeichen allein                | mit Name (kompakt)                    | Bildschirm: Höhe der Datei          | feste Bildgrößen: Zeichenhöhe in Gerätepixeln | Druck mindestens |
| -------------------- | -------------------------------------- | ----------------------------- | ------------------------------------- | ----------------------------------- | --------------------------------------------- | ---------------- |
| **P1 · 1 Ring**      | 16 Punkte                              | `vereinsflow-symbol-klein`    | –                                     | 16–29 px                            | unter 41 px                                   | 5 mm             |
| **P2 · 2 Ringe**     | 21 / 16                                | `vereinsflow-symbol-mittel`   | `vereinsflow-logo-kompakt`            | 30–39 px (kompakt: 24–39 px hoch)   | 41–49 px                                      | 6 mm             |
| **P3 · 3 Ringe**     | 27 / 22 / 17                           | `vereinsflow-symbol-gross`    | `vereinsflow-logo-kompakt-mittel`     | 40–111 px (kompakt: 40–119 px hoch) | 50–111 px                                     | 7 mm             |
| **Original · 4 Ringe** | 44 / 40 / 36 / 32                    | `vereinsflow-symbol`          | `vereinsflow-logo`, `-slogan`, `-gestapelt` | ab 112 px (horizontal ab 400 px breit) | ab 112 px                              | 15 mm            |

- **Bildschirm** (SVG in der Oberfläche): Grenzen in CSS-Pixeln, bezogen auf die Höhe der Datei samt schmalem Rand (das
  Zeichen ist 0,9 × so hoch). Ausgelegt für heutige Bildschirme mit 2- bis 3-facher Pixeldichte; bei einfacher Pixeldichte
  bleiben die Punkte ab etwa 1,6 px als Punkte erkennbar. Unter 16 px wird das Logo nicht verwendet.
- **Feste Bildgrößen** (App-Symbole, Android-Mipmaps, Favicons als PNG): gezählt wird die Zeichenhöhe in echten Gerätepixeln.
  Regel: jeder Punkt mindestens etwa 2,5 Gerätepixel Durchmesser, kein Punkt berührt den Nachbarn. Der kleinste Punkt misst
  bei P1 6,95 %, bei P2 6,13 %, bei P3 5,06 % und beim Original 2,31 % der Zeichenhöhe – daraus die Grenzen 41 / 50 / 112 px.
  Sie gelten für die ungerundete Höhe der gezeichneten Fassung (iOS `icon-80`: 49,6 px, also noch P2).
- **Druck**: kleinster Punkt mindestens 0,35 mm (wie beim Original mit 15 mm Zeichenhöhe).
- Die frühere kleine Form mit durchgehendem Bogen („B“) wird seit 28.11.2026 nicht mehr verwendet.

### Wo welche Fassung steht

| Einsatz                                                         | Größe                              | Fassung                              | Datei                                                                  |
| --------------------------------------------------------------- | ---------------------------------- | ------------------------------------ | ---------------------------------------------------------------------- |
| Browser-Tab (Website und App)                                   | 16 px (ICO 16 / 32 / 48)           | P1 auf Tinte-Kachel, Knoten aufgehellt | `02-website/favicon.svg`, `favicon.ico`; `03-software/src/app/icon.svg`, `favicon.ico` |
| App: schmale Symbolleiste (weißer Kreis)                        | 28 px                              | P1                                   | `03-software/public/brand/symbol-klein.svg`                            |
| Website: Kopfleiste (Handy) / Kopfleiste / Fußzeile             | 115 × 28 / 124 × 30 / 148 × 36 px  | kompakt mit P2                       | `02-website/assets/img/logo-dark.svg` (= `vereinsflow-logo-kompakt-weiss`) |
| App: Seitenleiste, Smartphone-Menü, Anmeldebühne, Rechtliches   | 40–44 px hoch (bis 54 px)          | kompakt mit P3                       | `03-software/public/brand/logo.svg`, `logo-weiss.svg` (= `vereinsflow-logo-kompakt-mittel`) |
| Kopf der Newsletter-Mail                                        | gezeigt 300 × 46 px                | kompakt mit P3                       | `02-website/assets/img/logo-mail.png` (570 × 87), `logo-mail@2x.png`   |
| App: Anmeldung, Registrierung, Hinweisseiten                    | 256 px breit                       | Original, gestapelt                  | `03-software/public/brand/logo-gestapelt(-weiss).svg`                  |
| App-Symbole iOS                                                 | 20–167 px                          | P1 → P2 → P3 (siehe unten)           | `04-app-ios/AppIcon.appiconset/icon-*.png`                             |
| App-Symbole iOS 180 / 1024, Web-App 180 / 192 / 512, maskierbar | ab 180 px                          | Original                             | `icon-180/1024.png`, `apple-touch-icon.png`, `android-chrome-*.png`, `app-icon-*.png` |
| Android-Mipmaps                                                 | 48–192 px                          | P1 → P2 → P3 → Original              | `05-app-android/res/mipmap-*/`                                         |
| Instagram, TikTok, Vorschaubild `og-image.png`, Druck           | groß                               | Original                             | `06-instagram/`, `02-website/assets/img/og-image.png`, `01-logo/`      |

App-Symbole nach Zeichenhöhe (iOS: Zeichen 62 % der Kachel, beim Original 64 %; Höhe der gezeichneten Fassung, gerundet –
maßgeblich ist der ungerundete Wert):

| Datei                                         | Kachel                         | Zeichen  | Fassung  |
| --------------------------------------------- | ------------------------------ | -------- | -------- |
| iOS `icon-20`, `-29`, `-40`, `-58`, `-60`     | 20–60 px                       | 12–37 px | P1       |
| iOS `icon-76`, `-80`                          | 76 / 80 px                     | 47 / 49,6 px | P2   |
| iOS `icon-87`, `-120`, `-152`, `-167`         | 87–167 px                      | 54–104 px | P3      |
| iOS `icon-180`, `-1024`; `apple-touch-icon`, `android-chrome-192/512`, `app-icon-*` | ab 180 px | ab 115 px | Original |
| Android `ic_launcher` / `_round` mdpi · hdpi · xhdpi · xxhdpi · xxxhdpi | 48 · 72 · 96 · 144 · 192 px | 30 · 45 · 60 · 89 · 119 px (`_round` 28 · 43 · 58 · 87 · 120 px) | P1 · P2 · P3 · P3 · Original |
| Android `ic_launcher_foreground` (adaptiv, gezeigt 48 von 72 dp) mdpi · hdpi · xhdpi · xxhdpi · xxxhdpi | 108 … 432 px | 31 · 48 · 65 · 98 · 135 px gezeigt | P1 · P2 · P3 · P3 · Original |

Favicon (`favicon.svg`, `favicon.ico`, `src/app/icon.svg`): P1 auf der Tinte-Kachel; der Knoten läuft dort in **aufgehellten**
Tönen von Grün und Vereinsblau (`#5EE6B8` → `#6F95FF`), damit er nicht in der dunklen Kachel absäuft – alle Größen gleich
(16, 32, 48 px und Vektor). Bei 16 px auf Bildschirmen mit einfacher Pixeldichte sind die 16 Ringpunkte gut 1 px groß und
lesen sich als gepunkteter Ring; ab 32 Gerätepixeln (Retina-Tab) sind sie klar getrennt.

## Schutzraum und Mindestgrößen

Schutzraum: rundum mindestens die **Versalhöhe des Namens** (Höhe des „V“) frei lassen; beim Zeichen allein mindestens ein
Drittel seiner Breite. Alle Master-Dateien (SVG, PNG, PDF) haben einen schmalen Rand von 10 Einheiten (gut 5 % der
Zeichenhöhe), damit kein Punkt auf der Kante liegt; den eigentlichen Schutzraum gibt das Layout. Das Zeichen allein
(`vereinsflow-symbol*`, `vereinsflow-symbol-klein*`) ist quadratisch.

| Fassung                          | Bildschirm (mindestens)    | Druck (mindestens) |
| -------------------------------- | -------------------------- | ------------------ |
| Zeichen Original (4 Ringe)       | 112 px hoch                | 15 mm hoch         |
| Zeichen P3 (3 Ringe)             | 40 px                      | 7 mm               |
| Zeichen P2 (2 Ringe)             | 30 px                      | 6 mm               |
| Zeichen P1 (1 Ring)              | 16 px                      | 5 mm               |
| horizontal, mit Slogan           | 400 px breit               | 55 / 80 mm breit   |
| gestapelt                        | 250 px breit               | 35 mm breit        |
| kompakt mittel (P3)              | 40 px hoch (165 px breit)  | 7 mm hoch          |
| kompakt (P2)                     | 24 px hoch (99 px breit)   | 6 mm hoch          |

Darunter jeweils die nächstkleinere Fassung nehmen (Tabelle „Welche Fassung bei welcher Größe“).

### Maße gegenüber dem alten Paket (Oktober 2026)

Das neue Zeichen ist rund und fast so hoch wie breit – die Fassungen sind deshalb weniger breit als früher. Wer eine alte
Datei 1 : 1 tauscht, muss `width`/`height` anpassen:

| Datei                                       | alt                  | neu                    |
| ------------------------------------------- | -------------------- | ---------------------- |
| `vereinsflow-logo(-slogan).svg` (viewBox)   | 1324,7 × 297,6 (4,45 : 1) | 705,35 × 210,4 (3,35 : 1) |
| `vereinsflow-logo-kompakt(-mittel).svg` (neu) | –                  | 840,24 × 204 (4,12 : 1) |
| `vereinsflow-logo-gestapelt.svg`            | 818,8 × 484,8        | 461,95 × 303,73        |
| `vereinsflow-symbol.svg`                    | 1000 × 1000          | 210,4 × 210,4 (quadratisch wie bisher) |
| `vereinsflow-symbol-klein/-mittel/-gross.svg` (neu) | –            | 204 × 204              |
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
| `favicon.svg`, `favicon.ico` (16, 32, 48 px)            | Browser-Tab – P1 (1 Ring) auf Tinte-Kachel                                         |
| `apple-touch-icon.png` (180)                            | Home-Bildschirm iPhone/iPad                                                        |
| `android-chrome-192.png`, `-512.png`                    | Web-Manifest (`site.webmanifest`)                                                  |
| `assets/img/logo.svg`, `logo-dark.svg`                  | Kopf- und Fußzeile – **kompakte** Fassung mit P2 (840,24 × 204); `<img>` 124 × 30 (Kopf) und 148 × 36 (Fuß) |
| `assets/img/og-image.png` (1200 × 630)                  | Vorschaubild beim Teilen von Links – Nachtblau wie die Website                     |
| `assets/img/logo-mail.png` (570 × 87), `logo-mail@2x.png` | Kopf der Newsletter-Mails (`newsletter.php`) – kompakte Fassung mit P3 (die Mail zeigt das Bild 300 × 46 px) |
| `assets/brand/logo-horizontal(-dark).svg`, `logo-stacked(-dark).svg`, `logo-stacked.png` | volle horizontale bzw. gestapelte Fassung (`-dark` = für dunklen Grund) |

Nach dem Austausch die Versionsangabe in den Links der geänderten Dateien hochzählen (zuletzt `?v=2026112802` an Favicons,
Manifest und `logo-dark.svg`), damit Browser die neuen Symbole laden.

## 03-software – Dateien für die VereinsFlow-App (Next.js)

Gleiche Pfade wie im Projekt:

| Datei                                                   | Wofür                                                                              |
| ------------------------------------------------------- | ---------------------------------------------------------------------------------- |
| `src/app/icon.svg`, `src/app/favicon.ico`               | Browser-Tab (P1 auf Tinte-Kachel; ICO mit 16, 32, 48 px)                           |
| `src/app/apple-icon.png` (180)                          | Home-Bildschirm iPhone/iPad, randlos                                               |
| `public/app-icon-192.png`, `-512.png`                   | Web-App-Manifest                                                                   |
| `public/app-icon-maskable-512.png`                      | Android, runde/tropfenförmige Masken – Zeichen liegt im Sicherheitskreis           |
| `public/brand/logo.svg`, `logo-weiss.svg`               | Kopfzeile, Seitenleiste, Smartphone-Menü (40–44 px hoch) – **kompakt mittel** (P3) |
| `public/brand/logo-gestapelt.svg`, `-weiss.svg`         | Anmelde- und Hinweisseiten                                                         |
| `public/brand/symbol.svg`, `-weiss.svg`                 | nur das Zeichen (Original, ab 112 px)                                              |
| `public/brand/symbol-klein.svg`, `-weiss.svg`           | P1 (1 Ring) – die schmale Symbolleiste (28 px)                                     |

`-weiss` = für dunklen Grund. Maße für `src/components/shared/brand-logo.tsx` (Seitenverhältnisse haben sich geändert):
horizontal (kompakt) 840 × 204, gestapelt 462 × 304, Zeichen 210 × 210, Zeichen P1–P3 204 × 204. Beim Einbau
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
- Punkte neu anordnen, den Zipfel weglassen oder die Lücke schließen; den Ring als durchgehenden Bogen zeichnen.
- Eine Fassung unter ihrer Mindestgröße zeigen (dann die nächstkleinere nehmen) oder eine kleine Fassung stark vergrößern,
  wo das Original passt.
- Die helle Fassung auf dunklen Grund setzen (oder umgekehrt); auf Fotos und farbigen Flächen die einfarbig weiße Fassung.

## Geometrie (zum Nachbauen)

Ringe mit Radius 88 / 78 / 68 / 58, je 44 / 40 / 36 / 32 Punkte (Radius 3,4 / 3 / 2,6 / 2,2), Lücke zwischen 58 % und 66 %
des Umlaufs (von oben im Uhrzeigersinn); Zipfel: Punkte mit Radius 5 / 4 / 3. Knoten: x = s · (sin u + 2 sin 2u),
y = s · (cos u − 2 cos 2u), s = 12, Strichstärke 7. Wortmarke: Versalhöhe = 31 % des Ringdurchmessers, Abstand zum Ring
gut eine Versalhöhe. Alle Koordinaten sind fest eingerechnet (keine Transformationen), auf zwei Nachkommastellen gerundet.

Punkt-Fassungen (Ringmitte 0/0, vor dem Normieren; jeweils auf 184 Einheiten Zeichenhöhe genormt, Lücke als Anteil des Umlaufs
von oben im Uhrzeigersinn, beide Lückenkanten besetzt):

| Fassung | Ringe: Radius / Punkte / Punktradius        | Lücke         | Zipfel-Punkte (Radius) | Knoten s / Strich |
| ------- | ------------------------------------------- | ------------- | ---------------------- | ----------------- |
| P3      | 86 / 27 / 6,4 · 69 / 22 / 5,6 · 53 / 17 / 4,9 | 0,56 – 0,68   | 7,4 · 6,2 · 5,1        | 12,5 / 10,5       |
| P2      | 84 / 21 / 7,6 · 63 / 16 / 6,4               | 0,555 – 0,69  | 8,6 · 7,2 · 6          | 13,5 / 12,5       |
| P1      | 80 / 16 / 9,6                               | 0,55 – 0,705  | 9,8 · 8 · 6,6          | 15 / 14           |
