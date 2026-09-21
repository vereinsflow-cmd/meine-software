// VereinsFlow – Website: kleine Verbesserungen (Menü, Kopfzeile, Einblenden).
// Ohne JavaScript bleibt die Seite vollständig les- und nutzbar. Keine Bibliotheken, keine Netzwerkzugriffe.
(() => {
  const root = document.documentElement;
  root.classList.add("js");

  // Mobiles Menü
  const toggle = document.querySelector(".nav-toggle");
  const nav = document.getElementById("site-nav");
  if (toggle && nav) {
    const setOpen = (open) => {
      toggle.setAttribute("aria-expanded", String(open));
      toggle.setAttribute("aria-label", open ? "Menü schließen" : "Menü öffnen");
      nav.classList.toggle("is-open", open);
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

  // Kopfzeile: Trennlinie erst nach dem Scrollen
  const header = document.querySelector(".site-header");
  if (header) {
    const update = () => header.classList.toggle("is-scrolled", window.scrollY > 8);
    update();
    window.addEventListener("scroll", update, { passive: true });
  }

  // Sanftes Einblenden: nur Elemente unterhalb des sichtbaren Bereichs werden vorübergehend ausgeblendet
  const items = document.querySelectorAll(".reveal");
  const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  if (items.length && "IntersectionObserver" in window && !reduce) {
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (!entry.isIntersecting) continue;
          entry.target.classList.remove("reveal-pending");
          entry.target.classList.add("reveal-in");
          observer.unobserve(entry.target);
        }
      },
      { rootMargin: "0px 0px -6% 0px", threshold: 0.06 },
    );
    for (const element of items) {
      if (element.getBoundingClientRect().top > window.innerHeight * 0.92) {
        element.classList.add("reveal-pending");
        observer.observe(element);
      }
    }
  }
})();
