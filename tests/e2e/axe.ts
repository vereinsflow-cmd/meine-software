import AxeBuilder from "@axe-core/playwright";
import type { Page } from "@playwright/test";

/**
 * Automatische Prüfung der Barrierefreiheit mit axe-core (WCAG 2.1, Stufen A und AA): Kontraste, Beschriftungen, Rollen,
 * Bezeichnungen von Bedienelementen, Überschriftenstruktur, Sprache. Das findet nur einen Teil der möglichen Probleme
 * (üblicherweise etwa ein Drittel) und ersetzt weder eine Prüfung mit Screenreader noch die Tastaturbedienung – ein
 * bestandener Lauf heißt „keine automatisch erkennbaren Verstöße“, nicht „barrierefrei“.
 */
/**
 * `only`: nur diesen Ausschnitt prüfen (CSS-Selektor), z. B. ein geöffnetes Menü „…“. Radix blendet für ein offenes Menü
 * alles andere mit `aria-hidden` aus – auch den Sprunglink „Zum Inhalt springen“, der fokussierbar bleibt. axe meldet das als
 * `aria-hidden-focus`, obwohl Tab das Menü schließt (und damit die Ausblendung aufhebt); das gilt für jedes Menü der App.
 */
export async function violations(page: Page, { only }: { only?: string } = {}): Promise<string[]> {
  // Kontraste werden am gerade sichtbaren Zustand gemessen: Mitten in einer Einblendung (Reiterwechsel, Dialog) wären die Farben
  // halbtransparent und würden fälschlich durchfallen. Endlos laufende Animationen (Ladeanzeigen) bleiben außen vor.
  await page.evaluate(() =>
    Promise.all(
      document
        .getAnimations()
        .filter((animation) => animation.effect?.getComputedTiming().iterations !== Infinity)
        .map((animation) => animation.finished.catch(() => undefined)),
    ),
  );
  const builder = new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"])
    .exclude("nextjs-portal"); // Entwicklungs-Werkzeug von Next.js, nicht Teil der Anwendung
  const results = await (only ? builder.include(only) : builder).analyze();
  return results.violations.map(
    (violation) =>
      `${violation.id} [${violation.impact}] ${violation.help} – ${violation.nodes.length}× , z. B. ${violation.nodes[0]?.target.join(" ")}`,
  );
}
