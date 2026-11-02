import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { AcceptInvitationForm } from "@/modules/auth/components/auth-forms";
import { FirstRunForm } from "@/modules/setup/components/first-run-form";

/**
 * Das Kästchen „Ich habe die Datenschutzerklärung zur Kenntnis genommen“ MUSS angekreuzt sein (Schema mit `refine`). Es trägt
 * deshalb wie die Textfelder den Stern und `aria-required` – sonst hält man es für freiwillig und erfährt erst nach dem
 * Absenden, dass es fehlt (wie im Beitrittsformular, tests/e2e/beitritt.spec.ts).
 */
describe.each([
  ["Einladung annehmen", () => createElement(AcceptInvitationForm, { token: "t" })],
  ["Ersteinrichtung", () => createElement(FirstRunForm)],
])("%s: Kästchen zur Datenschutzerklärung", (_, form) => {
  const markup = renderToStaticMarkup(form());

  it("ist als Pflicht gekennzeichnet: aria-required und Stern in der Beschriftung", () => {
    const checkbox = markup.match(/<input[^>]*type="checkbox"[^>]*>/)?.[0] ?? "";
    expect(checkbox).toContain('name="acceptTerms"');
    expect(checkbox).toContain('aria-required="true"');
    expect(markup).toMatch(/zur Kenntnis genommen\.<span aria-hidden="true"[^>]*> \*<\/span>/);
  });
});
