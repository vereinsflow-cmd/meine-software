"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { CopyIcon, PrinterIcon, TriangleAlertIcon } from "lucide-react";
import { toast } from "sonner";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  FormError,
  SubmitButton,
  TextField,
  type BaseProps,
} from "@/components/shared/form-fields";
import { useActionForm } from "@/hooks/use-action-form";
import {
  SecondFactorCodeField,
  SecondFactorModeSwitch,
  type SecondFactorMode,
} from "@/modules/auth/components/second-factor-field";
import {
  cancelTwoFactorSetupAction,
  confirmTwoFactorSetupAction,
  disableTwoFactorAction,
  renewRecoveryCodesAction,
  startTwoFactorSetupAction,
} from "../actions";
import {
  confirmTwoFactorSchema,
  twoFactorProtectedSchema,
  type TwoFactorProtectedInput,
} from "../schemas";

/**
 * Zwei-Faktor-Anmeldung im Profil: einrichten (QR-Code, erster Code), Wiederherstellungscodes einmal anzeigen,
 * neue Codes erstellen, ausschalten. Der QR-Code kommt fertig vom Server (`qr`), das Geheimnis verlässt den Server nur
 * für die eigene Profilseite während der Einrichtung.
 */

async function copyText(text: string, success: string) {
  try {
    await navigator.clipboard.writeText(text);
    toast.success(success);
  } catch {
    toast.error("Kopieren hat nicht geklappt. Bitte markiere den Text und kopiere ihn von Hand.");
  }
}

/**
 * Druckt die Codes auf einem eigenen, schlichten Blatt (neues Fenster derselben Herkunft, ohne Menü und Seitenleiste).
 * Die Inhalte werden als Text eingesetzt, nie als HTML.
 */
function printCodes(codes: string[]) {
  const win = window.open("", "_blank", "width=640,height=720");
  if (!win) {
    toast.error("Das Druckfenster wurde blockiert. Bitte kopiere die Codes stattdessen.");
    return;
  }
  const doc = win.document;
  doc.title = "VereinsFlow – Wiederherstellungscodes";
  doc.body.style.cssText = "font-family: Arial, Helvetica, sans-serif; margin: 32px; color: #000;";
  const heading = doc.createElement("h1");
  heading.textContent = "VereinsFlow – Wiederherstellungscodes";
  heading.style.cssText = "font-size: 20px; margin: 0 0 8px;";
  const intro = doc.createElement("p");
  intro.textContent = `Erstellt am ${new Date().toLocaleDateString("de-DE")}. Jeder Code gilt nur einmal. Bewahre dieses Blatt sicher auf.`;
  intro.style.cssText = "margin: 0 0 20px; font-size: 14px;";
  const list = doc.createElement("ol");
  list.style.cssText =
    "font-family: 'Courier New', monospace; font-size: 18px; line-height: 2; margin: 0;";
  for (const code of codes) {
    const item = doc.createElement("li");
    item.textContent = code;
    list.append(item);
  }
  doc.body.replaceChildren(heading, intro, list);
  win.addEventListener("afterprint", () => win.close());
  win.focus();
  win.print();
}

/**
 * Die frisch erzeugten Codes – nur jetzt sichtbar. Sie ersetzen ein Formular, dessen fokussierter Knopf dabei verschwindet:
 * Der Fokus springt deshalb auf die Überschrift (`heading`) bzw. ohne Überschrift (im Fenster) auf den Warnhinweis – so
 * hören Screenreader, dass jetzt die Codes da stehen, und die Tastatur macht hier weiter statt am Seitenanfang.
 */
export function RecoveryCodesPanel({
  codes,
  onDone,
  heading,
}: {
  codes: string[];
  onDone: () => void;
  heading?: string;
}) {
  const headingRef = useRef<HTMLHeadingElement>(null);
  const warningRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    (headingRef.current ?? warningRef.current)?.focus();
  }, []);

  return (
    <div className="grid gap-4">
      {heading && (
        <h3 ref={headingRef} tabIndex={-1} className="text-sm font-semibold outline-none">
          {heading}
        </h3>
      )}
      <Alert ref={warningRef} tabIndex={-1} variant="warning" className="outline-none">
        <TriangleAlertIcon />
        <AlertDescription>
          Speichere diese Wiederherstellungscodes jetzt – zum Beispiel ausgedruckt oder im
          Passwort-Manager. Sie werden nur dieses eine Mal angezeigt. Mit einem Code kommst du in
          dein Konto, wenn du dein Handy nicht hast. Jeder Code gilt nur einmal.
        </AlertDescription>
      </Alert>
      <ol
        aria-label="Wiederherstellungscodes"
        className="grid grid-cols-1 gap-x-6 gap-y-1.5 rounded-lg border p-4 font-mono text-base tabular-nums min-[420px]:grid-cols-2"
      >
        {codes.map((code) => (
          <li key={code} className="tracking-wide">
            {code}
          </li>
        ))}
      </ol>
      <div className="flex flex-wrap gap-2">
        <Button
          type="button"
          variant="outline"
          onClick={() => copyText(codes.join("\n"), "Die Codes wurden kopiert.")}
        >
          <CopyIcon /> Kopieren
        </Button>
        <Button type="button" variant="outline" onClick={() => printCodes(codes)}>
          <PrinterIcon /> Drucken
        </Button>
        <Button type="button" onClick={onDone}>
          Ich habe sie gespeichert
        </Button>
      </div>
    </div>
  );
}

/** Zustand „nicht eingerichtet“: Einrichtung beginnen. */
export function StartTwoFactorButton() {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  return (
    <Button
      variant="outline"
      disabled={pending}
      onClick={() =>
        startTransition(async () => {
          const result = await startTwoFactorSetupAction();
          if (!result.ok) {
            toast.error(result.error.message);
            return;
          }
          router.refresh();
        })
      }
    >
      {pending ? "Einen Moment …" : "Zwei-Faktor-Anmeldung einrichten"}
    </Button>
  );
}

/**
 * Schlüssel zum Abtippen, falls das Scannen nicht klappt. Die Zeile „Schlüssel zum Abtippen“ steht direkt davor; ein
 * `aria-labelledby` am `<code>` wäre wirkungslos (die Rolle `code` darf keinen Namen tragen).
 */
export function ManualKey({ secret, formatted }: { secret: string; formatted: string }) {
  return (
    <div className="grid gap-1.5">
      <p className="text-sm font-medium">Schlüssel zum Abtippen</p>
      <div className="flex flex-wrap items-center gap-2">
        <code className="rounded-md bg-muted px-2 py-1 font-mono text-sm tracking-wide break-all">
          {formatted}
        </code>
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => copyText(secret, "Der Schlüssel wurde kopiert.")}
        >
          <CopyIcon /> Kopieren
        </Button>
      </div>
      <p className="text-xs text-muted-foreground">
        In der App „Schlüssel eingeben“ wählen, als Namen „VereinsFlow“ eintragen und „zeitbasiert“
        lassen.
      </p>
    </div>
  );
}

/**
 * Zustand „angefangen“: Schritt 1 (QR-Code und Schlüssel, vom Server gerendert – `scan`) und Schritt 2 (Passwort und erster
 * Code). Danach ersetzen die Wiederherstellungscodes beide Schritte – QR-Code und Schlüssel braucht es dann nicht mehr.
 */
export function TwoFactorSetup({ scan }: { scan: React.ReactNode }) {
  const router = useRouter();
  const [codes, setCodes] = useState<string[] | null>(null);

  if (codes) {
    return (
      <RecoveryCodesPanel
        heading="Deine Wiederherstellungscodes"
        codes={codes}
        onDone={() => router.refresh()}
      />
    );
  }

  return (
    <div className="grid gap-6">
      <div className="grid gap-3">
        <h3 className="text-sm font-semibold">Schritt 1: QR-Code mit der App scannen</h3>
        {scan}
      </div>
      <div className="grid gap-3">
        <h3 className="text-sm font-semibold">Schritt 2: Passwort und Code eingeben</h3>
        <ConfirmTwoFactorForm onConfirmed={setCodes} />
      </div>
    </div>
  );
}

/** Schritt 2 der Einrichtung: aktuelles Passwort und erster Code aus der App. */
function ConfirmTwoFactorForm({ onConfirmed }: { onConfirmed: (codes: string[]) => void }) {
  const router = useRouter();
  const [cancelling, startCancel] = useTransition();
  const { form, onSubmit, isPending, formError } = useActionForm({
    schema: confirmTwoFactorSchema,
    defaultValues: { password: "", code: "" },
    action: confirmTwoFactorSetupAction,
    onSuccess: (data) => {
      onConfirmed(data.recoveryCodes);
      toast.success("Die Zwei-Faktor-Anmeldung ist eingeschaltet.");
    },
  });

  return (
    <form method="post" onSubmit={onSubmit} noValidate className="grid max-w-md gap-4">
      <FormError message={formError} />
      <TextField
        form={form}
        name="password"
        label="Passwort"
        type="password"
        autoComplete="current-password"
        hint="Zur Sicherheit: dein aktuelles Passwort für VereinsFlow."
        required
      />
      <TextField
        form={form}
        name="code"
        label="Code aus der App"
        inputMode="numeric"
        autoComplete="one-time-code"
        hint="Die 6 Ziffern, die die App jetzt für VereinsFlow anzeigt."
        inputClassName="sm:max-w-48"
        required
      />
      <div className="flex flex-wrap gap-2">
        <SubmitButton pending={isPending} pendingLabel="Wird geprüft …">
          Einschalten
        </SubmitButton>
        <Button
          type="button"
          variant="outline"
          disabled={cancelling || isPending}
          onClick={() =>
            startCancel(async () => {
              const result = await cancelTwoFactorSetupAction();
              if (!result.ok) toast.error(result.error.message);
              router.refresh();
            })
          }
        >
          Abbrechen
        </Button>
      </div>
    </form>
  );
}

/**
 * Passwort und Code – gemeinsam für „Ausschalten“ und „Neue Wiederherstellungscodes“. Das Codefeld verhält sich wie bei der
 * Anmeldung: Code aus der App (Ziffernblock am Handy) oder – per Umschalter – ein Wiederherstellungscode (normale
 * Tastatur). Beim Umschalten wird nur das Codefeld geleert; das Passwort bleibt stehen. Das Fenster baut den Inhalt beim
 * Schließen ab, beim nächsten Öffnen beginnt es also wieder mit dem Code aus der App.
 */
function ProtectedFields({ form }: { form: BaseProps<TwoFactorProtectedInput>["form"] }) {
  const [mode, setMode] = useState<SecondFactorMode>("app");
  // Fokus ins neue Feld erst nach dem Umschalten (nicht beim Öffnen – dort gehört er ins Passwortfeld).
  const [switches, setSwitches] = useState(0);
  useEffect(() => {
    if (switches > 0) form.setFocus("code");
  }, [form, switches]);

  function switchMode() {
    form.resetField("code");
    setMode((current) => (current === "app" ? "recovery" : "app"));
    setSwitches((count) => count + 1);
  }

  return (
    <>
      <TextField
        form={form}
        name="password"
        label="Passwort"
        type="password"
        autoComplete="current-password"
        required
      />
      <div className="grid gap-2">
        <SecondFactorCodeField form={form} name="code" mode={mode} />
        <SecondFactorModeSwitch
          mode={mode}
          onSwitch={switchMode}
          className="justify-self-start text-left"
        />
      </div>
    </>
  );
}

export function RenewRecoveryCodesDialog() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [codes, setCodes] = useState<string[] | null>(null);
  const { form, onSubmit, isPending, formError } = useActionForm({
    schema: twoFactorProtectedSchema,
    defaultValues: { password: "", code: "" },
    action: renewRecoveryCodesAction,
    resetOnSuccess: true,
    onSuccess: (data) => setCodes(data.recoveryCodes),
  });

  function done() {
    setCodes(null);
    setOpen(false);
    router.refresh();
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        // Solange die neuen Codes zu sehen sind, schließt nur „Ich habe sie gespeichert“ das Fenster.
        if (!next && codes) return;
        setOpen(next);
        if (!next) form.reset();
      }}
    >
      <DialogTrigger asChild>
        <Button variant="outline">Neue Wiederherstellungscodes</Button>
      </DialogTrigger>
      <DialogContent showCloseButton={!codes} className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Neue Wiederherstellungscodes</DialogTitle>
          <DialogDescription>
            {codes
              ? "Die bisherigen Codes gelten ab sofort nicht mehr."
              : "Du bekommst 10 neue Codes. Alle bisherigen Codes gelten danach nicht mehr."}
          </DialogDescription>
        </DialogHeader>
        {codes ? (
          <RecoveryCodesPanel codes={codes} onDone={done} />
        ) : (
          <form method="post" onSubmit={onSubmit} noValidate className="grid gap-4">
            <FormError message={formError} />
            <ProtectedFields form={form} />
            <SubmitButton pending={isPending} pendingLabel="Wird erstellt …">
              Neue Codes erstellen
            </SubmitButton>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}

export function DisableTwoFactorDialog() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const { form, onSubmit, isPending, formError } = useActionForm({
    schema: twoFactorProtectedSchema,
    defaultValues: { password: "", code: "" },
    action: disableTwoFactorAction,
    successMessage: "Die Zwei-Faktor-Anmeldung ist ausgeschaltet.",
    resetOnSuccess: true,
    onSuccess: () => {
      setOpen(false);
      router.refresh();
    },
  });

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (!next) form.reset();
      }}
    >
      <DialogTrigger asChild>
        <Button variant="outline">Ausschalten</Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Zwei-Faktor-Anmeldung ausschalten?</DialogTitle>
          <DialogDescription>
            Danach genügt zur Anmeldung wieder dein Passwort. Deine Wiederherstellungscodes gelten
            dann nicht mehr.
          </DialogDescription>
        </DialogHeader>
        <form method="post" onSubmit={onSubmit} noValidate className="grid gap-4">
          <FormError message={formError} />
          <ProtectedFields form={form} />
          <SubmitButton
            pending={isPending}
            pendingLabel="Wird ausgeschaltet …"
            variant="destructive"
          >
            Ausschalten
          </SubmitButton>
        </form>
      </DialogContent>
    </Dialog>
  );
}
