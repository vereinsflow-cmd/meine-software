"use client";

import { useEffect, useEffectEvent, useState } from "react";
import { createPortal } from "react-dom";
import { UploadIcon } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * Dateien per Ziehen und Ablegen („Drag and Drop“) annehmen.
 *
 * - `useWindowFileDrop`: Solange die Komponente eingebunden ist, nimmt das ganze Browserfenster Dateien an. Ohne diese
 *   Abwehr öffnete der Browser eine danebengefallene Datei selbst und verließe die Anwendung.
 * - `FileDropOverlay`: Hinweis über der ganzen Seite, solange Dateien darüber schweben.
 * - `FileDropZone`: gestrichelte Fläche um ein unsichtbares Dateifeld – Klick, Tippen oder Tastatur öffnen die Auswahl.
 *
 * Reagiert wird nur auf gezogene Dateien, nicht auf markierten Text oder Links.
 */
function carriesFiles(event: DragEvent): boolean {
  return Array.from(event.dataTransfer?.types ?? []).includes("Files");
}

/** Liefert, ob gerade Dateien über dem Fenster schweben; abgelegte Dateien gehen an `onFiles`. */
export function useWindowFileDrop(onFiles: (files: File[]) => void): boolean {
  const [dragging, setDragging] = useState(false);
  const receive = useEffectEvent(onFiles);

  useEffect(() => {
    // dragenter/dragleave feuern für jedes überquerte Element – erst beim Verlassen des Fensters geht der Zähler auf 0.
    let depth = 0;
    const enter = (event: DragEvent) => {
      if (!carriesFiles(event)) return;
      depth += 1;
      setDragging(true);
    };
    const leave = (event: DragEvent) => {
      if (!carriesFiles(event)) return;
      depth = Math.max(0, depth - 1);
      if (depth === 0) setDragging(false);
    };
    const over = (event: DragEvent) => {
      if (!carriesFiles(event)) return;
      event.preventDefault(); // erst das erlaubt das Ablegen
      if (event.dataTransfer) event.dataTransfer.dropEffect = "copy";
    };
    const drop = (event: DragEvent) => {
      if (!carriesFiles(event)) return;
      event.preventDefault();
      depth = 0;
      setDragging(false);
      const files = Array.from(event.dataTransfer?.files ?? []);
      if (files.length > 0) receive(files);
    };
    window.addEventListener("dragenter", enter);
    window.addEventListener("dragleave", leave);
    window.addEventListener("dragover", over);
    window.addEventListener("drop", drop);
    return () => {
      window.removeEventListener("dragenter", enter);
      window.removeEventListener("dragleave", leave);
      window.removeEventListener("dragover", over);
      window.removeEventListener("drop", drop);
    };
  }, []);

  return dragging;
}

/** Rein optischer Hinweis über der ganzen Seite: fängt keine Ereignisse ab und ist für Screenreader ausgeblendet. */
export function FileDropOverlay({
  show,
  title,
  hint,
}: {
  show: boolean;
  title: string;
  hint?: string;
}) {
  if (!show) return null;
  return createPortal(
    <div
      aria-hidden="true"
      data-slot="file-drop-overlay"
      className="pointer-events-none fixed inset-0 z-50 flex items-center justify-center bg-background/80 p-6 backdrop-blur-sm motion-safe:animate-in motion-safe:fade-in-0"
    >
      <div className="flex w-full max-w-lg flex-col items-center gap-3 rounded-2xl border-2 border-dashed border-primary bg-card px-6 py-12 text-center shadow-lg">
        <UploadIcon className="size-10 text-primary" />
        <p className="text-lg font-semibold">{title}</p>
        {hint && <p className="text-sm text-muted-foreground">{hint}</p>}
      </div>
    </div>,
    document.body,
  );
}

/**
 * Ablagefläche: ein großes Label um ein unsichtbares Dateifeld. Abgelegt wird über `useWindowFileDrop` (überall im
 * Fenster); `active` hebt die Fläche hervor, solange Dateien darüber schweben. Den Namen des Feldes liefert
 * `labelledBy` (die sichtbare Feldbeschriftung), den Hinweis `describedBy`.
 */
export function FileDropZone({
  id,
  active,
  invalid,
  disabled,
  accept,
  multiple,
  labelledBy,
  describedBy,
  onFiles,
  children,
}: {
  id: string;
  active: boolean;
  invalid?: boolean;
  disabled?: boolean;
  accept?: string;
  multiple?: boolean;
  labelledBy: string;
  describedBy?: string;
  onFiles: (files: File[]) => void;
  children: React.ReactNode;
}) {
  return (
    <label
      htmlFor={id}
      data-slot="file-drop-zone"
      data-active={active || undefined}
      className={cn(
        "flex cursor-pointer flex-col items-center gap-1 rounded-lg border-2 border-dashed px-4 py-5 text-center text-sm transition-colors hover:border-primary/60 hover:bg-accent/40 has-[:focus-visible]:border-ring has-[:focus-visible]:ring-3 has-[:focus-visible]:ring-ring/50",
        active ? "border-primary bg-primary/10" : "border-field",
        invalid && !active && "border-destructive",
        disabled && "pointer-events-none opacity-60",
      )}
    >
      <UploadIcon className="mb-1 size-6 text-muted-foreground" aria-hidden="true" />
      {children}
      <input
        id={id}
        type="file"
        multiple={multiple}
        accept={accept}
        disabled={disabled}
        aria-labelledby={labelledBy}
        aria-describedby={describedBy}
        aria-invalid={invalid ? true : undefined}
        className="sr-only"
        onChange={(event) => {
          const files = Array.from(event.currentTarget.files ?? []);
          event.currentTarget.value = ""; // dieselbe Datei später erneut wählen können
          if (files.length > 0) onFiles(files);
        }}
      />
    </label>
  );
}
