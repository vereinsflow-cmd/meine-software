// VereinsFlow – Website: Menü, Kopfzeile, Einblenden beim Scrollen, aktiver Abschnitt mit gleitender Markierung,
// Slider, Reiter, hochzählende Kennzahlen, Lichtschein auf Karten, Ladezustand der Bilder und Start der Vorführungen.
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
  for (const img of document.querySelectorAll(".browser img:not(.live-frame), .phone img, .laptop-screen img")) {
    const frame = img.closest(".browser, .phone, .laptop-screen");
    if (!frame || (img.complete && img.naturalWidth > 0)) continue;
    frame.classList.add("is-loading");
    const done = () => frame.classList.remove("is-loading");
    img.addEventListener("load", done, { once: true });
    img.addEventListener("error", done, { once: true });
  }

  // Vorführungen (Laptop, Telefon): Die Geräte bewegen sich von selbst, sobald sie zur Hälfte im Bild sind – einmal je
  // Aufruf (CSS-Animationen, site.css). Danach Ruhelage: Der Abschnitt bekommt .is-rest, und das CSS hängt die Animationen
  // ab – Chromium setzt Ebenen mit angehängter Transform-Animation nicht auf ganze Pixel, ohne sie stehen die Bildschirme
  // wieder Pixel für Pixel scharf. Ohne IntersectionObserver gleich die Endlage.
  for (const showcase of document.querySelectorAll(".showcase")) {
    const scene = showcase.querySelector(".showcase-scene");
    showcase.addEventListener("animationend", (event) => {
      if (event.animationName.endsWith("-body")) showcase.classList.add("is-rest"); // vf-laptop-body, vf-phone-body
    });
    if (!canObserve || !scene) {
      showcase.classList.add("is-rest");
      continue;
    }
    const observer = new IntersectionObserver(
      (entries) => {
        if (!entries.some((entry) => entry.isIntersecting)) return;
        showcase.classList.add("is-playing");
        observer.disconnect();
      },
      { threshold: 0.5, rootMargin: "0px 0px -8% 0px" },
    );
    observer.observe(scene);
  }

  // Live-Fenster: In Browserbildern bedient ein Mauszeiger die Anwendung (site.css „Live-Fenster“). Je Fenster ein kurzer
  // Ablaufplan: frame n = Bild n der Folge einblenden (0 = das ruhige Bild), move = Zeiger zu einer Stelle (Prozent des
  // Bildes, Werte aus tools/capture-screenshots.mjs), click = Einfedern und Ring, show/hide = Zeiger ein-/ausblenden,
  // keys = Tastenkürzel einblenden, wait = Pause (ms). Der Plan wiederholt sich, solange das Fenster im Bild ist (und
  // sein Reiter gewählt), und beginnt jedes Mal von vorn – erst wenn alle Bilder geladen sind. Bei reduzierter Bewegung
  // bleibt es beim ruhigen Bild (die Folge wird gar nicht geladen).
  const LIVE_SCENES = {
    // Helferschichten: beim Getränkestand eintragen, dann zu „Drucken“
    schichten: {
      rest: "55% 93%",
      steps: [
        ["frame", 1], ["show"], ["wait", 1000],
        ["move", "82% 72.14%", 1150], ["frame", 2], ["wait", 450], ["click"], ["frame", 3], ["wait", 1900],
        ["frame", 0], ["move", "92.62% 15.19%", 1100], ["frame", 4], ["wait", 1300],
        ["frame", 0], ["move", "55% 93%", 1000], ["hide"], ["wait", 900],
      ],
    },
    // Suche: Strg K, „Hel“ tippen, auf einen Treffer zeigen
    suche: {
      rest: "72% 90%",
      steps: [
        ["frame", 1], ["wait", 900], ["keys", true], ["wait", 650], ["frame", 2], ["wait", 400], ["keys", false], ["wait", 600],
        ["frame", 3, 90], ["wait", 280], ["frame", 4, 90], ["wait", 280], ["frame", 0, 90], ["wait", 900],
        ["show"], ["move", "37.07% 37.63%", 1000], ["frame", 5, 150], ["wait", 1900],
        ["frame", 0, 150], ["move", "72% 90%", 900], ["hide"], ["wait", 900],
      ],
    },
    // Mitglieder: ins Suchfeld klicken, „Koch“ tippen, filtern
    mitglieder: {
      rest: "45% 82%",
      steps: [
        ["frame", 0], ["show"], ["wait", 900],
        ["move", "8.98% 29.51%", 1100], ["click"], ["frame", 1, 150], ["wait", 650], ["frame", 2, 120], ["wait", 800],
        ["move", "93.31% 29.51%", 1100], ["frame", 3, 150], ["wait", 400], ["click"], ["frame", 4], ["wait", 2400],
        ["move", "45% 82%", 1000], ["hide"], ["wait", 900],
      ],
    },
    // Kalender: Wochenansicht und zurück zum Monat
    veranstaltungen: {
      rest: "58% 86%",
      steps: [
        ["frame", 0], ["show"], ["wait", 900],
        ["move", "81.84% 29.64%", 1100], ["frame", 1, 150], ["wait", 400], ["click"], ["frame", 2], ["wait", 2300],
        ["move", "74.11% 29.64%", 700], ["frame", 3, 150], ["wait", 400], ["click"], ["frame", 0], ["wait", 900],
        ["move", "58% 86%", 900], ["hide"], ["wait", 900],
      ],
    },
    // Auswertungen: Diagramm als Fläche, als Balken, wieder als Linie
    auswertungen: {
      rest: "62% 88%",
      steps: [
        ["frame", 0], ["show"], ["wait", 900],
        ["move", "45.8% 34.89%", 1000], ["click"], ["frame", 1], ["wait", 1900],
        ["move", "56.21% 34.89%", 650], ["click"], ["frame", 2], ["wait", 1900],
        ["move", "36.12% 34.89%", 850], ["click"], ["frame", 0], ["wait", 1300],
        ["move", "62% 88%", 900], ["hide"], ["wait", 900],
      ],
    },
  };
  const liveWindows = [...document.querySelectorAll(".live[data-live]")];
  if (liveWindows.length && canObserve && !reduceMotion) {
    const ease = "cubic-bezier(0.45, 0, 0.25, 1)"; // sanftes Ease-in-out
    for (const live of liveWindows) {
      const scene = LIVE_SCENES[live.dataset.live];
      const frames = [...live.querySelectorAll(".live-frame")];
      const pointer = live.querySelector(".live-pointer");
      const cursor = live.querySelector(".live-cursor");
      const ring = live.querySelector(".live-ring");
      const keys = live.querySelector(".live-keys");
      if (!scene || !frames.length || !pointer || !cursor || !ring) continue;
      let run = 0; // Nummer des laufenden Durchgangs – ändert sie sich, bricht der alte ab
      let at = scene.rest;
      let layer = 1;
      let ready = null;
      const load = () => {
        live.classList.add("is-live"); // Ebenen einhängen: erst jetzt lädt der Browser die Bilder der Folge
        return (ready ??= Promise.all(
          frames.map((img) => {
            img.loading = "eager";
            return img.decode().catch(() => {});
          }),
        ));
      };
      const place = (spot) => {
        at = spot;
        pointer.style.setProperty("translate", spot);
      };
      const reset = () => {
        for (const img of frames) {
          img.style.setProperty("transition-duration", "0ms");
          img.classList.remove("is-on");
          img.style.removeProperty("z-index");
        }
        layer = 1;
        pointer.classList.remove("is-on");
        keys?.classList.remove("is-on");
        place(scene.rest);
      };
      // Überblenden: das neue Bild legt sich darüber und blendet ein; darunterliegende gehen danach aus. Beim ruhigen
      // Bild (0) blendet das oberste aus. So scheint nie ein falsches Bild durch.
      const frame = (n, fade = 280) => {
        const next = frames[n - 1];
        const shown = frames.filter((img) => img.classList.contains("is-on"));
        if (next) {
          next.style.setProperty("z-index", String(++layer));
          next.style.setProperty("transition-duration", `${fade}ms`);
          next.classList.add("is-on");
          const id = run;
          setTimeout(() => {
            if (id !== run) return; // inzwischen angehalten oder neu begonnen
            for (const img of shown) {
              if (img === next) continue;
              img.style.setProperty("transition-duration", "0ms");
              img.classList.remove("is-on");
            }
          }, fade + 30);
        } else {
          for (const img of shown) {
            img.style.setProperty("transition-duration", `${fade}ms`);
            img.classList.remove("is-on");
          }
        }
      };
      const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
      const move = async (spot, ms) => {
        const motion = pointer.animate([{ translate: at }, { translate: spot }], { duration: ms, easing: ease, fill: "forwards" });
        await motion.finished.catch(() => {});
        place(spot);
        motion.cancel();
      };
      const click = async () => {
        cursor.animate([{ scale: 1 }, { scale: 0.86 }, { scale: 1 }], { duration: 260, easing: "ease-out" });
        ring.animate(
          [
            { opacity: 0, scale: 0.2 },
            { opacity: 1, scale: 0.4, offset: 0.15 },
            { opacity: 0, scale: 1 },
          ],
          { duration: 620, easing: "ease-out" },
        );
        await wait(140);
      };
      const play = async (id) => {
        await load();
        for (let round = 0; id === run; round++) {
          for (const [step, a, b] of scene.steps) {
            if (id !== run) return;
            if (step === "frame") frame(a, round === 0 && a && !frames.some((img) => img.classList.contains("is-on")) ? 0 : b);
            else if (step === "move") await move(a, b);
            else if (step === "click") await click();
            else if (step === "show") pointer.classList.add("is-on");
            else if (step === "hide") pointer.classList.remove("is-on");
            else if (step === "keys") keys?.classList.toggle("is-on", a);
            else if (step === "wait") await wait(a);
          }
        }
      };
      let visible = false;
      const decide = () => {
        const should = visible && !live.closest("[inert]") && document.visibilityState === "visible";
        const running = run % 2 === 1; // ungerade = läuft
        if (should === running) return;
        run++;
        if (should) play(run);
        else reset();
      };
      reset();
      new IntersectionObserver(
        (entries) => {
          visible = entries.some((entry) => entry.isIntersecting);
          decide();
        },
        { threshold: 0.4 },
      ).observe(live);
      document.addEventListener("visibilitychange", decide);
      document.addEventListener("vf:tabs", decide); // Reiter „Im Detail“ gewechselt
    }
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

  // Slider (Funktionen immer, Rollen und Sicherheit nur auf dem Smartphone – .slider-phone): Die Karten stehen in einer
  // waagerechten Reihe (site.css), die man wischt oder mit den Pfeilen bzw. Pfeiltasten blättert – jeweils eine Karte
  // weiter, weich gleitend (bei reduzierter Bewegung sofort). Karten, die nicht ganz im Bild stehen, werden blass
  // (.is-dim); ein Klick darauf holt sie herein. Am Anfang bzw. Ende sind die Pfeile ohne Wirkung (aria-disabled – so
  // bleibt der Fokus auf ihnen). Eine unsichtbare Zeile sagt Screenreadern nach dem Blättern, welche Karten zu sehen sind.
  const motion = window.matchMedia("(prefers-reduced-motion: reduce)");
  const phone = window.matchMedia("(max-width: 599px)");
  for (const slider of document.querySelectorAll(".slider")) {
    const track = slider.querySelector(".slider-track");
    const prevButton = slider.querySelector(".slider-prev");
    const nextButton = slider.querySelector(".slider-next");
    if (!track || !prevButton || !nextButton) continue;
    const cards = [...track.children];
    const bar = slider.querySelector(".slider-progress span");
    const status = slider.querySelector(".slider-status");
    const name = slider.dataset.sliderName ?? "Karten";
    let active = false;
    let pad = 0; // Innenabstand der Reihe = Abstand der Karten vom Rand des sichtbaren Bereichs (--bleed)
    // Einrastpunkte: jede Karte am Anfang des Inhaltsbereichs; zum Ende hin begrenzt – dort stehen die letzten gemeinsam
    const stops = () => {
      const max = track.scrollWidth - track.clientWidth;
      const list = [];
      for (const card of cards) {
        const stop = Math.round(Math.min(max, Math.max(0, card.offsetLeft - pad)));
        if (list.at(-1) !== stop) list.push(stop);
      }
      return list;
    };
    let aim = null; // Ziel eines laufenden Wechsels: schnell hintereinander geklickt, blättert es weiter statt zurück
    let first = 0;
    let last = 0;
    const goTo = (index) => {
      const list = stops();
      aim = Math.min(list.length - 1, Math.max(0, index));
      track.scrollTo({ left: list[aim], behavior: motion.matches ? "auto" : "smooth" });
    };
    const step = (delta) => {
      const list = stops();
      const current = list.reduce(
        (best, stop, index) => (Math.abs(stop - track.scrollLeft) < Math.abs(list[best] - track.scrollLeft) ? index : best),
        0,
      );
      goTo((aim ?? current) + delta);
    };
    let spoken = "";
    let interacted = false; // erst nach dem ersten Blättern ansagen, nicht schon beim Laden
    const announce = () => {
      if (!status || !interacted || !active) return;
      const text = first === last ? `${first + 1} von ${cards.length}` : `${first + 1} bis ${last + 1} von ${cards.length}`;
      if (text !== spoken) status.textContent = spoken = `${name} ${text}`;
    };
    let queued = false;
    const update = () => {
      queued = false;
      if (!active) return;
      const left = track.scrollLeft;
      const width = track.clientWidth;
      const total = track.scrollWidth;
      const zoneStart = left + pad;
      const zoneEnd = left + width - pad;
      let seenFirst = -1;
      cards.forEach((card, index) => {
        // offsetLeft/offsetWidth statt getBoundingClientRect: unabhängig von der Verkleinerung blasser Karten
        const start = card.offsetLeft;
        const end = start + card.offsetWidth;
        const inside = (Math.min(end, zoneEnd) - Math.max(start, zoneStart)) / card.offsetWidth > 0.9;
        card.classList.toggle("is-dim", !inside);
        if (inside) {
          if (seenFirst < 0) seenFirst = index;
          last = index;
        }
      });
      first = Math.max(0, seenFirst);
      const max = total - width;
      prevButton.setAttribute("aria-disabled", String(left <= 1));
      nextButton.setAttribute("aria-disabled", String(left >= max - 1));
      bar?.style.setProperty("--pos", (left / total).toFixed(4));
      bar?.style.setProperty("--size", (width / total).toFixed(4));
    };
    const schedule = () => {
      if (queued) return;
      queued = true;
      requestAnimationFrame(update);
    };
    // Ein- und ausschalten: .slider-phone nur auf dem Smartphone, sonst immer. Aus: Raster wie ohne JavaScript.
    const setActive = () => {
      const on = !slider.classList.contains("slider-phone") || phone.matches;
      if (on === active) return;
      active = on;
      slider.classList.toggle("is-slider", on);
      if (on) {
        track.setAttribute("tabindex", "0");
        track.setAttribute("role", "region");
        track.setAttribute("aria-roledescription", "Karussell");
        track.setAttribute("aria-label", `${name}, mit den Pfeiltasten blättern`);
      } else {
        for (const attribute of ["tabindex", "role", "aria-roledescription", "aria-label"]) track.removeAttribute(attribute);
        for (const card of cards) card.classList.remove("is-dim");
        track.scrollLeft = 0;
      }
    };
    let settle = 0;
    track.addEventListener(
      "scroll",
      () => {
        schedule();
        clearTimeout(settle);
        settle = setTimeout(() => {
          aim = null;
          announce();
        }, 160);
      },
      { passive: true },
    );
    const press = (button, delta) =>
      button.addEventListener("click", () => {
        if (button.getAttribute("aria-disabled") === "true") return;
        interacted = true;
        step(delta);
      });
    press(prevButton, -1);
    press(nextButton, 1);
    track.addEventListener("keydown", (event) => {
      if (!active) return;
      const moves = { ArrowLeft: () => step(-1), ArrowRight: () => step(1), Home: () => goTo(0), End: () => goTo(cards.length) };
      const move = moves[event.key];
      if (!move || event.altKey || event.ctrlKey || event.metaKey) return;
      event.preventDefault();
      interacted = true;
      move();
    });
    track.addEventListener("click", (event) => {
      const card = event.target instanceof Element ? event.target.closest(".slider-track > *") : null;
      if (!active || !card?.classList.contains("is-dim")) return;
      interacted = true;
      step(cards.indexOf(card) < first ? -1 : 1);
    });
    track.addEventListener("pointerdown", () => (interacted = true), { passive: true });
    const refresh = () => {
      setActive();
      pad = Number.parseFloat(getComputedStyle(track).paddingLeft) || 0;
      update();
    };
    phone.addEventListener("change", refresh);
    if ("ResizeObserver" in window) new ResizeObserver(refresh).observe(track);
    else window.addEventListener("resize", refresh, { passive: true });
    refresh();
  }

  // Reiter („Im Detail“): Ohne JavaScript stehen die Themen untereinander. Mit JavaScript erscheint die Reiterleiste,
  // immer ein Thema ist sichtbar. Bedienung wie bei Reitern üblich: Klick, Pfeiltasten (wählen sofort), Pos1/Ende.
  // Führt ein Link auf ein Thema (#suche aus der Fußzeile), wird dessen Reiter gewählt.
  for (const group of document.querySelectorAll("[data-tabs]")) {
    const list = group.querySelector('[role="tablist"]');
    const tabs = [...(list?.querySelectorAll('[role="tab"]') ?? [])];
    const panels = tabs.map((tab) => document.getElementById(tab.getAttribute("aria-controls") ?? ""));
    if (!list || !tabs.length || panels.some((panel) => !panel)) continue;
    const select = (index, focus = false) => {
      tabs.forEach((tab, i) => {
        const on = i === index;
        tab.setAttribute("aria-selected", String(on));
        tab.tabIndex = on ? 0 : -1;
        panels[i].classList.toggle("is-active", on);
        panels[i].toggleAttribute("inert", !on); // unsichtbare Themen: weder Fokus noch Vorlesen
      });
      if (focus) tabs[index].focus();
      document.dispatchEvent(new CustomEvent("vf:tabs")); // Live-Fenster: nur das sichtbare Thema läuft
    };
    for (const [i, panel] of panels.entries()) {
      panel.setAttribute("role", "tabpanel");
      panel.setAttribute("aria-labelledby", tabs[i].id);
    }
    list.hidden = false;
    group.classList.add("is-tabs");
    tabs.forEach((tab, i) => tab.addEventListener("click", () => select(i)));
    list.addEventListener("keydown", (event) => {
      const current = tabs.indexOf(document.activeElement);
      if (current < 0) return;
      const moves = { ArrowLeft: current - 1, ArrowRight: current + 1, Home: 0, End: tabs.length - 1 };
      if (!(event.key in moves)) return;
      event.preventDefault();
      select((moves[event.key] + tabs.length) % tabs.length, true);
    });
    const fromHash = () => {
      const index = panels.findIndex((panel) => `#${panel.id}` === location.hash);
      if (index >= 0) select(index);
      return index >= 0;
    };
    if (!fromHash()) select(0);
    window.addEventListener("hashchange", fromHash);
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
        const card = event.target instanceof Element ? event.target.closest(".card, .role") : null;
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
