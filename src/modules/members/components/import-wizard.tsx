"use client";

import { useRef, useState, useTransition } from "react";
import Link from "next/link";
import { CheckCircle2Icon, DownloadIcon, UploadIcon } from "lucide-react";
import { toast } from "sonner";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { ToneBadge, type Tone } from "@/components/shared/status-badge";
import { FormError } from "@/components/shared/form-fields";
import { executeImportAction, previewImportAction } from "../actions";
import type { ImportPreview } from "../import";

/** CSV aus Excel ist oft Windows-1252-kodiert; UTF-8 wird bevorzugt, sonst wird auf 1252 ausgewichen. */
async function readFileText(file: File): Promise<string> {
  const buffer = await file.arrayBuffer();
  try {
    return new TextDecoder("utf-8", { fatal: true }).decode(buffer);
  } catch {
    return new TextDecoder("windows-1252").decode(buffer);
  }
}

const STATUS: Record<"ok" | "duplicate" | "error", { label: string; tone: Tone }> = {
  ok: { label: "wird importiert", tone: "success" },
  duplicate: { label: "übersprungen (Duplikat)", tone: "warning" },
  error: { label: "Fehler", tone: "danger" },
};

export function ImportWizard() {
  const input = useRef<HTMLInputElement>(null);
  const [csv, setCsv] = useState<string | null>(null);
  const [fileName, setFileName] = useState("");
  const [preview, setPreview] = useState<ImportPreview | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<{ created: number; skipped: number; failed: number } | null>(
    null,
  );
  const [pending, startTransition] = useTransition();

  async function onFile(file: File | undefined) {
    setPreview(null);
    setResult(null);
    setError(null);
    if (!file) return;
    if (file.size > 1_000_000) {
      setError("Die Datei ist zu groß (höchstens 1 MB).");
      return;
    }
    const text = await readFileText(file);
    setCsv(text);
    setFileName(file.name);
    startTransition(async () => {
      const response = await previewImportAction({ csv: text });
      if (!response.ok) setError(response.error.message);
      else setPreview(response.data);
    });
  }

  function run() {
    if (!csv) return;
    startTransition(async () => {
      const response = await executeImportAction({ csv });
      if (!response.ok) {
        setError(response.error.message);
        return;
      }
      setResult(response.data);
      setPreview(null);
      toast.success(`${response.data.created} Mitglieder importiert.`);
    });
  }

  if (result) {
    return (
      <Alert>
        <CheckCircle2Icon />
        <AlertTitle>Import abgeschlossen</AlertTitle>
        <AlertDescription>
          <p>
            {result.created} Mitglieder wurden angelegt, {result.skipped} Duplikate übersprungen,{" "}
            {result.failed} fehlerhafte Zeilen nicht importiert.
          </p>
          <Button asChild className="mt-3">
            <Link href="/mitglieder">Zur Mitgliederliste</Link>
          </Button>
        </AlertDescription>
      </Alert>
    );
  }

  return (
    <div className="grid gap-6">
      <div className="rounded-xl border p-4">
        <h2 className="mb-1 text-base font-medium">1. Datei auswählen</h2>
        <p className="mb-3 text-sm text-muted-foreground">
          CSV-Datei (Semikolon oder Komma getrennt) mit mindestens den Spalten{" "}
          <strong>Vorname</strong> und <strong>Nachname</strong>. Weitere Spalten: Mitgliedsnummer,
          E-Mail, Telefon, Straße, PLZ, Ort, Geburtsdatum, Eintritt, Austritt, Status, Funktion,
          Abteilungen, Notizen. Höchstens 2.000 Zeilen.
        </p>
        <div className="flex flex-wrap items-center gap-3">
          <input
            ref={input}
            type="file"
            accept=".csv,text/csv"
            className="sr-only"
            id="csv-datei"
            onChange={(event) => void onFile(event.target.files?.[0])}
          />
          <Button variant="outline" onClick={() => input.current?.click()} disabled={pending}>
            <UploadIcon /> CSV-Datei wählen
          </Button>
          <label htmlFor="csv-datei" className="text-sm text-muted-foreground">
            {fileName || "Keine Datei ausgewählt"}
          </label>
          <Button asChild variant="ghost" size="sm">
            <a href="/vorlagen/mitglieder-import-vorlage.csv" download>
              <DownloadIcon /> Vorlage herunterladen
            </a>
          </Button>
        </div>
      </div>

      <FormError message={error} />

      {preview && (
        <div className="grid gap-4">
          <div className="rounded-xl border p-4">
            <h2 className="mb-2 text-base font-medium">2. Vorschau prüfen</h2>
            <div className="flex flex-wrap gap-2" role="status">
              <ToneBadge tone="success">{preview.counts.ok} gültig</ToneBadge>
              <ToneBadge tone="warning">{preview.counts.duplicate} Duplikate</ToneBadge>
              <ToneBadge tone="danger">{preview.counts.error} fehlerhaft</ToneBadge>
            </div>
            {preview.ignoredColumns.length > 0 && (
              <p className="mt-2 text-sm text-muted-foreground">
                Nicht erkannte Spalten werden ignoriert: {preview.ignoredColumns.join(", ")}
              </p>
            )}
          </div>

          <div className="overflow-x-auto rounded-xl border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-16">Zeile</TableHead>
                  <TableHead>Mitglied</TableHead>
                  <TableHead>Ergebnis</TableHead>
                  <TableHead>Hinweis</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {preview.rows.map((row) => (
                  <TableRow key={row.line}>
                    <TableCell className="text-muted-foreground">{row.line}</TableCell>
                    <TableCell className="font-medium">{row.label}</TableCell>
                    <TableCell>
                      <ToneBadge tone={STATUS[row.status].tone}>
                        {STATUS[row.status].label}
                      </ToneBadge>
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {row.messages.join(" ")}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
          {preview.rows.length <
            preview.counts.ok + preview.counts.duplicate + preview.counts.error && (
            <p className="text-sm text-muted-foreground">
              Die Vorschau zeigt die ersten 500 Zeilen. Der Import verarbeitet alle.
            </p>
          )}

          <div className="flex justify-end">
            <Button onClick={run} disabled={pending || preview.counts.ok === 0}>
              {pending ? "Import läuft …" : `${preview.counts.ok} Mitglieder importieren`}
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
