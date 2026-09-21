import AxeBuilder from "@axe-core/playwright";
import type { Page } from "@playwright/test";

/**
 * Automatische Prüfung der Barrierefreiheit mit axe-core (WCAG 2.1, Stufen A und AA): Kontraste, Beschriftungen, Rollen,
 * Bezeichnungen von Bedienelementen, Überschriftenstruktur, Sprache. Das findet nur einen Teil der möglichen Probleme
 * (üblicherweise etwa ein Drittel) und ersetzt weder eine Prüfung mit Screenreader noch die Tastaturbedienung – ein
 * bestandener Lauf heißt „keine automatisch erkennbaren Verstöße“, nicht „barrierefrei“.
 */
export async function violations(page: Page): Promise<string[]> {
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
  const results = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"])
    .exclude("nextjs-portal") // Entwicklungs-Werkzeug von Next.js, nicht Teil der Anwendung
    .analyze();
  return results.violations.map(
    (violation) =>
      `${violation.id} [${violation.impact}] ${violation.help} – ${violation.nodes.length}× , z. B. ${violation.nodes[0]?.target.join(" ")}`,
  );
}
