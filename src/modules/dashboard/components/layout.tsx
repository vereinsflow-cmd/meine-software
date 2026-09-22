import { Children, isValidElement } from "react";

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
        className="flex items-center gap-3 text-sm font-semibold tracking-wider text-muted-foreground uppercase after:h-px after:flex-1 after:bg-border"
      >
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
 */
export function CardGrid({ children }: { children: React.ReactNode }) {
  const items = Children.toArray(children);
  if (items.length === 0) return null;
  return (
    <div className={items.length > 1 ? "-mb-7 md:columns-2 md:gap-x-7" : "-mb-7"}>
      {items.map((item, index) => (
        <div
          key={isValidElement(item) && item.key !== null ? item.key : index}
          className="mb-7 break-inside-avoid"
        >
          {item}
        </div>
      ))}
    </div>
  );
}
