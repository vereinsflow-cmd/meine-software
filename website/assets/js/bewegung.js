// VereinsFlow – Website, nur Startseite: Bewegung beim Scrollen – Explosion (Kapitel 1), Aussage (2), Metall-Zahlen
// (4, 5, 6, 8, 9) und großes Telefon (6). Die Bewegung selbst steht in site.css (Abschnitt 17: Keyframes, nur transform
// und opacity). Kann der Browser scroll-driven animations (Chromium, Safari ab 26), führt er sie selbst aus – auf dem
// Compositor; dieses Skript tut beim Scrollen dann nichts außer sich den Scrollstand zu merken. Es
//   - dekodiert die Bilder der Explosion vorab (img.decode) und die des Telefons, sobald es nahe ist (sonst würde beim
//     Einblenden nachgerastert), und gibt will-change nur Bühnen nahe am Fenster (.ist-nah, IntersectionObserver),
//   - führt ohne scroll-driven animations (Firefox, ältere Safari) dieselben Animationen nach dem Scrollstand: site.css
//     hält sie mit 1 s Dauer an, hier wird je Bild currentTime = Fortschritt × 1 s gesetzt – gebündelt in
//     requestAnimationFrame, mit passiven Scroll-Ereignissen, aus zwischengespeicherter Lage der Bühnen (neu gemessen,
//     wenn sich Fenster oder Seitenhöhe ändern) und nur für Bühnen nahe am Fenster; keine Layout-Abfrage je Bild,
//   - hält die Leseposition, wenn „Bewegung anhalten“ (html.ist-ruhig, Ereignis vf:ruhe aus site.js) oder „Bewegung
//     reduzieren“ zur Laufzeit wechseln: Die Strecken klappen ein bzw. auf, die Seite springt dabei nicht (Safari kennt
//     kein Scroll-Anchoring; Chromium und Firefox würden es nur ungefähr halten).
// Ohne JavaScript, mit „Bewegung reduzieren“ und mit „Bewegung anhalten“ steht alles in der Endlage (site.css). Keine
// Bibliotheken, keine Netzwerkzugriffe; Werte nur per CSSOM (die Content-Security-Policy verbietet Inline-Stile).
(() => {
  const root = document.documentElement;
  const strecken = [...document.querySelectorAll("[data-explosion], [data-telefon]")];
  if (!strecken.length) return;
  const weniger = window.matchMedia("(prefers-reduced-motion: reduce)");
  const breit = window.matchMedia("(min-width: 900px)");
  // wie @supports in site.css: Zeitleiste und Spanne
  const sd = Boolean(window.CSS && CSS.supports && CSS.supports("(animation-timeline: view()) and (animation-range: contain 0% contain 100%)"));
  const DAUER = 1000; // ms – Dauer der angehaltenen Animationen in site.css
  const an = () => !weniger.matches && !root.classList.contains("ist-ruhig");

  // Bühnen = die Elemente mit einer Zeitleiste in site.css. Die Strecken (Explosion immer, Telefon ab 900 px) halten
  // ihre Bühne gepinnt: Spanne „contain“ (von „Oberkante unter der Kopfleiste“ bis „Unterkante am Fensterende“);
  // Aussage, Metall-Zahlen und das Telefon am Handy laufen über „cover“ (vom Eintreten bis zum Verlassen).
  const buehnen = [...document.querySelectorAll("[data-explosion], [data-aussage], [data-telefon], .metall")].map((el) => ({
    el,
    pin: el.matches("[data-explosion]") ? () => true : el.matches("[data-telefon]") ? () => breit.matches : () => false,
    oben: 0,
    hoch: 0,
    buehne: 0,
    anims: [],
    p: -1,
    nah: false,
  }));
  const zuStrecke = new Map(buehnen.map((b) => [b.el, b]));
  let aktiv = an();
  let kopf = 52;
  let fenster = window.innerHeight;
  let letzteY = window.scrollY;

  // ---- Lage messen: beim Start, wenn sich Fenster oder Seitenhöhe ändern und nach dem Umschalten (nie beim Scrollen) ----
  const messen = () => {
    kopf = parseFloat(getComputedStyle(root).getPropertyValue("--kopf-h")) || 52;
    fenster = window.innerHeight;
    const y = window.scrollY;
    for (const b of buehnen) {
      const r = b.el.getBoundingClientRect();
      b.oben = r.top + y;
      b.hoch = r.height;
      b.buehne = strecken.includes(b.el) ? b.el.firstElementChild.getBoundingClientRect().height : b.hoch;
      b.p = -1;
      b.anims = aktiv && !sd ? b.el.getAnimations({ subtree: true }).filter((a) => "animationName" in a) : [];
    }
    letzteY = y;
  };

  // Fortschritt 0 … 1 einer Bühne beim Scrollstand y (wie die Zeitleisten in site.css, die Kopfleiste abgezogen)
  const fortschritt = (b, y) => {
    let a;
    let e;
    if (b.pin()) {
      a = b.oben - kopf;
      e = b.oben + b.hoch - fenster;
      if (b.hoch < fenster - kopf) [a, e] = [e, a];
    } else {
      a = b.oben - fenster;
      e = b.oben + b.hoch - kopf;
    }
    return e > a ? Math.min(1, Math.max(0, (y - a) / (e - a))) : 1;
  };

  // ---- Ohne scroll-driven animations: je Bild die Zeit der angehaltenen Animationen setzen ----
  let geplant = 0;
  const zeichnen = () => {
    geplant = 0;
    if (!aktiv || sd) return;
    const y = window.scrollY;
    for (const b of buehnen) {
      if (!b.nah) continue;
      const p = fortschritt(b, y);
      if (Math.abs(p - b.p) < 0.0002) continue;
      b.p = p;
      for (const a of b.anims) a.currentTime = p * DAUER;
    }
  };
  const anfordern = () => {
    if (!geplant && aktiv && !sd) geplant = window.requestAnimationFrame(zeichnen);
  };

  // ---- Bilder vorab dekodieren (einmal je Bild) ----
  const dekodiert = new WeakSet();
  const dekodieren = (el) => {
    for (const img of el.querySelectorAll("img")) {
      if (dekodiert.has(img) || !img.decode) continue;
      dekodiert.add(img);
      img.decode().catch(() => {});
    }
  };

  // ---- Nähe: will-change (.ist-nah) und Rückfall nur für Bühnen im oder nahe am Fenster ----
  if ("IntersectionObserver" in window) {
    const io = new IntersectionObserver(
      (eintraege) => {
        for (const e of eintraege) {
          const b = zuStrecke.get(e.target);
          b.nah = e.isIntersecting;
          b.p = -1;
          b.el.classList.toggle("ist-nah", b.nah);
          if (b.nah && aktiv) dekodieren(b.el);
        }
        anfordern();
      },
      { rootMargin: "50% 0px 50% 0px" },
    );
    for (const b of buehnen) io.observe(b.el);
  } else {
    for (const b of buehnen) b.nah = true;
  }

  // ---- Umschalten zur Laufzeit ohne Sprung. Zwischen den Strecken ist das Layout in beiden Zuständen gleich; in einer
  // Strecke bleibt die Bühne, wo sie war: eingeklappt steht sie oben, aufgeklappt am Ende ihres Wegs (Endlage, wie
  // vorher zu sehen). Gerechnet wird mit der Lage vor dem Umschalten und dem letzten Scrollstand – beim Messen danach
  // hat Chromium womöglich schon selbst verschoben. ----
  const abbilden = (y, alt) => {
    const d = y + kopf;
    let i = -1;
    alt.forEach((a, k) => {
      if (a.oben <= d) i = k;
    });
    if (i < 0) return y;
    const a = alt[i];
    const n = zuStrecke.get(strecken[i]);
    const o = d - a.oben;
    if (o >= a.hoch) return n.oben + n.hoch + (o - a.hoch) - kopf;
    const inBuehne = Math.min(Math.max(0, o - (a.hoch - a.buehne)), n.buehne);
    return n.oben + (n.hoch - n.buehne) + inBuehne - kopf;
  };
  const umschalten = () => {
    const jetzt = an();
    if (jetzt === aktiv) return;
    const alt = strecken.map((el) => {
      const b = zuStrecke.get(el);
      return { oben: b.oben, hoch: b.hoch, buehne: b.buehne };
    });
    const y = letzteY;
    aktiv = jetzt;
    messen();
    const ziel = Math.max(0, Math.round(abbilden(y, alt)));
    if (Math.abs(ziel - window.scrollY) >= 1) window.scrollTo(0, ziel);
    letzteY = window.scrollY;
    if (aktiv) {
      for (const b of buehnen) if (b.nah) dekodieren(b.el);
      zeichnen();
    }
  };
  document.addEventListener("vf:ruhe", umschalten);
  if (weniger.addEventListener) weniger.addEventListener("change", umschalten);
  else if (weniger.addListener) weniger.addListener(umschalten);

  // ---- Ereignisse ----
  window.addEventListener(
    "scroll",
    () => {
      letzteY = window.scrollY;
      anfordern();
    },
    { passive: true },
  );
  let messenGeplant = 0;
  const spaeterMessen = () => {
    if (messenGeplant) return;
    messenGeplant = window.requestAnimationFrame(() => {
      messenGeplant = 0;
      messen();
      anfordern();
    });
  };
  window.addEventListener("resize", spaeterMessen);
  window.addEventListener("orientationchange", spaeterMessen);
  window.addEventListener("pageshow", spaeterMessen);
  // Seitenhöhe ändert sich (Fragen aufgeklappt, Bilder geladen): nach dem Layout messen – dann ist es frisch
  if ("ResizeObserver" in window) {
    new ResizeObserver(() => {
      messen();
      anfordern();
    }).observe(document.body);
  }

  messen();
  if (aktiv) dekodieren(strecken[0]);
  zeichnen();
})();
