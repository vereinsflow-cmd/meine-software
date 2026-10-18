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
    <section aria-labelledby={id} className="grid grid-cols-1 gap-4">
      {/* Schlichte Zwischenüberschrift in normaler Schreibweise (seit 17.10.2026) – keine Großbuchstaben-Überzeile mit Punkt. */}
      <h2 id={id} className="text-lg font-semibold tracking-tight">
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

/**
 * Aufteilung der Übersicht im Stil der Vorlage „Vertix“ (seit 18.10.2026): oben die Kennzahlen über die ganze Breite (`top`; die
 * Spalten ordnet die Seite nach der Breite dieses Rahmens, Containerabfrage `studio`), darunter die übrigen Karten (`after`); was
 * in „Anpassen“ vor die Kennzahlen gestellt wurde, steht darüber (`before`).
 */
export function StudioFrame({
  before,
  top,
  after,
  size,
}: {
  before: React.ReactNode;
  top: React.ReactNode;
  after: React.ReactNode;
  /** Eigene Größe der Kennzahlen („Anpassen“) – als `data-size` lesbar, wie beim einfachen Raster (`KpiCarousel`). */
  size: string;
}) {
  return (
    <div data-layout="studio" data-size={size} className="@container/studio grid gap-10">
      {before && <div className="min-w-0">{before}</div>}
      <div className="min-w-0">{top}</div>
      {after && <div className="min-w-0">{after}</div>}
    </div>
  );
}
