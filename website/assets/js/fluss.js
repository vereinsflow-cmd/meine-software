// VereinsFlow – Website · fluss.js: der Lichtfluss (Canvas 2D, eigener Code, keine Bibliothek). Ein Strom aus Fasern
// folgt einer geschwungenen Bahn wie Laternen auf dem Wasser bei langer Belichtung: hinten dunkel und kurz, vorn hell und
// lang. Auf der Nacht leuchtet er (Mischung „lighter“), auf Papier ist er Tinte (dünn, ohne Schein).
// Optionen am <canvas data-fluss>:
//   data-pfad="x,y …"        Mittellinie in Anteilen der Fläche (Catmull-Rom); data-pfad-kompakt für schmale Fenster
//   data-breite="0.03"       halbe Breite des Stroms (Anteil der Höhe)   data-anzahl="600"  Fasern (data-anzahl-kompakt)
//   data-straenge="5"        Stränge     data-strich="1"   Länge der Fasern     data-staerke="1"  Deckkraft
//   data-orange="0.05"       Anteil Signalorange               data-seed="7"   Zufall (wiederholbar)
//   data-tempo="1"           Geschwindigkeit (1 ≈ 40 px/s)     data-zeiger="1" Fasern weichen dem Zeiger aus
//   data-linien="4"          statt Fasern wenige klare Lichtlinien mit Lichtpulsen (data-pulse)
//   data-ziel="#id"          der Strom läuft in diesem Element zusammen (Bahn endet dort, Breite → 0)
//   data-start="#id"         die Bahn beginnt in diesem Element (z. B. ein Strom, der aus einem Knopf weiterläuft)
//   data-sammeln="1"         der Strom steht zuerst offen und zieht sich erst mit sammeln(ms) im Ziel zusammen
//   data-wachsen="1"         Linien wachsen erst mit wachsen(ms) vom Anfang bis ins Ziel
//   data-hell="1"            auf Papier: Tinte statt Licht
//   data-zwilling="id"       gleiche Bahn, gleicher Zufall und gleiche Bewegung wie der Canvas mit dieser id (anderer Ton)
//   data-umlauf="rx,ry,°"    geschlossene, geneigte Ellipse um die Mitte (Halbachsen in Anteilen von Breite und Höhe);
//                            data-seite="hinten|vorn" zeichnet nur den hinteren bzw. vorderen Bogen (zwei Ebenen)
//   data-nur-fluege="1"      Zwilling, der nur Flüge zeichnet (Ebene über anderen Elementen)
//   data-leise="sel, …"      über diesen Elementen (Text) leuchtet der Strom nur gedämpft (data-leise-anteil, Standard 0.35)
// Leistung: eine gemeinsame Schleife (requestAnimationFrame) nur für sichtbare Flächen, angehalten bei verborgenem Tab
// und mit dem Schalter „Bewegung anhalten“; je Faser ein drawImage eines vorgezeichneten Strichs (mit Schein); höchstens
// 1,5-fache Pixeldichte und 2 Millionen Pixel je Fläche; Speicher (Bildpuffer) nur für Flächen in der Nähe des Fensters
// (eine Fensterhöhe davor und danach), weiter weg wird er freigegeben; die ruhigen Grundlinien der Lichtlinien werden
// vor dem Sichtbarwerden in Leerlaufzeit vorgezeichnet (ohne Schatten-Unschärfe); auf schwachen Geräten halbe
// Faserzahl und 30 Bilder je Sekunde. Bei „Bewegung reduzieren“ und „Daten sparen“ ein einziges Standbild.

const NACHT = { himmel: [143, 176, 255], blau: [58, 107, 234], weiss: [235, 242, 255], signal: [255, 138, 94] };
const PAPIER = { himmel: [92, 132, 236], blau: [58, 107, 234], weiss: [40, 80, 196], signal: [214, 104, 62] };
const FARBEN = ["signal", "weiss", "himmel", "blau"];
const N = 720; // Stützpunkte der Bahn
const DPR_MAX = 1.5; // Pixeldichte der Flächen höchstens 1,5 (Licht und Tinte sind weich, mehr sieht man nicht)
const FLAECHE_MAX = 2e6; // Bildpunkte je Fläche höchstens (Speicher: 4 Byte je Bildpunkt)
const SPRITE_L = 160; // Länge des vorgezeichneten Strichs (px)
const SPRITE_H = 24;
const SPRITE_LINIE = 2.4; // Strichstärke im Sprite

const bewegungAus = window.matchMedia("(prefers-reduced-motion: reduce)");
const sparen = Boolean(navigator.connection?.saveData);
const schwach = (navigator.hardwareConcurrency || 8) <= 4 || (navigator.deviceMemory || 8) <= 4;
const kompaktMq = window.matchMedia("(max-width: 1023px), (max-height: 719px)");

function zufall(seed) {
  let s = seed >>> 0 || 1;
  return () => {
    s ^= s << 13;
    s >>>= 0;
    s ^= s >> 17;
    s ^= s << 5;
    s >>>= 0;
    return (s % 1000003) / 1000003;
  };
}

function gauss(r) {
  let u = 0;
  let v = 0;
  while (u === 0) u = r();
  while (v === 0) v = r();
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
}

// Catmull-Rom durch die Punkte, gleichmäßig nach Bogenlänge abgetastet; dazu die Normale je Punkt
function bahn(punkte) {
  const p = [punkte[0], ...punkte, punkte[punkte.length - 1]];
  const roh = [];
  for (let i = 1; i < p.length - 2; i++) {
    for (let k = 0; k < 40; k++) {
      const t = k / 40;
      const t2 = t * t;
      const t3 = t2 * t;
      const f = (a, b, c, d) => 0.5 * (2 * b + (-a + c) * t + (2 * a - 5 * b + 4 * c - d) * t2 + (-a + 3 * b - 3 * c + d) * t3);
      roh.push([f(p[i - 1][0], p[i][0], p[i + 1][0], p[i + 2][0]), f(p[i - 1][1], p[i][1], p[i + 1][1], p[i + 2][1])]);
    }
  }
  roh.push(p[p.length - 2]);
  return abtasten(roh);
}

// Gleichmäßig nach Bogenlänge abgetastet (N + 1 Punkte), mit Normalen; tiefe (optional) wird mit abgetastet
function abtasten(roh, tiefeRoh) {
  const len = [0];
  for (let i = 1; i < roh.length; i++) len.push(len[i - 1] + Math.hypot(roh[i][0] - roh[i - 1][0], roh[i][1] - roh[i - 1][1]));
  const gesamt = len[len.length - 1] || 1;
  const x = new Float32Array(N + 1);
  const y = new Float32Array(N + 1);
  const t = new Float32Array(N + 1);
  let j = 0;
  for (let k = 0; k <= N; k++) {
    const z = (k / N) * gesamt;
    while (j < len.length - 2 && len[j + 1] < z) j++;
    const a = (z - len[j]) / (len[j + 1] - len[j] || 1);
    x[k] = roh[j][0] + (roh[j + 1][0] - roh[j][0]) * a;
    y[k] = roh[j][1] + (roh[j + 1][1] - roh[j][1]) * a;
    if (tiefeRoh) t[k] = tiefeRoh[j] + (tiefeRoh[j + 1] - tiefeRoh[j]) * a;
  }
  const nx = new Float32Array(N + 1);
  const ny = new Float32Array(N + 1);
  for (let k = 0; k <= N; k++) {
    const a = Math.max(0, k - 2);
    const b = Math.min(N, k + 2);
    const tx = x[b] - x[a];
    const ty = y[b] - y[a];
    const tl = Math.hypot(tx, ty) || 1;
    nx[k] = -ty / tl;
    ny[k] = tx / tl;
  }
  return { x, y, nx, ny, gesamt, t };
}

// Umlaufbahn: Ellipse um (cx, cy), um phi geneigt; Tiefe = sin θ (+1 vorn unten, −1 hinten oben)
function ellipse(cx, cy, a, b, phi) {
  const roh = [];
  const tiefe = [];
  const c = Math.cos(phi);
  const s = Math.sin(phi);
  for (let k = 0; k <= 1440; k++) {
    const th = (k / 1440) * 6.2832;
    const ex = a * Math.cos(th);
    const ey = b * Math.sin(th);
    roh.push([cx + ex * c - ey * s, cy + ex * s + ey * c]);
    tiefe.push(Math.sin(th));
  }
  return abtasten(roh, tiefe);
}

// Vorgezeichnete Striche: Spur von hinten (durchsichtig) nach vorn (hell), vorn ein Lichtkopf; auf der Nacht mit Schein
const spriteCache = new Map();
function sprite(farbe, hell) {
  const key = `${farbe.join()}|${hell}`;
  if (spriteCache.has(key)) return spriteCache.get(key);
  const c = document.createElement("canvas");
  const s = 2; // in doppelter Auflösung vorzeichnen
  c.width = SPRITE_L * s;
  c.height = SPRITE_H * s;
  const g = c.getContext("2d");
  g.scale(s, s);
  const [R, G, B] = farbe;
  const m = SPRITE_H / 2;
  const grad = g.createLinearGradient(6, 0, SPRITE_L - 6, 0);
  grad.addColorStop(0, `rgba(${R},${G},${B},0)`);
  grad.addColorStop(0.55, `rgba(${R},${G},${B},0.35)`);
  grad.addColorStop(1, `rgba(${R},${G},${B},1)`);
  if (!hell) {
    g.shadowColor = `rgba(${R},${G},${B},0.9)`;
    g.shadowBlur = 7;
  }
  g.strokeStyle = grad;
  g.lineWidth = SPRITE_LINIE;
  g.lineCap = "round";
  g.beginPath();
  g.moveTo(6, m);
  g.lineTo(SPRITE_L - 7, m);
  g.stroke();
  if (!hell) {
    g.shadowBlur = 9;
    g.fillStyle = `rgba(${Math.min(255, R + 70)},${Math.min(255, G + 60)},${Math.min(255, B + 40)},0.95)`;
    g.beginPath();
    g.arc(SPRITE_L - 7, m, SPRITE_LINIE * 0.75, 0, 6.2832);
    g.fill();
  }
  spriteCache.set(key, c);
  return c;
}

const alle = new Set();
let aktiv = new Set();
let ruhig = false;
let schleife = 0;
let letzte = 0;
let zeit = 0;
let zeigerX = -1e5;
let zeigerY = -1e5;
let zeigerAktiv = false;

class Fluss {
  constructor(canvas) {
    this.cv = canvas;
    this.ctx = canvas.getContext("2d", { alpha: true });
    this.zwillinge = [];
    this.fluege = [];
    this.uebergaenge = [];
    this.bereit = false;
    const d = canvas.dataset;
    // Zusammenziehen und Wachsen (Finale): ohne Bewegung gleich im Endstand
    this.zug = d.sammeln && bewegt() ? 0 : 1;
    this.wuchs = d.wachsen && bewegt() ? 0 : 1;
    if (d.zwilling) {
      const quelle = document.getElementById(d.zwilling);
      this.quelle = quelle && flussVon(quelle);
      if (this.quelle) {
        this.quelle.zwillinge.push(this);
        this.d = this.quelle.cv.dataset;
      }
    }
    this.d ??= d;
    this.hell = d.hell === "1";
    this.seite = d.seite;
    this.nurFluege = d.nurFluege === "1";
    this.zeiger = d.zeiger === "1";
    this.farben = this.hell ? PAPIER : NACHT;
    this.sprites = FARBEN.map((f) => sprite(this.farben[f], this.hell));
    this.leiseAnteil = Number(d.leiseAnteil || 0.35);
    this.nah = false;
    this.messen();
  }

  // Bildpuffer nur in der Nähe des Fensters (sonst 0 × 0, gibt den Speicher frei)
  puffer() {
    const cv = this.cv;
    const bw = this.nah && this.w ? Math.round(this.w * this.dpr) : 0;
    const bh = this.nah && this.h ? Math.round(this.h * this.dpr) : 0;
    if (cv.width !== bw || cv.height !== bh) {
      cv.width = bw;
      cv.height = bh;
      this.grund = null;
      this.maske = null;
      this.leer = false;
    }
  }

  // Textflächen, über denen der Strom gedämpft leuchtet (in Koordinaten der Fläche)
  leiseMessen() {
    const sel = this.cv.dataset.leise;
    this.leiseRects = [];
    if (!sel) return;
    const c = this.cv.getBoundingClientRect();
    for (const el of document.querySelectorAll(sel)) {
      const r = el.getBoundingClientRect();
      if (r.width && r.height) this.leiseRects.push([r.left - c.left, r.top - c.top, r.right - c.left, r.bottom - c.top]);
    }
  }

  // 1 außerhalb, leiseAnteil innerhalb der Textflächen, mit 24 px weichem Rand
  leise(x, y) {
    let m = 1;
    for (const [l, t, r, b] of this.leiseRects) {
      const dx = Math.max(l - x, 0, x - r);
      const dy = Math.max(t - y, 0, y - b);
      const d = Math.hypot(dx, dy);
      if (d < 24) m = Math.min(m, this.leiseAnteil + (1 - this.leiseAnteil) * (d / 24));
    }
    return m;
  }

  messen() {
    const cv = this.cv;
    const w = cv.clientWidth;
    const h = cv.clientHeight;
    if (!w || !h) {
      this.bereit = false;
      return;
    }
    let dpr = Math.min(window.devicePixelRatio || 1, DPR_MAX);
    if (w * h * dpr * dpr > FLAECHE_MAX) dpr = Math.max(0.75, Math.sqrt(FLAECHE_MAX / (w * h)));
    this.dpr = dpr;
    this.w = w;
    this.h = h;
    this.grund = null;
    this.puffer();
    this.leiseMessen();
    if (this.quelle) {
      this.bereit = this.quelle.bereit;
      return;
    }
    const d = this.d;
    const kompakt = kompaktMq.matches;
    if (d.umlauf) {
      const [rx, ry, kipp] = d.umlauf.split(",").map(Number);
      this.umlauf = true;
      this.ziel = null;
      this.bahn = ellipse(w / 2, h / 2, rx * w, ry * h, (kipp * Math.PI) / 180);
      this.breite = Number(d.breite || 0.04) * h;
      this.aufbauen(kompakt);
      this.bereit = true;
      for (const z of this.zwillinge) z.messen();
      return;
    }
    const pfadText = (kompakt && d.pfadKompakt) || d.pfad || "0,0.6 0.5,0.55 1,0.6";
    let pkt = pfadText.trim().split(/\s+/).map((s) => s.split(",").map(Number));
    // Ziel und Start: Die Bahn endet im Element (z. B. im Punkt hinter „Ort“) bzw. beginnt darin. Entlang der Hauptachse
    // der Bahn wird gestreckt, quer dazu verschoben (der Versatz wächst mit dem Weg)
    this.ziel = null;
    const c = cv.getBoundingClientRect();
    const anker = (sel) => {
      const el = sel && document.querySelector(sel);
      if (!el) return null;
      const r = el.getBoundingClientRect();
      return [(r.left + r.width / 2 - c.left) / w, (r.top + r.height / 2 - c.top) / h];
    };
    const za = anker(d.ziel);
    const sa = anker(d.start);
    if (za || sa) {
      const [x0, y0] = pkt[0];
      const [xl, yl] = pkt[pkt.length - 1];
      const [X0, Y0] = sa ?? [x0, y0];
      const [XL, YL] = za ?? [xl, yl];
      const quer = Math.abs(xl - x0) >= Math.abs(yl - y0);
      pkt = pkt.map(([x, y]) => {
        if (quer) {
          const t = (x - x0) / (xl - x0 || 1);
          return [X0 + t * (XL - X0), y + (1 - t) * (Y0 - y0) + t * (YL - yl)];
        }
        const t = (y - y0) / (yl - y0 || 1);
        return [x + (1 - t) * (X0 - x0) + t * (XL - xl), Y0 + t * (YL - Y0)];
      });
      if (za) this.ziel = [za[0] * w, za[1] * h];
    }
    this.bahn = bahn(pkt.map(([x, y]) => [x * w, y * h]));
    this.breite = Number((kompakt && d.breiteKompakt) || d.breite || 0.04) * h;
    this.aufbauen(kompakt);
    this.bereit = true;
    for (const z of this.zwillinge) z.messen();
  }

  aufbauen(kompakt) {
    const d = this.d;
    const r = zufall(Number(d.seed || 7));
    this.r = r;
    const straenge = Number(d.straenge || 5);
    this.straenge = [];
    for (let s = 0; s < straenge; s++) {
      this.straenge.push({ off: (r() * 2 - 1) * 0.85, amp: 0.15 + r() * 0.35, frq: 1.2 + r() * 3, ph: r() * 6.28, hell: 0.55 + r() * 0.45, om: (r() * 2 - 1) * 0.25 });
    }
    const orange = Number(d.orange || 0.04);
    const strich = Number(d.strich || 1);
    const tempo = Number(d.tempo || 1);
    this.staerke = Number(d.staerke || 1);
    this.zielModus = Boolean(this.ziel);
    if (d.linien) {
      this.linien = [];
      const n = Number(d.linien);
      const pulse = Number(d.pulse || 2);
      for (let i = 0; i < n; i++) {
        const q0 = n === 1 ? 0 : ((i / (n - 1)) * 2 - 1) * 0.75;
        const farbe = i === Math.floor(n / 2) && orange > 0 ? 0 : i % 2 ? 2 : 1;
        const linie = { q0, ph: r() * 6.28, frq: 0.8 + r() * 1.6, amp: 0.12 + r() * 0.18, farbe, dicke: (this.hell ? 1.1 : 1.5 + r() * 0.9) * Number(d.dicke || 1), pulse: [] };
        for (let p = 0; p < pulse; p++) linie.pulse.push({ u: r(), v: (0.07 + r() * 0.05) * tempo });
        this.linien.push(linie);
      }
      this.grund = null;
      return;
    }
    this.linien = null;
    const flaeche = Math.min(1, ((this.w * this.h) / (1440 * 900)) * 1.2 + 0.2);
    let anzahl = Number((kompakt && d.anzahlKompakt) || d.anzahl || 400);
    if (!kompakt && !this.umlauf) anzahl *= flaeche;
    if (schwach) anzahl *= 0.5;
    anzahl = Math.round(anzahl);
    const L = this.bahn.gesamt;
    this.fasern = [];
    for (let i = 0; i < anzahl; i++) {
      const st = this.straenge[Math.floor(r() * straenge)];
      const z = r();
      const laenge = (46 + r() * 150) * (0.45 + z * 0.9) * strich;
      const q = r();
      const farbe = q < orange ? 0 : q < orange + 0.12 ? 1 : q < 0.6 ? 2 : 3;
      this.fasern.push({
        st,
        z,
        laenge,
        s: r() * (L + laenge * 2) - laenge,
        v: (26 + z * 28) * tempo * (0.85 + r() * 0.3),
        jit: gauss(r) * 0.14,
        farbe,
        breite: (this.hell ? 0.32 + z * 0.55 : 0.4 + z * 0.95) * 2,
      });
    }
    this.fasern.sort((a, b) => a.z - b.z);
  }

  // Ort auf der Bahn bei Bogenlänge s (px) mit Querversatz q (in Breiten); ohne Zeiger [x, y, 1]
  ort(s, q, aus) {
    const b = this.bahn;
    const u = this.umlauf ? (((s % b.gesamt) + b.gesamt) % b.gesamt) / b.gesamt : Math.max(0, Math.min(1, s / b.gesamt));
    const k = Math.round(u * N);
    aus[3] = b.t[k];
    // Im Ziel läuft der Strom zusammen; solange er sich noch sammelt (zug < 1), steht sein Ende offen
    const w = this.zielModus ? this.breite * (Math.pow(1 - u, 1.25) * 1.12 + 0.01 + (1 - this.zug) * Math.pow(u, 1.4) * 1.6) : this.breite;
    let x = b.x[k] + b.nx[k] * q * w;
    let y = b.y[k] + b.ny[k] * q * w;
    let licht = 1;
    if (zeigerAktiv && this.zeiger) {
      const zr = Math.max(60, Math.min(this.h, 900) * 0.11);
      const ex = x - this.zx;
      const ey = y - this.zy;
      const e = Math.hypot(ex, ey);
      if (e < zr * 2.4) {
        const kraft = Math.exp(-((e / zr) ** 2)) * zr * 0.75;
        x += (ex / (e || 1)) * kraft;
        y += (ey / (e || 1)) * kraft;
        licht = 1 + 1.4 * Math.exp(-((e / (zr * 1.35)) ** 2));
      }
    }
    aus[0] = x;
    aus[1] = y;
    aus[2] = licht;
    return u;
  }

  schritt(dt) {
    if (!this.bereit || this.quelle) return;
    if (this.uebergaenge.length) {
      const jetzt = performance.now();
      this.uebergaenge = this.uebergaenge.filter((x) => {
        const k = Math.min(1, (jetzt - x.t0) / x.dauer);
        this[x.art] = x.von + (1 - x.von) * (1 - (1 - k) ** 3);
        if (k < 1) return true;
        x.fertig();
        return false;
      });
    }
    const L = this.bahn.gesamt;
    if (this.fasern) {
      for (const f of this.fasern) {
        f.s += f.v * dt;
        if (this.umlauf) {
          if (f.s > L) f.s -= L;
        } else if (f.s - f.laenge > L) f.s = -f.laenge * (0.2 + this.r() * 0.8);
      }
    }
    if (this.linien) {
      for (const l of this.linien) for (const p of l.pulse) p.u = (p.u + p.v * dt) % 1.15;
    }
  }

  zeichnen() {
    const quelle = this.quelle ?? this;
    if (!quelle.bereit || !this.w || !this.cv.width) return;
    const ctx = this.ctx;
    const dpr = this.dpr;
    if (this.nurFluege && !this.fluege.length && this.leer) return;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, this.cv.width, this.cv.height);
    this.leer = !this.fluege.length;
    if (this.nurFluege) {
      this.fluegeZeichnen(ctx, dpr);
      ctx.globalAlpha = 1;
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      return;
    }
    if (this.zeiger && zeigerAktiv) {
      const c = this.cv.getBoundingClientRect();
      quelle.zx = zeigerX - c.left;
      quelle.zy = zeigerY - c.top;
    }
    ctx.globalCompositeOperation = this.hell ? "source-over" : "lighter";
    if (quelle.linien) this.linienZeichnen(quelle, ctx, dpr);
    else if (quelle.umlauf) this.umlaufZeichnen(quelle, ctx, dpr);
    else this.fasernZeichnen(quelle, ctx, dpr);
    this.fluegeZeichnen(ctx, dpr);
    ctx.globalAlpha = 1;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
  }

  fasernZeichnen(q, ctx, dpr) {
    const kopf = [0, 0, 1];
    const schwanz = [0, 0, 1];
    const t = zeit;
    const faktor = this.hell ? 0.75 : 1;
    const staerke = q.staerke;
    // Dämpfung über Text nur in Ruhe (in der Kamerafahrt fliegt die Überschrift davon)
    const leise = this.leiseRects.length > 0 && !this.cv.closest(".ist-faehrt");
    for (const f of q.fasern) {
      const st = f.st;
      const sk = f.s;
      const ss = f.s - f.laenge;
      const L = q.bahn.gesamt;
      if (sk < 0 || ss > L) continue;
      const uk = Math.max(0, Math.min(1, sk / L));
      const qq = st.off + Math.sin(uk * st.frq * 6.28 + st.ph + t * st.om) * st.amp * 0.6 + f.jit;
      q.ort(sk, qq, kopf);
      const us = Math.max(0, Math.min(1, ss / L));
      const qs = st.off + Math.sin(us * st.frq * 6.28 + st.ph + t * st.om) * st.amp * 0.6 + f.jit;
      q.ort(Math.max(0, ss), qs, schwanz);
      let dx = kopf[0] - schwanz[0];
      let dy = kopf[1] - schwanz[1];
      let len = Math.hypot(dx, dy);
      if (len < 2) continue;
      // Vom Zeiger verdrängte Fasern nicht zu langen Strichen dehnen
      if (len > f.laenge * 1.2) {
        const k = (f.laenge * 1.2) / len;
        dx *= k;
        dy *= k;
        len *= k;
        schwanz[0] = kopf[0] - dx;
        schwanz[1] = kopf[1] - dy;
      }
      const mitte = Math.exp(-((qq / 1.05) ** 2) * 1.1);
      const rand = Math.min(1, Math.min(uk, q.zielModus ? 1 : 1 - uk) * 7 + 0.2);
      const grund = st.hell * (0.35 + 0.65 * mitte) * rand * (q.zielModus ? 0.55 + 0.6 * uk : 1);
      let al = Math.min(1, grund * staerke * (0.3 + f.z * 0.8) * Math.max(kopf[2], schwanz[2]) * faktor * (0.45 + 0.55 * q.zug));
      if (al < 0.012) continue;
      if (leise) al *= this.leise((kopf[0] + schwanz[0]) / 2, (kopf[1] + schwanz[1]) / 2);
      const cos = dx / len;
      const sin = dy / len;
      const sx = len / (SPRITE_L - 13);
      const sy = f.breite / SPRITE_LINIE;
      ctx.globalAlpha = al;
      ctx.setTransform(dpr * cos * sx, dpr * sin * sx, -dpr * sin * sy, dpr * cos * sy, dpr * (schwanz[0] - cos * 6 * sx), dpr * (schwanz[1] - sin * 6 * sx));
      ctx.drawImage(this.sprites[f.farbe], 0, -SPRITE_H / 2, SPRITE_L, SPRITE_H);
    }
  }

  umlaufZeichnen(q, ctx, dpr) {
    const a = [0, 0, 1, 0];
    const b = [0, 0, 1, 0];
    const vorn = this.seite !== "hinten";
    const t = zeit;
    const S = SPRITE_L - 13;
    for (const f of q.fasern) {
      const st = f.st;
      const n = Math.max(1, Math.min(5, Math.ceil(f.laenge / 34)));
      const qq = st.off + Math.sin(st.ph + t * st.om) * st.amp * 0.6 + f.jit;
      const mitte = Math.exp(-((qq / 1.05) ** 2) * 1.1);
      const grund = q.staerke * st.hell * (0.35 + 0.65 * mitte) * (0.3 + f.z * 0.8);
      const s0 = f.s - f.laenge;
      q.ort(s0, qq, a);
      for (let i = 1; i <= n; i++) {
        q.ort(s0 + (f.laenge * i) / n, qq, b);
        const tiefe = (a[3] + b[3]) / 2;
        const dx = b[0] - a[0];
        const dy = b[1] - a[1];
        const len = Math.hypot(dx, dy);
        if (tiefe >= 0 === vorn && len > 0.5) {
          const v = (tiefe + 1) / 2;
          const al = Math.min(1, grund * (0.4 + 0.6 * v));
          if (al > 0.012) {
            const x0 = 6 + (S * (i - 1)) / n;
            const x1 = i === n ? SPRITE_L - 3 : 6 + (S * i) / n;
            const cos = dx / len;
            const sin = dy / len;
            const sy = (f.breite * (0.7 + 0.6 * v)) / SPRITE_LINIE;
            ctx.globalAlpha = al;
            ctx.setTransform(dpr * cos, dpr * sin, -dpr * sin * sy, dpr * cos * sy, dpr * a[0], dpr * a[1]);
            ctx.drawImage(this.sprites[f.farbe], x0 * 2, 0, (x1 - x0) * 2, SPRITE_H * 2, 0, -SPRITE_H / 2, (len * (x1 - x0) * n) / S, SPRITE_H);
          }
        }
        a[0] = b[0];
        a[1] = b[1];
        a[3] = b[3];
      }
    }
  }

  // Ruhige Grundlinien einmal je Größe vorzeichnen: je Linie wenige Teilstriche mit eigener Deckkraft (statt 160 einzelner
  // Striche mit Schatten-Unschärfe); auf der Nacht darunter ein breiter, schwacher Strich als Schein. Läuft vor dem
  // Sichtbarwerden in Leerlaufzeit (vorbereiten), sonst beim ersten Bild.
  grundBauen(q) {
    const g = document.createElement("canvas");
    g.width = this.cv.width;
    g.height = this.cv.height;
    const gc = g.getContext("2d");
    gc.scale(this.dpr, this.dpr);
    gc.lineCap = "round";
    gc.lineJoin = "round";
    gc.globalCompositeOperation = this.hell ? "source-over" : "lighter";
    const p = [0, 0, 1];
    const L = q.bahn.gesamt;
    const SCHRITTE = 160;
    const TEIL = 8;
    for (const l of q.linien) {
      const [R, G, B] = this.farben[FARBEN[l.farbe]];
      const pkt = [];
      for (let s = 0; s <= SCHRITTE; s++) {
        const u = s / SCHRITTE;
        q.ort(u * L, l.q0 + Math.sin(u * l.frq * 6.28 + l.ph) * l.amp, p);
        pkt.push([p[0], p[1], u]);
      }
      for (const schein of this.hell ? [false] : [true, false]) {
        for (let i = 0; i < SCHRITTE; i += TEIL) {
          const u = pkt[Math.min(SCHRITTE, i + TEIL / 2)][2];
          const rand = Math.min(1, u * 7 + 0.2);
          const al = Math.min(1, q.staerke * 0.34 * rand * (0.5 + 0.5 * u));
          gc.strokeStyle = `rgba(${R},${G},${B},${schein ? al * 0.22 : al})`;
          gc.lineWidth = schein ? l.dicke * 4.5 : l.dicke;
          gc.beginPath();
          gc.moveTo(pkt[i][0], pkt[i][1]);
          for (let k = i + 1; k <= Math.min(SCHRITTE, i + TEIL); k++) gc.lineTo(pkt[k][0], pkt[k][1]);
          gc.stroke();
        }
      }
    }
    q.grund = g;
    q.grundFuer = this;
  }

  // In Leerlaufzeit vorbereiten (Fläche in der Nähe des Fensters, noch nicht sichtbar)
  vorbereiten() {
    const q = this.quelle ?? this;
    if (!q.bereit || !q.linien || !this.cv.width || (q.grund && q.grundFuer === this)) return;
    if (q.grund && (q.grund.width !== this.cv.width || q.grund.height !== this.cv.height)) q.grund = null;
    if (!q.grund) this.grundBauen(q);
  }

  linienZeichnen(q, ctx, dpr) {
    if (!q.grund || q.grundFuer !== this || q.grund.width !== this.cv.width) this.grundBauen(q);
    ctx.globalAlpha = 1;
    const a = [0, 0, 1];
    const b = [0, 0, 1];
    const L = q.bahn.gesamt;
    if (q.wuchs < 1) {
      this.wachsenZeichnen(q, ctx, dpr, a, b);
      return;
    }
    ctx.drawImage(q.grund, 0, 0);
    for (const l of q.linien) {
      for (const p of l.pulse) {
        const uk = Math.min(1, p.u);
        const us = Math.max(0, uk - 0.09);
        if (uk <= 0.001) continue;
        q.ort(uk * L, l.q0 + Math.sin(uk * l.frq * 6.28 + l.ph) * l.amp, a);
        q.ort(us * L, l.q0 + Math.sin(us * l.frq * 6.28 + l.ph) * l.amp, b);
        const dx = a[0] - b[0];
        const dy = a[1] - b[1];
        const len = Math.hypot(dx, dy);
        if (len < 2) continue;
        const ende = p.u > 1 ? Math.max(0, 1 - (p.u - 1) / 0.15) : 1;
        ctx.globalAlpha = Math.min(1, q.staerke * 0.95 * Math.min(1, uk * 6) * ende);
        const cos = dx / len;
        const sin = dy / len;
        const sx = len / (SPRITE_L - 13);
        const sy = (l.dicke * 1.6) / SPRITE_LINIE;
        ctx.setTransform(dpr * cos * sx, dpr * sin * sx, -dpr * sin * sy, dpr * cos * sy, dpr * (b[0] - cos * 6 * sx), dpr * (b[1] - sin * 6 * sx));
        ctx.drawImage(this.sprites[l.farbe], 0, -SPRITE_H / 2, SPRITE_L, SPRITE_H);
      }
    }
  }

  // Wachsen: die vorgezeichneten Linien nur bis zur Spitze (Maske: ein breiter Strich die Bahn entlang), dort je Linie ein
  // Lichtkopf
  wachsenZeichnen(q, ctx, dpr, a, b) {
    if (q.wuchs <= 0.002) return;
    this.maske ??= document.createElement("canvas");
    const m = this.maske;
    if (m.width !== this.cv.width || m.height !== this.cv.height) {
      m.width = this.cv.width;
      m.height = this.cv.height;
    }
    const mc = m.getContext("2d");
    const L = q.bahn.gesamt;
    mc.setTransform(1, 0, 0, 1, 0, 0);
    mc.globalCompositeOperation = "source-over";
    mc.clearRect(0, 0, m.width, m.height);
    mc.setTransform(dpr, 0, 0, dpr, 0, 0);
    mc.lineCap = "round";
    mc.lineJoin = "round";
    mc.lineWidth = q.breite * 2.4 + 16;
    mc.strokeStyle = "#000";
    mc.beginPath();
    const n = Math.max(2, Math.round(120 * q.wuchs));
    for (let i = 0; i <= n; i++) {
      q.ort(((i / n) * q.wuchs - 0.004) * L, 0, a);
      if (i) mc.lineTo(a[0], a[1]);
      else mc.moveTo(a[0], a[1]);
    }
    mc.stroke();
    mc.setTransform(1, 0, 0, 1, 0, 0);
    mc.globalCompositeOperation = "source-in";
    mc.drawImage(q.grund, 0, 0);
    ctx.globalAlpha = 1;
    ctx.drawImage(m, 0, 0);
    for (const l of q.linien) {
      const uk = q.wuchs;
      const us = Math.max(0, uk - 0.1);
      q.ort(uk * L, l.q0 + Math.sin(uk * l.frq * 6.28 + l.ph) * l.amp, a);
      q.ort(us * L, l.q0 + Math.sin(us * l.frq * 6.28 + l.ph) * l.amp, b);
      const dx = a[0] - b[0];
      const dy = a[1] - b[1];
      const len = Math.hypot(dx, dy);
      if (len < 2) continue;
      const cos = dx / len;
      const sin = dy / len;
      const sx = len / (SPRITE_L - 13);
      const sy = (l.dicke * 1.8) / SPRITE_LINIE;
      ctx.globalAlpha = Math.min(1, q.staerke);
      ctx.setTransform(dpr * cos * sx, dpr * sin * sx, -dpr * sin * sy, dpr * cos * sy, dpr * (b[0] - cos * 6 * sx), dpr * (b[1] - sin * 6 * sx));
      ctx.drawImage(this.sprites[l.farbe], 0, -SPRITE_H / 2, SPRITE_L, SPRITE_H);
    }
  }

  // Zusammenziehen (zug) bzw. Wachsen (wuchs) von 0 auf 1 in dauer ms, weich auslaufend; ohne Bewegung sofort
  uebergang(art, dauer) {
    const q = this.quelle ?? this;
    return new Promise((fertig) => {
      q.uebergaenge = q.uebergaenge.filter((x) => (x.art === art ? (x.fertig(), false) : true));
      if (!dauer || !q.bereit || !bewegt()) {
        q[art] = 1;
        this.zeichnen();
        fertig();
        return;
      }
      q.uebergaenge.push({ art, von: q[art], t0: performance.now(), dauer, fertig });
      starten();
    });
  }

  sammeln(dauer) {
    return this.uebergang("zug", dauer);
  }

  wachsen(dauer) {
    return this.uebergang("wuchs", dauer);
  }

  // Ein einzelner Lichtpunkt fliegt die Bahn entlang zu einem Element (z. B. in einen freien Platz der Ampel)
  flug(ziel, { dauer = 900, von = 0.12 } = {}) {
    const q = this.quelle ?? this;
    return new Promise((fertig) => {
      if (!q.bereit || !ziel || !bewegt()) {
        fertig();
        return;
      }
      this.fluege.push({ ziel, dauer, von, t0: performance.now(), fertig });
      starten();
    });
  }

  // Komet: ein Lichtkopf (weißer Kern, Schein in Signalorange als Gegenfarbe zum Blau der Ampel) mit einem Schweif von
  // rund 260 px aus Tinte, der den Strom entlang läuft; zuletzt biegt er ins Ziel. Der Ablauf hängt nur an der Zeit.
  fluegeZeichnen(ctx, dpr) {
    if (!this.fluege.length) return;
    const q = this.quelle ?? this;
    const jetzt = performance.now();
    const c = this.cv.getBoundingClientRect();
    const p = [0, 0, 1];
    const L = q.bahn.gesamt;
    const [bR, bG, bB] = this.farben.blau;
    const [sR, sG, sB] = NACHT.signal;
    const SCHWEIF = 260;
    const TEILE = 40;
    this.fluege = this.fluege.filter((f) => {
      const k = Math.min(1, (jetzt - f.t0) / f.dauer);
      const r = f.ziel.getBoundingClientRect();
      const zx = r.left + r.width / 2 - c.left;
      const zy = r.top + r.height / 2 - c.top;
      const e = k < 0.5 ? 4 * k ** 3 : 1 - (-2 * k + 2) ** 3 / 2;
      const sKopf = (f.von + (1 - f.von) * Math.min(1, e * 1.12)) * L;
      const hop = Math.max(0, (e - 0.66) / 0.34);
      const m = hop * hop * (3 - 2 * hop);
      const laenge = Math.min(SCHWEIF, sKopf - f.von * L) * (1 - 0.85 * m);
      const einblenden = Math.min(1, k * 6);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.globalCompositeOperation = "source-over";
      // Schweif: von hinten (dünn, durchsichtig) nach vorn als durchgehender Strich aus kurzen Stücken; jeder Punkt biegt
      // anteilig mit ins Ziel
      const punkte = [];
      for (let j = TEILE; j >= 0; j--) {
        const a = j / TEILE;
        q.ort(Math.max(0, sKopf - laenge * a), 0, p);
        const mm = m * (1 - a * 0.6);
        punkte.push([p[0] + (zx - p[0]) * mm, p[1] + (zy - p[1]) * mm, 1 - a]);
      }
      ctx.lineCap = "round";
      for (let j = 1; j < punkte.length; j++) {
        const [x0, y0] = punkte[j - 1];
        const [x1, y1, v] = punkte[j];
        ctx.globalAlpha = einblenden * 0.7 * v ** 1.3;
        ctx.strokeStyle = v > 0.75 ? `rgb(${sR},${sG},${sB})` : `rgb(${bR},${bG},${bB})`;
        ctx.lineWidth = 1 + 8 * v ** 1.2;
        ctx.beginPath();
        ctx.moveTo(x0, y0);
        ctx.lineTo(x1, y1);
        ctx.stroke();
      }
      // Kopf: Schein (30 px) und Kern
      q.ort(sKopf, 0, p);
      const x = p[0] + (zx - p[0]) * m;
      const y = p[1] + (zy - p[1]) * m;
      ctx.globalAlpha = einblenden;
      const g = ctx.createRadialGradient(x, y, 0, x, y, 30);
      g.addColorStop(0, "rgba(255,255,255,1)");
      g.addColorStop(0.22, `rgba(${sR},${sG},${sB},0.95)`);
      g.addColorStop(0.55, `rgba(${sR},${sG},${sB},0.32)`);
      g.addColorStop(1, `rgba(${sR},${sG},${sB},0)`);
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.arc(x, y, 30, 0, 6.2832);
      ctx.fill();
      if (k >= 1) {
        f.fertig();
        return false;
      }
      return true;
    });
  }
}

const register = new WeakMap();
function flussVon(cv) {
  if (!register.has(cv)) {
    const f = new Fluss(cv);
    register.set(cv, f);
    alle.add(f);
  }
  return register.get(cv);
}

const bewegt = () => !bewegungAus.matches && !sparen && !ruhig;

function bild(t) {
  schleife = 0;
  if (!bewegt() || document.hidden || !aktiv.size) return;
  const dtRoh = letzte ? (t - letzte) / 1000 : 0.016;
  // schwache Geräte: 30 Bilder je Sekunde
  if (schwach && dtRoh < 0.03) {
    schleife = requestAnimationFrame(bild);
    return;
  }
  letzte = t;
  const dt = Math.min(0.05, dtRoh);
  zeit += dt;
  for (const f of aktiv) f.schritt(dt);
  for (const f of aktiv) {
    if (f.sichtbar) f.zeichnen();
    for (const z of f.zwillinge) if (z.sichtbar) z.zeichnen();
  }
  schleife = requestAnimationFrame(bild);
}

function starten() {
  if (schleife || !bewegt() || document.hidden) return;
  letzte = 0;
  schleife = requestAnimationFrame(bild);
}

function standbild() {
  // Standbild: ein fester Moment (nach 6 s Simulation), keine Schleife; Sammeln und Wachsen im Endstand
  for (const f of alle) {
    f.uebergaenge.forEach((x) => x.fertig());
    f.uebergaenge = [];
    f.zug = 1;
    f.wuchs = 1;
    if (!f.bereit || f.quelle || f.standbildFertig) continue;
    for (let i = 0; i < 60; i++) f.schritt(0.1);
    f.standbildFertig = true;
  }
  for (const f of alle) f.zeichnen();
}

let sichtbar;
let nahIo;
const leerlauf = (fn) => (window.requestIdleCallback ? requestIdleCallback(fn, { timeout: 400 }) : setTimeout(fn, 60));
/** Startet den Lichtfluss in allen canvas[data-fluss] (oder den angegebenen). */
export function fluesseStarten(canvases = document.querySelectorAll("canvas[data-fluss]")) {
  const liste = [...canvases].filter((cv) => cv.getContext);
  // Zuerst die Quellen, dann die Zwillinge
  liste.sort((a, b) => Number(Boolean(a.dataset.zwilling)) - Number(Boolean(b.dataset.zwilling)));
  for (const cv of liste) flussVon(cv);
  sichtbar ??= new IntersectionObserver(
    (entries) => {
      for (const e of entries) {
        const f = register.get(e.target);
        if (f) f.sichtbar = e.isIntersecting;
      }
      // Aktiv ist eine Quelle, solange sie selbst oder einer ihrer Zwillinge im Bild ist (Simulation läuft weiter)
      aktiv = new Set([...alle].filter((f) => !f.quelle && (f.sichtbar || f.zwillinge.some((z) => z.sichtbar))));
      if (bewegt()) starten();
      else standbild();
    },
    { rootMargin: "100px 0px" },
  );
  for (const cv of liste) sichtbar.observe(cv);
  // Nähe (eine Fensterhöhe davor und danach): Bildpuffer anlegen und in Leerlaufzeit vorbereiten, weiter weg freigeben
  nahIo ??= new IntersectionObserver(
    (entries) => {
      for (const e of entries) {
        const f = register.get(e.target);
        if (!f || f.nah === e.isIntersecting) continue;
        f.nah = e.isIntersecting;
        f.puffer();
        if (!f.nah) continue;
        leerlauf(() => {
          f.vorbereiten();
          if (!bewegt()) f.zeichnen();
        });
      }
    },
    { rootMargin: "100% 0px" },
  );
  for (const cv of liste) nahIo.observe(cv);
  const ro = new ResizeObserver((entries) => {
    for (const e of entries) {
      const f = register.get(e.target);
      if (!f) continue;
      const w = e.target.clientWidth;
      const h = e.target.clientHeight;
      if (w === f.w && h === f.h) continue;
      f.standbildFertig = false;
      (f.quelle ?? f).messen();
      if (f.quelle) f.messen();
    }
    if (!bewegt()) standbild();
  });
  for (const cv of liste) ro.observe(cv);
  if (!bewegt()) standbild();
}

/** Zeigerlage für Flächen mit data-zeiger (Fasern weichen aus). */
window.addEventListener(
  "pointermove",
  (e) => {
    if (e.pointerType !== "mouse") return;
    zeigerX = e.clientX;
    zeigerY = e.clientY;
    zeigerAktiv = true;
  },
  { passive: true },
);
document.documentElement.addEventListener("pointerleave", () => {
  zeigerAktiv = false;
});

document.addEventListener("visibilitychange", () => {
  if (!document.hidden) starten();
});
document.addEventListener("vf:ruhe", (e) => {
  ruhig = Boolean(e.detail?.ruhig);
  if (ruhig) {
    cancelAnimationFrame(schleife);
    schleife = 0;
    for (const f of alle) {
      f.fluege.forEach((x) => x.fertig());
      f.fluege = [];
      f.uebergaenge.forEach((x) => x.fertig());
      f.uebergaenge = [];
      f.zug = 1;
      f.wuchs = 1;
      f.zeichnen();
    }
  } else starten();
});
bewegungAus.addEventListener("change", () => (bewegt() ? starten() : standbild()));
kompaktMq.addEventListener("change", () => {
  for (const f of alle) if (!f.quelle) f.messen();
  for (const f of alle) if (f.quelle) f.messen();
  if (!bewegt()) standbild();
});

/** Lichtfluss eines Canvas (für Flug und Zeiger). */
export function fluss(canvas) {
  return register.get(canvas);
}

/** Anzahl laufender Flächen (für Prüfungen). */
export function zaehler() {
  return { aktiv: aktiv.size, laeuft: Boolean(schleife), zeit };
}
