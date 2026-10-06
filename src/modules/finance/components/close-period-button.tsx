"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { ConfirmAction } from "@/components/shared/confirm-dialog";
import { formatCalendarDate } from "@/lib/dates";
import { closePeriodAction } from "../closing-actions";

/**
 * „September 2026 abschließen“ mit Rückfrage: Was danach nicht mehr geht, steht deutlich da – ein Abschluss lässt sich nicht
 * zurücknehmen. Offene Punkte der Checkliste halten nicht auf (sie stehen auf der Seite darüber).
 */
/** Ziel des Fokus nach dem Abschluss (der Knopf verschwindet, wenn der nächste Monat noch läuft). */
export const CLOSE_FOCUS_ID = "abschluesse-titel";

export function ClosePeriodButton({
  month,
  label,
  through,
  warnings,
  firstClose,
}: {
  month: string;
  label: string;
  through: Date;
  /** Zahl der offenen Punkte der Checkliste (für den Hinweis im Fenster). */
  warnings: number;
  /** Erster Abschluss: Danach stehen die Anfangsbestände fest. */
  firstClose: boolean;
}) {
  const router = useRouter();
  const [note, setNote] = useState("");
  const closed = useRef(false);
  const nextDay = formatCalendarDate(new Date(through.getTime() + 86_400_000));
  return (
    <ConfirmAction
      trigger={<Button>{label} abschließen</Button>}
      title={`${label} abschließen?`}
      description={
        <>
          Danach lassen sich bis {formatCalendarDate(through)} keine Buchungen mehr anlegen und
          keine Belege mehr entfernen. Ein Storno oder eine Korrektur wird dann am {nextDay}{" "}
          gebucht.
          {firstClose && " Auch die Anfangsbestände der Konten stehen danach fest."} Das lässt sich
          nicht rückgängig machen.
          {warnings > 0 &&
            ` Die Checkliste hat noch ${warnings === 1 ? "einen offenen Punkt" : `${warnings} offene Punkte`}.`}
        </>
      }
      confirmLabel="Endgültig abschließen"
      action={async () => {
        const result = await closePeriodAction({ month, note });
        // Schon abgeschlossen (anderer Kassenwart, zweiter Tab): die Seite zeigt dann den aktuellen Monat.
        if (!result.ok) router.refresh();
        return result;
      }}
      successMessage={`${label} ist abgeschlossen.`}
      onSuccess={() => {
        closed.current = true;
        setNote("");
      }}
      onCloseAutoFocus={(event) => {
        if (!closed.current) return;
        closed.current = false;
        event.preventDefault();
        document.getElementById(CLOSE_FOCUS_ID)?.focus();
      }}
    >
      <div className="grid gap-1.5">
        <Label htmlFor="abschluss-notiz">Notiz (freiwillig)</Label>
        <Textarea
          id="abschluss-notiz"
          value={note}
          onChange={(event) => setNote(event.target.value)}
          rows={2}
          maxLength={500}
          placeholder="z. B. Kontoauszug 9/2026 abgeglichen"
        />
      </div>
    </ConfirmAction>
  );
}
