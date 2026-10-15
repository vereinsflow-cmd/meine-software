"use client";

import type { FieldValues } from "react-hook-form";
import { Button } from "@/components/ui/button";
import { TextField, type BaseProps } from "@/components/shared/form-fields";
import { cn } from "@/lib/utils";

/** Welche Art Code gerade eingegeben wird: aus der Authenticator-App oder ein Wiederherstellungscode. */
export type SecondFactorMode = "app" | "recovery";

/**
 * Feld für den zweiten Faktor – bei der Anmeldung und im Profil (Ausschalten, neue Wiederherstellungscodes) gleich:
 *  - App: Ziffernblock am Handy (`inputMode="numeric"`) und `autocomplete="one-time-code"`, damit das Handy den Code
 *    anbieten kann.
 *  - Wiederherstellungscode: normale Tastatur (Buchstaben und Ziffern), keine Vorschläge alter Eingaben.
 * Beides landet im selben Feld (`name`); geprüft wird ohnehin beides. Der eigene `key` je Art baut das Eingabefeld neu auf –
 * nur so wechselt die Tastatur am Handy zuverlässig.
 */
export function SecondFactorCodeField<T extends FieldValues>({
  form,
  name,
  mode,
  className,
  inputClassName,
}: Pick<BaseProps<T>, "form" | "name" | "className"> & {
  mode: SecondFactorMode;
  inputClassName?: string;
}) {
  return mode === "app" ? (
    <TextField
      key="app"
      form={form}
      name={name}
      label="Code aus der App"
      inputMode="numeric"
      autoComplete="one-time-code"
      hint="Die 6 Ziffern, die deine Authenticator-App für VereinsFlow gerade anzeigt."
      className={className}
      inputClassName={inputClassName}
      required
    />
  ) : (
    <TextField
      key="recovery"
      form={form}
      name={name}
      label="Wiederherstellungscode"
      autoComplete="off"
      hint="Einer der 10 Codes, die du beim Einrichten gespeichert hast (z. B. 7KQ2M-9XD4T). Jeder Code gilt nur einmal."
      className={className}
      inputClassName={inputClassName}
      required
    />
  );
}

/** Umschalter zwischen Code aus der App und Wiederherstellungscode (als Link-Knopf unter dem Feld). */
export function SecondFactorModeSwitch({
  mode,
  onSwitch,
  className,
}: {
  mode: SecondFactorMode;
  onSwitch: () => void;
  className?: string;
}) {
  return (
    <Button
      type="button"
      variant="link"
      className={cn("h-auto p-0 text-sm whitespace-normal pointer-coarse:min-h-11", className)}
      onClick={onSwitch}
    >
      {mode === "app"
        ? "Kein Zugriff auf die App? Wiederherstellungscode verwenden"
        : "Doch den Code aus der App verwenden"}
    </Button>
  );
}
