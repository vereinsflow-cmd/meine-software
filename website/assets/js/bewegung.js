// VereinsFlow – Website, nur Startseite: Bewegung – die Explosion (Kapitel 1) läuft von selbst ab, sobald man scrollt;
// Aussage (2), Metall-Zahlen (4, 5, 6, 8, 9) und großes Telefon (6) folgen dem Scrollen. Die Bewegung selbst steht in
// site.css (Abschnitt 17: Keyframes, nur transform und opacity). Dieses Skript
//   - startet die Explosion: Steht die Seite oben, liegt sie zerlegt. Sobald die Leseposition die Schwelle überschreitet
//     (mehr als 20 px, gleich ob Mausrad, Trackpad, Tastatur oder Finger), setzt sie sich von selbst zusammen: Ihre
//     CSS-Animationen (2,5 s, in site.css angehalten) laufen auf der Zeitleiste des Dokuments ab – auf dem Compositor,
//     ohne Arbeit je Bild hier. Zurück ganz oben (unter 4 px) läuft sie rückwärts auseinander. Ein Richtungswechsel
//     mitten im Ablauf kehrt nur die Richtung um, vom aktuellen Stand aus; zwischen den beiden Schwellen
//     bleibt alles, wie es ist (kein Flattern). Die Seite selbst scrollt dabei nie, Eingaben werden nicht abgefangen.
//     Wird die Seite mitten geladen (Neuladen mit wiederhergestellter Leseposition, Sprungmarke), steht die Explosion
//     gleich zusammengesetzt da, ebenso nach einem Sprung weit hinter die Bühne,
//   - meldet, wann die Explosion zerlegt in Ruhe liegt (.ist-zerlegt an der Strecke, Ablauf beendet): Nur dann hebt die
//     Maus in site.css einzelne Ebenen heraus (Abschnitt 17, „Herausheben“; reine CSS-Sache, hier kein Zeigerereignis),
//   - dekodiert die Bilder der Explosion vorab (img.decode) und die des Telefons, sobald es nahe ist (sonst würde beim
//     Einblenden nachgerastert), und gibt will-change nur Bühnen nahe am Fenster (.ist-nah, IntersectionObserver),
//   - führt ohne scroll-driven animations (Firefox, ältere Safari) Aussage, Metall-Zahlen und Telefon nach dem Scrollstand:
//     site.css hält sie mit 1 s Dauer an, hier wird je Bild currentTime = Fortschritt × 1 s gesetzt – gebündelt in
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
  const DAUER = 1000; // ms – Dauer der angehaltenen Scroll-Animationen in site.css
  const an = () => !weniger.matches && !root.classList.contains("ist-ruhig");
  // CSS-Animationen eines Elements samt Nachfahren und Pseudo-Elementen (::after der Ebenen)
  const cssAnimationen = (el) => (el && el.getAnimations ? el.getAnimations({ subtree: true }).filter((a) => "animationName" in a) : []);

  // Bühnen = die Elemente mit einer Zeitleiste in site.css. Die Strecken (Explosion immer, Telefon ab 900 px) halten
  // ihre Bühne gepinnt: Spanne „contain“ (von „Oberkante unter der Kopfleiste“ bis „Unterkante am Fensterende“);
  // Aussage, Metall-Zahlen und das Telefon am Handy laufen über „cover“ (vom Eintreten bis zum Verlassen). Die Explosion
  // läuft auf der Zeit (unten) – ihre Strecke wird trotzdem gemessen (Umschalten, Sprünge).
  const buehnen = [...document.querySelectorAll("[data-explosion], [data-aussage], [data-telefon], .metall")].map((el) => ({
    el,
    zeit: el.matches("[data-explosion]"),
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
      b.anims = aktiv && !sd && !b.zeit ? cssAnimationen(b.el) : [];
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

  // ---- Ohne scroll-driven animations: je Bild die Zeit der angehaltenen Animationen setzen (nicht die Explosion) ----
  let geplant = 0;
  const zeichnen = () => {
    geplant = 0;
    if (!aktiv || sd) return;
    const y = window.scrollY;
    for (const b of buehnen) {
      if (!b.nah || b.zeit) continue;
      const p = fortschritt(b, y);
      if (Math.abs(p - b.p) < 0.0002) continue;
      b.p = p;
      for (const a of b.anims) a.currentTime = p * DAUER;
    }
  };
  const anfordern = () => {
    if (!geplant && aktiv && !sd) geplant = window.requestAnimationFrame(zeichnen);
  };

  // ---- Explosion: läuft auf der Zeit. Ziel 0 = zerlegt, 1 = zusammengesetzt ----
  const ex = buehnen.find((b) => b.zeit);
  const AB = 20; // px: weiter unten setzt sie sich zusammen
  const OBEN = 4; // px: darüber (ganz oben) läuft sie auseinander – dazwischen bleibt das Ziel (Hysterese)
  let exAnims = [];
  let exZiel = 0;
  let exLaufen = false; // zum Ziel ablaufen (true) oder gleich dort stehen (false)
  // Vor der ersten Eingabe (Rad, Finger, Taste, Zeiger) und bis kurz nach dem Laden scrollt nur der Browser selbst
  // (Leseposition wiederherstellen, Sprungmarke): dann gleich ans Ziel, ohne Ablauf
  let frei = false;
  const freigeben = () => {
    frei = true;
  };
  for (const typ of ["wheel", "touchstart", "keydown", "pointerdown"]) window.addEventListener(typ, freigeben, { capture: true, passive: true, once: true });

  const exDauer = (a) => (a.effect ? a.effect.getComputedTiming().endTime : 0);
  const rueckwaerts = (a) => Boolean(a.effect) && a.effect.getTiming().direction === "reverse";
  const exRichtung = (a, rueck) => {
    if (a.effect && rueckwaerts(a) !== rueck) a.effect.updateTiming({ direction: rueck ? "reverse" : "normal" });
  };
  // Stand im Sinne des Zusammenbaus (0 = zerlegt … Dauer = zusammengesetzt), gleich in welcher Richtung sie läuft; eine
  // laufende Animation wird mit der Zeit „jetzt“ aus ihrer Startzeit gerechnet (dieselbe Zeit wie beim Neustart unten)
  const exStand = (a, jetzt) => {
    const d = exDauer(a);
    const laeuft = a.playState === "running" && a.startTime !== null;
    const t = Math.min(d, Math.max(0, laeuft ? (jetzt - a.startTime) * a.playbackRate : (a.currentTime ?? 0)));
    return rueckwaerts(a) ? d - t : t;
  };
  // Die Animationen holen. WebKit legt sie mitunter erst nach dem Start dieses Skripts an, nach dem Umschalten und bei
  // einem Wechsel über 900 px (Beschriftung ↔ Legende) entstehen neue: Sie übernehmen Stand und Richtung der übrigen bzw.
  // stehen am Ziel – alles bleibt im Gleichschritt.
  const exHolen = () => {
    if (!aktiv || !ex) {
      exAnims = [];
      return;
    }
    const vorher = new Set(exAnims);
    const ref = exAnims.find((a) => a.playState !== "idle");
    exAnims = cssAnimationen(ex.el);
    for (const a of exAnims) {
      if (vorher.has(a)) continue;
      if (ref && ref.playState === "running" && ref.startTime !== null) {
        exRichtung(a, rueckwaerts(ref));
        a.playbackRate = 1;
        a.startTime = ref.startTime;
      } else {
        const stand = ref ? exStand(ref, performance.now()) : exZiel ? exDauer(a) : 0;
        a.pause();
        exRichtung(a, false);
        a.currentTime = Math.min(exDauer(a), stand);
      }
    }
  };
  // Ans Ziel: ablaufen – vom aktuellen Stand aus; läuft sie gerade in die andere Richtung, kehrt sie nur um – oder gleich
  // dort stehen (Laden, Sprung, Umschalten). Rückwärts heißt: dieselbe Animation mit direction: reverse, vorwärts
  // abgespielt (playbackRate 1) – mit negativer playbackRate läge die Startzeit in der Zukunft, und Chromium spielte sie
  // dann nicht auf dem Compositor ab (gemessen: 13 statt 150 Bilder). Gestartet wird über eine gemeinsame Startzeit aus
  // performance.now() (die Zeitleiste des Dokuments hat denselben Nullpunkt): Alle Teile laufen exakt im Gleichschritt,
  // beim Umkehren geht die Bewegung genau dort weiter, wo sie ist, und WebKit kann nicht mit seiner zwischengespeicherten,
  // veralteten Zeit der Zeitleiste rechnen (mit play() sprang der Ablauf dort beim Start um die Ruhezeit davor nach vorn).
  const exAnwenden = () => {
    exHolen();
    const jetzt = performance.now();
    const rueck = !exZiel;
    for (const a of exAnims) {
      const d = exDauer(a);
      if (!exLaufen) {
        a.pause();
        exRichtung(a, false);
        a.currentTime = exZiel ? d : 0;
        continue;
      }
      if (a.playState === "running" && a.startTime !== null && rueckwaerts(a) === rueck) continue;
      const stand = exStand(a, jetzt);
      if (exZiel ? stand >= d : stand <= 0) continue;
      exRichtung(a, rueck);
      a.playbackRate = 1;
      a.startTime = jetzt - (rueck ? d - stand : stand);
    }
    exRuhe();
  };
  // Zerlegt in Ruhe (Ziel 0, Ablauf beendet): .ist-zerlegt an der Strecke – erst dann hebt die Maus Ebenen heraus
  // (site.css Abschnitt 17). Läuft sie gerade auseinander, wird nach der restlichen Zeit noch einmal nachgesehen; mit dem
  // Ziel 1 (oder ohne Bewegung) fällt die Klasse sofort weg.
  let ruheUhr = 0;
  const exRuhe = () => {
    window.clearTimeout(ruheUhr);
    ruheUhr = 0;
    if (!ex) return;
    if (!aktiv || exZiel) {
      ex.el.classList.remove("ist-zerlegt");
      return;
    }
    const jetzt = performance.now();
    const rest = exAnims.reduce((m, a) => Math.max(m, exStand(a, jetzt)), 0);
    if (rest <= 0) ex.el.classList.add("ist-zerlegt");
    else ruheUhr = window.setTimeout(exRuhe, rest + 40);
  };
  // beim Scrollen: nur die Schwellen vergleichen (keine Layout-Abfrage), nur beim Überschreiten etwas tun
  const exPruefen = () => {
    if (!aktiv || !ex) return;
    const y = window.scrollY;
    const ziel = y > AB ? 1 : y < OBEN ? 0 : exZiel;
    if (ziel === exZiel) return;
    exZiel = ziel;
    // noch beim Laden oder weit hinter die Bühne gesprungen (sie ist nicht mehr zu sehen): gleich ans Ziel
    exLaufen = frei && y + kopf < ex.oben + ex.hoch;
    exAnwenden();
  };
  // Zustand aus der Leseposition, ohne Ablauf (Start; nach dem Umschalten). Beim Start zählt auch eine Sprungmarke, deren
  // Ziel unterhalb der Schwelle liegt – der Browser springt womöglich erst nach diesem Skript dorthin.
  const sprungUnten = () => {
    let id = "";
    try {
      id = decodeURIComponent(window.location.hash.slice(1));
    } catch {
      return false;
    }
    const ziel = id ? document.getElementById(id) : null;
    return Boolean(ziel) && ziel.getBoundingClientRect().top + window.scrollY - kopf - 16 > AB;
  };
  const exStart = (mitSprung) => {
    exZiel = window.scrollY > AB || (mitSprung && sprungUnten()) ? 1 : 0;
    exLaufen = false;
    exAnims = [];
    exAnwenden();
  };
  // Nach dem Laden: frei für den Ablauf, und einmal nachsehen, ob (in WebKit) inzwischen Animationen entstanden sind
  const nachLaden = () =>
    window.setTimeout(() => {
      freigeben();
      exHolen();
    }, 300);
  if (document.readyState === "complete") nachLaden();
  else window.addEventListener("load", nachLaden, { once: true });
  if (breit.addEventListener) breit.addEventListener("change", exHolen);
  else if (breit.addListener) breit.addListener(exHolen);

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
    // die Animationen der Explosion sind neu (bzw. weg): Zustand aus der neuen Leseposition, ohne Ablauf
    exStart(false);
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
      exPruefen();
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
  // nach dem Drucken (dort entfallen die Animationen): Explosion wieder in den Zustand der Leseposition, ohne Ablauf
  window.addEventListener("afterprint", () => exStart(false));
  // Seitenhöhe ändert sich (Fragen aufgeklappt, Bilder geladen): nach dem Layout messen – dann ist es frisch
  if ("ResizeObserver" in window) {
    new ResizeObserver(() => {
      messen();
      anfordern();
    }).observe(document.body);
  }

  messen();
  exStart(true);
  if (aktiv && ex) dekodieren(ex.el);
  zeichnen();
})();
