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
 * Aufteilung der Übersicht im Stil der Vorlage „Analytics“ (seit 17.10.2026): links die Mitglieder-Kachel mit dem Aufgaben-Ring
 * (`top`) und darunter die übrigen Karten (`after`; was in „Anpassen“ vor die Kennzahlen gestellt wurde, steht darüber –
 * `before`), rechts die Spalte der Kennzahlen (`side`) über die ganze Höhe.
 *
 * Gemessen wird die Breite des Reiters (Containerabfrage `studio`): erst ab 58 rem hat die rechte Spalte neben dem Paar Platz
 * (z. B. 1470 px Fenster); schmaler steht sie als Raster unter dem Paar, am Handy alles untereinander. Die Reihenfolge im Code
 * (Tastatur, Screenreader) ist immer: davor, Paar, Spalte, danach. Die rechte Spalte reicht über alle Reihen; die letzte Reihe
 * (`1fr`) nimmt die übrige Höhe auf, damit zwischen den Karten links keine Lücken entstehen.
 */
export function StudioFrame({
  before,
  top,
  side,
  after,
  size,
}: {
  before: React.ReactNode;
  top: React.ReactNode;
  side: React.ReactNode;
  after: React.ReactNode;
  /** Eigene Größe der Kennzahlen („Anpassen“) – als `data-size` lesbar, wie beim einfachen Raster (`KpiCarousel`). */
  size: string;
}) {
  const rows = [before ? "auto" : null, "auto", after ? "auto" : null, "1fr"]
    .filter(Boolean)
    .join(" ");
  return (
    <div data-layout="studio" data-size={size} className="@container/studio">
      <div
        style={{ "--studio-rows": rows } as React.CSSProperties}
        className="grid @bento-wide/studio:grid-cols-[minmax(0,1fr)_minmax(19rem,22rem)] @bento-wide/studio:grid-rows-(--studio-rows) @bento-wide/studio:gap-x-6"
      >
        {before && <div className="mb-10 min-w-0">{before}</div>}
        <div className="mb-8 min-w-0">{top}</div>
        <div className="mb-10 min-w-0 @bento-wide/studio:col-start-2 @bento-wide/studio:row-[1/-1] @bento-wide/studio:mb-0">
          {side}
        </div>
        {after && <div className="min-w-0">{after}</div>}
      </div>
    </div>
  );
}
