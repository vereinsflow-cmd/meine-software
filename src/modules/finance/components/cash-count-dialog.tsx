"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { NativeSelect } from "@/components/ui/native-select";
import { Textarea } from "@/components/ui/textarea";
import { formatEuroFromCents } from "@/lib/dates";
import { centsToInput, parseEuroToCents } from "@/lib/money";
import { countCashAction } from "../closing-actions";
import { formatSignedEuro } from "../ledger-format";

/** Scheine und Münzen in Cent (wie `DENOMINATIONS` im Dienst). */
const DENOMINATIONS = [
  50_000, 20_000, 10_000, 5_000, 2_000, 1_000, 500, 200, 100, 50, 20, 10, 5, 2, 1,
] as const;

const denominationLabel = (cents: number) => (cents >= 100 ? `${cents / 100} €` : `${cents} ct`);

/**
 * Kassensturz: Bargeld zählen und eintragen – auf Wunsch mit Zählhilfe (Anzahl je Schein und Münze). Das Fenster zeigt den
 * Stand laut Kassenbuch und die Differenz schon beim Tippen; gibt es eine, braucht es einen kurzen Grund und wird als
 * Buchung „Kassendifferenz“ festgehalten.
 */
export function CashCountDialog({
  accounts,
  initialAccountId,
  open,
  onOpenChange,
  onCloseAutoFocus,
}: {
  accounts: { id: string; name: string; bookCents: number }[];
  /** Vorgewählte Kasse (Link „Kassensturz machen“ aus der Checkliste). */
  initialAccountId?: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCloseAutoFocus?: (event: Event) => void;
}) {
  const [busy, setBusy] = useState(false);
  return (
    <Dialog open={open} onOpenChange={(next) => !busy && onOpenChange(next)}>
      <DialogContent
        className="max-h-[90dvh] overflow-y-auto sm:max-w-lg"
        onCloseAutoFocus={onCloseAutoFocus}
      >
        <DialogHeader>
          <DialogTitle>Kassensturz</DialogTitle>
          <DialogDescription>
            Zähl das Bargeld und trag den Betrag ein. Stimmt er nicht mit dem Kassenbuch überein,
            wird die Differenz als Buchung „Kassendifferenz“ festgehalten.
          </DialogDescription>
        </DialogHeader>
        {/* Entsteht bei jedem Öffnen neu – nichts Halbes vom letzten Mal. */}
        <CashCountForm
          accounts={accounts}
          initialAccountId={initialAccountId}
          onBusy={setBusy}
          onDone={() => onOpenChange(false)}
        />
      </DialogContent>
    </Dialog>
  );
}

function CashCountForm({
  accounts,
  initialAccountId,
  onBusy,
  onDone,
}: {
  accounts: { id: string; name: string; bookCents: number }[];
  initialAccountId?: string;
  onBusy: (busy: boolean) => void;
  onDone: () => void;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [accountId, setAccountId] = useState(
    accounts.find((a) => a.id === initialAccountId)?.id ?? accounts[0]?.id ?? "",
  );
  // Der Server rechnet den Stand frisch – weicht er ab (gerade jemand gebucht), fragt er nach dem Grund.
  const [askReason, setAskReason] = useState(false);
  const [counted, setCounted] = useState("");
  const [note, setNote] = useState("");
  const [helper, setHelper] = useState(false);
  const [pieces, setPieces] = useState<Record<number, string>>({});
  const [error, setError] = useState<string | null>(null);
  const account = accounts.find((a) => a.id === accountId);
  const helperTotal = DENOMINATIONS.reduce(
    (sum, value) => sum + value * (Number(pieces[value]) || 0),
    0,
  );
  const countedCents = helper ? helperTotal : parseEuroToCents(counted);
  const difference = countedCents !== null && account ? countedCents - account.bookCents : null;

  function setPiece(value: number, text: string) {
    const next = { ...pieces, [value]: text.replace(/\D/g, "").slice(0, 5) };
    setPieces(next);
  }

  function submit(event: React.FormEvent) {
    event.preventDefault();
    if (!account) return;
    if (countedCents === null) {
      setError("Bitte gib den gezählten Betrag ein (z. B. 239,80).");
      return;
    }
    if ((difference !== 0 || askReason) && note.trim().length < 3) {
      setError("Bitte schreib kurz, woran die Differenz liegen könnte.");
      return;
    }
    setError(null);
    onBusy(true);
    startTransition(async () => {
      const denominations = helper
        ? Object.fromEntries(
            DENOMINATIONS.filter((value) => Number(pieces[value]) > 0).map((value) => [
              String(value),
              Number(pieces[value]),
            ]),
          )
        : undefined;
      const result = await countCashAction({
        accountId: account.id,
        counted: centsToInput(countedCents),
        denominations,
        note,
      })
        .catch(() => null)
        .finally(() => onBusy(false));
      if (!result) {
        setError(
          "Die Verbindung wurde unterbrochen. Bitte lade die Seite neu und prüfe, ob gezählt wurde.",
        );
        return;
      }
      if (!result.ok) {
        const fields = result.error.fieldErrors ?? {};
        if (fields.note) setAskReason(true);
        setError(
          fields.note?.[0] ?? fields.counted?.[0] ?? fields.accountId?.[0] ?? result.error.message,
        );
        // Stand laut Kassenbuch neu laden (z. B. wurde inzwischen bar gebucht).
        router.refresh();
        return;
      }
      toast.success(
        result.data.differenceCents === 0
          ? `${account.name} stimmt mit dem Kassenbuch überein.`
          : `Differenz ${formatSignedEuro(result.data.differenceCents)} als Buchung ${result.data.entryLabel} festgehalten.`,
      );
      onDone();
    });
  }

  return (
    <form method="post" onSubmit={submit} noValidate className="grid gap-4">
      {accounts.length > 1 && (
        <div className="grid gap-1.5">
          <Label htmlFor="kassensturz-kasse">Kasse</Label>
          <NativeSelect
            id="kassensturz-kasse"
            value={accountId}
            onChange={(event) => setAccountId(event.target.value)}
          >
            {accounts.map((a) => (
              <option key={a.id} value={a.id}>
                {a.name}
              </option>
            ))}
          </NativeSelect>
        </div>
      )}
      <p className="text-sm">
        Laut Kassenbuch:{" "}
        <span className="font-semibold tabular-nums">
          {formatEuroFromCents(account?.bookCents ?? 0)}
        </span>
      </p>

      {!helper ? (
        <div className="grid gap-1.5">
          <Label htmlFor="kassensturz-betrag">Gezählt in €</Label>
          <Input
            id="kassensturz-betrag"
            inputMode="decimal"
            value={counted}
            onChange={(event) => setCounted(event.target.value)}
            placeholder="z. B. 239,80"
            className="sm:max-w-48"
            autoComplete="off"
          />
        </div>
      ) : (
        <fieldset className="grid gap-2">
          <legend className="mb-1 text-sm font-medium">Anzahl je Schein und Münze</legend>
          <div className="grid grid-cols-3 gap-2 sm:grid-cols-5">
            {DENOMINATIONS.map((value) => (
              <div key={value} className="grid gap-1">
                <Label htmlFor={`stueck-${value}`} className="text-xs text-muted-foreground">
                  {denominationLabel(value)}
                </Label>
                <Input
                  id={`stueck-${value}`}
                  inputMode="numeric"
                  value={pieces[value] ?? ""}
                  onChange={(event) => setPiece(value, event.target.value)}
                  className="h-9 tabular-nums"
                  autoComplete="off"
                />
              </div>
            ))}
          </div>
          <p className="text-sm">
            Zusammen:{" "}
            <span className="font-semibold tabular-nums">{formatEuroFromCents(helperTotal)}</span>
          </p>
        </fieldset>
      )}
      <Button
        type="button"
        variant="ghost"
        size="sm"
        className="-mt-2 justify-self-start text-primary hover:text-primary"
        onClick={() => setHelper((value) => !value)}
      >
        {helper ? "Betrag direkt eingeben" : "Zählhilfe: Scheine und Münzen einzeln"}
      </Button>

      {difference !== null && (
        <p className="text-sm font-medium" role="status" aria-live="polite">
          {difference === 0 ? (
            <span className="text-emerald-700 dark:text-emerald-400">
              Stimmt mit dem Kassenbuch überein.
            </span>
          ) : (
            <span className="text-amber-700 dark:text-amber-400">
              Differenz: {formatSignedEuro(difference)}
            </span>
          )}
        </p>
      )}
      {((difference !== null && difference !== 0) || askReason) && (
        <div className="grid gap-1.5">
          <Label htmlFor="kassensturz-grund">Woran könnte es liegen?</Label>
          <Textarea
            id="kassensturz-grund"
            value={note}
            onChange={(event) => setNote(event.target.value)}
            rows={2}
            maxLength={500}
            placeholder="z. B. Wechselgeld beim Sommerfest falsch herausgegeben"
          />
        </div>
      )}
      {error && (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}
      <Button type="submit" disabled={pending || !account} className="justify-self-start">
        {pending ? "Einen Moment …" : "Kassensturz speichern"}
      </Button>
    </form>
  );
}
