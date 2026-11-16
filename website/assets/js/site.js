// VereinsFlow – Website (alle Seiten): Menü, aktiver Abschnitt in der Kopfleiste (aria-current), Einblenden, Fragen
// per Sprungmarke, Kopieren der E-Mail-Adresse, Start der Vorführungen (Laptop, Telefon – wörtlich wie bisher) und der
// Schalter „Bewegung anhalten“. Ohne JavaScript bleibt alles les- und nutzbar. Keine Bibliotheken, keine
// Netzwerkzugriffe, kein Speichern im Gerät. Die Content-Security-Policy verbietet Inline-Stile; Werte setzt das Skript
// per CSSOM (style.setProperty).
(() => {
  const root = document.documentElement;
  root.classList.add("js");
  const bewegungAus = window.matchMedia("(prefers-reduced-motion: reduce)");
  const darfBewegen = () => !bewegungAus.matches;
  const canObserve = "IntersectionObserver" in window;
  const kopf = document.querySelector("[data-kopf]");

  // ---- Menü (unter 900 px): Der Knopf steht vor den Menüpunkten. Offen ist alles außer der Kopfzeile gesperrt (inert:
  // kein Fokus, kein Vorlesen, kein Tippen), der Fokus springt auf den ersten Punkt. Esc schließt, der Fokus kehrt zum
  // Knopf zurück; ein Menüpunkt springt dagegen zu seinem Abschnitt. ----
  const menueKnopf = document.querySelector("[data-menue-knopf]");
  const menue = document.querySelector("[data-menue]");
  const menueLabel = document.querySelector("[data-menue-label]");
  if (kopf && menueKnopf && menue) {
    const setMenue = (offen, fokusZurueck = true) => {
      menue.hidden = !offen;
      menueKnopf.setAttribute("aria-expanded", String(offen));
      if (menueLabel) menueLabel.textContent = offen ? "Menü schließen" : "Menü öffnen";
      kopf.classList.toggle("menue-auf", offen);
      for (const el of document.body.children) {
        if (el !== kopf && !el.matches("script, .sprite")) el.toggleAttribute("inert", offen);
      }
      if (offen) menue.querySelector("a")?.focus();
      else if (fokusZurueck) menueKnopf.focus();
    };
    menueKnopf.addEventListener("click", () => setMenue(menue.hidden));
    menue.addEventListener("click", (e) => {
      if (e.target instanceof Element && e.target.closest("a")) setMenue(false, false);
    });
    document.addEventListener("keydown", (e) => {
      if (e.key === "Escape" && !menue.hidden) setMenue(false);
    });
    window.matchMedia("(min-width: 900px)").addEventListener("change", (m) => {
      if (m.matches && !menue.hidden) setMenue(false, false);
    });
  }

  // ---- Kopfleiste: nach den ersten 8 px etwas dichter (Wächter am Seitenanfang) ----
  if (kopf) {
    const waechter = document.querySelector("[data-kopf-waechter]");
    if (canObserve && waechter) {
      new IntersectionObserver(([e]) => kopf.classList.toggle("ist-gescrollt", !e.isIntersecting)).observe(waechter);
    } else {
      kopf.classList.add("ist-gescrollt");
    }
  }

  // ---- Aktiver Abschnitt: Jedes Kapitel (main [data-kapitel]) wird an einem 1 % hohen Band bei 45 % der Fensterhöhe
  // gemessen. Dann trägt sein Eintrag in Kopfleiste und Menü aria-current (data-navi: Marke 1–3, Funktionen 4,
  // Helferplanung 5–6, Finanzen 7, Sicherheit 8, Fragen 9–10, Demo anfragen 11). Wer die Fußzeile sieht, ist im letzten
  // Kapitel. ----
  const naviLinks = [...document.querySelectorAll("[data-navi]")];
  const teile = [...document.querySelectorAll("main [data-kapitel]")];
  if (kopf && naviLinks.length && teile.length) {
    let kapitel = 0;
    const setKapitel = (n) => {
      if (n === kapitel) return;
      kapitel = n;
      kopf.dataset.kapitel = String(n);
      for (const a of naviLinks) {
        if (a.dataset.navi.split(" ").includes(String(n))) a.setAttribute("aria-current", "true");
        else a.removeAttribute("aria-current");
      }
    };
    setKapitel(Number(kopf.dataset.kapitel) || 1);
    if (canObserve) {
      const band = new IntersectionObserver(
        (entries) => {
          for (const e of entries) if (e.isIntersecting) setKapitel(Number(e.target.dataset.kapitel));
        },
        { rootMargin: "-45% 0px -54% 0px" },
      );
      teile.forEach((el) => band.observe(el));
      const fuss = document.querySelector("[data-fuss]");
      const letztes = Number(teile.at(-1).dataset.kapitel);
      if (fuss) {
        new IntersectionObserver(
          ([e]) => {
            if (e.isIntersecting) setKapitel(letztes);
          },
          { threshold: 0.3 },
        ).observe(fuss);
      }
    }
  }

  // ---- Einblenden (.erscheint): einmal, dann bleibt es. Geschwister folgen mit 60 ms Versatz (höchstens vier). Was
  // nach 4,5 s noch verborgen im Bild steht (etwa nach einem Sprung), erscheint sofort. ----
  const erscheint = [...document.querySelectorAll(".erscheint")];
  if (erscheint.length) {
    if (!canObserve || !darfBewegen()) {
      erscheint.forEach((el) => el.classList.add("ist-da"));
    } else {
      for (const el of erscheint) {
        const geschwister = [...(el.parentElement?.children ?? [])].filter((g) => g.classList.contains("erscheint"));
        const i = geschwister.indexOf(el);
        if (i > 0) el.style.setProperty("--d", `${Math.min(i, 3) * 60}ms`);
      }
      const io = new IntersectionObserver(
        (entries) => {
          for (const e of entries) {
            if (!e.isIntersecting) continue;
            e.target.classList.add("ist-da");
            io.unobserve(e.target);
          }
        },
        { rootMargin: "0px 0px -12% 0px" },
      );
      erscheint.forEach((el) => io.observe(el));
      setTimeout(() => {
        for (const el of erscheint) {
          const r = el.getBoundingClientRect();
          if (r.bottom > 0 && r.top < window.innerHeight) el.classList.add("ist-da");
        }
      }, 4500);
    }
  }

  // ---- Aufklappbare Frage als Sprungziel (#ausprobieren): Führt die Adresse auf ein geschlossenes <details> (oder
  // hinein), öffnet es sich – sonst stünde dort nur die Frage. ----
  const frageOeffnen = () => {
    const id = decodeURIComponent(window.location.hash.slice(1));
    if (!id) return;
    const details = document.getElementById(id)?.closest("details");
    if (details && !details.open) details.open = true;
  };
  frageOeffnen();
  window.addEventListener("hashchange", frageOeffnen);

  // ---- Kopieren der E-Mail-Adresse (für Webmail, wenn sich beim Klick kein E-Mail-Programm öffnet). Der Knopf steht mit
  // JavaScript von Anfang an da (kein Springen) und verschwindet nur ohne Zwischenablage (ohne sichere Verbindung). ----
  for (const button of document.querySelectorAll("[data-copy]")) {
    if (!navigator.clipboard?.writeText) {
      button.hidden = true;
      continue;
    }
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

  // ---- Schalter „Bewegung anhalten“ (WCAG 2.2.2, Fußzeile der Startseite): setzt html.ist-ruhig und meldet sich als
  // Ereignis vf:ruhe – die Bewegungen der Startseite (site.css, bewegung.js) halten an bzw. stehen in der Endlage, ohne
  // dass die Seite springt. Gilt nur für diesen Besuch – die Seite speichert nichts im Gerät. ----
  const ruheKnoepfe = [...document.querySelectorAll("[data-ruhe-knopf]")];
  if (ruheKnoepfe.length) {
    let ruhig = false;
    const zeigen = () => {
      for (const k of ruheKnoepfe) {
        k.hidden = !darfBewegen();
        k.setAttribute("aria-pressed", String(ruhig));
        const l = k.querySelector("[data-ruhe-label]");
        if (l) l.textContent = ruhig ? "Bewegung fortsetzen" : "Bewegung anhalten";
      }
    };
    for (const k of ruheKnoepfe) {
      k.addEventListener("click", () => {
        ruhig = !ruhig;
        root.classList.toggle("ist-ruhig", ruhig);
        zeigen();
        document.dispatchEvent(new CustomEvent("vf:ruhe", { detail: { ruhig } }));
      });
    }
    zeigen();
    bewegungAus.addEventListener("change", zeigen);
  }

  // ---- Wörtlich aus site.js c112a20, Zeilen 107–140 (Bild-Laden und Start der Vorführungen) – nicht ändern ----
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
})();
