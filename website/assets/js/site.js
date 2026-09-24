// VereinsFlow – Website: Menü, Kopfzeile, Einblenden beim Scrollen, aktiver Abschnitt mit gleitender Markierung,
// hochzählende Kennzahlen, Lichtschein auf Karten, Ladezustand der Bilder und – nur ohne Scroll-Timeline im Browser –
// Scrollfortschritt der Vorführungen.
// Ohne JavaScript bleibt die Seite vollständig les- und nutzbar. Keine Bibliotheken, keine Netzwerkzugriffe.
// Die Content-Security-Policy verbietet Inline-Stile im HTML; Werte wie Verzögerung oder Mausposition setzt das
// Skript über element.style.setProperty (CSSOM) – das ist davon nicht betroffen.
(() => {
  const root = document.documentElement;
  root.classList.add("js");
  const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const canHover = window.matchMedia("(hover: hover)").matches;
  const canObserve = "IntersectionObserver" in window;
  const header = document.querySelector(".site-header");

  // Mobiles Menü
  const toggle = document.querySelector(".nav-toggle");
  const nav = document.getElementById("site-nav");
  if (toggle && nav) {
    const setOpen = (open) => {
      toggle.setAttribute("aria-expanded", String(open));
      toggle.setAttribute("aria-label", open ? "Menü schließen" : "Menü öffnen");
      nav.classList.toggle("is-open", open);
      header?.classList.toggle("is-open", open); // Kopfzeile deckend, sonst entsteht über dem Einstieg eine Kante
    };
    const isOpen = () => toggle.getAttribute("aria-expanded") === "true";
    toggle.addEventListener("click", () => setOpen(!isOpen()));
    nav.addEventListener("click", (event) => {
      if (event.target instanceof Element && event.target.closest("a")) setOpen(false);
    });
    document.addEventListener("keydown", (event) => {
      if (event.key === "Escape" && isOpen()) {
        setOpen(false);
        toggle.focus();
      }
    });
    window.matchMedia("(min-width: 900px)").addEventListener("change", (event) => {
      if (event.matches) setOpen(false);
    });
  }

  // Kopfzeile: durchscheinender Grund erst nach dem Scrollen (höchstens einmal je Bild berechnet)
  if (header) {
    let queued = false;
    const update = () => {
      header.classList.toggle("is-scrolled", window.scrollY > 8);
      queued = false;
    };
    update();
    window.addEventListener(
      "scroll",
      () => {
        if (queued) return;
        queued = true;
        requestAnimationFrame(update);
      },
      { passive: true },
    );
  }

  // Bildschirmfotos: ruhiger Platzhalter, bis das Bild da ist; danach blendet es weich ein. Bereits geladene Bilder
  // (Zwischenspeicher) bleiben unberührt – so blitzt nichts auf.
  for (const img of document.querySelectorAll(".browser img, .phone img, .laptop-screen img")) {
    const frame = img.closest(".browser, .phone, .laptop-screen");
    if (!frame || (img.complete && img.naturalWidth > 0)) continue;
    frame.classList.add("is-loading");
    const done = () => frame.classList.remove("is-loading");
    img.addEventListener("load", done, { once: true });
    img.addEventListener("error", done, { once: true });
  }

  // Vorführungen (Laptop, Telefon): Die Bewegungen sind CSS-Animationen an einer Scroll-Timeline (site.css) und laufen
  // ohne Skript. Hier geschieht nur zweierlei:
  // - Ruhelage: Ist alles fertig bewegt (Fortschritt ab --vf-rest), bekommt der Abschnitt .is-rest, und das CSS hängt die
  //   Animationen ab – Chromium setzt Ebenen mit angehängter Transform-Animation nicht auf ganze Pixel, ohne sie stehen
  //   die Bildschirme wieder Pixel für Pixel scharf. Mit Scroll-Timeline meldet das ein IntersectionObserver an einer
  //   Marke (.showcase-rest), ganz ohne Arbeit beim Scrollen.
  // - Browser ohne Scroll-Timeline halten die Animationen an; dann wird hier ihre Zeit nach dem Fortschritt durch den
  //   Abschnitt gesetzt – 0, wenn er unten ins Fenster kommt, 1, wenn sein Ende unten ankommt (dieselbe Strecke wie die
  //   Timeline). Nur Zeit setzen: Die Animationen verändern bloß transform und opacity, der Browser muss dafür weder neu
  //   anordnen noch neu zeichnen. Entfallen die Animationen (reduzierte Bewegung, Druck, Ruhelage) und entstehen später
  //   neu, wird neu gesammelt.
  const showcases = [...document.querySelectorAll(".showcase")];
  const hasScrollTimeline =
    typeof CSS !== "undefined" && CSS.supports("(animation-timeline: view()) and (animation-range: entry 0% exit 0%)");
  if (showcases.length && hasScrollTimeline && canObserve) {
    const observer = new IntersectionObserver((entries) => {
      for (const entry of entries) {
        const rest = entry.isIntersecting || entry.boundingClientRect.bottom <= 0;
        entry.target.parentElement?.classList.toggle("is-rest", rest);
      }
    });
    for (const showcase of showcases) {
      const mark = document.createElement("span");
      mark.className = "showcase-rest";
      mark.setAttribute("aria-hidden", "true");
      showcase.append(mark);
      observer.observe(mark);
    }
  } else if (showcases.length && !hasScrollTimeline && typeof root.getAnimations === "function") {
    const collect = (showcase) =>
      showcase.getAnimations({ subtree: true }).filter((animation) => animation.animationName?.startsWith("vf-"));
    const tracks = showcases.map((showcase) => ({
      showcase,
      restAt: Number.parseFloat(getComputedStyle(showcase).getPropertyValue("--vf-rest")) || 1,
      rest: false,
      animations: collect(showcase),
      time: -1,
    }));
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)");
    let queued = false;
    const update = () => {
      queued = false;
      if (reduce.matches) return; // keine Animationen (site.css)
      // Höhe des Anfangsblocks statt innerHeight: Sie bleibt gleich, wenn auf dem Smartphone die Adressleiste ein- und
      // ausfährt (sonst spränge die Drehung), und entspricht der Bühne (100svh)
      const height = root.clientHeight;
      for (const track of tracks) {
        const box = track.showcase.getBoundingClientRect();
        const progress = Math.min(1, Math.max(0, (height - box.top) / box.height));
        const rest = progress >= track.restAt;
        if (rest !== track.rest) {
          track.rest = rest;
          track.showcase.classList.toggle("is-rest", rest);
          track.time = -1;
        }
        if (rest) continue;
        // Animationen neu entstanden (nach Ruhelage, Druck, geänderter Einstellung)? Dann die neuen nehmen
        if (!track.animations.length || track.animations[0].playState === "idle") track.animations = collect(track.showcase);
        const time = Math.round(progress * 10000) / 10; // in ms, 1 s lang
        if (time === track.time) continue; // davor: nichts zu tun
        track.time = time;
        for (const animation of track.animations) animation.currentTime = time;
      }
    };
    const schedule = () => {
      if (queued) return;
      queued = true;
      requestAnimationFrame(update);
    };
    const refresh = () => {
      for (const track of tracks) track.time = -1;
      update();
    };
    update();
    window.addEventListener("scroll", schedule, { passive: true });
    window.addEventListener("resize", schedule, { passive: true });
    reduce.addEventListener("change", refresh);
    window.addEventListener("afterprint", refresh);
  }

  // Kennzahlen zählen beim ersten Erscheinen hoch (nur, was beim Laden noch nicht zu sehen ist – sonst stünde kurz „0“ da)
  const armed = new Set();
  const countUp = (element) => {
    const target = Number(element.dataset.count);
    const start = performance.now();
    const duration = 1200;
    const frame = (now) => {
      const progress = Math.min(1, (now - start) / duration);
      element.textContent = String(Math.round(target * (1 - (1 - progress) ** 3)));
      if (progress < 1) requestAnimationFrame(frame);
    };
    requestAnimationFrame(frame);
  };

  // Sanftes Ein- und Ausblenden beim Scrollen. Versteckt wird nur, was gerade nicht zu sehen ist: beim Laden alles
  // außerhalb des Fensters, später alles, was das Fenster ganz verlassen hat. Kommt es zurück, gleitet es aus der
  // Richtung herein, aus der es kommt. Was gleichzeitig erscheint, folgt kurz nacheinander (Zeile für Zeile).
  const items = document.querySelectorAll(".reveal");
  if (items.length && canObserve && !reduceMotion) {
    const hide = (element, above) => {
      element.classList.toggle("from-above", above);
      element.style.setProperty("--reveal-delay", "0ms");
      element.classList.add("is-pending");
    };
    const show = (element, index) => {
      element.style.setProperty("--reveal-delay", `${Math.min(index, 6) * 70}ms`);
      element.classList.remove("is-pending");
      for (const counter of element.querySelectorAll(".count")) {
        if (!armed.delete(counter)) continue;
        setTimeout(() => countUp(counter), Math.min(index, 6) * 70 + 150);
      }
    };
    const observer = new IntersectionObserver(
      (entries) => {
        const entering = [];
        for (const entry of entries) {
          const element = entry.target;
          const box = entry.boundingClientRect;
          if (entry.isIntersecting) {
            if (element.classList.contains("is-pending")) entering.push({ element, box });
          } else if (box.bottom <= 0 || box.top >= window.innerHeight) {
            hide(element, box.bottom <= 0);
          }
        }
        entering.sort((a, b) => a.box.top - b.box.top || a.box.left - b.box.left);
        entering.forEach(({ element }, index) => show(element, index));
      },
      { rootMargin: "0px 0px -7% 0px", threshold: 0 },
    );
    const limit = window.innerHeight * 0.93;
    for (const element of items) {
      const box = element.getBoundingClientRect();
      if (box.top > limit || box.bottom < 0) {
        hide(element, box.bottom < 0);
        for (const counter of element.querySelectorAll(".count")) {
          // Breite der Endzahl vorhalten, damit beim Hochzählen nichts springt
          counter.style.setProperty("min-width", `${counter.textContent.trim().length}ch`);
          counter.textContent = "0";
          armed.add(counter);
        }
      }
      observer.observe(element);
    }
  }

  // Navigation: Abschnitt, der gerade in der Mitte des Fensters steht, wird hervorgehoben; eine Markierung gleitet
  // dorthin – und beim Überfahren zum Menüpunkt unter dem Mauszeiger.
  const links = [...document.querySelectorAll('.nav ul a[href^="#"]')];
  const sections = links.map((link) => document.getElementById(link.hash.slice(1))).filter(Boolean);
  const list = document.querySelector(".nav-links");
  const indicator = list?.querySelector(".nav-indicator");
  let activeLink = null;
  const moveIndicator = (link) => {
    if (!indicator || !list) return;
    if (!link || link.offsetParent === null) {
      indicator.classList.remove("is-visible");
      return;
    }
    const wasVisible = indicator.classList.contains("is-visible");
    indicator.classList.toggle("no-slide", !wasVisible || reduceMotion); // erstes Erscheinen: an Ort und Stelle einblenden
    const box = link.getBoundingClientRect();
    const origin = list.getBoundingClientRect();
    indicator.style.setProperty("--x", `${box.left - origin.left}px`);
    indicator.style.setProperty("--w", `${box.width}px`);
    indicator.classList.add("is-visible");
  };
  if (indicator && list) {
    for (const link of links) {
      link.addEventListener("pointerenter", () => moveIndicator(link));
      link.addEventListener("focus", () => moveIndicator(link));
    }
    list.addEventListener("pointerleave", () => moveIndicator(activeLink));
    list.addEventListener("focusout", (event) => {
      if (!list.contains(event.relatedTarget)) moveIndicator(activeLink);
    });
    window.addEventListener("resize", () => moveIndicator(activeLink), { passive: true });
  }
  if (sections.length && canObserve) {
    const inView = new Set();
    const spy = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) inView.add(entry.target);
          else inView.delete(entry.target);
        }
        const current = sections.find((section) => inView.has(section));
        activeLink = current ? links.find((link) => link.hash === `#${current.id}`) ?? null : null;
        for (const link of links) link.classList.toggle("is-active", link === activeLink);
        if (!list?.matches(":hover")) moveIndicator(activeLink);
      },
      { rootMargin: "-45% 0px -50% 0px" },
    );
    for (const section of sections) spy.observe(section);
  }

  // Lichtschein auf Karten folgt dem Mauszeiger (nur mit Maus, nicht bei reduzierter Bewegung)
  if (canHover && !reduceMotion) {
    let pending = null;
    let point = null;
    document.addEventListener(
      "pointermove",
      (event) => {
        const card = event.target instanceof Element ? event.target.closest(".card, .role, .step") : null;
        if (!card) return;
        point = { card, x: event.clientX, y: event.clientY };
        if (pending) return;
        pending = requestAnimationFrame(() => {
          pending = null;
          const box = point.card.getBoundingClientRect();
          point.card.style.setProperty("--mx", `${point.x - box.left}px`);
          point.card.style.setProperty("--my", `${point.y - box.top}px`);
        });
      },
      { passive: true },
    );
  }
})();
