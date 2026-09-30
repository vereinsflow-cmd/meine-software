"use client";

import { createContext, useContext, useEffect } from "react";
import { useRouter } from "next/navigation";

/*
 * Welcher Rahmen gerade zu sehen ist: der reduzierte der Einrichtung (`true`) oder die ganze App (`false`). Den Rahmen
 * wählt das gemeinsame Layout – das beim Wechsel innerhalb der App aber nicht neu berechnet wird. Ändert sich die Sperre
 * zwischendurch (die Einrichtung schließt jemand anderes ab, eine Person wird zur Vereinsverwaltung befördert), stünde
 * sonst z. B. der Assistent mitten im vollen Menü. `SetupFrameSync` in den Seiten bemerkt das und lädt den Rahmen neu.
 */
const SetupFrameContext = createContext<boolean | null>(null);

export function SetupFrame({ locked, children }: { locked: boolean; children: React.ReactNode }) {
  return <SetupFrameContext value={locked}>{children}</SetupFrameContext>;
}

export function SetupFrameSync({ locked }: { locked: boolean }) {
  const shown = useContext(SetupFrameContext);
  const router = useRouter();
  useEffect(() => {
    if (shown !== null && shown !== locked) router.refresh();
  }, [shown, locked, router]);
  return null;
}
