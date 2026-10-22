import {
  ENTRANCE_SECONDS,
  STAGE_MAX_SPEED,
  STAGE_PANELS,
  STAGE_QUALITY,
  STAGE_SPEED,
  STAGE_START_SPORT,
  STAGE_STILL_OFFSET,
  STAGE_WIDE_QUERY,
  clamp,
  dragDegrees,
  entrance,
  focusProgress,
  frontPanel,
  isSlowStage,
  normalizeAngle,
  panelLook,
  releaseSpeed,
  smoothing,
} from "../stage";
import { motionPreference } from "./motion-preference";

/**
 * Die Schleife der Anmeldebühne („3D-Fotokarussell“): EIN requestAnimationFrame für alles, was sich bewegt. Im DOM ändern
 * sich nur `transform` und `opacity` (die Unschärfe der hinteren Plakate springt nur in drei Stufen um, nicht in jedem
 * Bild). Die Ziele findet sie über `data-stage`-Attribute im Markup von stage-scene.tsx und login-stage.tsx:
 *
 *   entrance / anchor / ring / panel   die 3D-Kette: Auftritt (Deckkraft), Kamera, Drehung, Plakate
 *   glow                               Raumlicht je Abteilung (die Farbe des vorderen Fotos)
 *   ghost / swing                      Nachbilder und Hauptzeile „In Bewegung.“ – sie ziehen Schlieren, je schneller es dreht
 *   rim / pulse                        Kantenlicht der Glasfläche und das kurze Aufleuchten beim Tippen
 *   focus / progress                   „Im Fokus“ (welches Plakat vorn steht) und der Balken bis zum nächsten
 *   glass                              die Glasfläche: Fokus darin bremst den Ring, Tastendrücke rücken ihn ein Stück weiter
 *   zone                               (schmal) die Fläche über dem Ring, auf der man seitlich wischen kann
 *   dust / measure                     Lichtstaub (Canvas 2D) und der unsichtbare Maßstab für den Halbmesser in Pixeln
 *
 * Zustände (am Element als `data-motion`):
 *   running   dreht von selbst; Ziehen, Mausrad und Maus geben Schwung, Kamera und Glas neigen sich mit der Maus
 *   paused    „Bewegung anhalten“: läuft weich aus und steht dann – die Schleife ruht ganz. Ziehen dreht weiter 1 : 1 und
 *             läuft aus, ohne wieder anzulaufen. Ein laufender Auftritt (unter 3 s) wird noch zu Ende gespielt.
 *   reduced   „Bewegung reduzieren“: keine Schleife, keine Eingaben; das Standbild zeichnet allein das CSS
 *
 * Schwache Grafik: Gleich nach dem Auftritt misst sie einmal die Bildabstände (`isSlowStage`); sind sie durchgehend lang
 * (Rechner ohne Grafikbeschleunigung), setzt sie `data-quality="low"` – dann zeichnen Stil und Schleife leichter.
 *
 * Pausiert bei verborgenem Tab, räumt beim Verlassen alles ab.
 */

interface Panel {
  el: HTMLElement;
  sport: number;
  angle: number;
  shade: HTMLElement;
  sheen: HTMLElement;
  label: HTMLElement;
  halo: HTMLElement;
  reflection: HTMLElement;
  photo: HTMLElement;
  blurStep: number;
  /** zuletzt geschriebene Deckkräfte (shade, reflection, sheen, label, halo) – nur Änderungen gehen ins DOM */
  written: number[];
}

interface Mote {
  x: number;
  y: number;
  z: number;
  r: number;
  vx: number;
  vy: number;
  a: number;
  twinkle: number;
  phase: number;
  color: number;
}

const DUST_COLORS = ["150 180 255", "255 255 255", "255 150 105", "120 160 255"];

export function startStage(root: HTMLElement): () => void {
  const one = <T extends Element = HTMLElement>(name: string) =>
    root.querySelector<T>(`[data-stage="${name}"]`);
  const all = <T extends Element = HTMLElement>(name: string) =>
    Array.from(root.querySelectorAll<T>(`[data-stage="${name}"]`));

  const anchor = one("anchor");
  const ring = one("ring");
  const entranceLayer = one("entrance");
  const measure = one("measure");
  const canvas = one<HTMLCanvasElement>("dust");
  if (!anchor || !ring || !entranceLayer || !measure || !canvas) return () => {};

  const child = (el: HTMLElement, name: string) =>
    el.querySelector<HTMLElement>(`[data-stage="${name}"]`)!;
  const allPanels: Panel[] = all("panel").map((el) => ({
    el,
    sport: Number(el.dataset.sport),
    angle: 0,
    shade: child(el, "shade"),
    sheen: child(el, "sheen"),
    label: child(el, "label"),
    halo: child(el, "halo"),
    reflection: child(el, "reflection"),
    photo: child(el, "photo"),
    blurStep: -1,
    written: [-1, -1, -1, -1, -1],
  }));
  const glows = all("glow");
  const glowWritten = glows.map(() => -1);
  const ghosts = all("ghost");
  const swing = one("swing");
  const rim = one("rim");
  const pulse = one("pulse");
  const focusEntries = all("focus");
  const progress = one("progress");
  const glass = one("glass");
  const horizon = one("horizon");
  const flash = one("flash");
  const glassHolder = glass?.parentElement ?? null;

  const wideQuery = window.matchMedia(STAGE_WIDE_QUERY);
  const reduceQuery = window.matchMedia("(prefers-reduced-motion: reduce)");
  let narrow = !wideQuery.matches;
  let reduced = reduceQuery.matches;
  let paused = motionPreference.get();
  let radius = measure.offsetWidth || 1000;

  // Aus dem Stil: wie viele Plakate stehen (schmal 8, breit 16) und wie stark die Kamera kippt – so bleibt das Bild in
  // einer Datei einstellbar.
  let panels = allPanels;
  let angles: number[] = [];
  let step = 360 / STAGE_PANELS.wide;
  let baseTilt = -16;
  function readStyle() {
    const style = getComputedStyle(root);
    const tilt = parseFloat(style.getPropertyValue("--tilt"));
    baseTilt = Number.isFinite(tilt) ? tilt : -16;
    const count = parseInt(style.getPropertyValue("--panels"), 10);
    panels = allPanels.slice(0, count > 0 ? Math.min(count, allPanels.length) : allPanels.length);
    step = 360 / panels.length;
    angles = panels.map((_, index) => index * step);
    panels.forEach((panel, index) => (panel.angle = angles[index]));
  }
  readStyle();

  const stillAngle = () => -(STAGE_START_SPORT + STAGE_STILL_OFFSET) * step;

  // ---- Zustand ----
  let rotation = -STAGE_START_SPORT * step; // der Auftritt dreht zusätzlich über `entrance().spin`
  let speed = 0;
  /** Angehalten: wie schnell der Ring ausläuft – nach dem Knopf rasch (gut 1 s), nach einem Wurf länger. */
  let coast = 0.25;
  let nudge = 0; // noch ausstehende Grad aus Tastenanschlägen
  let factor = 1;
  let targetFactor = 1;
  let focusDim = 0;
  let targetFocusDim = 0;
  let parX = 0;
  let parY = 0;
  let targetParX = 0;
  let targetParY = 0;
  let lag = 0;
  let lastShown = Number.NaN;
  let front = -1;
  let time = 0;
  let last = 0;
  let frame = 0;
  let drag: { id: number; x: number; history: { x: number; t: number }[] } | null = null;
  // Auftritt: Die Plakate stehen zuerst als enge Blüte in der Mitte und falten sich zum Ring auf.
  let unfolded = false;
  let flashed = false;
  // Schwache Grafik: Bildabstände nach dem Auftritt (ms) und ob die Bühne schon leichter zeichnet
  const frameTimes: number[] = [];
  let low = false;

  function skipEntrance() {
    time = Math.max(time, ENTRANCE_SECONDS);
    flashed = true;
  }

  // ---- Lichtstaub (Canvas 2D) ----
  const ctx = canvas.getContext("2d");
  const sprites = DUST_COLORS.map((rgb) => {
    const sprite = document.createElement("canvas");
    sprite.width = sprite.height = 64;
    const g = sprite.getContext("2d");
    if (g) {
      const [r, gr, b] = rgb.split(" ");
      const gradient = g.createRadialGradient(32, 32, 0, 32, 32, 32);
      gradient.addColorStop(0, `rgba(${r},${gr},${b},1)`);
      gradient.addColorStop(0.22, `rgba(${r},${gr},${b},0.5)`);
      gradient.addColorStop(1, `rgba(${r},${gr},${b},0)`);
      g.fillStyle = gradient;
      g.fillRect(0, 0, 64, 64);
    }
    return sprite;
  });
  let motes: Mote[] = [];
  let width = 0;
  let height = 0;
  let dpr = 1;

  function newDust() {
    const count = narrow ? (low ? 14 : 26) : low ? 28 : 70;
    motes = Array.from({ length: count }, () => {
      const z = Math.random() ** 1.6; // meist fern und klein, wenige nah und groß
      const near = z > 0.86;
      // um die Höhe des Rings gehäuft (zwei Zufallszahlen gemittelt ≈ Glocke)
      const share = narrow
        ? (Math.random() + Math.random()) * 0.22
        : (Math.random() + Math.random()) * 0.42 + 0.04;
      return {
        x: Math.random() * width,
        y: share * height,
        z,
        r: near ? 5 + Math.random() * 6 : 1 + z * 2.8,
        vx: (Math.random() - 0.5) * 6,
        vy: -(3 + Math.random() * 10) * (0.4 + z),
        a: near ? 0.1 + Math.random() * 0.12 : 0.35 + z * 0.6,
        twinkle: 0.6 + Math.random() * 1.8,
        phase: Math.random() * Math.PI * 2,
        color: Math.floor(Math.random() * DUST_COLORS.length),
      };
    });
  }

  function resize() {
    const rect = root.getBoundingClientRect();
    const oldWidth = width;
    width = rect.width;
    height = rect.height;
    // Weiche Lichtpunkte brauchen keine volle Pixeldichte: schmal und bei schwacher Grafik 1, sonst höchstens 2.
    dpr = narrow || low ? 1 : Math.min(2, window.devicePixelRatio || 1);
    canvas!.width = Math.round(width * dpr);
    canvas!.height = Math.round(height * dpr);
    radius = measure!.offsetWidth || radius;
    readStyle();
    if (!motes.length || Math.abs(oldWidth - width) > 80) newDust();
  }

  function drawDust(dt: number, visibleSpeed: number, brightness: number, move: boolean) {
    if (!ctx) return;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, width, height);
    ctx.globalCompositeOperation = "lighter";
    const pull = clamp(visibleSpeed, -STAGE_MAX_SPEED, STAGE_MAX_SPEED) * (radius / 520);
    for (const mote of motes) {
      if (move) {
        mote.x += (mote.vx + pull * mote.z) * dt;
        mote.y += mote.vy * dt;
        if (mote.x < -40) mote.x += width + 80;
        else if (mote.x > width + 40) mote.x -= width + 80;
        if (mote.y < -40) mote.y += height * (narrow ? 0.5 : 0.9);
      }
      const flicker = 0.65 + 0.35 * Math.sin(time * mote.twinkle + mote.phase);
      ctx.globalAlpha = clamp(mote.a * flicker * brightness, 0, 1);
      const size = mote.r * 7;
      ctx.drawImage(sprites[mote.color], mote.x - size / 2, mote.y - size / 2, size, size);
    }
    ctx.globalAlpha = 1;
  }

  // ---- ein Bild der Szene ----
  const setOpacity = (el: HTMLElement, value: number, written: number[], slot: number) => {
    const rounded = Math.round(value * 1000) / 1000;
    if (written[slot] !== rounded) {
      written[slot] = rounded;
      el.style.opacity = String(rounded);
    }
  };
  const lightWeight = new Array<number>(glows.length).fill(0);

  function draw(dt: number) {
    const intro = entrance(time);

    factor += (targetFactor - factor) * smoothing(dt, 0.55);
    focusDim += (targetFocusDim - focusDim) * smoothing(dt, 0.5);
    const base = paused ? 0 : (narrow ? STAGE_SPEED.narrow : STAGE_SPEED.wide) * factor;
    if (!drag) {
      // Angehalten läuft der Ring weich aus (auch nach einem Wurf), statt wieder anzulaufen.
      speed += (base - speed) * smoothing(dt, paused ? coast : 1.5);
      if (paused && Math.abs(speed) < 0.05) speed = 0;
      rotation += speed * dt;
    }
    if (nudge) {
      const piece = nudge * smoothing(dt, 0.14);
      rotation += piece;
      nudge = Math.abs(nudge - piece) < 0.001 ? 0 : nudge - piece;
    }
    const shown = rotation + intro.spin;
    const visibleSpeed =
      dt > 0 && !Number.isNaN(lastShown) ? (shown - lastShown) / dt : paused ? 0 : speed;
    lastShown = shown;

    parX += (targetParX - parX) * smoothing(dt, 0.4);
    parY += (targetParY - parY) * smoothing(dt, 0.4);
    if (Math.abs(targetParX - parX) < 0.0005) parX = targetParX;
    if (Math.abs(targetParY - parY) < 0.0005) parY = targetParY;

    // Auftritt: Halbmesser wächst aus der Mitte (nur in den ersten Sekunden je Plakat geschrieben).
    if (!unfolded) {
      if (intro.bloom >= 1) {
        unfolded = true;
        for (const panel of allPanels) panel.el.style.transform = "";
      } else {
        for (const panel of panels)
          panel.el.style.transform = `rotateY(${panel.angle}deg) translateZ(${(radius * intro.bloom).toFixed(1)}px)`;
      }
      if (!flashed && time > 0.73) {
        flashed = true;
        flash?.animate(
          [
            { opacity: 0, transform: "translate(-50%, -50%) scale(0.6)" },
            { opacity: 1, transform: "translate(-50%, -50%) scale(1)", offset: 0.25 },
            { opacity: 0, transform: "translate(-50%, -50%) scale(1.5)" },
          ],
          { duration: 1500, easing: "cubic-bezier(0.23, 1, 0.32, 1)" },
        );
      }
    }

    // Kamera: Auftritt aus der Tiefe, dann leichte Schwenks mit der Maus.
    const pushBack = (1 - intro.depth) * radius * 1.1;
    const tilt = baseTilt + parY * 2.4 - (1 - intro.depth) * 10;
    anchor!.style.transform = `translate3d(${(parX * 28).toFixed(2)}px, ${(parY * 12).toFixed(2)}px, ${(-radius - pushBack).toFixed(1)}px) rotateX(${tilt.toFixed(3)}deg) rotateZ(${(parX * -0.9).toFixed(3)}deg)`;
    ring!.style.transform = `rotateY(${shown.toFixed(3)}deg)`;
    entranceLayer!.style.opacity = String(Math.round(intro.opacity * 1000) / 1000);

    lightWeight.fill(0);
    for (const panel of panels) {
      const look = panelLook(panel.angle + shown, focusDim);
      setOpacity(panel.shade, look.shade, panel.written, 0);
      setOpacity(panel.reflection, look.reflection, panel.written, 1);
      setOpacity(panel.sheen, look.sheen, panel.written, 2);
      setOpacity(panel.label, look.label, panel.written, 3);
      setOpacity(panel.halo, look.halo, panel.written, 4);
      if (!narrow && !low && look.blurStep !== panel.blurStep) {
        panel.blurStep = look.blurStep;
        panel.photo.style.filter = look.blurStep
          ? `blur(${(look.blurStep * 1.7).toFixed(1)}px)`
          : "";
      }
      lightWeight[panel.sport] = Math.max(lightWeight[panel.sport], look.light);
    }

    const lightStrength = (0.9 - focusDim * 0.9) * (0.35 + 0.65 * intro.depth);
    glows.forEach((el, i) => setOpacity(el, lightWeight[i] * lightStrength, glowWritten, i));

    const ahead = frontPanel(angles, shown);
    const aheadSport = panels[ahead.index]?.sport ?? 0;
    if (aheadSport !== front) {
      const before = front;
      front = aheadSport;
      focusEntries.forEach((el, i) => {
        el.dataset.state = i === front ? "active" : i === before ? "gone" : "";
      });
      if (before !== -1 && horizon) {
        horizon.animate([{ opacity: 1 }, { opacity: 0.55 }], {
          duration: 1100,
          easing: "cubic-bezier(0.23, 1, 0.32, 1)",
        });
      }
    }
    if (progress) {
      progress.style.transform = `scaleX(${focusProgress(ahead.azimuth, step, visibleSpeed).toFixed(3)})`;
    }

    // Schrift in Bewegung: Nachbilder ziehen hinter der Zeile her, die Zeile lehnt sich in die Drehung.
    lag += (clamp(visibleSpeed * 0.5, -72, 72) - lag) * smoothing(dt, 0.12);
    if (Math.abs(lag) < 0.01) lag = 0;
    ghosts.forEach((el, j) => {
      el.style.transform = `translate3d(${(-lag * (j + 1) * 0.95).toFixed(2)}px,0,0)`;
      el.style.opacity = String(clamp(Math.abs(lag) / 45 - 0.02, 0, 0.62) * (1 - j * 0.3));
    });
    if (swing) swing.style.transform = `skewX(${(-lag * 0.07).toFixed(3)}deg)`;
    if (rim) rim.style.transform = `rotate(${(normalizeAngle(shown * 1.6) + 210).toFixed(2)}deg)`;
    // Die Glasfläche schwebt im selben Raum: neigt sich leicht mit der Maus, beim Tippen steht sie still.
    if (glassHolder && !narrow) {
      const calm = 1 - clamp(focusDim / 0.22, 0, 1);
      glassHolder.style.transform = `perspective(1800px) rotateY(${(parX * -2.6 * calm).toFixed(3)}deg) rotateX(${(parY * 1.8 * calm).toFixed(3)}deg)`;
    }

    drawDust(dt, visibleSpeed, (1 - focusDim * 1.4) * intro.depth, !paused || drag !== null);
  }

  /** Angehalten und nichts mehr unterwegs: Dann ruht die Schleife, bis wieder etwas passiert. */
  const settled = () =>
    paused &&
    !drag &&
    unfolded &&
    time >= ENTRANCE_SECONDS &&
    speed === 0 &&
    nudge === 0 &&
    lag === 0 &&
    parX === targetParX &&
    parY === targetParY &&
    Math.abs(targetFocusDim - focusDim) < 0.001 &&
    Math.abs(targetFactor - factor) < 0.001;

  // ---- Schwache Grafik ----
  function measureFrame(ms: number) {
    if (low || time < ENTRANCE_SECONDS || frameTimes.length >= STAGE_QUALITY.frames) return;
    frameTimes.push(ms);
    if (isSlowStage(frameTimes)) lowerQuality();
  }
  /** Einmal und endgültig: Stil (`data-quality`) und Schleife lassen Teures weg, der Ring dreht weiter wie vorher. */
  function lowerQuality() {
    low = true;
    root.dataset.quality = "low";
    for (const panel of allPanels) {
      panel.blurStep = -1;
      panel.photo.style.filter = "";
    }
    resize(); // Lichtstaub in einfacher Pixeldichte …
    newDust(); // … und weniger davon
  }

  // ---- Schleife ----
  function tick(now: number) {
    if (last) measureFrame(now - last);
    const dt = last ? clamp((now - last) / 1000, 0, 0.05) : 1 / 60;
    last = now;
    time += dt;
    draw(dt);
    frame = settled() ? 0 : requestAnimationFrame(tick);
  }
  function wake() {
    if (frame || reduced || document.hidden) return;
    last = 0;
    frame = requestAnimationFrame(tick);
  }
  function halt() {
    if (frame) cancelAnimationFrame(frame);
    frame = 0;
  }
  function setMotion() {
    root.dataset.motion = reduced ? "reduced" : paused ? "paused" : "running";
  }

  /** „Bewegung reduzieren“: Schleife aus, alle von ihr gesetzten Werte weg – dann zeichnet das CSS das Standbild. */
  function showStill() {
    halt();
    drag = null;
    root.dataset.dragging = "false";
    anchor!.style.transform = "";
    ring!.style.transform = "";
    entranceLayer!.style.opacity = "";
    for (const panel of allPanels) {
      panel.el.style.transform = "";
      panel.photo.style.filter = "";
      panel.blurStep = -1;
      for (const el of [panel.shade, panel.reflection, panel.sheen, panel.label, panel.halo])
        el.style.opacity = "";
      panel.written.fill(-1);
    }
    glows.forEach((el) => (el.style.opacity = ""));
    glowWritten.fill(-1);
    for (const el of ghosts) {
      el.style.transform = "";
      el.style.opacity = "";
    }
    if (swing) swing.style.transform = "";
    if (rim) rim.style.transform = "";
    if (progress) progress.style.transform = "";
    if (glassHolder) glassHolder.style.transform = "";
    focusEntries.forEach((el, i) => (el.dataset.state = i === STAGE_START_SPORT ? "active" : ""));
    front = -1;
    unfolded = false;
    skipEntrance();
    rotation = stillAngle();
    speed = 0;
    lag = 0;
    lastShown = Number.NaN;
    parX = parY = targetParX = targetParY = 0;
    drawDust(0, 0, 1, false); // ruhender Lichtstaub
    setMotion();
  }

  // ---- Eingaben ----
  const isControl = (target: EventTarget | null) =>
    target instanceof Element &&
    !!target.closest("input, textarea, select, button, a, label, [data-stage='glass']");

  function pointerDown(e: PointerEvent) {
    if (reduced || e.button !== 0 || isControl(e.target)) return;
    // Schmal nimmt der Finger nur die Fläche über dem Ring – sonst scrollt die Seite ganz normal.
    if (
      narrow &&
      e.pointerType !== "mouse" &&
      !(e.target instanceof Element && e.target.closest("[data-stage='zone']"))
    )
      return;
    drag = { id: e.pointerId, x: e.clientX, history: [{ x: e.clientX, t: e.timeStamp }] };
    // Mit der Maus: kein Markieren von Text und kein Fokuswechsel beim Ziehen (ein Feld behält den Fokus).
    if (e.pointerType === "mouse") e.preventDefault();
    root.setPointerCapture(e.pointerId);
    root.dataset.dragging = "true";
    wake();
  }
  function pointerMove(e: PointerEvent) {
    if (drag && e.pointerId === drag.id) {
      const dx = e.clientX - drag.x;
      drag.x = e.clientX;
      rotation += dragDegrees(dx, radius); // 1 : 1 – das vordere Plakat klebt am Zeiger
      drag.history.push({ x: e.clientX, t: e.timeStamp });
      while (drag.history.length > 2 && e.timeStamp - drag.history[0].t > 100) drag.history.shift();
      return;
    }
    if (e.pointerType !== "mouse" || reduced || paused) return;
    targetParX = clamp((e.clientX / window.innerWidth - 0.5) * 2, -1, 1);
    targetParY = clamp((e.clientY / window.innerHeight - 0.5) * 2, -1, 1);
    // Wer mit der Maus über die Bühne streicht, schubst den Ring ein wenig an.
    if (!isControl(e.target))
      speed = clamp(speed + clamp(e.movementX, -40, 40) * 0.05, -STAGE_MAX_SPEED, STAGE_MAX_SPEED);
  }
  function pointerUp(e: PointerEvent) {
    if (!drag || e.pointerId !== drag.id) return;
    // Schwung übernehmen, klingt dann aus
    speed = releaseSpeed(drag.history, radius, e.type === "pointercancel");
    coast = 0.8;
    drag = null;
    root.dataset.dragging = "false";
    if (root.hasPointerCapture(e.pointerId)) root.releasePointerCapture(e.pointerId);
    wake();
  }
  function wheel(e: WheelEvent) {
    if (reduced || paused || isControl(e.target)) return;
    speed = clamp(
      speed + clamp(e.deltaX + e.deltaY, -120, 120) * 0.07,
      -STAGE_MAX_SPEED,
      STAGE_MAX_SPEED,
    );
  }
  function focusIn(e: FocusEvent) {
    if (glass && e.target instanceof Node && glass.contains(e.target)) {
      targetFactor = 0.1;
      targetFocusDim = 0.22;
      root.dataset.focus = "true";
      wake();
    }
  }
  function focusOut(e: FocusEvent) {
    const next = e.relatedTarget;
    if (!glass || !(next instanceof Node) || !glass.contains(next)) {
      targetFactor = 1;
      targetFocusDim = 0;
      root.dataset.focus = "false";
      wake();
    }
  }
  function keyDown(e: KeyboardEvent) {
    if (reduced || !glass || !(e.target instanceof Node) || !glass.contains(e.target)) return;
    if (e.key.length !== 1 && e.key !== "Backspace") return;
    // Jeder Anschlag: Kante leuchtet kurz auf, der Ring rastet ein kleines Stück weiter (wie ein Zahnrad) – er bleibt dabei
    // gebremst, schnelles Tippen dreht ihn also nicht auf. Angehalten bleibt er stehen.
    if (!paused) {
      nudge = clamp(nudge + 0.7, 0, 6);
      wake();
    }
    pulse?.animate([{ opacity: 0.85 }, { opacity: 0 }], {
      duration: 520,
      easing: "cubic-bezier(0.23, 1, 0.32, 1)",
    });
  }
  function visibility() {
    if (document.hidden) halt();
    else wake();
  }
  function reducedChanged() {
    reduced = reduceQuery.matches;
    if (reduced) showStill();
    else {
      setMotion();
      wake();
    }
  }
  function wideChanged() {
    const oldStep = step;
    narrow = !wideQuery.matches;
    if (glassHolder) glassHolder.style.transform = "";
    allPanels.forEach((panel) => {
      panel.blurStep = -1;
      panel.photo.style.filter = "";
    });
    resize();
    // Gleiches Plakat vorn, obwohl schmal und breit verschieden viele Plakate stehen.
    rotation *= step / oldStep;
    lastShown = Number.NaN;
    newDust();
    if (reduced) showStill();
    else if (!frame) draw(0);
  }
  const unsubscribe = motionPreference.subscribe(() => {
    paused = motionPreference.get();
    if (paused) {
      targetParX = targetParY = 0;
      coast = 0.25;
    }
    setMotion();
    wake();
  });

  resize();
  const observer = new ResizeObserver(() => {
    resize();
    if (reduced) drawDust(0, 0, 1, false);
    else if (!frame) draw(0);
  });
  observer.observe(root);

  root.addEventListener("pointerdown", pointerDown);
  root.addEventListener("pointermove", pointerMove);
  root.addEventListener("pointerup", pointerUp);
  root.addEventListener("pointercancel", pointerUp);
  root.addEventListener("wheel", wheel, { passive: true });
  root.addEventListener("focusin", focusIn);
  root.addEventListener("focusout", focusOut);
  root.addEventListener("keydown", keyDown);
  document.addEventListener("visibilitychange", visibility);
  reduceQuery.addEventListener("change", reducedChanged);
  wideQuery.addEventListener("change", wideChanged);

  if (reduced) showStill();
  else {
    // Wer die Bewegung angehalten hat, bekommt gleich das Standbild – ohne Auftritt.
    if (paused) {
      skipEntrance();
      rotation = stillAngle();
    } else {
      // Der Ring dreht schon während des Auftritts im Grundtempo – so früher losgedreht, steht am Ende Dart genau vorn
      // (wie im Standbild und in „Im Fokus“ aus dem Server).
      speed = narrow ? STAGE_SPEED.narrow : STAGE_SPEED.wide;
      rotation -= speed * ENTRANCE_SECONDS;
    }
    setMotion();
    wake();
  }
  root.dataset.ready = "true";

  return () => {
    halt();
    unsubscribe();
    observer.disconnect();
    root.removeEventListener("pointerdown", pointerDown);
    root.removeEventListener("pointermove", pointerMove);
    root.removeEventListener("pointerup", pointerUp);
    root.removeEventListener("pointercancel", pointerUp);
    root.removeEventListener("wheel", wheel);
    root.removeEventListener("focusin", focusIn);
    root.removeEventListener("focusout", focusOut);
    root.removeEventListener("keydown", keyDown);
    document.removeEventListener("visibilitychange", visibility);
    reduceQuery.removeEventListener("change", reducedChanged);
    wideQuery.removeEventListener("change", wideChanged);
  };
}
