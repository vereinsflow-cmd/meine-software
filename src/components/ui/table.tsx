"use client";

import * as React from "react";
import { cn } from "@/lib/utils";

/**
 * Gestapelt am Handy (`<Table stack>`): Unter 768 px wird jede Zeile eine kleine Karte und jede Zelle eine Zeile
 * „Beschriftung · Wert“ (Beschriftung aus `<TableCell label="…">`; das Aussehen steht in globals.css). Weil Browser einer
 * Tabelle mit geändertem `display` ihre Bedeutung nehmen können, tragen die Teile dann ausdrückliche Rollen – Screenreader
 * und Tests finden weiter Tabelle, Zeilen, Spaltenköpfe und Zellen.
 */
const StackContext = React.createContext(false);

function Table({
  className,
  stack = false,
  ...props
}: React.ComponentProps<"table"> & {
  /** Unter 768 px Zeilen als gestapelte Karten statt seitlich scrollender Tabelle. */
  stack?: boolean;
}) {
  return (
    <div data-slot="table-container" className="relative w-full overflow-x-auto">
      <StackContext value={stack}>
        <table
          data-slot="table"
          data-stack={stack ? "" : undefined}
          role={stack ? "table" : undefined}
          className={cn("w-full caption-bottom text-sm", className)}
          {...props}
        />
      </StackContext>
    </div>
  );
}

function TableHeader({ className, ...props }: React.ComponentProps<"thead">) {
  const stack = React.useContext(StackContext);
  // Leichter Hintergrund, damit die Kopfzeile nicht wie eine normale Zeile aussieht.
  return (
    <thead
      data-slot="table-header"
      role={stack ? "rowgroup" : undefined}
      className={cn("bg-muted/50 [&_tr]:border-b [&_tr]:hover:bg-transparent", className)}
      {...props}
    />
  );
}

function TableBody({ className, ...props }: React.ComponentProps<"tbody">) {
  const stack = React.useContext(StackContext);
  return (
    <tbody
      data-slot="table-body"
      role={stack ? "rowgroup" : undefined}
      className={cn("[&_tr:last-child]:border-0", className)}
      {...props}
    />
  );
}

function TableFooter({ className, ...props }: React.ComponentProps<"tfoot">) {
  const stack = React.useContext(StackContext);
  return (
    <tfoot
      data-slot="table-footer"
      role={stack ? "rowgroup" : undefined}
      className={cn("border-t bg-muted/50 font-medium [&>tr]:last:border-b-0", className)}
      {...props}
    />
  );
}

function TableRow({ className, ...props }: React.ComponentProps<"tr">) {
  const stack = React.useContext(StackContext);
  return (
    <tr
      data-slot="table-row"
      role={stack ? "row" : undefined}
      className={cn(
        "border-b transition-colors hover:bg-muted/50 has-aria-expanded:bg-muted/50 data-[state=selected]:bg-muted",
        className,
      )}
      {...props}
    />
  );
}

function TableHead({ className, ...props }: React.ComponentProps<"th">) {
  const stack = React.useContext(StackContext);
  return (
    <th
      data-slot="table-head"
      role={stack ? "columnheader" : undefined}
      className={cn(
        "h-10 px-2 text-left align-middle font-medium whitespace-nowrap text-muted-foreground [&:has([role=checkbox])]:pr-0",
        className,
      )}
      {...props}
    />
  );
}

function TableCell({
  className,
  label,
  ...props
}: React.ComponentProps<"td"> & {
  /** Beschriftung der Zelle in gestapelten Tabellen am Handy (meist der Spaltenkopf); ohne sie geht die Zelle über die ganze Breite. */
  label?: string;
}) {
  const stack = React.useContext(StackContext);
  return (
    <td
      data-slot="table-cell"
      data-label={label}
      role={stack ? "cell" : undefined}
      className={cn("p-2 align-middle whitespace-nowrap [&:has([role=checkbox])]:pr-0", className)}
      {...props}
    />
  );
}

function TableCaption({ className, ...props }: React.ComponentProps<"caption">) {
  return (
    <caption
      data-slot="table-caption"
      className={cn("mt-4 text-sm text-muted-foreground", className)}
      {...props}
    />
  );
}

export { Table, TableHeader, TableBody, TableFooter, TableHead, TableRow, TableCell, TableCaption };
