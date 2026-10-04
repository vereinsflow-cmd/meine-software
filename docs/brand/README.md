# Logo

Das VereinsFlow-Logo (seit Oktober 2026): ein „V“ aus drei Etappen – links Schwarz, rechts Vereinsblau –, unten ein orangefarbener Punkt
mit Tempo-Strichen; daneben bzw. darunter die Wortmarke „VereinsFlow“ in Manrope ExtraBold, 9° geneigt und orange unterstrichen.
Alle Dateien stammen aus dem Logo-Paket der Gestaltung (`vereinsflow-logo-paket`, Ordner `03-software`; Anleitung in dessen
`LIESMICH.md`) und sind unverändert übernommen. Die Schrift ist dort bereits in Pfade umgewandelt – es muss keine Schriftdatei
geladen werden. Das frühere Logo (zwei sich überschneidende Kreise) ist vollständig ersetzt; es liegt nur noch in der Git-Historie.

## Farben

| Name         | Wert      | Verwendung                                              |
| ------------ | --------- | ------------------------------------------------------- |
| Schwarz      | `#1A1A1A` | linke Etappen und „Vereins“ auf hellem Grund            |
| Vereinsblau  | `#3A6BEA` | rechte Etappen und „Flow“ auf hellem Grund              |
| Himmel       | `#8FB0FF` | Blau auf dunklem Grund                                  |
| Signalorange | `#FF8A5E` | Punkt, Tempo-Striche, Unterstrich (hell wie dunkel)     |
| Tinte        | `#0F1C2E` | dunkler Hintergrund der App-Symbole                     |
| Weiß         | `#FFFFFF` | linke Etappen und „Vereins“ auf dunklem Grund (`weiss`) |

Die Farben gehören nur zum Logo; die Farbpalette der Oberfläche (`src/app/globals.css`) ist davon unabhängig.

## Logo in der Oberfläche (`public/brand/`)

| Datei                                             | Wofür                                                                              |
| ------------------------------------------------- | ---------------------------------------------------------------------------------- |
| `logo.svg`, `logo-weiss.svg`                      | horizontal (Symbol links, Name rechts) – Seitenleiste, Smartphone-Menü, Kopfzeilen |
| `logo-gestapelt.svg`, `logo-gestapelt-weiss.svg`  | gestapelt (Symbol über dem Namen) – Anmelde- und Hinweisseiten                     |
| `symbol.svg`, `symbol-weiss.svg`                  | nur das V                                                                          |
| `symbol-klein.svg`, `symbol-klein-weiss.svg` (\*) | nur das V, vereinfacht für bis 32 px – eingeklappte Seitenleiste                   |

`-weiss` ist jeweils die Fassung für dunklen Grund (Schwarz → Weiß, Vereinsblau → Himmel).

(\*) Das Paket enthält die vereinfachte Form (zwei statt drei Etappen, ohne Tempo-Striche) nur als Favicon mit dunkler Kachel
(`src/app/icon.svg`). Die beiden `symbol-klein`-Dateien sind daraus abgeleitet: dieselbe Datei ohne die Kachel, für hellen Grund mit
denselben Farbtauschen wie zwischen `symbol-weiss.svg` und `symbol.svg` (`#FFFFFF` → `#1A1A1A`, `#8FB0FF` → `#3A6BEA`).

Eingebunden werden die Dateien über die Komponente `BrandLogo` ([`src/components/shared/brand-logo.tsx`](../../src/components/shared/brand-logo.tsx)),
meist über `Brand` ([`brand.tsx`](../../src/components/shared/brand.tsx)) als Link zur Startseite:

- `variant`: `horizontal` (Standard), `stacked` (gestapelt) oder `icon` (nur das Symbol); bei `icon` wählt `small` die vereinfachte Form.
- Hell und dunkel: Beide Bilder stehen im HTML, CSS zeigt je nach Darstellung (`.dark`) das passende – ohne Nachladen beim Umschalten.
- Beschriftung: `alt="VereinsFlow"`; mit `decorative` (wenn z. B. der umgebende Link schon „VereinsFlow – Startseite“ heißt) leer.

Wo das Logo steht:

- **Anmelde- und Hinweisseiten** (Anmeldung, Passwort vergessen/zurücksetzen, Einladung): gestapelte Fassung, mittig über der Karte.
- **Seitenleiste, Smartphone-Menü, Impressum, Datenschutzerklärung, Einrichtung, Plattformverwaltung, Seite „nicht gefunden“:**
  horizontale Fassung. Die eingeklappte Seitenleiste zeigt nur das Symbol (2 rem, vereinfachte Form).
- E-Mails und Ausdrucke (Helferplan, Aushang „Mitglied werden“) zeigen kein VereinsFlow-Logo, nur das Vereinslogo.

## App-Symbole (Browser-Tab, Lesezeichen, Startbildschirm)

Das Symbol in Weiß/Himmel/Orange auf der dunklen Kachel (Tinte) – auf hellen wie dunklen Tab-Leisten gut sichtbar.

| Datei                              | Wofür                                                                                  |
| ---------------------------------- | -------------------------------------------------------------------------------------- |
| `src/app/icon.svg`                 | Browser-Tab in aktuellen Browsern (Vektor, vereinfachte Form für kleine Größen)        |
| `src/app/favicon.ico`              | Safari, Windows, ältere Browser – 16, 32 und 48 px                                     |
| `src/app/apple-icon.png`           | Home-Bildschirm von iPhone und iPad (180 px, randlos – iOS rundet die Ecken selbst ab) |
| `public/app-icon-192.png`, `-512`  | Android und Chrome, über das Web-App-Manifest (`src/app/manifest.ts`)                  |
| `public/app-icon-maskable-512.png` | Android-Startbildschirme mit runden oder tropfenförmigen Symbolen (randlos)            |

Next.js bindet sie über die Dateinamen selbst in jede Seite ein; der Name unter dem Symbol auf dem iPhone ist „VereinsFlow“
(`src/app/layout.tsx`). Das Manifest öffnet VereinsFlow vom Startbildschirm aus bewusst im Browser (`display: "browser"`), nicht als
eigenständige App ohne Adresszeile. Symbole, Logo-Dateien und Manifest sind ohne Anmeldung abrufbar (`src/proxy.ts`), geprüft in
`tests/e2e/app-symbol.spec.ts`.

## Änderungen am Logo

Neue Fassungen kommen als Paket aus der Gestaltung: die Dateien aus `03-software` an dieselben Pfade kopieren (Dateinamen wie oben)
und die beiden `symbol-klein`-Dateien wie beschrieben neu ableiten. Ändert sich das Seitenverhältnis, die Maße (`width`/`height`) in
`brand-logo.tsx` anpassen. Der Test `tests/e2e/logo.spec.ts` prüft, dass das Logo erscheint, beschriftet ist und in der dunklen
Darstellung die helle Fassung zeigt.
