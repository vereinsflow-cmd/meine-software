"use client";

import { Children, useId, useState } from "react";
import { ChevronDownIcon } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * Liste, die zunächst nur die ersten Einträge zeigt und den Rest hinter „N weitere anzeigen“ verbirgt – so bleibt eine Karte
 * ruhig und kurz, und nichts geht verloren. Die Einträge (`<li>`) kommen als Kinder vom Server; zum Filtern oder Sortieren
 * gibt es hier nichts. Der Knopf sagt Screenreadern über `aria-expanded`, ob die Liste aufgeklappt ist.
 */
export function ExpandableList({
  children,
  initial = 3,
  className,
  itemNoun = "weitere",
}: {
  children: React.ReactNode;
  /** Wie viele Einträge zunächst sichtbar sind. */
  initial?: number;
  className?: string;
  /** Text im Knopf: „2 weitere anzeigen“. */
  itemNoun?: string;
}) {
  const items = Children.toArray(children);
  const [expanded, setExpanded] = useState(false);
  const listId = useId();
  const hidden = items.length - initial;
  const shown = expanded || hidden <= 0 ? items : items.slice(0, initial);

  return (
    <div className="grid gap-2">
      <ul id={listId} className={className}>
        {shown}
      </ul>
      {hidden > 0 && (
        <button
          type="button"
          onClick={() => setExpanded((value) => !value)}
          aria-expanded={expanded}
          aria-controls={listId}
          className="group inline-flex w-fit items-center gap-1.5 rounded-md px-1 py-0.5 text-sm font-medium text-muted-foreground transition-colors outline-none hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring motion-reduce:transition-none"
        >
          {expanded ? "Weniger anzeigen" : `${hidden} ${itemNoun} anzeigen`}
          <ChevronDownIcon
            className={cn(
              "size-4 transition-transform motion-reduce:transition-none",
              expanded && "rotate-180",
            )}
            aria-hidden="true"
          />
        </button>
      )}
    </div>
  );
}
