"use client";

import { PaperclipIcon } from "lucide-react";
import { buttonVariants } from "@/components/ui/button";
import { ALLOWED_TYPES } from "@/lib/uploads";
import { cn } from "@/lib/utils";

const ACCEPT = ALLOWED_TYPES.map((type) => `.${type.ext}`).join(",");

/**
 * Knopf zum Wählen einer Belegdatei – ein deutsch beschrifteter Knopf statt des Dateifelds des Browsers („Choose File“).
 * Das Feld selbst ist unsichtbar im Knopf; Name und Hinweis kommen über `labelledBy`/`describedBy`.
 */
export function ReceiptPicker({
  id,
  label,
  labelledBy,
  describedBy,
  invalid,
  disabled,
  onFile,
}: {
  id: string;
  /** Text auf dem Knopf („Datei auswählen“, „Datei hochladen“). */
  label: string;
  labelledBy?: string;
  describedBy?: string;
  invalid?: boolean;
  disabled?: boolean;
  onFile: (file: File) => void;
}) {
  return (
    <label
      htmlFor={id}
      className={cn(
        buttonVariants({ variant: "outline", size: "sm" }),
        "cursor-pointer justify-self-start has-[:focus-visible]:border-ring has-[:focus-visible]:ring-3 has-[:focus-visible]:ring-ring/50",
        disabled && "pointer-events-none opacity-60",
      )}
    >
      <PaperclipIcon aria-hidden="true" />
      {label}
      <input
        id={id}
        type="file"
        accept={ACCEPT}
        disabled={disabled}
        aria-labelledby={labelledBy}
        aria-describedby={describedBy}
        aria-invalid={invalid ? true : undefined}
        className="sr-only"
        onChange={(event) => {
          const file = event.currentTarget.files?.[0];
          event.currentTarget.value = ""; // dieselbe Datei später erneut wählen können
          if (file) onFile(file);
        }}
      />
    </label>
  );
}
