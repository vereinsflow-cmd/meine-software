// VereinsFlow – Website: Menü, Kopfzeile, Einblenden beim Scrollen, aktiver Abschnitt mit gleitender Markierung,
// Karten der Funktionen, Reiter, hochzählende Kennzahlen, Lichtschein auf Karten, Ladezustand der Bilder und Start der
// Vorführungen.
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

  // Mobiles Menü. Der Knopf steht im HTML vor der Navigation, die Tabulatortaste führt von ihm also direkt zu den
  // Menüpunkten. Offen ist alles außer der Kopfzeile gesperrt (inert: kein Fokus, kein Vorlesen, kein Tippen), und der
  // Fokus springt auf den ersten Menüpunkt. Esc oder ein Tipp daneben schließt es, der Fokus kehrt dann zum Knopf zurück
  // (ein Menüpunkt springt dagegen zu seinem Abschnitt).
  const toggle = document.querySelector(".nav-toggle");
  const nav = document.getElementById("site-nav");
  if (toggle && nav) {
    const setOpen = (open) => {
      toggle.setAttribute("aria-expanded", String(open));
      toggle.setAttribute("aria-label", open ? "Menü schließen" : "Menü öffnen");
      nav.classList.toggle("is-open", open);
      header?.classList.toggle("is-open", open); // Kopfzeile deckend, sonst entsteht über dem Einstieg eine Kante
      for (const element of document.body.children) {
        if (element !== header && !element.matches("script, .sprite")) element.toggleAttribute("inert", open);
      }
      if (open) nav.querySelector("a")?.focus();
    };
    const isOpen = () => toggle.getAttribute("aria-expanded") === "true";
    const close = () => {
      const inside = nav.contains(document.activeElement);
      setOpen(false);
      if (inside) toggle.focus(); // der Menüpunkt ist gleich ausgeblendet – sonst stünde der Fokus nirgends
    };
    toggle.addEventListener("click", () => setOpen(!isOpen()));
    nav.addEventListener("click", (event) => {
      if (event.target instanceof Element && event.target.closest("a")) setOpen(false);
    });
    // Tipp neben das Menü (auf die Abdunkelung darunter) schließt es
    document.addEventListener("click", (event) => {
      if (isOpen() && event.target instanceof Node && !nav.contains(event.target) && !toggle.contains(event.target)) {
        close();
      }
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

  // Kopieren der E-Mail-Adresse im Kontaktbereich (für Webmail, wenn sich beim Klick kein E-Mail-Programm öffnet). Der
  // Knopf ist im HTML versteckt und erscheint nur, wenn der Browser die Zwischenablage anbietet (sichere Verbindung).
  for (const button of document.querySelectorAll("[data-copy]")) {
    if (!navigator.clipboard?.writeText) continue;
    button.hidden = false;
    const label = button.querySelector(".copy-label");
    const status = button.parentElement?.querySelector(".copy-status");
    const idle = label?.textContent ?? "";
    let timer = 0;
    button.addEventListener("click", async () => {
      try {
        await navigator.clipboard.writeText(button.dataset.copy ?? "");
      } catch {
        // Zwischenablage verweigert: Adresse markieren, dann genügt Strg+C bzw. ⌘C
        const address = button.parentElement?.querySelector('a[href^="mailto:"]');
        if (address) window.getSelection()?.selectAllChildren(address);
        if (status) status.textContent = "Kopieren hat nicht geklappt – die Adresse ist markiert.";
        return;
      }
      button.classList.add("is-done");
      if (label) label.textContent = "Kopiert";
      if (status) status.textContent = "E-Mail-Adresse kopiert.";
      clearTimeout(timer);
      timer = setTimeout(() => {
        button.classList.remove("is-done");
        if (label) label.textContent = idle;
        if (status) status.textContent = "";
      }, 2400);
    });
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
  // keys = Tastenkürzel einblenden, wait = Pause (ms). Im Kapitel Helferschichten außerdem: step n = Schritt n der Liste
  // darunter hervorheben (0 = keiner; data-shown am [data-story], dazu --story-ms = Dauer bis zum nächsten step für den
  // Balken), print = das gedruckte Blatt herausschieben bzw. zurück (.is-printed), phone n = im Telefon daneben Bild n
  // zeigen (0 = sein ruhiges Bild; so zeigen Telefon und Fenster immer denselben Stand). Der Plan wiederholt sich,
  // solange das Fenster im Bild ist (und sein Reiter gewählt), und beginnt jedes Mal von vorn – erst wenn alle Bilder
  // geladen sind. Bei reduzierter Bewegung bleibt es beim ruhigen Bild (die Folge wird gar nicht geladen).
  // Jedes Fenster hat einen Knopf „Anhalten“ (außerhalb der für Screenreader verborgenen Leiste, erscheint erst, wenn das
  // Fenster abspielen kann). Er gilt für alle Fenster der Seite zugleich – wer eines anhält, will auch in den anderen
  // Themen Ruhe: Angehalten zeigt jedes das ruhige Bild, die Schritte stehen gleichrangig; „Abspielen“ beginnt von vorn.
  const LIVE_SCENES = {
    // Helferschichten, in drei Schritten wie die Liste darunter: auf „Neue Schicht“ zeigen, beim Getränkestand
    // eintragen (das Telefon wechselt mit dem Klick von „vorher“ zu „nachher“), „Drucken“ – danach hebt sich der
    // gedruckte Plan vom Stapel
    schichten: {
      rest: "50% 96%",
      steps: [
        ["step", 1], ["frame", 1], ["phone", 1], ["show"], ["wait", 700],
        ["move", "63.6% 4.75%", 1150], ["frame", 5, 150], ["wait", 1700],
        ["step", 2], ["frame", 1, 150], ["move", "87.28% 85.6%", 1200], ["frame", 2, 150], ["wait", 450], ["click"], ["frame", 3], ["phone", 0, 150], ["wait", 2300],
        ["step", 3], ["frame", 0, 150], ["move", "77.2% 4.75%", 1150], ["frame", 4, 150], ["wait", 400], ["click"], ["print", true], ["wait", 2800],
        ["print", false], ["frame", 0, 150], ["move", "50% 96%", 1000], ["hide"], ["step", 0], ["wait", 1100],
      ],
    },
    // Suche: Strg K, „Hel“ tippen, auf einen Treffer zeigen
    suche: {
      rest: "72% 90%",
      steps: [
        ["frame", 1], ["wait", 900], ["keys", true], ["wait", 650], ["frame", 2], ["wait", 400], ["keys", false], ["wait", 600],
        ["frame", 3, 90], ["wait", 280], ["frame", 4, 90], ["wait", 280], ["frame", 0, 90], ["wait", 900],
        ["show"], ["move", "32.2% 33.76%", 1000], ["frame", 5, 150], ["wait", 1900],
        ["frame", 0, 150], ["move", "72% 90%", 900], ["hide"], ["wait", 900],
      ],
    },
    // Mitglieder: ins Suchfeld klicken, „Koch“ tippen, filtern
    mitglieder: {
      rest: "45% 82%",
      steps: [
        ["frame", 0], ["show"], ["wait", 900],
        ["move", "19.7% 29.51%", 1100], ["click"], ["frame", 1, 150], ["wait", 650], ["frame", 2, 120], ["wait", 800],
        ["move", "62.53% 36.01%", 1100], ["frame", 3, 150], ["wait", 400], ["click"], ["frame", 4], ["wait", 2400],
        ["move", "45% 82%", 1000], ["hide"], ["wait", 900],
      ],
    },
    // Kalender: Monat als Liste und zurück zum Monat
    veranstaltungen: {
      rest: "58% 86%",
      steps: [
        ["frame", 0], ["show"], ["wait", 900],
        ["move", "93.72% 29.81%", 1100], ["frame", 1, 150], ["wait", 400], ["click"], ["frame", 2], ["wait", 2300],
        ["move", "72.08% 29.81%", 900], ["frame", 3, 150], ["wait", 400], ["click"], ["frame", 0], ["wait", 900],
        ["move", "58% 86%", 900], ["hide"], ["wait", 900],
      ],
    },
    // Auswertungen: Diagramm als Fläche, als Balken, wieder als Linie
    auswertungen: {
      rest: "62% 88%",
      steps: [
        ["frame", 0], ["show"], ["wait", 900],
        ["move", "46.27% 34.38%", 1000], ["click"], ["frame", 1], ["wait", 1900],
        ["move", "56.9% 34.38%", 650], ["click"], ["frame", 2], ["wait", 1900],
        ["move", "36.39% 34.38%", 850], ["click"], ["frame", 0], ["wait", 1300],
        ["move", "62% 88%", 900], ["hide"], ["wait", 900],
      ],
    },
  };
  const liveWindows = [...document.querySelectorAll(".live[data-live]")];
  // Ohne Live-Fenster stehen Telefon und Schritte im Kapitel Helferschichten allein (gleiche Abfrage wie in site.css)
  const STORY_COMPACT = "(max-width: 719px), (max-width: 999px) and (max-height: 500px)";
  if (liveWindows.length && canObserve && !reduceMotion) {
    const ease = "cubic-bezier(0.45, 0, 0.25, 1)"; // sanftes Ease-in-out
    let paused = false;
    const deciders = [];
    const toggles = [];
    const setPaused = (value) => {
      paused = value;
      for (const button of toggles) {
        button.setAttribute("aria-label", paused ? "Vorführung abspielen" : "Vorführung anhalten");
        button.classList.toggle("is-paused", paused);
        const label = button.querySelector(".live-toggle-label");
        if (label) label.textContent = paused ? "Abspielen" : "Anhalten";
      }
      for (const decide of deciders) decide();
    };
    for (const live of liveWindows) {
      const scene = LIVE_SCENES[live.dataset.live];
      const frames = [...live.querySelectorAll(".live-frame")];
      const pointer = live.querySelector(".live-pointer");
      const cursor = live.querySelector(".live-cursor");
      const ring = live.querySelector(".live-ring");
      const keys = live.querySelector(".live-keys");
      const story = live.closest("[data-story]"); // Schrittliste, Telefon und gedrucktes Blatt (nur Helferschichten)
      const twins = story ? [...story.querySelectorAll(".story-phone .live-frame")] : []; // Telefon: Bild „vorher“
      if (!scene || !frames.length || !pointer || !cursor || !ring) continue;
      // Dauer jedes step-Eintrags bis zum nächsten (Bewegungen, Pausen, Klicks) – so lange füllt sich sein Balken
      const spans = scene.steps.map(([step], i) => {
        if (step !== "step") return 0;
        let ms = 0;
        for (const [next, a, b] of scene.steps.slice(i + 1)) {
          if (next === "step") break;
          if (next === "move") ms += b;
          else if (next === "wait") ms += a;
          else if (next === "click") ms += 140;
        }
        return ms;
      });
      const mark = (n, ms) => {
        if (!story) return;
        if (n) {
          story.style.setProperty("--story-ms", `${ms}ms`);
          story.dataset.shown = String(n);
        } else story.removeAttribute("data-shown");
      };
      let run = 0; // Nummer des laufenden Durchgangs – ändert sie sich, bricht der alte ab
      let at = scene.rest;
      let layer = 1;
      let ready = null;
      const load = () => {
        live.classList.add("is-live"); // Ebenen einhängen: erst jetzt lädt der Browser die Bilder der Folge
        story?.classList.add("is-live");
        return (ready ??= Promise.all(
          [...frames, ...twins].map((img) => {
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
        // Zeigerweg, Einfedern und Ring sofort beenden – sonst setzte ein noch laufender Weg den Zeiger danach woandershin
        for (const animation of [pointer, cursor, ring].flatMap((element) => element.getAnimations?.() ?? [])) {
          if (!("transitionProperty" in animation)) animation.cancel(); // nur die eigenen, nicht das Ausblenden per CSS
        }
        for (const img of frames) {
          img.style.setProperty("transition-duration", "0ms");
          img.classList.remove("is-on");
          img.style.removeProperty("z-index");
        }
        twin(0, 0);
        layer = 1;
        pointer.classList.remove("is-on");
        keys?.classList.remove("is-on");
        mark(0);
        story?.classList.remove("is-printed");
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
      // Telefon: Bild n über seinem ruhigen Bild ein-, alle anderen ausblenden (0 = nur das ruhige)
      const twin = (n, fade = 280) => {
        twins.forEach((img, i) => {
          img.style.setProperty("transition-duration", `${fade}ms`);
          img.classList.toggle("is-on", i === n - 1);
        });
      };
      const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
      const move = async (spot, ms) => {
        const id = run;
        const motion = pointer.animate([{ translate: at }, { translate: spot }], { duration: ms, easing: ease, fill: "forwards" });
        await motion.finished.catch(() => {});
        if (id !== run) return; // inzwischen angehalten: reset() hat den Zeiger schon an seinen Ruheplatz gesetzt
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
          for (const [i, [step, a, b]] of scene.steps.entries()) {
            if (id !== run) return;
            if (step === "frame") frame(a, round === 0 && a && !frames.some((img) => img.classList.contains("is-on")) ? 0 : b);
            else if (step === "phone") twin(a, round === 0 && a ? 0 : b);
            else if (step === "step") mark(a, spans[i]);
            else if (step === "print") story?.classList.toggle("is-printed", a);
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
        const should = visible && !paused && !live.closest("[inert]") && document.visibilityState === "visible";
        const running = run % 2 === 1; // ungerade = läuft
        if (should === running) return;
        run++;
        if (should) play(run);
        else reset();
      };
      reset();
      deciders.push(decide);
      const button = live.querySelector(".live-toggle");
      if (button) {
        toggles.push(button);
        button.hidden = false;
        button.addEventListener("click", () => setPaused(!paused));
      }
      new IntersectionObserver(
        (entries) => {
          visible = entries.some((entry) => entry.isIntersecting);
          decide();
        },
        { threshold: 0.4 },
      ).observe(live);
      document.addEventListener("visibilitychange", decide);
      document.addEventListener("vf:tabs", decide); // Reiter „Im Detail“ gewechselt

      // Smartphone und quer gehaltenes Handy: Dort fehlt das Fenster (site.css), dem Telefon gehört dann allein der
      // Moment, der überzeugt – einmal je Aufruf. Kurz bevor es ins Bild kommt, legt sich sein Bild „vorher“ darüber
      // (2 von 4, „Eintragen“). Steht es zur Hälfte im Bild, ist Schritt 1 hervorgehoben; nach einer kurzen Weile tippt
      // ein Finger auf „Eintragen“, das Bild blendet auf den Stand danach über (3 von 4, eigener Name), Schritt 2 ist
      // hervorgehoben. Verlässt es vorher das Bild, beginnt die Weile beim nächsten Mal neu. Ohne JavaScript und bei
      // reduzierter Bewegung zeigt das Telefon gleich den Stand danach.
      const storyPhone = story?.querySelector(".story-phone");
      if (storyPhone && twins.length) {
        const compact = window.matchMedia(STORY_COMPACT);
        const tap = storyPhone.querySelector(".story-tap");
        let state = "idle"; // idle → ready (Bild „vorher“ steht) → done
        let seen = false;
        let timer = 0;
        let primed = null;
        const tapNow = () => {
          state = "done";
          tap?.animate(
            [
              { opacity: 0, scale: 0.3 },
              { opacity: 1, scale: 0.7, offset: 0.25 },
              { opacity: 0, scale: 1.2 },
            ],
            { duration: 800, easing: "ease-out" },
          );
          setTimeout(() => {
            twin(0, 450);
            mark(2, 2400);
          }, 220);
        };
        const schedule = () => {
          clearTimeout(timer);
          if (state !== "ready" || !seen || !compact.matches) return;
          mark(1, 1600);
          timer = setTimeout(tapNow, 1600);
        };
        const prime = () => {
          if (state !== "idle" || !compact.matches) return;
          story.classList.add("is-live"); // Ebene im Telefon einhängen: erst jetzt lädt das Bild „vorher“
          primed ??= Promise.all(
            twins.map((img) => {
              img.loading = "eager";
              return img.decode().catch(() => {});
            }),
          );
          primed.then(() => {
            if (state !== "idle" || !compact.matches) return;
            twin(1, seen ? 280 : 0); // schon im Bild (schnell gescrollt): sanft statt mit einem Sprung
            state = "ready";
            schedule();
          });
        };
        new IntersectionObserver((entries) => entries.some((entry) => entry.isIntersecting) && prime(), {
          rootMargin: "400px 0px",
        }).observe(storyPhone);
        new IntersectionObserver(
          (entries) => {
            for (const entry of entries) seen = entry.isIntersecting && entry.intersectionRatio >= 0.5;
            if (state === "ready" && !seen) {
              clearTimeout(timer);
              mark(0);
            }
            schedule();
          },
          { threshold: [0, 0.5] },
        ).observe(storyPhone);
        compact.addEventListener("change", () => {
          clearTimeout(timer);
          if (state === "ready") state = "idle"; // das Fenster übernimmt (und setzt das Telefon zurück)
        });
      }
    }
  }

  // Kennzahlen zählen beim ersten Erscheinen hoch (nur, was beim Laden noch nicht zu sehen ist – sonst stünde kurz „0“ da).
  // Am Ende steht die Endzahl wieder in ihrer natürlichen Breite (die vorgehaltene Breite entfällt).
  const armed = new Set();
  const countUp = (element) => {
    const target = Number(element.dataset.count);
    const start = performance.now();
    const duration = 1200;
    const frame = (now) => {
      const progress = Math.min(1, (now - start) / duration);
      element.textContent = String(Math.round(target * (1 - (1 - progress) ** 3)));
      if (progress < 1) requestAnimationFrame(frame);
      else element.style.removeProperty("min-width");
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
        for (const counter of element.querySelectorAll(".count")) {
          // Breite der Endzahl vorhalten (gemessen, bevor das Ausblenden sie verkleinert – nicht in ch: die Ziffern sind
          // verschieden breit und enger gesetzt), damit beim Hochzählen nichts springt
          counter.style.setProperty("min-width", `${counter.getBoundingClientRect().width}px`);
          counter.textContent = "0";
          armed.add(counter);
        }
        hide(element, box.bottom < 0);
      }
      observer.observe(element);
    }
  }

  // Bewegung reduzieren – für die Reiter jedes Mal neu abgefragt (die Einstellung kann sich während des Besuchs ändern)
  const motion = window.matchMedia("(prefers-reduced-motion: reduce)");

  // Funktionen: Jeder Eintrag der Liste (.fkt-liste, hier „Kachel“) klappt zu seiner Karte mit der ganzen Beschreibung
  // auf (Popover – Öffnen, Schließen mit × und Esc, Klick daneben und der Fokus laufen ohne Skript). Das Skript ergänzt:
  // - Die Karte über der Kachel wächst immer nach unten, so hoch wie ihr Inhalt (site.css). Kacheln, die sie dabei
  //   teilweise verdeckt, blendet sie ganz aus (is-verdeckt) – sonst läse man unter ihrem Rand halbe Zeilen; die übrigen
  //   treten per CSS zurück. Passt die Karte nicht ganz ins Bild, rollt die Seite gerade so weit, dass Kachel und Karte
  //   zu sehen sind – weich, bei reduzierter Bewegung sofort (scroll-behavior).
  // - Verlässt der Fokus die Karte mit der Tabulatortaste, schließt sie (sie läge sonst über den nächsten Kacheln, deren
  //   Fokusrahmen verdeckt wäre). Ein Link darin schließt sie ebenfalls, bevor die Seite zum Abschnitt springt; steht
  //   sein Ziel schon in der Adresse, meldet der Browser keinen Wechsel – dann wählt ein eigenes Signal den Reiter.
  // - Das Blatt von unten (Smartphone, niedrige Bildschirme) sperrt die Seite dahinter per CSS; rollt sie doch (ältere
  //   Browser), schließt es, statt über bewegtem Inhalt zu stehen.
  // - Nach Esc oder × steht der Fokus wieder auf der Kachel. Das erledigt sonst der Browser – Safari aber fokussiert
  //   Knöpfe beim Klick nicht und gäbe den Fokus an body zurück; die nächste Tabulatortaste spränge dann hinter den
  //   Abschnitt. Ein Klick daneben, Tab und Links lassen den Fokus, wo er ist (wie ohne Skript).
  // - Pfeiltasten wechseln zwischen den Kacheln, wie sie stehen: links/rechts zur vorigen bzw. nächsten, hoch/runter zur
  //   Kachel darüber bzw. darunter, Pos1/Ende zur ersten bzw. letzten. Die Tabulatortaste geht wie gewohnt alle durch.
  const sheet = window.matchMedia("(max-width: 719px), (max-height: 499px)");
  const anchored = window.CSS?.supports?.("anchor-name: --a") ?? false; // sonst steht die Karte mittig im Fenster
  const tiles = [...document.querySelectorAll(".fkt-liste > .feat")];
  for (const card of document.querySelectorAll(".feat-pop")) {
    if (typeof card.hidePopover !== "function") continue;
    const tile = card.closest(".feat");
    const button = tile?.querySelector(".feat-btn");
    const close = () => {
      if (card.matches(":popover-open")) card.hidePopover();
    };
    let openedAt = 0;
    let covered = [];
    let restore = false; // mit Esc oder × geschlossen
    const closeOnScroll = () => {
      if (Math.abs(window.scrollY - openedAt) > 40) close();
    };
    document.addEventListener(
      "keydown",
      (event) => {
        if (event.key === "Escape" && card.matches(":popover-open")) restore = true;
      },
      true,
    );
    card.addEventListener("toggle", (event) => {
      window.removeEventListener("scroll", closeOnScroll);
      for (const other of covered) other.classList.remove("is-verdeckt");
      covered = [];
      if (event.newState !== "open") {
        const active = document.activeElement;
        if (restore && button && (!active || active === document.body || card.contains(active))) {
          button.focus({ preventScroll: true });
        }
        restore = false;
        return;
      }
      restore = false;
      if (!tile) return;
      openedAt = window.scrollY;
      if (sheet.matches) {
        window.addEventListener("scroll", closeOnScroll, { passive: true });
        return;
      }
      if (!anchored) return;
      // Kacheln, die gerade noch einblenden (.reveal gleitet von unten herein), sofort an ihren Platz – die Karte folgt
      // ihrer Kachel, gemessen wird erst danach
      for (const other of tiles) {
        for (const animation of other.getAnimations?.() ?? []) {
          try {
            animation.finish();
          } catch {
            // endlose Animation – bleibt, wie sie ist
          }
        }
      }
      // Lage der Karte: genau über ihrer Kachel, so breit wie sie; die Höhe ohne die Transformation des Aufblendens
      // (offsetHeight). Darunter teilweise verdeckte Kacheln ausblenden (gemessen, bevor die Seite rollt – Karte und
      // Kacheln rollen gemeinsam).
      const box = card.getBoundingClientRect();
      const own = tile.getBoundingClientRect();
      const top = Math.min(box.top, own.top);
      const bottom = Math.max(box.top + card.offsetHeight, own.bottom);
      for (const other of tiles) {
        if (other === tile) continue;
        const r = other.getBoundingClientRect();
        const across = Math.min(r.right, box.right) - Math.max(r.left, box.left) > 10;
        if (across && r.top < bottom - 1 && r.bottom > top + 1) covered.push(other);
      }
      for (const other of covered) other.classList.add("is-verdeckt");
      const minTop = (header?.getBoundingClientRect().bottom ?? 0) + 12;
      const maxBottom = window.innerHeight - 12;
      let delta = Math.max(0, bottom - maxBottom);
      if (top - delta < minTop) delta = top - minTop; // oben nie unter die Kopfzeile schieben
      if (Math.abs(delta) > 2) window.scrollBy({ top: delta });
    });
    card.addEventListener("focusout", (event) => {
      const next = event.relatedTarget; // null bei einem Klick auf Text in der Karte – dann bleibt sie offen
      if (next instanceof Node && !card.contains(next)) close();
    });
    card.addEventListener("click", (event) => {
      if (event.target instanceof Element && event.target.closest(".feat-close")) restore = true;
      const link = event.target instanceof Element ? event.target.closest("a") : null;
      if (!link) return;
      close();
      if (link.hash && link.hash === location.hash) window.dispatchEvent(new HashChangeEvent("hashchange"));
    });
  }
  const featGrid = document.querySelector(".fkt-liste");
  featGrid?.addEventListener("keydown", (event) => {
    if (event.altKey || event.ctrlKey || event.metaKey || event.shiftKey) return;
    const from = event.target;
    if (!(from instanceof HTMLElement) || !from.matches(".feat-btn")) return;
    const buttons = [...featGrid.querySelectorAll(".feat-btn")];
    const index = buttons.indexOf(from);
    const box = (button) => (button.closest(".feat") ?? button).getBoundingClientRect();
    // Nächste Reihe in der Richtung; darin die Kachel unter bzw. über der Mitte der jetzigen (sonst die nächstgelegene)
    const vertical = (direction) => {
      const here = box(from);
      const middle = here.left + here.width / 2;
      let best = -1;
      let bestGap = Infinity;
      let bestSide = Infinity;
      buttons.forEach((button, i) => {
        const other = box(button);
        const gap = direction > 0 ? other.top - here.bottom : here.top - other.bottom;
        if (gap < -2) return;
        const side = Math.max(0, other.left - middle, middle - other.right);
        if (gap < bestGap - 4 || (Math.abs(gap - bestGap) <= 4 && side < bestSide)) {
          best = i;
          bestGap = gap;
          bestSide = side;
        }
      });
      return best;
    };
    const moves = {
      ArrowLeft: () => index - 1,
      ArrowRight: () => index + 1,
      ArrowUp: () => vertical(-1),
      ArrowDown: () => vertical(1),
      Home: () => 0,
      End: () => buttons.length - 1,
    };
    const target = moves[event.key]?.() ?? -1;
    if (target < 0 || target >= buttons.length) return;
    event.preventDefault();
    buttons[target].focus();
  });

  // Reiter („Im Detail“): Ohne JavaScript stehen die Themen untereinander. Mit JavaScript erscheint die Reiterleiste,
  // immer ein Thema ist sichtbar. Bedienung wie bei Reitern üblich: Klick, Pfeiltasten (wählen sofort), Pos1/Ende.
  // Führt ein Link auf ein Thema (#suche aus der Fußzeile), wird dessen Reiter gewählt.
  // Der gewählte Reiter liegt auf einer weißen Fläche (.tabs::before), die beim Wechsel zum neuen Reiter gleitet und
  // ihre Breite anpasst – Lage und Maße setzt das Skript als Variablen. Beim Wechsel gleitet das bisherige Thema kurz
  // gegen die Laufrichtung hinaus, das gewählte kommt aus der Laufrichtung herein: erst der Text, dann das Bild mit
  // leichtem Zoom. Dafür Web Animations statt CSS-Übergängen – so lässt sich jeder Wechsel sauber abbrechen, wenn schnell
  // hintereinander geklickt wird. Bei reduzierter Bewegung wechselt alles sofort.
  // Auf dem Smartphone klebt die Reiterleiste unter der Kopfzeile (site.css); ist ein Thema dort schon ein Stück gelesen,
  // rollt ein Tipp auf einen anderen Reiter an den Anfang des neuen Themas zurück, wo direkt unter der Leiste sein Bild
  // steht.
  // Die Bilder der verborgenen Themen lädt der Browser erst, wenn jemand die Reiter anfasst (Zeiger darüber, Fokus,
  // Berührung) oder ein Thema gewählt wird: Übereinander gestapelt liegen alle im Bild, loading="lazy" allein hielte sie
  // nicht zurück. Bis dahin stehen Adresse und Varianten des Bildes nur im Skript (die Maße hält das HTML). Ohne
  // JavaScript bleibt es bei den normalen Bildern – alle Themen stehen dann untereinander.
  for (const group of document.querySelectorAll("[data-tabs]")) {
    const list = group.querySelector('[role="tablist"]');
    const tabs = [...(list?.querySelectorAll('[role="tab"]') ?? [])];
    const panels = tabs.map((tab) => document.getElementById(tab.getAttribute("aria-controls") ?? ""));
    if (!list || !tabs.length || panels.some((panel) => !panel)) continue;
    let current = -1;
    let running = [];
    const placePill = () => {
      const tab = tabs[current];
      if (!tab) return;
      list.style.setProperty("--pill-x", `${tab.offsetLeft}px`);
      list.style.setProperty("--pill-y", `${tab.offsetTop}px`);
      list.style.setProperty("--pill-w", `${tab.offsetWidth}px`);
      list.style.setProperty("--pill-h", `${tab.offsetHeight}px`);
    };
    // Ohne Gleiten an die neue Stelle (erste Anzeige, geänderte Fenstergröße)
    const settlePill = () => {
      list.classList.add("is-instant");
      placePill();
      list.classList.add("has-pill");
      requestAnimationFrame(() => requestAnimationFrame(() => list.classList.remove("is-instant")));
    };
    const swap = (from, to, dir) => {
      for (const animation of running) animation.cancel();
      running = [];
      for (const panel of panels) panel.classList.remove("is-leaving");
      if (motion.matches) return;
      from.classList.add("is-leaving"); // bleibt sichtbar, bis es hinausgeglitten ist
      const out = from.animate(
        [
          { opacity: 1, transform: "none" },
          { opacity: 0, transform: `translateX(${dir * -24}px)` },
        ],
        { duration: 170, easing: "cubic-bezier(0.4, 0, 1, 1)" },
      );
      out.addEventListener("finish", () => from.classList.remove("is-leaving"));
      running.push(out);
      const enter = (element, distance, delay, zoom) => {
        if (!element) return;
        running.push(
          element.animate(
            [
              { opacity: 0, transform: `translateX(${dir * distance}px)${zoom ? " scale(0.97)" : ""}` },
              { opacity: 1, transform: "none" },
            ],
            { duration: 600, delay, easing: "cubic-bezier(0.22, 1, 0.36, 1)", fill: "backwards" },
          ),
        );
      };
      enter(to.querySelector(".spot-text"), 28, 160, false); // erst, wenn das bisherige fast verschwunden ist
      enter(to.querySelector(".spot-media"), 44, 220, true);
    };
    const parked = []; // [Bild, src, srcset] der Bilder, die noch nicht laden sollen
    const park = (panel) => {
      for (const img of panel.querySelectorAll(".spot-media picture img")) {
        if (img.complete && img.naturalWidth > 0) continue; // schon geladen (Zwischenspeicher)
        parked.push([img, img.getAttribute("src"), img.getAttribute("srcset")]);
        img.removeAttribute("srcset");
        img.removeAttribute("src");
      }
    };
    // Ohne Angabe alle Themen, sonst nur das genannte; der Platzhalter („Ladezustand der Bilder“) gilt auch hier
    const unpark = (panel) => {
      for (const entry of [...parked]) {
        const [img, src, srcset] = entry;
        if (panel && !panel.contains(img)) continue;
        parked.splice(parked.indexOf(entry), 1);
        const frame = img.closest(".browser, .phone");
        if (frame) {
          frame.classList.add("is-loading");
          const done = () => frame.classList.remove("is-loading");
          img.addEventListener("load", done, { once: true });
          img.addEventListener("error", done, { once: true });
        }
        if (srcset) img.setAttribute("srcset", srcset);
        if (src) img.setAttribute("src", src);
      }
    };
    const select = (index, focus = false) => {
      const previous = current;
      current = index;
      unpark(panels[index]);
      tabs.forEach((tab, i) => {
        const on = i === index;
        tab.setAttribute("aria-selected", String(on));
        tab.tabIndex = on ? 0 : -1;
        panels[i].classList.toggle("is-active", on);
        panels[i].toggleAttribute("inert", !on); // unsichtbare Themen: weder Fokus noch Vorlesen
      });
      placePill();
      if (previous >= 0 && previous !== index) swap(panels[previous], panels[index], index > previous ? 1 : -1);
      if (focus) tabs[index].focus();
      document.dispatchEvent(new CustomEvent("vf:tabs")); // Live-Fenster: nur das sichtbare Thema läuft
    };
    // Gewählt per Tipp oder Pfeiltaste: Klebt die Leiste (Smartphone) und liegt der Anfang des Themas schon über ihr,
    // zurück an den Anfang – so weit, dass die Leiste wieder an ihrem Platz steht
    const toStart = () => {
      if (getComputedStyle(list).position !== "sticky") return;
      const bar = list.getBoundingClientRect();
      const gap = parseFloat(getComputedStyle(list).marginBottom) || 0;
      const delta = panels[current].getBoundingClientRect().top - (bar.bottom + gap);
      if (delta < -1) window.scrollBy({ top: delta, behavior: motion.matches ? "auto" : "smooth" });
    };
    const choose = (index, focus = false) => {
      const changed = index !== current;
      select(index, focus);
      if (changed) toStart();
    };
    for (const [i, panel] of panels.entries()) {
      panel.setAttribute("role", "tabpanel");
      panel.setAttribute("aria-labelledby", tabs[i].id);
    }
    list.hidden = false;
    group.classList.add("is-tabs");
    tabs.forEach((tab, i) => tab.addEventListener("click", () => choose(i)));
    list.addEventListener("keydown", (event) => {
      const current = tabs.indexOf(document.activeElement);
      if (current < 0) return;
      const moves = { ArrowLeft: current - 1, ArrowRight: current + 1, Home: 0, End: tabs.length - 1 };
      if (!(event.key in moves)) return;
      event.preventDefault();
      choose((moves[event.key] + tabs.length) % tabs.length, true);
    });
    const fromHash = () => {
      const index = panels.findIndex((panel) => `#${panel.id}` === location.hash);
      if (index >= 0) select(index);
      return index >= 0;
    };
    const first = Math.max(0, panels.findIndex((panel) => `#${panel.id}` === location.hash));
    panels.forEach((panel, i) => i !== first && park(panel));
    for (const type of ["pointerenter", "focusin", "touchstart"]) {
      list.addEventListener(type, () => unpark(), { once: true, passive: true });
    }
    window.addEventListener("beforeprint", () => unpark()); // im Druck stehen alle Themen untereinander
    if (!fromHash()) select(0);
    settlePill();
    if ("ResizeObserver" in window) new ResizeObserver(settlePill).observe(list);
    else window.addEventListener("resize", settlePill, { passive: true });
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
