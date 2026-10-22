// VereinsFlow – Website · buehne.js (nur Startseite, als Modul): Posen der Geräte in Ruhe, Kamerafahrt in den Laptop,
// Wortwalze, magnetische Knöpfe, Lichtkanten am Telefon, Zählwerke, die Spur der Helferplanung, die Umlaufbahn um das
// Telefon, Karten unter dem Zeiger, der Lichtstreif der Finanzen, Rollen, Startlinie, Fragen (View Transition), das
// Finale und der Lichtfluss (fluss.js). Die Geräte selbst bewegt nur
// site.js (wörtlich wie bisher) – hier werden ihre Zustände (.is-rest) nur gelesen. Laufende Werte gehen per CSSOM
// (style.setProperty) an die Hüllen; keine Scroll-Listener (Wächter über IntersectionObserver, Bewegung über
// scroll-driven Animationen in site.css).
import { fluesseStarten, fluss } from "./fluss.js?v=2026102001";

const bewegungAus = window.matchMedia("(prefers-reduced-motion: reduce)");
const buehneMq = window.matchMedia("(min-width: 1024px) and (min-height: 720px) and (prefers-reduced-motion: no-preference)");
const feinMq = window.matchMedia("(hover: hover) and (pointer: fine)");
const scrollZeit = CSS.supports("animation-timeline: view()");
const canObserve = "IntersectionObserver" in window;
const $ = (s, el = document) => el.querySelector(s);
const $$ = (s, el = document) => [...el.querySelectorAll(s)];
const px = (n) => `${Math.round(n * 100) / 100}px`;

const buehne = $("[data-buehne]");
const fahrt = $("[data-fahrt]");
const kamera = $("[data-kamera]");
const kopf = $("[data-kopf]");

// ---------------------------------------------------------------------------------------------------------------
// Lichtkanten am Titanrahmen: schmale Linie genau auf der rechten Außenkante (Seite) und der linken Kante der Vorderseite,
// einmal in der Ruhelage gemessen (nicht während der Fahrt).
// ---------------------------------------------------------------------------------------------------------------
const randRechts = $('[data-randlicht="rechts"]');
const randLinks = $('[data-randlicht="links"]');
function randlichter() {
  if (!buehne || !randRechts || !randLinks) return;
  const iphone = $(".k01 .iphone");
  const seite = $(".k01 .iphone-side-r");
  const front = $(".k01 .iphone-front");
  if (!iphone || !seite || !front || buehne.classList.contains("ist-faehrt")) return;
  const b = buehne.getBoundingClientRect();
  const s = seite.getBoundingClientRect();
  const f = front.getBoundingClientRect();
  if (!s.height || !f.height) return;
  const setzen = (el, x, top, hoehe) => {
    el.style.setProperty("left", px(x - b.left - 1.25));
    el.style.setProperty("top", px(top - b.top));
    el.style.setProperty("height", px(hoehe));
    el.classList.add("ist-an");
  };
  setzen(randRechts, s.right, s.top + s.height * 0.14, s.height * 0.72);
  setzen(randLinks, f.left + 1, f.top + f.height * 0.12, f.height * 0.5);
}
function randlichterAus() {
  randRechts?.classList.remove("ist-an");
  randLinks?.classList.remove("ist-an");
}

// ---------------------------------------------------------------------------------------------------------------
// Posen: Sobald ein Gerät im Einstieg in Ruhe steht (.is-rest von site.js), dreht es sich in seine 3D-Pose (.ist-posiert,
// Übergang in site.css). Die Bewegung des Geräts selbst bleibt damit genau wie bisher.
// ---------------------------------------------------------------------------------------------------------------
const einstiegGeraete = $$(".k01 [data-geraet]");
function posieren(showcase) {
  if (showcase.classList.contains("ist-posiert")) return;
  showcase.classList.add("ist-posiert");
  showcase.closest(".geraet")?.classList.add("ist-posiert"); // Hülle: Ausgleich der Pose endet (site.css)
  if (showcase.dataset.geraet === "handy") {
    const pose = $(".pose", showcase);
    const fertig = () => randlichter();
    if (bewegungAus.matches) fertig();
    else pose?.addEventListener("transitionend", fertig, { once: true });
  }
}
for (const sc of einstiegGeraete) {
  if (sc.classList.contains("is-rest")) posieren(sc);
  new MutationObserver(() => {
    if (sc.classList.contains("is-rest")) posieren(sc);
  }).observe(sc, { attributes: true, attributeFilter: ["class"] });
}
// Ohne Bewegung gibt es kein Ende einer Animation: die Pose steht sofort (site.css), die Lichtkanten ebenso
if (bewegungAus.matches) einstiegGeraete.forEach(posieren);

// ---------------------------------------------------------------------------------------------------------------
// Kamerafahrt (ab 1024 × 720 mit Bewegung): Geometrie für die Keyframes in site.css („12a. Kamerafahrt“).
// ---------------------------------------------------------------------------------------------------------------
const titel = $(".einstieg-titel");
function offsetIn(el, vorfahr) {
  let x = 0;
  let y = 0;
  let e = el;
  while (e && e !== vorfahr) {
    x += e.offsetLeft;
    y += e.offsetTop;
    const p = e.offsetParent;
    if (p && p !== vorfahr) {
      x += p.clientLeft;
      y += p.clientTop;
    }
    e = p;
  }
  return [x, y];
}

let geometrieBereit = false;
function geometrie() {
  if (!buehne || !kamera) return;
  if (!buehneMq.matches) {
    geometrieBereit = false;
    return;
  }
  const laptop = $(".k01 .showcase-laptop");
  const bild = $(".k01 .laptop-screen picture");
  if (!laptop || !bild) return;
  const S = parseFloat(getComputedStyle(laptop).getPropertyValue("--sw")) || 1056;
  const W = buehne.clientWidth;
  const H = buehne.clientHeight;
  // Maßstab und Lage stehen nur in site.css (--u, --gx, --y0): Die Überschrift ist 104 Entwurfs-Pixel groß, das Telefon
  // steht bei (1118, 372) – daraus die Lage des Laptops bei (366, 250)
  const handy = $(".k01 .geraet-handy");
  const u = (titel && parseFloat(getComputedStyle(titel).fontSize) / 104) || Math.min(window.innerWidth / 1440, H / 900);
  const gx = handy ? handy.offsetLeft - (1118 - 64) * u : W / 2 - 656 * u;
  const y0 = handy ? handy.offsetTop - 372 * u : H / 2 - 450 * u;
  const [bx, by] = offsetIn(bild, kamera);
  const set = (k, v) => buehne.style.setProperty(k, typeof v === "number" ? px(v) : v);
  // Einstieg: Bildschirm sichtbar 640 Entwurfs-Pixel breit
  const ks0 = (640 * u) / S;
  set("--ks0", String(Math.round(ks0 * 10000) / 10000));
  set("--kx0", gx + (366 - 64) * u);
  set("--ky0", y0 + 250 * u);
  // ab 88 %: Maßstab 1, Bildschirm waagrecht mittig, ganze Pixel
  const oben = Math.round(Math.max(0.42 * (H - S / 1.6), 24));
  const kx2 = Math.round(W / 2 - S / 2 - bx);
  const ky2 = oben - Math.round(by);
  set("--kx2", kx2);
  set("--ky2", ky2);
  // bei 58 %: frontal, 0,94-fach um die Mitte des Bildschirms
  const ks1 = 0.94;
  const cx = kx2 + bx + S / 2;
  const cy = ky2 + by + S / 3.2;
  set("--ks1", String(ks1));
  set("--kx1", cx - ks1 * (bx + S / 2));
  set("--ky1", cy - ks1 * (by + S / 3.2));
  // flache Aufnahme: deckungsgleich auf dem Bildschirm (Rand oben = W/44 im flachen Bild, im Maßstab S/W = b)
  const fs = S / W;
  set("--fs", String(Math.round(fs * 100000) / 100000));
  set("--fx", kx2 + bx);
  set("--fy", ky2 + by - fs * (W / 44));
  // Überschrift: gemeinsamer Ursprung für alle Teile (sie fliegen wie ein Stück vorbei)
  if (titel) {
    const ox = titel.offsetWidth * 0.32;
    const oy = titel.offsetHeight * 0.55;
    for (const teil of $$(".w, .w-pin", titel)) {
      const [x, y] = offsetIn(teil, titel);
      teil.style.setProperty("--ox", px(ox - x));
      teil.style.setProperty("--oy", px(oy - y));
    }
  }
  geometrieBereit = true;
}

// Bilder für die Nähe: Die flache Aufnahme hat zuerst dieselbe Auswahl wie der Bildschirm (dieselbe Datei, nur eine
// Anfrage). Sobald die Fahrt beginnt, wird genau eine große Fassung (fensterbreit: 1440 bzw. 2880 px) geladen und
// dekodiert und erst dann an beiden Bildern eingesetzt – kein Stocken am Ende der Fahrt, keine dritte Datei.
let grosseBilder = false;
function bilderNachladen() {
  if (grosseBilder) return;
  grosseBilder = true;
  const flach = $("[data-fahrt-flach] img");
  const schirm = $(".k01 .laptop-screen img");
  const gross = flach?.dataset.gross;
  if (!gross) return;
  const einsetzen = () => {
    for (const img of [schirm, flach]) {
      if (!img) continue;
      img.sizes = "100vw";
      img.srcset = gross;
    }
  };
  const probe = new Image();
  probe.sizes = "100vw";
  probe.srcset = gross;
  if (probe.decode) probe.decode().then(einsetzen, einsetzen);
  else probe.addEventListener("load", einsetzen, { once: true });
}

// Wächter der Fahrt: oben im Fenster (1 % hohes Band) – Anfang (Pose; danach die großen Bilder), Mitte (Stufe 1),
// Ende (Kopfzeile aus)
let waechterIo;
function waechterStarten() {
  waechterIo?.disconnect();
  if (!buehne || !canObserve) return;
  buehne.classList.remove("ist-faehrt", "fahrt-1", "fahrt-2");
  if (!buehneMq.matches) {
    kopf?.classList.remove("ist-weg");
    return;
  }
  const zustand = { start: true, mitte: false, ende: false, danach: false };
  const anwenden = () => {
    const faehrt = !zustand.start;
    if (faehrt !== buehne.classList.contains("ist-faehrt")) {
      buehne.classList.toggle("ist-faehrt", faehrt);
      if (faehrt) randlichterAus();
      else setTimeout(randlichter, 950);
    }
    kopf?.classList.toggle("ist-weg", zustand.ende);
    if (faehrt) bilderNachladen();
    if (!scrollZeit) {
      buehne.classList.toggle("fahrt-1", zustand.mitte);
      buehne.classList.toggle("fahrt-2", zustand.ende || zustand.danach);
    }
  };
  waechterIo = new IntersectionObserver(
    (entries) => {
      for (const e of entries) {
        const art = e.target.dataset.fahrtWaechter;
        zustand[art] = e.isIntersecting;
        if (art === "ende") zustand.danach = !e.isIntersecting && e.boundingClientRect.top < 0;
      }
      anwenden();
    },
    { rootMargin: "0px 0px -99% 0px" },
  );
  $$("[data-fahrt-waechter]", fahrt).forEach((w) => waechterIo.observe(w));
}

// ---------------------------------------------------------------------------------------------------------------
// Wortwalze: vier Zonen (IntersectionObserver-Band bei 45 %), kein Zeitgeber. Das alte Wort rollt nach oben (CSS-Übergang,
// kurz weich), die Buchstaben des neuen steigen ganz und ohne Maske von unten auf (Web Animations, 30 ms Versatz).
// ---------------------------------------------------------------------------------------------------------------
const walze = $("[data-walze-woerter]");
const woerter = walze ? $$(".wort", walze) : [];
const liste = $$(".wortliste li");
let wortJetzt = -1;
let wortAnimationen = [];
function buchstabenTeilen() {
  for (const w of woerter) {
    if (w.dataset.geteilt) continue;
    w.dataset.geteilt = "1";
    for (const knoten of [...w.childNodes]) {
      if (knoten.nodeType !== Node.TEXT_NODE) continue;
      const frag = document.createDocumentFragment();
      for (const z of knoten.textContent) {
        const b = document.createElement("span");
        b.className = "b";
        b.textContent = z;
        frag.append(b);
      }
      knoten.replaceWith(frag);
    }
  }
}
function wortSetzen(n, animiert = true) {
  if (n === wortJetzt || !woerter.length) return;
  const vorher = wortJetzt;
  wortJetzt = n;
  wortAnimationen.forEach((a) => a.finish());
  wortAnimationen = [];
  woerter.forEach((w, i) => {
    w.classList.toggle("ist-jetzt", i === n);
    w.classList.toggle("ist-vor1", i === n - 1);
    w.classList.toggle("ist-vor2", i === n - 2);
    w.classList.toggle("ist-weg", i < n - 2);
  });
  liste.forEach((li, i) => {
    li.classList.toggle("vorbei", i < n);
    li.classList.toggle("jetzt", i === n);
  });
  if (!animiert || bewegungAus.matches || !buehneMq.matches) return;
  const alt = woerter[vorher];
  if (alt?.animate) {
    wortAnimationen.push(alt.animate([{ filter: "blur(0)" }, { filter: "blur(3px)", offset: 0.4 }, { filter: "blur(0)" }], { duration: 450, easing: "ease-out" }));
  }
  const neu = woerter[n];
  if (neu && n > vorher) {
    $$(".b", neu).forEach((b, i) => {
      wortAnimationen.push(
        b.animate(
          [
            { transform: "translateY(0.42em)", opacity: 0, filter: "blur(3px)" },
            { transform: "translateY(0)", opacity: 1, filter: "blur(0)" },
          ],
          { duration: 420, delay: i * 30, easing: "cubic-bezier(0.23, 1, 0.32, 1)", fill: "backwards" },
        ),
      );
    });
  }
}
// Größe: Das längste Wort füllt die Textbreite, läuft aber nie über (auch nicht mit breiterer Ersatzschrift)
function walzeEinpassen() {
  if (!walze) return;
  walze.style.removeProperty("--wg");
  if (!buehneMq.matches) return;
  const fs = parseFloat(getComputedStyle(walze).fontSize);
  const verfuegbar = walze.clientWidth;
  let breit = 0;
  for (const w of woerter) breit = Math.max(breit, w.scrollWidth);
  if (breit > verfuegbar && breit > 0) walze.style.setProperty("--wg", px(Math.floor(fs * (verfuegbar / breit) * 0.985)));
}
let zonenIo;
function walzeStarten() {
  if (!walze) return;
  zonenIo?.disconnect();
  if (!buehneMq.matches || !canObserve) {
    woerter.forEach((w) => w.classList.remove("ist-jetzt", "ist-vor1", "ist-vor2", "ist-weg"));
    wortJetzt = -1;
    return;
  }
  buchstabenTeilen();
  walzeEinpassen();
  if (wortJetzt < 0) wortSetzen(0, false);
  zonenIo = new IntersectionObserver(
    (entries) => {
      for (const e of entries) if (e.isIntersecting) wortSetzen(Number(e.target.dataset.zone));
    },
    { rootMargin: "-45% 0px -54% 0px" },
  );
  $$(".walze-zone").forEach((z) => zonenIo.observe(z));
}

// ---------------------------------------------------------------------------------------------------------------
// Magnetische Knöpfe (nur Maus, mit Bewegung): Ab 140 px Abstand zieht der Knopf zum Zeiger, höchstens 13 px, der Kreis
// mit dem Pfeil halb so weit dazu; beim Verlassen federt er zurück (gedämpfte Feder, ein kleines Überschwingen). Eine
// passive Zeigerverarbeitung, gerechnet einmal je Bild.
// ---------------------------------------------------------------------------------------------------------------
const magnete = $$(".magnet").map((el) => ({ el, kreis: $(".kreis", el), x: 0, y: 0, vx: 0, vy: 0, tx: 0, ty: 0, sichtbar: false }));
let zeiger = null;
let magnetSchleife = 0;
const MAGNET_WEITE = 140;
const MAGNET_ZUG = 13;
function magnetBild() {
  magnetSchleife = 0;
  let weiter = false;
  for (const m of magnete) {
    if (!m.sichtbar && !m.x && !m.y && !m.vx && !m.vy) continue;
    m.tx = 0;
    m.ty = 0;
    let nah = false;
    if (zeiger && m.sichtbar) {
      const r = m.el.getBoundingClientRect();
      const cx = r.left - m.x + r.width / 2;
      const cy = r.top - m.y + r.height / 2;
      const dx = zeiger.x - cx;
      const dy = zeiger.y - cy;
      const ausX = Math.max(0, Math.abs(dx) - r.width / 2);
      const ausY = Math.max(0, Math.abs(dy) - r.height / 2);
      const aussen = Math.hypot(ausX, ausY);
      if (aussen < MAGNET_WEITE) {
        nah = true;
        const d = Math.hypot(dx, dy) || 1;
        // stark nah am Knopf, nach außen weich auslaufend
        const kraft = MAGNET_ZUG * Math.min(1, d / 90) * (1 - (aussen / MAGNET_WEITE) ** 2);
        m.tx = (dx / d) * kraft;
        m.ty = (dy / d) * kraft * 0.75;
      }
    }
    m.el.classList.toggle("ist-nah", nah);
    // Feder: ziehen (0,14) und dämpfen (0,74 je Bild)
    m.vx = (m.vx + (m.tx - m.x) * 0.14) * 0.74;
    m.vy = (m.vy + (m.ty - m.y) * 0.14) * 0.74;
    m.x += m.vx;
    m.y += m.vy;
    if (Math.abs(m.tx - m.x) < 0.05 && Math.abs(m.ty - m.y) < 0.05 && Math.abs(m.vx) < 0.05 && Math.abs(m.vy) < 0.05) {
      m.x = m.tx;
      m.y = m.ty;
      m.vx = 0;
      m.vy = 0;
    } else weiter = true;
    if (m.x || m.y) {
      m.el.style.setProperty("translate", `${m.x.toFixed(2)}px ${m.y.toFixed(2)}px`);
      m.kreis?.style.setProperty("translate", `${(m.x * 0.5).toFixed(2)}px ${(m.y * 0.5).toFixed(2)}px`);
    } else {
      m.el.style.removeProperty("translate");
      m.kreis?.style.removeProperty("translate");
    }
    if (nah) weiter = true;
  }
  if (weiter) magnetSchleife = requestAnimationFrame(magnetBild);
}
function magnetStarten() {
  if (!magnetSchleife) magnetSchleife = requestAnimationFrame(magnetBild);
}
if (magnete.length) {
  if (canObserve) {
    const io = new IntersectionObserver((entries) => {
      for (const e of entries) {
        const m = magnete.find((x) => x.el === e.target);
        if (m) m.sichtbar = e.isIntersecting;
      }
    });
    magnete.forEach((m) => io.observe(m.el));
  }
  window.addEventListener(
    "pointermove",
    (e) => {
      if (e.pointerType !== "mouse" || !feinMq.matches || bewegungAus.matches) return;
      zeiger = { x: e.clientX, y: e.clientY };
      if (magnete.some((m) => m.sichtbar)) magnetStarten();
    },
    { passive: true },
  );
  document.documentElement.addEventListener("pointerleave", () => {
    zeiger = null;
    magnetStarten();
  });
}

// --- Zählwerke (nur mit Bewegung): Um jede Ziffer ein Fenster mit einer Rolle der Ziffern, die die Stelle durchläuft,
// unten die Endziffer (ohne Verschiebung steht die Endzahl). Gerollt wird in % der Rolle, also in ganzen Zeilen – in
// Ruhe nie ein Bruchstück. Während des Rollens laufen die Fenster oben und unten weich aus (Maske, --zw-f in site.css)
// und die Rolle ist senkrecht verwischt; beides ist bei der Ankunft wieder null. Die vorderen Stellen rasten früh ein,
// nur die hinteren rollen lange. von: Anfangszahl gleicher Länge (Leerzeichen = leere Stelle), zyklen: Umläufe je
// Stelle. Bis zum Start ist die Zahl unsichtbar (keine „0.000,00“). ---
const ROLL = "cubic-bezier(0.16, 1, 0.3, 1)";
// Dieselbe Kurve als Funktion (Zeitanteil → Weganteil), damit Maske und Unschärfe genau dem Rollen folgen
function kurve(x1, y1, x2, y2) {
  const b = (a1, a2, t) => 3 * a1 * t * (1 - t) ** 2 + 3 * a2 * t * t * (1 - t) + t ** 3;
  return (x) => {
    let t = x;
    for (let i = 0; i < 8; i++) {
      const d = (b(x1, x2, t + 1e-4) - b(x1, x2, t)) / 1e-4;
      if (!d) break;
      t = Math.min(1, Math.max(0, t - (b(x1, x2, t) - x) / d));
    }
    return b(y1, y2, t);
  };
}
const rollKurve = kurve(0.16, 1, 0.3, 1);
const neuEl = (tag, cls, text) => {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text !== undefined) e.textContent = text;
  return e;
};
function zaehlwerk(el, von, zyklen) {
  if (!el || el.dataset.zw) return null;
  el.dataset.zw = "1";
  const text = el.textContent;
  const rollen = [];
  el.textContent = "";
  [...text].forEach((z, pos) => {
    if (!/\d/.test(z)) return el.append(z);
    const folge = von[pos] === " " ? [" ", z] : [];
    if (!folge.length) {
      let d = Number(von[pos]);
      folge.push(d);
      for (let k = ((Number(z) - d + 10) % 10) + 10 * (zyklen[rollen.length] || 0); k > 0; k--) folge.push((d = (d + 1) % 10));
    }
    const r = neuEl("span", "zw-r");
    // leere Stelle als geschütztes Leerzeichen: eine Zeile mit nur einem Leerzeichen hätte die Höhe null, die Rolle stünde
    // dann um eine halbe Zeile versetzt (die „1“ schaute halb ins Fenster)
    for (const f of folge) r.append(neuEl("span", "", f === " " ? "\u00a0" : String(f)));
    const s = neuEl("span", "zw-s");
    s.append(neuEl("span", "zw-platz", z), r);
    el.append(s);
    rollen.push({ r, s, schritte: folge.length - 1, oben: `translateY(${(((folge.length - 1) / folge.length) * 100).toFixed(4)}%)` });
  });
  rollen.el = el;
  return rollen;
}
const zwAnfang = (rs) => rs?.forEach(({ r, oben }) => r.style.setProperty("transform", oben));
const zwEnde = (rs) =>
  rs?.forEach(({ r, s }) => {
    r.getAnimations().forEach((a) => a.cancel());
    s.getAnimations().forEach((a) => a.cancel());
    r.style.removeProperty("transform");
    s.classList.remove("zw-weich");
  });
// Hoch zur Endzahl: Stelle i von n braucht 42 % … 100 % der Dauer (vorn kurz, hinten lang)
function zwHoch(rs, dauer) {
  zwEnde(rs);
  if (!rs?.length) return;
  const fs = parseFloat(getComputedStyle(rs.el).fontSize) || 40;
  rs.forEach(({ r, s, oben, schritte }, i) => {
    const d = dauer * (0.42 + 0.58 * ((i + 1) / rs.length) ** 1.4);
    r.animate([{ transform: oben }, { transform: "translateY(0)" }], { duration: d, easing: ROLL, fill: "backwards" });
    if (!schritte) return;
    // Je Zeitpunkt der verbleibende Weg in Zeilen: Der weiche Rand ist immer mindestens so breit wie der Versatz der
    // Ziffer (nie eine harte Schnittkante durch eine Ziffer), die Unschärfe nimmt ab, sobald weniger als zwei Zeilen
    // fehlen – in Ruhe ist die Ziffer scharf und ganz
    const b = Math.min(5, fs * 0.03);
    const maske = [];
    const blur = [];
    for (let k = 0; k <= 24; k++) {
      const rest = schritte * (1 - rollKurve(k / 24));
      maske.push({ "--zw-f": `${Math.min(0.32, rest * 1.2).toFixed(3)}em`, offset: k / 24 });
      blur.push({ filter: `blur(${(b * Math.min(1, rest / 2)).toFixed(2)}px)`, offset: k / 24 });
    }
    r.animate(blur, { duration: d, easing: "linear" });
    s.classList.add("zw-weich");
    s.animate(maske, { duration: d, easing: "linear" }).finished.then(
      () => s.classList.remove("zw-weich"),
      () => {},
    );
  });
}
function zwRunter(rs, dauer) {
  rs?.forEach(({ r, oben }) => {
    r.getAnimations().forEach((a) => a.cancel());
    r.style.setProperty("transform", oben);
    r.animate([{ transform: "translateY(0)" }, { transform: oben }], { duration: dauer, easing: ROLL });
  });
}
// Einmal hochzählen, sobald die Zahl zu 60 % im Bild ist; bis dahin unsichtbar (die ganze Zahl samt Einheit)
function zaehlenBeimErscheinen(el, von, zyklen, dauer) {
  if (!el || !canObserve || bewegungAus.matches) return;
  const rs = zaehlwerk(el, von, zyklen);
  const huelle = el.closest(".gz-zahl") ?? el;
  zwAnfang(rs);
  huelle.classList.add("zw-wartet");
  const io = new IntersectionObserver(
    ([e]) => {
      if (!e.isIntersecting) return;
      io.disconnect();
      huelle.classList.remove("zw-wartet");
      zwHoch(rs, dauer);
    },
    { threshold: 0.6 },
  );
  io.observe(el);
}
zaehlenBeimErscheinen($(".dreizehn [data-zahl]"), " 0", [0, 1], 1300);
// Kontostand „13.944,47“: die erste Stelle erscheint aus der leeren Stelle, die Cent rollen einmal mehr durch
zaehlenBeimErscheinen($(".geldzahl [data-zahl]"), " 0.000,00", [0, 0, 0, 0, 0, 1, 1], 1500);

// --- Kapitel 3 · Spur (ab 1200 × 760 mit Bewegung): drei Zonen am Band bei 45 % setzen data-schritt an .spur (0 =
// davor). Schritt 2: Ein Lichtkomet fliegt den Strom entlang in Annas Platz (fluss.js, 1,2 s), dann .ist-eingetragen –
// der Platz leuchtet auf, ein Ring läuft aus, die Zeile glimmt, die Zahl rollt von 9 auf 10, Telefon und Chips zeigen
// ihren Eintrag. Springt der Schritt
// (schnelles Scrollen), steht der Endzustand sofort da. ---
const spur = $("[data-spur]");
const spurMq = window.matchMedia("(min-width: 1200px) and (min-height: 760px) and (prefers-reduced-motion: no-preference)");
const spurFlug = $(".fluss-flug");
let spurSchritt = -1;
let spurZahl = null;
let eingetragen = false;
let flugNr = 0;
let spurIo;
function eintragen(animiert) {
  eingetragen = true;
  const nr = ++flugNr;
  const landen = () => {
    if (nr !== flugNr || spurSchritt < 2) return;
    spur.classList.add("ist-eingetragen");
    if (!animiert) return zwEnde(spurZahl);
    spur.classList.remove("ist-gelandet");
    void spur.offsetWidth;
    spur.classList.add("ist-gelandet");
    zwHoch(spurZahl, 650);
  };
  const f = animiert && spurFlug && fluss(spurFlug);
  if (f) Promise.race([f.flug($("#platz-anna"), { dauer: 1200 }), new Promise((r) => setTimeout(r, 1800))]).then(landen);
  else landen();
}
function spurSetzen(n) {
  if (n === spurSchritt) return;
  const sprung = spurSchritt < 0 || Math.abs(n - spurSchritt) > 1;
  spurSchritt = n;
  if (sprung) {
    spur.classList.add("sofort");
    requestAnimationFrame(() => requestAnimationFrame(() => spur.classList.remove("sofort")));
  }
  spur.dataset.schritt = String(n);
  if (n >= 2 && !eingetragen) eintragen(!sprung);
  else if (n < 2 && eingetragen) {
    eingetragen = false;
    flugNr++;
    spur.classList.remove("ist-eingetragen", "ist-gelandet");
    if (sprung) zwAnfang(spurZahl);
    else zwRunter(spurZahl, 420);
  }
}
function spurStarten() {
  if (!spur) return;
  spurIo?.disconnect();
  if (!spurMq.matches || !canObserve) {
    delete spur.dataset.schritt;
    spur.classList.remove("ist-eingetragen", "ist-gelandet");
    zwEnde(spurZahl);
    spurSchritt = -1;
    eingetragen = false;
    return;
  }
  spurZahl ??= zaehlwerk($(".k03 .gz-zahl"), " 9", [0, 0]);
  if (spurSchritt < 0) {
    zwAnfang(spurZahl);
    spurSetzen(0);
  }
  spurIo = new IntersectionObserver(
    (entries) => {
      for (const e of entries) {
        const n = Number(e.target.dataset.schritt);
        if (e.isIntersecting) spurSetzen(n);
        else if (n === 1 && e.boundingClientRect.top > window.innerHeight * 0.45) spurSetzen(0);
      }
    },
    { rootMargin: "-45% 0px -54% 0px" },
  );
  $$(".spur-zone", spur).forEach((z) => spurIo.observe(z));
}

// --- Kapitel 4 · Umlaufbahn (ab 1200 × 720): Lage aus dem Telefon (Layout, ohne Bewegung); die Chips kreisen in 40 s um
// die geneigte Bahn – vorn groß und scharf über dem Telefon, hinten klein und weich darunter (z-index wechselt an den
// Seiten, wo sie neben dem Gerät stehen). Sie erscheinen, wenn das Telefon steht; Hover, Schalter und Verlassen des
// Bildes halten sie an. Ohne Bewegung stehen sie still. ---
const kreis = $("[data-kreisbahn]");
const kreisShow = kreis && $(".showcase", kreis);
const kreisGeraet = kreis && $(".showcase-scene > *", kreis);
const kreisChips = kreis ? $$(".u-chip", kreis) : [];
const kreisMq = window.matchMedia("(min-width: 1200px) and (min-height: 720px)");
const kreisPause = { hover: false, weg: false, ruhe: false };
let kreisAnim = [];
let kreisW = 0;
function kreisMessen() {
  if (!kreisGeraet) return false;
  const [x, y] = offsetIn(kreisGeraet, kreis);
  const w = kreisGeraet.offsetWidth;
  const h = kreisGeraet.offsetHeight;
  if (!w || !h) return false;
  // Maßstab: rechts muss die Bahn samt Chips ins Fenster passen
  const k = Math.max(0.6, Math.min(1, (kreis.clientWidth - x - w / 2 - 150) / (1.12 * w)));
  kreisW = w * k;
  for (const [n, v] of [["--uk", String(Math.round(k * 1000) / 1000)], ["--ux", px(x + w / 2)], ["--uy", px(y + h / 2)], ["--uw", px(w)], ["--uh", px(h)]]) kreis.style.setProperty(n, v);
  return true;
}
// Ein Chip auf der Bahn beim Winkel th: Versatz zur Mitte und Aussehen nach der Tiefe v (0 hinten … 1 vorn)
function kreisForm(th) {
  const ex = 1.02 * kreisW * Math.cos(th);
  const ey = 0.56 * kreisW * Math.sin(th);
  const v = (Math.sin(th) + 1) / 2;
  return {
    transform: `translate(${(ex * 0.985 + ey * 0.1736).toFixed(1)}px, ${(ey * 0.985 - ex * 0.1736).toFixed(1)}px) translate(-50%, -50%) scale(${(0.8 + 0.34 * v ** 1.4).toFixed(3)})`,
    zIndex: v >= 0.5 ? 3 : -1,
    opacity: (0.5 + 0.5 * v).toFixed(3),
    filter: `blur(${((1 - v) * 2.4).toFixed(2)}px)`,
  };
}
const kreisAnhalten = () => kreisAnim.forEach((a) => (kreisPause.hover || kreisPause.weg || kreisPause.ruhe ? a.pause() : a.play()));
function kreisStarten() {
  const phase = kreisAnim[0]?.currentTime ?? 0;
  kreisAnim.forEach((a) => a.cancel());
  kreisAnim = [];
  if (!kreis) return;
  const an = kreisMq.matches && kreisMessen();
  // Mit Umlauf stehen die Chips nicht mehr in der Reihe darunter: Der Abschnitt bekommt genau deren Höhe als Abstand
  // (--chips-h, site.css) – so bleibt er gleich hoch, und nichts darunter springt (auch nicht beim Neuladen mitten auf
  // der Seite, wenn dieses Skript erst nach dem ersten Zeichnen läuft)
  kreis.style.removeProperty("--chips-h");
  if (an) {
    kreis.classList.remove("ist-umlauf");
    const ohne = kreis.offsetHeight;
    kreis.classList.add("ist-umlauf");
    const mit = kreis.offsetHeight;
    if (ohne > mit) kreis.style.setProperty("--chips-h", px(ohne - mit));
  }
  kreis.classList.toggle("ist-umlauf", Boolean(an));
  const still = bewegungAus.matches || !document.body.animate;
  if (an && (still || kreisShow?.classList.contains("is-rest"))) kreis.classList.add("ist-kreist");
  kreisChips.forEach((li, i) => {
    const chip = $(".chip", li);
    for (const [e, p] of [[li, "transform"], [li, "z-index"], [chip, "opacity"], [chip, "filter"]]) e?.style.removeProperty(p);
    if (!an) return;
    // Startwinkel: vorn unten der letzte Chip („Im Browser, ganz ohne App“), die übrigen im Abstand von 72°
    const th0 = Math.PI / 2 + ((i - 4) * 2 * Math.PI) / 5;
    if (still) {
      const f = kreisForm(th0);
      li.style.setProperty("transform", f.transform);
      li.style.setProperty("z-index", String(f.zIndex));
      chip?.style.setProperty("opacity", f.opacity);
      chip?.style.setProperty("filter", f.filter);
      return;
    }
    const formen = Array.from({ length: 61 }, (_, k) => kreisForm(th0 + (k / 60) * 2 * Math.PI));
    const opt = { duration: 40000, iterations: Infinity };
    // getrennt: transform, opacity und filter laufen im Compositor, nur der Wechsel des z-index im Hauptthread
    kreisAnim.push(
      li.animate(formen.map(({ transform }) => ({ transform })), opt),
      li.animate(formen.map(({ zIndex }) => ({ zIndex })), opt),
    );
    if (chip) kreisAnim.push(chip.animate(formen.map(({ opacity, filter }) => ({ opacity, filter })), opt));
  });
  const zeit = document.timeline?.currentTime ?? 0;
  kreisAnim.forEach((a) => (a.startTime = zeit - phase));
  kreisAnhalten();
}
if (kreis) {
  if (kreisShow) {
    new MutationObserver(() => kreisShow.classList.contains("is-rest") && kreis.classList.add("ist-kreist")).observe(kreisShow, { attributes: true, attributeFilter: ["class"] });
  }
  for (const li of kreisChips) {
    for (const [typ, an] of [["pointerenter", true], ["pointerleave", false]]) {
      li.addEventListener(typ, () => {
        kreisPause.hover = an;
        kreisAnhalten();
      });
    }
  }
  if (canObserve) {
    new IntersectionObserver(([e]) => {
      kreisPause.weg = !e.isIntersecting;
      kreisAnhalten();
    }).observe(kreis);
  }
  document.addEventListener("vf:ruhe", (e) => {
    kreisPause.ruhe = Boolean(e.detail?.ruhig);
    kreisAnhalten();
  });
  kreisMq.addEventListener("change", kreisStarten);
}

// --- Kapitel 5 · Karten unter dem Zeiger (nur Maus, mit Bewegung): Die Karte unter dem Zeiger neigt sich (höchstens 8°,
// nachgeführt mit 0,12 je Bild) und hebt sich 26 px, ihr Glanz folgt dem Zeiger; die Lichtkante jeder Karte zeigt zu
// ihm, ferne Karten schwächer. Beim Verlassen federt sie in 500 ms zurück. Ein Zeiger-Listener, gerechnet je Bild. ---
const karten = $$(".bento .fkarte");
const FEDER = CSS.supports("transition-timing-function", "linear(0, 1)") ? getComputedStyle(document.documentElement).getPropertyValue("--feder-ruhig").trim() : "";
const NEIG0 = "perspective(900px) rotateX(0deg) rotateY(0deg) translateZ(0px)";
const kartenAn = () => feinMq.matches && !bewegungAus.matches;
const neig = { rx: 0, ry: 0, z: 0 };
let kartenTeile = [];
let kZeiger = null;
let kSchleife = 0;
let gehoben = null;
function kartenVorbereiten() {
  if (!kartenAn() || kartenTeile.length) return;
  kartenTeile = karten.map((k) => {
    const licht = neuEl("span", "fk-licht");
    const ring = neuEl("span", "fk-ring");
    const fleck = neuEl("span", "fk-fleck");
    const glanz = neuEl("span", "fk-glanz");
    licht.setAttribute("aria-hidden", "true");
    ring.append(fleck);
    licht.append(ring, glanz);
    k.prepend(licht);
    return { k, fleck, glanz };
  });
}
function loslassen(k) {
  const von = k.style.transform;
  k.classList.remove("ist-gehoben");
  k.style.removeProperty("transform");
  if (von) k.animate([{ transform: von }, { transform: NEIG0 }], { duration: 500, easing: FEDER || ROLL });
}
function kartenBild() {
  kSchleife = 0;
  const basis = karten[0]?.offsetParent?.getBoundingClientRect();
  if (!basis) return;
  let ziel = null;
  for (const t of kartenTeile) {
    const { offsetLeft: x0, offsetTop: y0, offsetWidth: w, offsetHeight: h } = t.k;
    const x = basis.left + x0;
    const y = basis.top + y0;
    t.r = { x, y, w, h };
    if (!kZeiger) {
      t.fleck.style.setProperty("opacity", "0");
      continue;
    }
    if (kZeiger.x >= x && kZeiger.x <= x + w && kZeiger.y >= y && kZeiger.y <= y + h) ziel = t;
    // Lichtkante: Fleck auf dem Rand in Richtung des Zeigers
    const dx = kZeiger.x - (x + w / 2);
    const dy = kZeiger.y - (y + h / 2);
    const s = Math.min(w / 2 / (Math.abs(dx) || 1e-6), h / 2 / (Math.abs(dy) || 1e-6), 1);
    t.fleck.style.setProperty("translate", `${(w / 2 + dx * s).toFixed(1)}px ${(h / 2 + dy * s).toFixed(1)}px`);
    t.fleck.style.setProperty("opacity", (Math.max(0.12, 1 - Math.hypot(dx, dy) / 760) * 0.95).toFixed(3));
  }
  if (ziel?.k !== gehoben) {
    if (gehoben) loslassen(gehoben);
    gehoben = ziel?.k ?? null;
    neig.rx = neig.ry = neig.z = 0;
    gehoben?.classList.add("ist-gehoben");
  }
  if (!ziel) return;
  const fx = (kZeiger.x - ziel.r.x) / ziel.r.w;
  const fy = (kZeiger.y - ziel.r.y) / ziel.r.h;
  const rx = (0.5 - fy) * 12;
  const ry = (fx - 0.5) * 16;
  neig.rx += (rx - neig.rx) * 0.12;
  neig.ry += (ry - neig.ry) * 0.12;
  neig.z += (26 - neig.z) * 0.12;
  ziel.k.style.setProperty("transform", `perspective(900px) rotateX(${neig.rx.toFixed(2)}deg) rotateY(${neig.ry.toFixed(2)}deg) translateZ(${neig.z.toFixed(1)}px)`);
  ziel.glanz.style.setProperty("translate", `${(fx * ziel.r.w).toFixed(1)}px ${(fy * ziel.r.h).toFixed(1)}px`);
  if (Math.abs(rx - neig.rx) > 0.02 || Math.abs(ry - neig.ry) > 0.02 || 26 - neig.z > 0.05) kSchleife = requestAnimationFrame(kartenBild);
}
const kartenAnstossen = () => {
  if (!kSchleife) kSchleife = requestAnimationFrame(kartenBild);
};
const bereich = karten[0]?.closest(".kapitel");
if (bereich) {
  kartenVorbereiten();
  bereich.addEventListener(
    "pointermove",
    (e) => {
      if (e.pointerType !== "mouse" || !kartenAn()) return;
      kartenVorbereiten();
      kZeiger = { x: e.clientX, y: e.clientY };
      kartenAnstossen();
    },
    { passive: true },
  );
  bereich.addEventListener("pointerleave", () => {
    kZeiger = null;
    kartenAnstossen();
  });
}

// --- Kapitel 6 · Lichtstreif: Lage der dunklen Karte „Kontostand · alle Konten“ im Bild des Laptops (in Ruhe frontal,
// Layout = Bild); einmal 1,2 s, sobald der Laptop steht und der Streif im Bild ist. Gemessen am Bild selbst (`picture`,
// ohne den schwarzen Rand des Bildschirms – bis 21.10.2026 am ganzen Bildschirm, der Streif saß dadurch etwas zu weit
// links und zu tief). Anteile des Bildes aus tools/capture-screenshots.mjs (Aufnahme 22.10.2026): Die Karte beginnt bei
// 11,7 % / 34,4 %, ist 53,1 % breit und reicht unten aus dem Bild; ihre Ecken (1,5 rem bei 1280 px Fenster) sind 2 % der
// Bildbreite. Nur über der Karte – über hellem Grund und dunkler Schrift (Überschrift „Konten“) wirkte der aufhellende
// Streif wie ein Fehler; die Kontokarten rechts bleiben deshalb außen vor. ---
const finanz = $(".k06");
const streif = $("[data-streif]");
const finanzShow = finanz && $(".showcase", finanz);
let streifFertig = false;
let streifSichtbar = false;
function streifMessen() {
  const bild = finanz && $(".laptop-screen picture", finanz);
  if (!bild || !streif || bewegungAus.matches || !bild.offsetWidth) return;
  const [x, y] = offsetIn(bild, streif.parentElement);
  const w = bild.offsetWidth;
  const h = bild.offsetHeight;
  for (const [n, v] of [["--st-x", x + 0.117 * w], ["--st-y", y + 0.344 * h], ["--st-b", 0.531 * w], ["--st-h", 0.656 * h], ["--st-r", 0.02 * w]]) finanz.style.setProperty(n, px(v));
  finanz.classList.add("ist-gemessen");
}
function streifZiehen() {
  const band = streif && $("i", streif);
  if (streifFertig || !streifSichtbar || !finanzShow?.classList.contains("is-rest") || !band?.animate) return;
  streifFertig = true;
  band.animate(
    [
      { transform: "translateX(-140%) skewX(-14deg)", opacity: 0 },
      { opacity: 1, offset: 0.15 },
      { opacity: 1, offset: 0.8 },
      { transform: "translateX(620%) skewX(-14deg)", opacity: 0 },
    ],
    { duration: 1200, delay: 250, easing: "cubic-bezier(0.45, 0, 0.25, 1)" },
  );
}
// Der Laptop der Finanzen beginnt schon, wenn ein Fünftel seiner Bühne im Bild ist (site.js startet ihn erst bei der
// Hälfte – beim Scrollen stand bis dahin ein zugeklappter Deckel in viel leerer Fläche). Nur der Start rückt vor; die
// Bewegung selbst bleibt die der Vorführung.
const finanzSzene = finanzShow && $(".showcase-scene", finanzShow);
if (finanzSzene && canObserve && !bewegungAus.matches) {
  const io = new IntersectionObserver(
    ([e]) => {
      if (!e.isIntersecting) return;
      io.disconnect();
      finanzShow.classList.add("is-playing");
    },
    { threshold: 0.2 },
  );
  io.observe(finanzSzene);
}
if (streif && finanzShow && canObserve) {
  new MutationObserver(streifZiehen).observe(finanzShow, { attributes: true, attributeFilter: ["class"] });
  new IntersectionObserver(
    ([e]) => {
      streifSichtbar = e.isIntersecting;
      streifZiehen();
    },
    { threshold: 0.6 },
  ).observe(streif);
}

// --- Kapitel 7–10: einmal, sobald ein Teil zu einem Anteil im Bild ist (ohne Bewegung oder ohne Beobachter: nichts –
// dann steht alles im Endstand, die Vorzustände in site.css gelten nur mit .ist-bereit) ---
const vorbereitet = (el) => Boolean(el && canObserve && !bewegungAus.matches && document.body.animate);
// Ausgelöst, wenn der Anteil im Bild ist – oder, bei Teilen, die höher als das Fenster sind, die halbe Fensterhöhe
function einmalSichtbar(el, anteil, fn, rand = "0px") {
  const io = new IntersectionObserver(
    ([e]) => {
      if (!e.isIntersecting || (e.intersectionRatio < anteil - 0.001 && e.intersectionRect.height < window.innerHeight * 0.5)) return;
      io.disconnect();
      fn();
    },
    { threshold: [0, 0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8, 0.9, 1], rootMargin: `0px 0px ${rand} 0px` },
  );
  io.observe(el);
}
const ruhigJetzt = () => bewegungAus.matches || document.documentElement.classList.contains("ist-ruhig");
const RAST = CSS.supports("transition-timing-function", "linear(0, 1)") ? getComputedStyle(document.documentElement).getPropertyValue("--feder-rast").trim() : "";
const EASE = "cubic-bezier(0.23, 1, 0.32, 1)";

// Kapitel 7 · Rollen: Die Rahmen legen sich von außen nach innen, sobald 40 % im Bild sind; Annas Plakette folgt (CSS)
const rollen = $("[data-rollen]");
if (vorbereitet(rollen)) {
  rollen.classList.add("ist-bereit");
  einmalSichtbar(rollen, 0.4, () => rollen.classList.add("ist-gelegt"));
}

// Kapitel 8 · Startlinie: Die Linie zeichnet sich, die Pinnnadel fährt einmal von 1 über 2 nach 3 (je 400 ms Feder) und
// füllt die Punkte, wenn sie ankommt. Schmal (senkrecht) ohne Nadel.
const startweg = $("[data-startweg]");
if (vorbereitet(startweg)) {
  const punkte = $$(".startlinie li", startweg);
  const nadel = $(".sw-pin", startweg);
  const fuellung = $(".sw-fuellung", startweg);
  const spur = $(".sw-spur", startweg);
  const fertig = () => {
    punkte.forEach((li) => li.classList.add("ist-erreicht"));
    startweg.classList.add("ist-gefahren");
  };
  startweg.classList.add("ist-bereit");
  einmalSichtbar(startweg, 0.5, () => {
    if (ruhigJetzt() || punkte.length !== 3 || !spur) return fertig();
    const senkrecht = window.matchMedia("(max-width: 719px)").matches;
    const lage = punkte.map((li) => {
      const nr = $(".nr", li);
      const [x, y] = offsetIn(nr, startweg);
      return senkrecht ? y + nr.offsetHeight / 2 : x + nr.offsetWidth / 2;
    });
    const [sx, sy] = offsetIn(spur, startweg);
    const laenge = senkrecht ? spur.offsetHeight : spur.offsetWidth;
    const anteil = lage.map((p) => Math.max(0, Math.min(1, (p - (senkrecht ? sy : sx)) / (laenge || 1))));
    const sk = (a) => (senkrecht ? `scaleY(${a.toFixed(4)})` : `scaleX(${a.toFixed(4)})`);
    const T = 1400;
    const zug = fuellung.animate(
      [
        { transform: sk(0), offset: 0 },
        { transform: sk(anteil[0]), offset: 250 / 1800 },
        { transform: sk(anteil[0]), offset: 400 / 1800, easing: EASE },
        { transform: sk(anteil[1]), offset: 800 / 1800 },
        { transform: sk(anteil[1]), offset: 1000 / 1800, easing: EASE },
        { transform: sk(anteil[2]), offset: T / 1800, easing: EASE },
        { transform: sk(1) },
      ],
      { duration: 1800, fill: "forwards" },
    );
    if (!senkrecht && nadel) {
      const d = lage.map((x) => x - lage[2]);
      const rast = RAST || EASE;
      nadel.animate(
        [
          { transform: `translate(${d[0]}px, -10px)`, opacity: 0, easing: EASE },
          { transform: `translate(${d[0]}px, 0)`, opacity: 1, offset: 250 / T },
          { transform: `translate(${d[0]}px, 0)`, opacity: 1, offset: 400 / T, easing: rast },
          { transform: `translate(${d[1]}px, 0)`, opacity: 1, offset: 800 / T },
          { transform: `translate(${d[1]}px, 0)`, opacity: 1, offset: 1000 / T, easing: rast },
          { transform: "translate(0, 0)", opacity: 1 },
        ],
        { duration: T, fill: "forwards" },
      );
    }
    [250, 800, T].forEach((t, i) => setTimeout(() => punkte[i].classList.add("ist-erreicht"), t));
    zug.finished.then(
      () => {
        fertig();
        startweg.getAnimations({ subtree: true }).forEach((a) => a.cancel());
      },
      () => {},
    );
  });
}

// Kapitel 9 (und „Mehr dazu“) · Aufklappen: Die Seite bleibt stehen, die Fragen darunter gleiten an ihren neuen Platz
// (ihr Papiergrund deckt die Antwort dabei ab), die Antwort blendet ein. In Chromium als View Transition (Namen nur für
// die Dauer, die Kopfzeile mit eigenem Namen, damit nichts über sie gleitet). WebKit 26 blendet die Fragen dabei an
// altem und neuem Platz über, statt sie gleiten zu lassen – dort (und ohne View Transitions) dasselbe Bild über Web
// Animations (FLIP: vorher messen, umschalten, vom alten Platz zurückgleiten; nur transform und opacity). Erkannt wird
// Chromium an interpolate-size (bisher nur dort).
const vtGut = typeof document.startViewTransition === "function" && CSS.supports("interpolate-size: allow-keywords");
let uebergang = null;
function aufklappen(d) {
  const fragen = d.closest(".faq") ? $$("details", d.closest(".faq")) : [];
  const danach = fragen.slice(fragen.indexOf(d) + 1);
  const antwort = $(".answer, .checks", d);
  if (vtGut) {
    uebergang?.skipTransition();
    const namen = [[kopf, "vt-kopf"], [antwort, "vt-antwort"], ...danach.map((f, i) => [f, `vt-frage-${i + 1}`])];
    const setzen = (an) => {
      for (const [el, name] of namen) {
        if (!el) continue;
        if (an) el.style.setProperty("view-transition-name", name);
        else el.style.removeProperty("view-transition-name");
      }
    };
    setzen(true);
    uebergang = document.startViewTransition(() => {
      d.open = !d.open;
    });
    uebergang.finished.finally(() => {
      setzen(false);
      uebergang = null;
    });
    return;
  }
  const vorher = danach.map((f) => f.getBoundingClientRect().top);
  d.open = !d.open;
  danach.forEach((f, i) => {
    const dy = vorher[i] - f.getBoundingClientRect().top;
    if (Math.abs(dy) > 0.5) f.animate([{ transform: `translateY(${dy.toFixed(1)}px)` }, { transform: "none" }], { duration: 320, easing: EASE });
  });
  if (d.open && antwort) antwort.animate([{ opacity: 0, transform: "translateY(-8px)" }, { opacity: 1, transform: "none" }], { duration: 320, easing: EASE });
}
if (document.body.animate) {
  document.documentElement.classList.add("js-klappen");
  for (const d of $$(".faq details, details.mehr")) {
    $("summary", d)?.addEventListener("click", (e) => {
      if (bewegungAus.matches) return;
      e.preventDefault();
      aufklappen(d);
    });
  }
}

// Kapitel 10 · Finale: Sobald der Demo-Knopf ganz im Bild ist (über dem unteren Achtel), zieht sich der Strom in seinem
// Pfeil zusammen (1,5 s), der Lichthof atmet einmal (.ist-gesammelt), dann wachsen die Lichtlinien zum Zeichen auf dem
// Deckel (0,9 s), das einmal aufleuchtet (.ist-angekommen). Angehalten (Schalter) oder ohne Bewegung: gleich der Endstand.
const finale = $("[data-finale]");
if (vorbereitet(finale)) {
  finale.classList.add("ist-bereit");
  einmalSichtbar($(".leuchtet", finale) ?? finale, 1, async () => {
    const strom = $(".fluss-finale", finale);
    const linien = $(".fluss-weiter", finale);
    const f1 = strom && fluss(strom);
    const f2 = linien && fluss(linien);
    const warte = (p, ms) => Promise.race([p ?? Promise.resolve(), new Promise((r) => setTimeout(r, ms))]);
    if (ruhigJetzt()) {
      f1?.sammeln(0);
      f2?.wachsen(0);
      finale.classList.add("ist-angekommen");
      return;
    }
    await warte(f1?.sammeln(1500), 2000);
    finale.classList.add("ist-gesammelt");
    await warte(f2?.wachsen(900), 1400);
    finale.classList.add("ist-angekommen");
  }, "-12%");
}
// Sprungmarken in einen Bogen (z. B. #benachrichtigen in #kontakt): Der Bogen steht vor dem Hereinscrollen noch 14svh
// tiefer (scroll-driven, site.css 12c). Der Browser rechnete das Ziel mit dieser Lage und landete nach dem Sprung um
// genau diese Strecke zu tief – die Überschrift läge unter der Kopfzeile. Für die Dauer des Sprungs steht der Bogen
// deshalb an seinem Platz (animation: none), danach läuft die Animation weiter (am Ziel ist sie dann zu Ende).
function bogenSprung(ziel) {
  const bogen = ziel?.closest(".bogen");
  if (!bogen) return;
  bogen.style.setProperty("animation", "none");
  requestAnimationFrame(() => requestAnimationFrame(() => bogen.style.removeProperty("animation")));
}
const zielVon = (hash) => {
  try {
    return hash.length > 1 ? document.getElementById(decodeURIComponent(hash.slice(1))) : null;
  } catch {
    return null;
  }
};
document.addEventListener(
  "click",
  (e) => {
    if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
    const a = e.target instanceof Element ? e.target.closest("a[href*='#']") : null;
    if (!a || a.origin !== location.origin || a.pathname !== location.pathname) return;
    bogenSprung(zielVon(a.hash));
  },
  true,
);
// Aufruf mit Sprungmarke (…/#benachrichtigen): einmal nachrichten, sobald die Seite steht
if (location.hash && zielVon(location.hash)?.closest(".bogen")) {
  window.addEventListener(
    "load",
    () => {
      const ziel = zielVon(location.hash);
      if (!ziel) return;
      bogenSprung(ziel);
      ziel.scrollIntoView({ block: "start" });
    },
    { once: true },
  );
}

// Drucken: alles im Endstand
window.addEventListener("beforeprint", () => {
  rollen?.classList.add("ist-gelegt");
  startweg?.classList.add("ist-gefahren");
  $$(".startlinie li").forEach((li) => li.classList.add("ist-erreicht"));
  finale?.classList.add("ist-angekommen");
});

// ---------------------------------------------------------------------------------------------------------------
// Start und Größenänderungen
// ---------------------------------------------------------------------------------------------------------------
function alles() {
  geometrie();
  waechterStarten();
  walzeStarten();
  spurStarten();
  kreisStarten();
  streifMessen();
}
spurMq.addEventListener("change", spurStarten);
alles();
fluesseStarten();
let neuT = 0;
const neu = () => {
  clearTimeout(neuT);
  randlichterAus();
  neuT = setTimeout(() => {
    geometrie();
    walzeEinpassen();
    if (!buehne?.classList.contains("ist-faehrt")) randlichter();
    kreisStarten();
    streifMessen();
  }, 160);
};
window.addEventListener("resize", neu);
buehneMq.addEventListener("change", alles);
bewegungAus.addEventListener("change", alles);
// Schrift geladen (Systemschrift, aber Maße können sich nach dem ersten Zeichnen noch setzen)
document.fonts?.ready.then(() => {
  geometrie();
  walzeEinpassen();
});
