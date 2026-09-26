"use client";

import { useId } from "react";
import type { FieldError, FieldValues, Path, UseFormReturn } from "react-hook-form";
import { Loader2Icon, TriangleAlertIcon } from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { NativeSelect } from "@/components/ui/native-select";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";

/**
 * Wiederverwendbare Formularfelder für React Hook Form.
 * Barrierefreiheit: Jedes Feld hat ein sichtbares Label (htmlFor), Fehlertexte sind per
 * aria-describedby verknüpft und werden Screenreadern mitgeteilt (aria-invalid, role="alert").
 */
type AnyForm<T extends FieldValues> = UseFormReturn<T, unknown, FieldValues>;

interface BaseProps<T extends FieldValues> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  form: UseFormReturn<T, any, any>;
  name: Path<T>;
  label: string;
  hint?: string;
  required?: boolean;
  disabled?: boolean;
  className?: string;
}

function errorOf<T extends FieldValues>(form: AnyForm<T>, name: Path<T>): string | undefined {
  const parts = name.split(".");
  let current: unknown = form.formState.errors;
  for (const part of parts) {
    if (current && typeof current === "object")
      current = (current as Record<string, unknown>)[part];
    else return undefined;
  }
  return (current as FieldError | undefined)?.message;
}

function FieldShell({
  id,
  label,
  hint,
  required,
  error,
  className,
  children,
}: {
  id: string;
  label: string;
  hint?: string;
  required?: boolean;
  error?: string;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    // `content-start`: Im Formularraster wird das Feld auf die Zeilenhöhe gestreckt. Hat das Nachbarfeld einen Hilfetext,
    // rutschten Beschriftung und Feld sonst ein Stück nach unten – so beginnen die Felder einer Zeile oben bündig.
    <div className={cn("grid content-start gap-1.5", className)}>
      <Label htmlFor={id}>
        {label}
        {required && (
          <span aria-hidden="true" className="text-destructive">
            {" "}
            *
          </span>
        )}
      </Label>
      {children}
      {hint && !error && (
        <p id={`${id}-hint`} className="text-sm text-muted-foreground">
          {hint}
        </p>
      )}
      {error && (
        <p id={`${id}-error`} role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}
    </div>
  );
}

export function TextField<T extends FieldValues>({
  form,
  name,
  label,
  hint,
  required,
  disabled,
  className,
  type = "text",
  autoComplete,
  placeholder,
  inputMode,
}: BaseProps<T> & {
  type?: "text" | "email" | "password" | "tel" | "date" | "time" | "number" | "url";
  autoComplete?: string;
  placeholder?: string;
  inputMode?: "text" | "numeric" | "decimal" | "tel" | "email" | "url";
}) {
  const id = useId();
  const error = errorOf(form, name);
  return (
    <FieldShell
      id={id}
      label={label}
      hint={hint}
      required={required}
      error={error}
      className={className}
    >
      <Input
        id={id}
        type={type}
        autoComplete={autoComplete}
        placeholder={placeholder}
        inputMode={inputMode}
        disabled={disabled}
        aria-invalid={error ? true : undefined}
        aria-required={required}
        aria-describedby={error ? `${id}-error` : hint ? `${id}-hint` : undefined}
        {...form.register(name, {
          setValueAs: type === "number" ? (v) => (v === "" ? undefined : Number(v)) : undefined,
        })}
      />
    </FieldShell>
  );
}

export function TextareaField<T extends FieldValues>({
  form,
  name,
  label,
  hint,
  required,
  disabled,
  className,
  rows = 4,
}: BaseProps<T> & { rows?: number }) {
  const id = useId();
  const error = errorOf(form, name);
  return (
    <FieldShell
      id={id}
      label={label}
      hint={hint}
      required={required}
      error={error}
      className={className}
    >
      <Textarea
        id={id}
        rows={rows}
        disabled={disabled}
        aria-invalid={error ? true : undefined}
        aria-describedby={error ? `${id}-error` : hint ? `${id}-hint` : undefined}
        {...form.register(name)}
      />
    </FieldShell>
  );
}

export interface SelectOption {
  value: string;
  label: string;
}

/** Natives Auswahlfeld: zuverlässig auf Smartphones, voll tastaturbedienbar und ohne Zusatzskript. */
export function SelectField<T extends FieldValues>({
  form,
  name,
  label,
  hint,
  required,
  disabled,
  className,
  options,
  placeholder,
}: BaseProps<T> & { options: readonly SelectOption[]; placeholder?: string }) {
  const id = useId();
  const error = errorOf(form, name);
  return (
    <FieldShell
      id={id}
      label={label}
      hint={hint}
      required={required}
      error={error}
      className={className}
    >
      {/* Derselbe Baustein wie in Filterleisten: Rand, Fläche und Fehlerzustand (über aria-invalid) wie bei den Textfeldern. */}
      <NativeSelect
        id={id}
        disabled={disabled}
        aria-invalid={error ? true : undefined}
        aria-describedby={error ? `${id}-error` : hint ? `${id}-hint` : undefined}
        {...form.register(name)}
      >
        {placeholder !== undefined && <option value="">{placeholder}</option>}
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </NativeSelect>
    </FieldShell>
  );
}

export function CheckboxField<T extends FieldValues>({
  form,
  name,
  label,
  hint,
  disabled,
  className,
}: Omit<BaseProps<T>, "required" | "label"> & { label: React.ReactNode }) {
  const id = useId();
  const error = errorOf(form, name);
  return (
    <div className={cn("grid content-start gap-1", className)}>
      <div className="flex items-start gap-2.5">
        <input
          id={id}
          type="checkbox"
          disabled={disabled}
          aria-invalid={error ? true : undefined}
          aria-describedby={error ? `${id}-error` : hint ? `${id}-hint` : undefined}
          className="mt-1 size-4 shrink-0 rounded accent-primary"
          {...form.register(name)}
        />
        <Label htmlFor={id} className="leading-snug font-normal">
          {label}
        </Label>
      </div>
      {hint && !error && (
        <p id={`${id}-hint`} className="pl-6.5 text-sm text-muted-foreground">
          {hint}
        </p>
      )}
      {error && (
        <p id={`${id}-error`} role="alert" className="pl-6.5 text-sm text-destructive">
          {error}
        </p>
      )}
    </div>
  );
}

/** Allgemeine Fehlermeldung oberhalb des Formulars (wird Screenreadern sofort vorgelesen). */
export function FormError({ message }: { message: string | null }) {
  if (!message) return null;
  return (
    <Alert variant="destructive" role="alert">
      <TriangleAlertIcon />
      <AlertDescription>{message}</AlertDescription>
    </Alert>
  );
}

export function SubmitButton({
  pending,
  children,
  pendingLabel = "Wird gespeichert …",
  className,
  variant,
}: {
  pending: boolean;
  children: React.ReactNode;
  pendingLabel?: string;
  className?: string;
  variant?: React.ComponentProps<typeof Button>["variant"];
}) {
  return (
    <Button
      type="submit"
      disabled={pending}
      aria-disabled={pending}
      className={className}
      variant={variant}
    >
      {pending && <Loader2Icon className="animate-spin" aria-hidden="true" />}
      {pending ? pendingLabel : children}
    </Button>
  );
}
