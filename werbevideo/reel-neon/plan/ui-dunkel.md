# UI-Baukasten im Dunkelmodus (Stand 2026-11-24)

`video/src/ui` zeigt die App jetzt in ihrem **echten Dunkelmodus**. API, Exportnamen, Props und Layout sind unverändert
(siehe `plan/ui-baukasten.md`); geändert sind nur die Farben.

- **Herkunft der Farben:** `.dark`-Block in `~/VereinsFlow/src/app/globals.css` plus die `dark:`-Klassen der App, aus
  oklch exakt nach Hex umgerechnet.
- **Gegengeprüft:** an echten Dunkel-Aufnahmen vom 16.11. in
  `~/VereinsFlow-Medien/website-entwurf/apple-pro/_bilder/handy-*-dunkel.png`. Die Werte treffen exakt oder auf ±1.
- **Übersicht aller Seiten:** Still `Ui-Dunkel-Uebersicht` (3510 × 2532), dazu die Vergleichstafeln `Ui-*` und
  `Ui-Animationstest`.

## Tokens (`ui/tokens.ts` → `C`)

| Gruppe | Werte |
|---|---|
| Grund | page `#0A0A0B` · header `#141416` · card `#171719` · tableHead `#1C1C1F` · popover `#1D1D1F` · mutedBg `#222225` · secondary `#262629` · accent `#28282C` |
| Text | fg `#FAFAFA` · muted `#ADADB3` · field `#77777C` |
| Linien/Felder | border `rgba(255,255,255,0.11)` · input `rgba(255,255,255,0.15)` · inputBg `rgba(255,255,255,0.045)` · inputBgPressed `rgba(255,255,255,0.075)` · ring `rgba(250,250,250,0.15)` |
| Marke | primary `#6BA5FB` · primaryFg `#07101C` · primaryPressed `rgba(107,165,251,0.85)` · primarySoft `rgba(107,165,251,0.1)` |
| Erfolg | success `#5AC576` · successFg `#061308` · successPressed `#94C66A` |
| Glocke/Warnung | bell `#F9CC21` · bellOutline `#EAB532` · destructive `#FF6467` |
| Schilder (Fläche/Text) | green `#002C22`/`#A4F4CF` · blue `#162456`/`#BEDBFF` · amber `#461901`/`#FEE685` · red `#460809`/`#FFC9C9` |
| Textfarben | orange `#FFB900` („3 frei“) · green `#00D492` („voll“) · check `#009966` · redText `#FF6467` · sky700 `#74D4FF` |
| Balken | emerald500 `#00BC7D` · amber500 `#FE9A00` · red500 `#FB2C36` |
| Kalender (Deckkraft 0,4) | emerald50 `rgba(0,44,34,0.4)` · violet50 `rgba(47,13,104,0.4)` · amber50 `rgba(70,25,1,0.4)` · blue50 `rgba(22,36,86,0.4)` · red50 `rgba(70,8,9,0.4)` |
| Chat | chatWall `#0B141A` · chatOwn `#005C4B` · chatOther `#202C33` · chatFg `#E9EDEF` · chatMeta `rgba(255,255,255,0.8)` · chatDay `#182229` · send `#009966` · unread `#007A55` |
| Avatare (Fläche/Symbol) | emerald `#002C22`/`#5EE9B5` · amber `#461901`/`#FFD230` · violet `#2F0D68`/`#C4B4FF` · sky `#052F4A`/`#74D4FF` · blue `#162456`/`#8EC5FF` |

- Neu in `tokens.ts`: `withAlpha(color, a)` (nimmt Hex und rgba) und `ROW_TINT = 0.1` (Tönung hervorgehobener Zeilen).
- Einige Tokens sind **rgba-Strings statt Hex**: primaryPressed, primarySoft, border, chatMeta, emerald50…red50, ring,
  input, inputBg, inputBgPressed. Für eigene Abwandlungen `withAlpha()` benutzen, nicht an Hex-Strings anhängen.

## Was das für den Film heißt

- Die App-Schatten sind schwarz und auf `#0A0A0B` kaum sichtbar. Die Tiefe entsteht über Flächenstufen und Ringe.
  **Schwebende Karten brauchen ihren Glow aus der Szene**, also `neon/GlassPanel`/`ScreenPanel` als Rahmen.
- Die Markenfarbe der App heißt im Dunkeln **`#6BA5FB`**, heller als Vereinsblau `#3A6BEA`. In App-Seiten bleibt
  `#6BA5FB`. Für Neon-Licht außerhalb der App gilt die Neon-Palette (`neon/palette.ts`, Vereinsblau/Himmel).
- Trend-Schilder im Dashboard sind weiter standardmäßig aus (`trends=false`), denn Trendzahlen sind nicht freigegeben.
- **Glocke** in der Kopfzeile: gelb gefüllt mit Goldumriss, wie in der App seit 20.10. Das lässt sich in einer Zeile
  in `AppShell.tsx` ändern.
- **Abgeleitet ohne `dark:`-Vorbild:**
  - Kopfzeile card/80 mit Trennlinie (Layout vom 07.10.)
  - Zeilentönung 10 %
  - blauer Avatar
  - Absendername im Chat emerald-300
  - natives Kästchen wie Chrome dunkel: Fläche und Haken `#3B3B3B`, Rand `#858585`
- **Rundung:** 1 CSS-px (3 Bildpixel) Versatz gegenüber der Aufnahme an wenigen Stellen (Kalender, Schichten, Chat).
  Er stammt schon aus dem hellen Baukasten und ist im Film unsichtbar.
