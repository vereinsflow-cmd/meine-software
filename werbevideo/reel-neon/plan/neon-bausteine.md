# Neon-Bausteine (`video/src/neon`) – API für die Szenen

Stand 2026-11-24. Gebaut nach den Referenzbildern (`plan/referenz/`), in VereinsFlow-Farben. Die Analyse des Vorbilds
(Palette, Glow, Lichtbänder, Glas, Typografie, Tiefenschärfe, Kamera, Übergänge, Logo) steht oben in
`src/neon/index.ts`. **Alles wird importiert über `import { … } from "../neon"`** (aus einer Szene im Unterordner:
`"../../neon"`).

## Grundregeln

- **Frame immer übergeben:** Alle Bausteine laufen nur über den Frame, als Prop `frame` (absoluter Frame).
  - Die Szene bekommt `f` von Video.tsx und reicht es als `frame={f}` weiter.
  - Ohne Prop greifen die Bausteine auf die Remotion-Zeitachse zurück. Das stimmt im Prüfbogen (`ShowFrame`) nicht.
- **Keine Zufälle, keine CSS-Übergänge:** Kein `Math.random`, keine CSS-Transitions. Für pseudo-zufällige Werte gibt es
  `seeded()` in `neon/util`.
- **Schrift muss geladen sein:** `GlowPill`, `DonutRing` und Zeilenumbrüche messen per Canvas. Video.tsx legt alles in
  `FontGate`, in Szenen ist das also erfüllt.
- **Was Video.tsx schon macht:** Die Szene zeichnet nur ihren Inhalt. Video.tsx liefert dazu:
  - den durchgehenden `NeonBackground`, gesteuert über `mood` der Szene (siehe unten)
  - die globale `NeonVignette` (Stärke 0,45) und `NeonGrain` (0,04)
  - die Zoom-Übergänge an „zoom“/„sweep“-Grenzen mit `ZoomThrough` und `zoomCross(f, Grenze, 16)`
  - den `FlashSweep` an „sweep“-Grenzen
  - **Also in Szenen keinen eigenen Vollbild-Hintergrund und keine zweite Vignette oder Korn.** Lokale Lichtflecken,
    Lichtboden und Tiefenebenen sind in Ordnung.
- **Renderzeit:** Mehrfach-Zeichner (`Echo`, `ZoomThrough` mit Geistern, `GlowDissolve`, `TunnelPanel`, große
  `blur()`-Filter) gezielt und kurz einsetzen. Richtwert: im Mittel unter 1,5 s pro Frame.

## Hintergrund über `mood` (in der Szene, nicht als Komponente)

```ts
export const termine: NeonScene = {
  id: "termine",
  Comp: TermineComp,
  // Standard im Film: ribbons 0.45, particles 0.35, tint 0.25, warm 0, lift 0, layout "drift"
  mood: (f) => ({ ribbons: 0.4, tint: 0.3 }),
};
```

- **Felder:**
  - `ribbons` 0…1: Helligkeit der Bänder. Mit Inhalt im Bild 0,3–0,5, ohne Inhalt bis 1.
  - `warm` 0…1: Orange-Anteil.
  - `particles` 0…1
  - `tint`: 0 = tiefes Blau, 1 = heller Himmel.
  - `lift` 0…1: hebt den Grund an.
  - `layout`: `"drift"` (Bänder am Rand, Mitte frei), `"hero"` (große senkrechte Bänder wie im Opener t00.25) oder
    `"low"` (Bänder unten, fürs Logo).
  - `swooshAt` (absoluter Frame): ein schneller Wischer mit Bewegungsunschärfe über 16 Frames, Richtung
    `swooshDirection`.
- **Übergänge:** An jeder Grenze mischt Video.tsx die Stimmungen über ±10 Frames. Bei unterschiedlichem `layout` blendet
  es zwei Hintergründe über.
- **`mood(f)` darf vom Frame abhängen,** etwa wenn die Bänder bei Feierabend langsam warm werden.

## Bausteine

### 3D-Bühne
- **`NeonScene3D`**: Bühne mit Kamera und automatischer Tiefenschärfe.
  - `camera`: `{ dolly, orbitX, orbitY, roll, panX, panY, pivot }`
  - weitere Props: `perspective`, `focusZ`, `dof` (px Unschärfe je 100 px Abstand zur Fokusebene), `maxBlur`, `dim`,
    `dimRange`
- **`Layer3D`**: eine Ebene, muss **direktes Kind** von `NeonScene3D` sein (sonst keine Tiefensortierung).
  - Lage: `x`, `y` (Mitte im Videoraum), `z` (+ = zur Kamera), `rotX`, `rotY`, `rotZ`, `scale`
  - Größe und Darstellung: `width`, `height`, `opacity`, `blur`, `sharp` (immer scharf), `noDim`, `order`,
    `hideBackface`, `zBias`
  - Unschärfe und Abdunkeln kommen aus dem Abstand zur Fokusebene. Kurz vor der Linse blendet die Ebene aus.
- **Helfer:** `project()`, `toCamera()`, `depthLook()`, `useScene3D()`.

### Glas
- **`GlassPanel`**: Glaskarte mit Lichtkante, Innenlicht, äußerem Glow und Glanzstreifen.
  - Props: `width`, `height`, `radius`, `tint` (0 = dunkle Kennzahlenkarte, 1 = sattes Vereinsblau), `glow`,
    `glowColor`, `edge`, `light` (Grad), `sheen` (0..1), `frost` (px), `padding`, `children`
- **`ScreenPanel`**: dieselbe Karte mit **einer App-Seite aus `src/ui`** darin (Bildraum 1170 px breit, skaliert, runde
  Ecken).
  - Props: `width`, `screenHeight`, `scrollY`, `tone` (`"native"` = echte Dunkel-App, Standard; `"dim"` = gedämpft),
    `bezel`, dazu alle Glas-Props
  - Höhe vorab berechnen: `screenPanelHeight()`
  - Seiten-Komponenten und ihre Props stehen in `plan/ui-baukasten.md`, die Farben in `plan/ui-dunkel.md`.

### Schrift
- **`GlowText`**: Neon-Zeile.
  - Auftritt je Wort: `start` + `stagger` oder `wordStarts[]` (z. B. aus `cue()`), `mode` (`"blur"` | `"rise"` |
    `"pop"` | `"none"`), `reveal`
  - Tippen: `typeStart`, `cps`, `cursor`, `cursorColor`
  - Aussehen: `fontSize`, `weight` (500 | 800), `color`, `wordColors`, `glow`, `flare` (Aufleuchten beim Auftritt),
    `extrude` (3D-Tiefe), `extrudeTone`, `maxWidth`, `align`, `lineHeight`, `letterSpacing`
  - Echo-Geister wie in t07.75: `echo`, `echoLag`
  - Abgang: `exit` (0..1)
  - Rendert inline, die Lage bestimmt also der umgebende Container.
- **`Cursor`**: glühender Tipp-Balken.
- **`GlowPill`**: Pille aus t02.75. Der Umriss zeichnet sich von links und wächst mit jedem Anschlag weich mit (Manrope
  800, Glow, Extrusion).
  - Props: `text`, `typeStart`, `cps`, `fontSize`, `x`, `y`, `anchor`, `draw`, `glow`, `extrude`, `cursorColor`,
    `appear`
  - `followX`: Kamera folgt dem Cursor. `maxWidth`: Zeilenumbruch.
  - `glowPillLayout()` liefert Maße und Cursorposition.
- **Tipp-Helfer** aus `neon/util`: `typing()`, `typingEnd()`, `cursorBlink()`.

### Befehlsleiste
- **`CommandBar`**: leuchtender Rahmen, Bildmarke, Such-Chip, satte Eingabezeile mit orangem Prompt-Punkt und
  Senden-Knopf.
  - Props: `text`, `typeStart`, `cps`, `width`, `chipLabel`, `placeholder`, `glow`, `appear`
  - `sendAt`: Der Knopf pulst mit Lichtring, der Text steigt weg, der Platzhalter kehrt zurück, die Frage erscheint als
    Blase oben rechts.
  - `expand` / `expandHeight` / `children`: Die Leiste klappt zur Antwortfläche auf.
  - Helfer: `commandBarHeight()`, `COMMAND_BAR_COLLAPSED`
- **`ResponseCard`**: Antwortzeilen mit wachsender Leuchtlinie links.
  - Props: `lines` (`{ text, strong, dot, color, size }`), `start`, `stagger`, `fontSize`, `accent`

### Kennzahlen
Alle Werte kommen von außen, die Platzhalter im Schaukasten sind keine Fakten.
- **`DonutRing`**: Lichtschlauch-Ring mit weißglühendem Kopf.
  - Props: `size`, `value`, `progress`, `format`, `label`, `sublabel`, `head`, `colors`
- **`Bars`**: Props `values`, `progress`, `stagger`, `labels`, `highlight` (orange Spitze).
- **`LineSpark`**: Linie zeichnet sich mit Glow, Fläche und Endpunkt. Props `values`, `progress`, `area`, `dot`,
  `dotColor`.
- **`MetricCard`**: dunkle Glaskarte mit Titel und optionalem Wert.

### Wand / Tunnel
- **`CurvedWall`**: Paneele auf einem Zylinder, innerhalb von `NeonScene3D`.
  - Props: `count`, `renderPanel(i)`, `panelWidth`, `panelHeight`, `radius`, `rotation`, `inside`, `center`,
    `edgeGlow`
  - `axis`: `"y"` | `"x"` | `"z"`. `"z"` ist der Tunnel um die Kamera wie t09.75, mit `radiusY` für ein hohes Oval.
  - Schneller Umlauf mit Bewegungsunschärfe: `blurSpan`, `samples`
  - Tunneltiefe: `nearDark`, `nearBlur`, `fogFar`
- **Dazu:** `WallFrame`, `TunnelPanel`, `TunnelMouth` (weiche, runde Tunnelöffnung als 2D-Overlay).

### Logo und Licht
- **`DotBurst`**: der orange Punkt als Heldenlicht (weißer Kern, Hof, anamorphotischer Streifen, Strahlen, Flug mit
  Kometenschweif, Explosion).
  - Props: `x`/`y` oder `path` + `pathProgress`, `trail`, `size`, `glow`, `flare`, `rays`, `burst`, `pulse`
- **`LogoReveal`**: V-Etappen gleiten ein, die Wortmarke erscheint Buchstabe für Buchstabe aus den echten Logo-Pfaden,
  die Laufweite zieht sich mit Echo zusammen; i-Punkt und Unterstreichung folgen.
  - Props: `start`, `width`, `x`, `y`, `spacingFrom`, `tighten`, `hideDot`, `glow`, `exit`
  - Landepunkt für den Punkt: `logoDotPosition(x, y, width)`
- **`LightFloor`**: Lichtkegel vom unteren Rand. Props `intensity`, `x`, `y`, `width`, `height`, `color`.
- **`fadeIn(f, start, dur)`**: weicher Einblendwert.

### Übergänge
Innerhalb einer Szene oder an eigenen „cut“-Grenzen:
- **`FlashSweep`**: schräges Lichtband mit kurzem Aufhellen. Props `progress`, `angle`, `width`, `flash`, `accent`.
- **`ZoomThrough`**: `t` −1 → 0 kommt aus der Tiefe, 0 → 1 fährt durch die Kamera. Props `origin`, `ghosts`,
  `maxScale`, `minScale`.
- **`GlowDissolve`**: glüht kurz auf und sinkt ins Dunkel (`t` 0 → 1).
- **`Echo`**: Echo-Geister einer Bewegung, `render(f)` wird für frühere Frames halbtransparent wiederholt.
- **`zoomCross(f, cut, dur)`**: liefert `{ out, in }` überlappend. Dazu `exitT`, `enterT`.

### Palette und Helfer (`neon/palette`, `neon/util`)
- **`NEON`:**
  - Grund: void `#020409`, night `#050916`, navy `#0D1736`
  - Blautöne: blue `#3A6BEA`, sky `#8FB0FF`, electric `#2A5BEA`, deep `#1C42BE`, abyss `#0E1F5E`
  - Akzent und Text: orange `#FF8A5E`, ice `#EEF3FF`, mist, hot `#FFF3EA`, glass
  - **Kein Violett, kein Magenta.**
- **Glow-Helfer:** `textGlow(k)`, `boxGlow(k)`, `extrude(n)`, `extrudeLit(n)`, `rgba()`, `mixHex()`
- **Mathe:** `lerp`, `invLerp`, `clamp01`, `smooth`, `smoothstep`, `easeOut`, `easeInOut`, `win`, `blip`, `catmull`

## Beispiele

- **`src/neon/Showcase.tsx`**: Szenen `SceneLogo`, `ScenePill`, `SceneCards`, `SceneCommand`, `SceneMetrics`,
  `SceneWall`, jeweils `{ f, bg }`. Das sind die Nachbauten der Referenzbilder; Stills `Neon-1` … `Neon-6` zeigen sie
  neben dem Original.
- **`src/neon/Demo.tsx`**: alle Bausteine hintereinander mit Übergängen (`Neon-Demo`, 150 Frames).

```tsx
<NeonScene3D camera={{ dolly: lerp(-160, 90, m), orbitY: lerp(6, -4, m) }} focusZ={0} dof={3.4}>
  <Layer3D x={230} y={470} z={300} rotY={16} width={560} height={420}><GlassPanel width={560} height={420} tint={1} /></Layer3D>
  <Layer3D x={540} y={1000} z={0} width={900} height={screenPanelHeight(900, 1400)}>
    <ScreenPanel width={900} screenHeight={1400}><MembersPage … /></ScreenPanel>
  </Layer3D>
</NeonScene3D>
<GlowText text="Alle Mitglieder. An einem Ort." frame={f} wordStarts={[…cue()]} fontSize={72} mode="rise" echo={2} />
```

## Nachtrag nach der Prüfung der Bausteine (21:40)

Die API ist rückwärtskompatibel, es kamen nur Props und Exporte dazu. Der Look ist überarbeitet:
- **Grund und Glow:** Grund fast schwarz mit Blaustich, Bloom in Markenblau getönt (kein grauer Schleier, kein
  Cyan-Kern).
- **Glas:** GlassPanel mit Glasdicke, Fresnel-Saum und Glanzpunkt. CommandBar mit dünner Lichtkante.
- **Schrift:** Extrusion standardmäßig beleuchtet (`extrudeTone="dark"` = alter Look). Der weiße Kernschein in
  `textGlow` ist gedeckelt.
- **Übergänge und Logo:** FlashSweep ohne Blur-Filter, Logo mit Lichthof und Glanzlicht über die Wortmarke.

**Neue oder präzisierte Props und Standardwerte:**
- **Bühne:** `NeonScene3D` mit `perspective` 1700, `dof` 3.5, `maxBlur` 22, `dim` 0.55, `dimRange` 1200.
  `project(s, x, y, z)` liefert `{ x, y, scale, depth, visible }`.
- **Glas:** `GlassPanel` hat zusätzlich `contentStyle`.
- **Schrift:**
  - `GlowPill`: `cps` 16, `fontSize` 104, `minTextWidth`, `extrudeTone`, `glow` 1.25, `extrude` 5
  - `Cursor`: `opacity`, `color`, `width` (0.075em), `gap`, `glow`
- **Befehlsleiste:**
  - `CommandBar`: `cps` 15, `width` 940, `question` (Frage nach dem Senden als Blase, Standard an), `expandHeight` 620.
    Helfer `commandBarHeight(expand, expandHeight)`.
  - `ResponseCard`: `width`, `fontSize` 34, `lineGap` 18, `stagger` 5
- **Kennzahlen:**
  - `DonutRing`: `thickness`, `glow`
  - `Bars`: `width`, `barHeight` 34, `gap` 18, `labelWidth`, `glow`
  - `LineSpark`: `width`, `height`, `min`, `max`, `strokeWidth` 5, `glow`
  - `MetricCard`: `caption`, `tint`, `glow` 0.5, `appear`, `padding` 34
- **Wand und Tunnel:**
  - `CurvedWall`: `step`, `cull`, `samples` (Höchstwert 4, passt sich der Drehung an), Tunnel `farEdge`
  - **`TunnelMouth`** (neu, 2D, über die Bühne und unter die Schrift): `x`, `y`, `rx`, `ry`, `dark` 0.85, `rim` 0.8,
    `feather` 0.25, `color`
  - Runde Öffnung: CurvedWall mit `farEdge` ≈ 0.15, `fogFar` ≈ 0.3, `edgeGlow` ≈ 0.35. Bei Kamerafahrt `rx`/`ry`/`x`/`y`
    per `project()` mitführen.
- **Logo und Licht:**
  - `LogoReveal`: `width` 860, `spacingFrom` 46, `tighten` 44. Das Glanzlicht läuft bei `start + tighten + 4` über ca.
    26 Frames.
  - `LightFloor`: `y` (Standard H − 120), `width` 1500, `height` 1300, `breathe`
- **Korn:** `NeonGrain` mischt jetzt per `overlay`. Den globalen Einsatz macht Video.tsx.
- **Prüfwerkzeuge:** Stills `Neon-7` (Opener gegen t00.25) und `Neon-Szenenbogen` (eine Schaukasten-Szene zu mehreren
  Frames: `--props='{"scene":"logo","frames":[10,24,34],"cols":3,"scale":0.33}'`, Szenen hero | logo | pill | cards |
  command | metrics | wall).
- **Kosten:** Ein Tunnel-Frame mit Übergang kostet 2–3 s. Bei schweren Szenen innerhalb der eigenen Szene
  `ghosts={0}` bzw. `bloom={false}` setzen.

## Bekannte Grenzen

- **Tiefenschärfe je Ebene, nicht je Pixel:** Lange Tunnelpaneele täuschen die Tiefe über Masken vor.
- **Wand und Punkt:** Die Wand ist ein Vieleck aus flachen Paneelen. Der Punkt ist eine 2D-Kugel mit Flare, kein
  3D-Körper.
- **Markenfarben:** etwas weniger gesättigt als das Violett der Referenz, bewusst wegen der Markentreue.
