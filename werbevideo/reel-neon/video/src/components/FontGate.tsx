/**
 * Rendert die Kinder erst, wenn Manrope geladen ist.
 *
 * Mehrere Bausteine messen Text per Canvas (Untertitel, Leitsatz, Claim, Reiter, Hook). loadFont()
 * hält zwar den Screenshot an, rendert die Komponenten danach aber nicht neu – der erste Frame
 * jedes Render-Tabs wäre sonst mit der Ersatzschrift vermessen (Wörter kleben aneinander).
 */
import React, { useEffect, useState } from "react";
import { continueRender, delayRender } from "remotion";
import { fontsReady, waitForFonts } from "../fonts";

export const FontGate: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [ready, setReady] = useState(fontsReady);
  const [handle] = useState(() => (ready ? null : delayRender("Manrope laden (FontGate)")));
  useEffect(() => {
    if (handle === null) return;
    let alive = true;
    waitForFonts()
      .catch(() => undefined)
      .then(() => {
        if (alive) setReady(true);
        continueRender(handle);
      });
    return () => {
      alive = false;
    };
  }, [handle]);
  return ready ? <>{children}</> : null;
};
