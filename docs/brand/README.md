# Logo

| Datei                                                                                          | Inhalt                                                                                           |
| ---------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------ |
| [`vereinsflow-logo-original.png`](vereinsflow-logo-original.png)                               | Das Original-Logo (1760 × 1120 Pixel, cremefarbener Hintergrund) – die Vorlage für alles Weitere |
| [`generate-logo-paths.mjs`](generate-logo-paths.mjs)                                           | Erzeugt die Schrift-Umrisse für die Vektorfassung (siehe unten)                                  |
| [`generate-app-icons.mjs`](generate-app-icons.mjs)                                             | Erzeugt die App-Symbole für Browser-Tab und Startbildschirm (siehe unten)                        |
| [`src/components/shared/brand-logo.tsx`](../../src/components/shared/brand-logo.tsx)           | Die Vektorfassung als React-Komponente (`BrandLogo`), verwendet über `Brand`                     |
| [`src/components/shared/brand-logo-paths.ts`](../../src/components/shared/brand-logo-paths.ts) | Pfaddaten von Wortmarke und Slogan (erzeugt)                                                     |

## App-Symbole (Browser-Tab, Lesezeichen, Startbildschirm)

Die beiden Kreise des Logos in der dunklen Farbfassung auf dunklem Marineblau (`#12253b`) – dieselbe Gestaltung wie das Favicon der Website (`website/favicon.svg`), damit man App und Website im Browser gleich erkennt. Der dunkle Grund hält das Symbol auf hellen wie dunklen Tab-Leisten sichtbar.

| Datei                              | Wofür                                                                                    |
| ---------------------------------- | ---------------------------------------------------------------------------------------- |
| `src/app/icon.svg`                 | Browser-Tab in aktuellen Browsern (Vektor, scharf in jeder Größe)                        |
| `src/app/favicon.ico`              | Safari, Windows, ältere Browser – 16, 32 und 48 px; in 16 px ist das Symbol etwas größer |
| `src/app/apple-icon.png`           | Home-Bildschirm von iPhone und iPad (180 px, randlos – iOS rundet die Ecken selbst ab)   |
| `public/app-icon-192.png`, `-512`  | Android und Chrome, über das Web-App-Manifest (`src/app/manifest.ts`)                    |
| `public/app-icon-maskable-512.png` | Android-Startbildschirme mit runden oder tropfenförmigen Symbolen (randlos)              |

Alle Dateien erzeugt `node docs/brand/generate-app-icons.mjs` (mit sharp, das Next.js mitbringt). Next.js bindet sie über die Dateinamen selbst in jede Seite ein; der Name unter dem Symbol auf dem iPhone ist „VereinsFlow“ (`src/app/layout.tsx`). Das Manifest öffnet VereinsFlow vom Startbildschirm aus bewusst im Browser (`display: "browser"`), nicht als eigenständige App ohne Adresszeile. Symbole und Manifest sind ohne Anmeldung abrufbar (`src/proxy.ts`), geprüft in `tests/e2e/app-symbol.spec.ts`.

## Wo das Logo in der Anwendung steht

- **Anmelde- und Hinweisseiten** (Anmeldung, Passwort vergessen/zurücksetzen, Einladung): gestapelte Fassung mit Slogan, mittig über der Karte.
- **Seitenleiste, Smartphone-Menü, Impressum, Datenschutzerklärung, Plattformverwaltung:** horizontale Fassung (Symbol links, Wortmarke rechts), als Link zur Startseite.

## Vektorfassung

Die Anwendung nutzt nicht das PNG, sondern eine Vektorgrafik (scharf in jeder Größe, mit transparentem Hintergrund, in der dunklen Darstellung anpassbar). Die Schrift des Logos ist
**Poppins** (SIL Open Font License); Wortmarke und Slogan sind aus den Schriftdateien in Pfade umgewandelt und am Original ausgerichtet („Vereins“ Regular, „Flow“ SemiBold,
Slogan Medium mit leichtem Zeichenabstand). Ein Pixelvergleich mit dem Original ergab, dass nur die Kanten (Anti-Aliasing) abweichen. Die Kreise sind zwei Kreise mit Radius 130,5
im Abstand von 190 Pixeln; der Überschnitt (Linse) hat eine eigene Farbe.

### Farben

| Verwendung              | Hell (Original) | Dunkel    |
| ----------------------- | --------------- | --------- |
| Linker Kreis und „Flow“ | `#1c4a7a`       | `#4a8ccf` |
| Rechter Kreis           | `#5b9cd6`       | `#8dbbe8` |
| Überschnitt             | `#112e4f`       | `#2b5f98` |
| „Vereins“ (Schrift)     | `#12253b`       | `#eef3f9` |
| Slogan                  | `#78827a`       | `#9aa5a0` |

Die Werte stehen als CSS-Variablen `--logo-*` in `src/app/globals.css`. Die dunkle Fassung ist eine Ableitung (das Original kennt nur den hellen Grund).

### Änderungen am Logo

1. Neues Original ablegen und die Maße im Kopf von `generate-logo-paths.mjs` anpassen (Schrift, Größe, Position).
2. `npm install --no-save @fontsource/poppins opentype.js`, dann `node docs/brand/generate-logo-paths.mjs` und `npx prettier --write src/components/shared/brand-logo-paths.ts`.
3. Kreise und Anordnung stehen direkt in `brand-logo.tsx`.

Der Test `tests/e2e/logo.spec.ts` prüft, dass das Logo erscheint, beschriftet ist und in der dunklen Darstellung lesbar bleibt.
