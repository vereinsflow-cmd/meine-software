/**
 * NEON-BAUSTEINE für das 60-s-Reel (Look nach dem Referenz-Reel, in VereinsFlow-Farben).
 *
 * ── Was den Look der Referenz ausmacht (Frames plan/referenz/t00.25 … t14.25; abgefilmter AE-Promo, 16:9, violett) ──
 *
 * 1 Palette & Glow
 *   Grund fast schwarz mit Blaustich (#05061A … #0A0B24), oben links minimal heller, Ecken in Vignette. Licht kommt nur
 *   aus den Elementen: sattes Violettblau, Spitzen fast weiß (Lavendel). Glow ist immer mehrlagig – harter heller Kern,
 *   mittlerer Schein, sehr weiter, schwacher Hof – und wirkt additiv (wo sich Licht überlagert, wird es weißer).
 *   Glow flammt beim Auftritt auf und klingt ab (t07.75 stark → t08.75 ruhig). Keine harten Kanten im Licht.
 * 2 Lichtbänder (t00.25–t00.75)
 *   Breite „Lichtseide“: eine Kante hell und scharf, die Fläche weich auslaufend, dazu dünne helle Linien. Die Bänder
 *   biegen und verdrehen sich (steht das Band hochkant, entsteht ein heller Knick), als Übergang peitscht ein Band mit
 *   starker Bewegungsunschärfe durchs Bild.
 * 3 Glaskarten
 *   (a) satte Indigo-Karten (t03.75/t04.25): Verlauf Blau → Violett, fast deckend, helle Oberkante, Licht in der Ecke;
 *   (b) dunkle Kennzahlenkarten (t08.25): fast Grundfarbe, 1-px-Rahmen gedimmt, an den oberen Ecken heller, großer
 *   Radius. Kaum Milchglas – Tiefe entsteht durch Unschärfe und Abdunkeln, nicht durch Frost.
 * 4 Typografie
 *   Geometrische Grotesk. Ruhige Zeilen klein, Medium, weiß-lavendel mit leichtem Schein (t04.25, t10.75); große Zeilen
 *   fett, mit Neon-Glow und leichter 3D-Extrusion (t02.75). Tipp-Cursor als glühender Balken, Text in einer glühenden
 *   Pille, deren Umriss sich zeichnet. Wörter kommen einzeln mit Versatz, Unschärfe und Echo-Geistern (t07.75, t10.25).
 * 5 Tiefenschärfe
 *   Nur die Textebene ist scharf; Karten davor/dahinter sind deutlich weich (bis ~20 px) und dunkler (t03.75), bei den
 *   Kennzahlen dagegen fast scharf (t08.75). Große unscharfe Formen (Sterne) im Vorder- und Hintergrund.
 * 6 Kamera
 *   Langsame Dolly-Fahrten mit Parallaxe (Karten driften auf die Kamera zu, t03.75 → t04.25), harter Zoom an die
 *   Suchleiste (t04.75), Herausfahren beim Aufklappen (t06.25 → t07.25), Orbit um/in eine gekrümmte Wand aus Paneelen
 *   (t09.25 → t10.25, Kamera innen, Tunnelblick, schneller Umlauf mit Verwischen).
 * 7 Übergänge
 *   Lichtband-Wischer, Zoom durch die Kamera mit Echo/Bewegungsunschärfe, kurze schwarze Atempausen (t02.25, t11.75),
 *   Echo-Geister bei Textwechseln (t03.25, t05.75).
 * 8 Logo
 *   3D-Stern dreht sich ein, Wortmarke mit weiter Laufweite und Echo zieht sich zusammen (t12.25 → t13.75), darunter ein
 *   breiter, weicher Lichtkegel vom unteren Rand (t13.25). Sonst nichts im Bild.
 *
 * ── Übertragung auf VereinsFlow ──
 *   Violett → Vereinsblau #3A6BEA / Himmel #8FB0FF, weißer Kern bleibt; Grund fast schwarz #020409 → #050916 (wie die
 *   Referenz: Licht nur aus den Elementen). Signalorange #FF8A5E nur als Akzent: der orange Punkt ist das Heldenlicht
 *   (statt Stern), dazu dünnes Akzentband, Prompt-Punkt und Senden-Knopf, hervorgehobener Balken. Schrift Manrope 500/800.
 *   Kein Violett, kein Magenta. Licht bleibt farbig: Bloom in Markenblau getönt, übersteuertes Blau läuft zu Eis-Weiß
 *   (nicht Cyan), Schrift-Extrusion als beleuchtete Himmel→Vereinsblau-Flanke (wie t02.75), keine grauen Schleier.
 *
 * ── Prüfen ──
 *   Neon-1 … Neon-7          Nachbau links, Referenz rechts (t13.25, t02.75, t04.25, t05.25, t08.75, t09.75, t00.25)
 *   Neon-Szenenbogen         eine Schaukasten-Szene zu mehreren Frames, z. B.
 *                            --props='{"scene":"logo","frames":[10,24,34,46,60,84],"cols":3,"scale":0.33}'
 *                            (scene: hero | logo | pill | cards | command | metrics | wall)
 *   Neon-Demo / Neon-Pruefbogen  alle Bausteine hintereinander mit echten Übergängen
 *
 * ── Bausteine (alle nur aus dem Frame, Prop `frame` = absoluter Frame, sonst useCurrentFrame) ──
 *   NeonBackground, NeonGrain, NeonVignette      Grund, Lichtbänder (Canvas, additiv, Bloom), Bokeh, Wischer
 *   NeonScene3D, Layer3D, project, useScene3D    Perspektiv-Bühne mit Kamera und Tiefenschärfe
 *   GlassPanel, ScreenPanel                      Glaskarte; Glaskarte mit App-Seite aus src/ui
 *   GlowText, GlowPill, Cursor                   Neon-Schrift (Wort-Auftritt, Tippen), leuchtende Pille
 *   CommandBar, ResponseCard                     Suchleiste mit Tippen/Senden/Aufklappen, Antwortzeilen
 *   DonutRing, Bars, LineSpark, MetricCard       Kennzahlen
 *   CurvedWall, WallFrame, TunnelPanel           Paneele auf Zylinder/Tunnel um die Kamera
 *   TunnelMouth                                  weiche, runde Tunnelöffnung (2D-Overlay über der Wand)
 *   DotBurst, LogoReveal, LightFloor             oranger Punkt als Heldenlicht, Logo-Enthüllung, Bodenlicht
 *   FlashSweep, ZoomThrough, GlowDissolve, Echo  Übergänge (+ zoomCross, exitT, enterT)
 */
export { NEON, boxGlow, extrude, extrudeLit, mixHex, rgba, textGlow } from "./palette";
export { blip, catmull, clamp01, cursorBlink, easeInOut, easeOut, invLerp, lerp, smooth, smoothstep, typing, typingEnd, useF, win } from "./util";
export type { Pt } from "./util";
export { NeonBackground, NeonGrain, NeonVignette, moodMix, swooshProgress } from "./NeonBackground";
export type { NeonBackgroundProps, RibbonSpec } from "./NeonBackground";
export { Layer3D, NeonScene3D, depthLook, project, toCamera, useScene3D } from "./Scene3D";
export type { Layer3DProps, NeonCamera, NeonScene3DProps, Scene3DSettings } from "./Scene3D";
export { GlassPanel, ScreenPanel, screenPanelHeight } from "./GlassPanel";
export type { GlassPanelProps, ScreenPanelProps, ScreenTone } from "./GlassPanel";
export { Cursor, GlowPill, GlowText, glowPillLayout } from "./GlowText";
export type { GlowPillProps, GlowTextProps } from "./GlowText";
export { COMMAND_BAR_COLLAPSED, CommandBar, ResponseCard, commandBarHeight } from "./CommandBar";
export type { CommandBarProps, ResponseCardProps, ResponseLine } from "./CommandBar";
export { Bars, DonutRing, LineSpark, MetricCard } from "./Metrics";
export type { BarsProps, DonutRingProps, LineSparkProps, MetricCardProps } from "./Metrics";
export { CurvedWall, TunnelMouth, TunnelPanel, WallFrame } from "./CurvedWall";
export type { CurvedWallProps } from "./CurvedWall";
export { DotBurst, LightFloor, LogoReveal, fadeIn, logoDotPosition } from "./DotBurst";
export type { DotBurstProps, LightFloorProps, LogoRevealProps } from "./DotBurst";
export { Echo, FlashSweep, GlowDissolve, ZoomThrough, enterT, exitT, zoomCross } from "./Transitions";
export type { EchoProps, FlashSweepProps, GlowDissolveProps, ZoomThroughProps } from "./Transitions";
