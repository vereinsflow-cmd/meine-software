/**
 * Bausteine für den Inhalt der Dashboard-Reiter (ohne Zustand, laufen im Server).
 */

/**
 * Eine Gruppe mit kleiner Überschrift (Ebene 2) – die Karten darunter tragen Ebene 3. Der Inhalt einer Gruppe steht nie leer da:
 * Die Seite ruft `Group` nur auf, wenn die Rolle etwas dafür sehen darf.
 */
export function Group({
  id,
  title,
  children,
}: {
  id: string;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section aria-labelledby={id} className="grid gap-4">
      <h2
        id={id}
        className="flex items-center gap-3 text-sm font-semibold tracking-[0.12em] text-foreground/70 uppercase after:h-px after:flex-1 after:bg-border"
      >
        {/* Kleiner Punkt in der Markenfarbe vor der Überschrift (wie in den Entwürfen 2 und 5), rein optisch. */}
        <span className="size-1.5 shrink-0 rounded-full bg-primary" aria-hidden="true" />
        {title}
      </h2>
      {children}
    </section>
  );
}

/**
 * Karten einer Gruppe: eine allein füllt die Breite, zwei oder mehr laufen ab mittlerer Breite in zwei Spalten. Es sind
 * CSS-Spalten statt eines Zeilenrasters – jede Karte behält ihre natürliche Höhe und wird nicht auf die der Nachbarin
 * gedehnt (wo sie dann leer wirken würde); eine Karte wird nie zwischen zwei Spalten geteilt.
 *
 * Seit 02.10.2026 lässt sich jede Karte selbst auf „Groß“ stellen („Anpassen“, `wide`): Sie steht dann über die volle Breite,
 * an ihrem Platz in der Reihenfolge. Die Karten davor und danach bilden je einen eigenen Abschnitt – steht dort nur eine,
 * füllt auch sie die Breite (statt einer halb leeren Zeile).
 */
export function CardGrid({
  items,
}: {
  items: readonly { id: string; node: React.ReactNode; wide?: boolean }[];
}) {
  if (items.length === 0) return null;
  const runs: (typeof items)[number][][] = [];
  for (const item of items) {
    const last = runs.at(-1);
    if (item.wide || !last || last[0]!.wide) runs.push([item]);
    else last.push(item);
  }
  return (
    <div className="grid gap-7">
      {runs.map((run) => (
        <div
          key={run[0]!.id}
          className={run.length > 1 ? "-mb-7 md:columns-2 md:gap-x-7" : undefined}
        >
          {run.map((item) => (
            <div
              key={item.id}
              data-block={item.id}
              className={run.length > 1 ? "mb-7 break-inside-avoid" : undefined}
            >
              {item.node}
            </div>
          ))}
        </div>
      ))}
    </div>
  );
}
