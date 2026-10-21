import Link from "next/link";
import { LockIcon, UploadIcon } from "lucide-react";
import { ACCENT } from "@/components/shared/accent";
import { IconHint } from "@/components/shared/icon-hint";
import { ToneBadge } from "@/components/shared/status-badge";
import { calendarDateToInputValue, formatCalendarDate, formatDate } from "@/lib/dates";
import { centsToInput } from "@/lib/money";
import { formatBytes } from "@/lib/uploads";
import { cn } from "@/lib/utils";
import { MarkPaidButton } from "@/modules/finance/components/mark-paid-button";
import {
  categoryAccent,
  fileTypeLabel,
  invoiceState,
  splitFileName,
  type CategoryAccents,
} from "../display";
import { ACCESS_LABEL, type AccessLevel } from "../schemas";
import type { DocumentDto, DocumentInvoice, StorageUsage } from "../service";
import { DocumentRowActions, type DocumentRowActionData } from "./document-row-actions";

/**
 * Spalten am Computer: Dokument (Kachel, Name, Angaben) · Rechnung (nur wenn auf der Seite eine steht) · Knöpfe (breit genug
 * für „Bezahlt“ und „…“, sonst nur „…“). Jede Zeile ist ein eigenes Raster mit denselben festen Breiten, so stehen Beträge und
 * Knöpfe untereinander. Ausgeschrieben, weil Tailwind nur vollständige Klassen im Quelltext findet.
 */
const COLUMNS = {
  invoicesAndPaid: "md:grid-cols-[minmax(0,1fr)_11rem_9rem]",
  invoices: "md:grid-cols-[minmax(0,1fr)_11rem_2rem]",
  plain: "md:grid-cols-[minmax(0,1fr)_2rem]",
} as const;

/** Kleines Schild in der Rechnungsspalte (etwas kleiner als `ToneBadge` sonst, damit die Zeile ruhig bleibt). */
const SMALL_BADGE = "h-5 max-w-full min-w-0 px-1.5 text-[0.6875rem]";

/**
 * Dokumentenliste als „Ruhige Liste“ (seit 20.10.2026, Entwurf A – Wunsch Luis): eine Zeile je Dokument, alle gleich hoch.
 * Vorne die Kachel mit dem Dateityp in der Farbe der Kategorie, daneben der Name ohne Endung (die steht auf der Kachel; für
 * Screenreader und beim Überfahren der volle Name) und darunter klein „Kategorie · Größe · Datum von Person“ samt
 * Veranstaltung bzw. Beleg im Kassenbuch. Zugriff „Alle Mitglieder“ ohne Zeichen, sonst ein Schloss mit Hinweis. Rechts der
 * Rechnungsstand (Betrag, Schild), „Bezahlt“ (zartgrün, nur bei offenen Rechnungen) und das Menü „…“.
 *
 * Ein Klick auf Name oder Kachel lädt herunter (immer über die geschützte Route). Am Handy zwei Zeilen: Name (darf umbrechen)
 * und darunter Betrag mit Schild bzw. Kategorie und Datum; „Bezahlt“ steckt dort im Menü.
 *
 * Rechte wie bisher: Rechnungsangaben kommen nur für `finance:read` aus dem Dienst (`DocumentDto.invoice`), „Bezahlt“ und
 * die Rechnungsfelder in „Bearbeiten“ nur mit `finance:manage`, Bearbeiten/Löschen nach `DocumentDto.can`.
 */
export function DocumentList({
  items,
  financeManage,
  accessLevels,
  accents,
}: {
  items: DocumentDto[];
  /** Darf Rechnungen als bezahlt markieren und ihre Angaben ändern (`finance:manage`). */
  financeManage: boolean;
  /** Zugriffsstufen, die der Benutzer vergeben darf (für „Bearbeiten“). */
  accessLevels: AccessLevel[];
  /** Farben der Kategorien (`categoryAccents` aus allen sichtbaren Kategorien – auf jeder Seite der Liste dieselben). */
  accents: CategoryAccents;
}) {
  const payableInvoice = (document: DocumentDto) =>
    financeManage && document.can.manage && document.invoice?.status === "OPEN"
      ? document.invoice
      : null;
  const showInvoices = items.some((document) => document.invoice);
  const columns = !showInvoices
    ? COLUMNS.plain
    : items.some(payableInvoice)
      ? COLUMNS.invoicesAndPaid
      : COLUMNS.invoices;

  return (
    <>
      {/* Spaltenköpfe nur am Computer und nur mit Rechnungen – leise, damit die Zeilen führen. Für Screenreader stehen
          die Angaben in jeder Zeile („Rechnung, 349,50 € …“). */}
      {showInvoices && (
        <div
          aria-hidden="true"
          className={cn(
            "hidden gap-4 px-5 pt-3 pb-1 text-xs font-medium text-muted-foreground md:grid",
            columns,
          )}
        >
          <span className="pl-14">Dokument</span>
          <span className="text-right">Rechnung</span>
          <span />
        </div>
      )}
      <ul className="grid grid-cols-[minmax(0,1fr)] gap-0.5 p-2">
        {items.map((document) => {
          const payable = payableInvoice(document);
          const actions: DocumentRowActionData = {
            id: document.id,
            name: document.name,
            edit: document.can.manage
              ? {
                  name: document.name,
                  category: document.category ?? "",
                  access: document.access,
                  // Rechnungsangaben nur für Berechtigte – sonst fehlt der Teil im Formular ganz.
                  ...(financeManage && document.invoice
                    ? {
                        invoice: {
                          status: document.invoice.status,
                          amount: centsToInput(document.invoice.amountCents),
                          dueDate: calendarDateToInputValue(document.invoice.dueDate),
                        },
                      }
                    : {}),
                }
              : null,
            accessLevels,
            delete: document.can.delete,
            payableInvoiceId: payable?.id ?? null,
          };
          return (
            <li
              key={document.id}
              className={cn(
                // Fokus per Tastatur färbt die ganze Zeile (der Fokusrahmen selbst liegt am Namen, wie bei allen Links).
                "relative grid min-h-16 grid-cols-[minmax(0,1fr)_auto] items-center gap-3 rounded-xl px-2 py-2 hover:bg-muted has-[a:focus-visible]:bg-muted md:gap-4 md:px-3",
                columns,
              )}
            >
              <DocumentCell document={document} accents={accents} />
              {showInvoices && (
                <div className="min-w-0 max-md:hidden">
                  {document.invoice && <InvoiceColumn invoice={document.invoice} />}
                </div>
              )}
              <div className="flex items-center justify-end gap-1">
                {payable && (
                  <MarkPaidButton
                    invoiceId={payable.id}
                    name={document.name}
                    soft
                    className="max-md:hidden"
                  />
                )}
                <DocumentRowActions document={actions} className="text-muted-foreground" />
              </div>
            </li>
          );
        })}
      </ul>
    </>
  );
}

/**
 * Kachel, Name und die graue Zeile darunter. Die Fläche des Namenslinks (`after:`) deckt Kachel und Text – ein Klick auf die
 * Kachel lädt also auch herunter; Schloss und Veranstaltung liegen darüber (`z-10`).
 */
function DocumentCell({ document, accents }: { document: DocumentDto; accents: CategoryAccents }) {
  const { base, ext } = splitFileName(document.name);
  const restricted = document.access !== "ALL_MEMBERS";
  return (
    <div className="relative flex min-w-0 items-center gap-3 md:gap-4">
      <span
        aria-hidden="true"
        className={cn(
          "grid size-9 shrink-0 place-items-center rounded-lg text-[0.625rem] font-bold tracking-wide md:size-10 md:text-[0.6875rem]",
          ACCENT[categoryAccent(document.category, accents)].tile,
        )}
      >
        {fileTypeLabel(document.name, document.mimeType)}
      </span>
      <div className="min-w-0 flex-1">
        <p className="flex min-w-0 items-start gap-1.5 md:items-center">
          {/* Am Handy darf ein langer Name in eine zweite Zeile umbrechen, am Computer ist Platz für eine. Screenreader hören
              den vollen Namen mit Endung (`aria-label` – ein unsichtbarer Text dahinter würde mit Leerzeichen vorgelesen). */}
          <a
            href={`/api/dokumente/${document.id}/download`}
            title={document.name}
            aria-label={ext ? document.name : undefined}
            className="line-clamp-2 min-w-0 text-sm font-semibold break-words underline-offset-4 after:absolute after:inset-0 after:rounded-lg hover:underline md:line-clamp-1"
          >
            {base}
          </a>
          {restricted && (
            <IconHint label={ACCESS_LABEL[document.access]} className="z-10 mt-0.5 md:mt-0">
              <LockIcon />
            </IconHint>
          )}
        </p>
        <div className="mt-0.5 text-xs text-muted-foreground md:hidden">
          {document.invoice ? (
            <InvoiceLine invoice={document.invoice} />
          ) : (
            <MetaLine document={document} compact />
          )}
        </div>
        <div className="mt-0.5 text-xs text-muted-foreground max-md:hidden">
          <MetaLine document={document} />
        </div>
      </div>
    </div>
  );
}

/**
 * „Rechnungen · 106 Byte · 15.09.2026 von Bernd Vorstand · Zu: Sommerfest 2026 (12.07.2026)“ – in einer Zeile, zu Langes
 * endet mit „…“ (der volle Text steht im Hinweis beim Überfahren). `compact` (Handy): nur Kategorie und Datum, dazu die
 * Veranstaltung bzw. der Beleg. Gehört das Dokument zu einer Veranstaltung, steht dort statt der Kategorie die Veranstaltung
 * (sonst bliebe vom Link am Handy oft nur „Zu: S…“).
 */
function MetaLine({ document, compact = false }: { document: DocumentDto; compact?: boolean }) {
  const uploaded = `${formatDate(document.createdAt)}${
    !compact && document.uploader ? ` von ${document.uploader}` : ""
  }`;
  const category = compact && document.event ? null : document.category;
  const facts = [category, !compact && formatBytes(document.sizeBytes), uploaded]
    .filter(Boolean)
    .join(" · ");
  const { event } = document;
  const eventText = event ? `${event.title} (${formatDate(event.startsAt)})` : null;
  const receipt = document.retainedUntil
    ? compact
      ? "Beleg im Kassenbuch"
      : `Beleg im Kassenbuch, aufbewahrt bis ${formatCalendarDate(document.retainedUntil)}`
    : null;
  return (
    <p
      className="truncate"
      title={[facts, eventText && `Zu: ${eventText}`, receipt].filter(Boolean).join(" · ")}
    >
      {facts}
      {event && (
        <>
          {" · Zu: "}
          <Link
            href={`/veranstaltungen/${event.id}`}
            className="relative z-10 underline underline-offset-4 hover:text-foreground"
          >
            {compact ? event.title : eventText}
          </Link>
        </>
      )}
      {receipt && ` · ${receipt}`}
    </p>
  );
}

/** Rechte Spalte am Computer: Betrag rechtsbündig, darunter das Schild. */
function InvoiceColumn({ invoice }: { invoice: DocumentInvoice }) {
  const { amount, tone, text } = invoiceState(invoice);
  return (
    <div className="flex min-w-0 flex-col items-end gap-1 text-right">
      <span className="sr-only">Rechnung,</span>
      {amount && (
        <span
          className={cn(
            "text-sm font-semibold tabular-nums",
            invoice.status === "PAID" && "font-medium text-muted-foreground",
          )}
        >
          {amount}
        </span>
      )}
      <ToneBadge tone={tone} className={cn(SMALL_BADGE, "truncate")}>
        {text}
      </ToneBadge>
    </div>
  );
}

/** Am Handy: Betrag und Schild in der zweiten Zeile unter dem Namen. */
function InvoiceLine({ invoice }: { invoice: DocumentInvoice }) {
  const { amount, tone, text } = invoiceState(invoice);
  return (
    <p className="flex min-w-0 items-center gap-1.5">
      <span className="sr-only">Rechnung,</span>
      {amount && (
        <span
          className={cn(
            "shrink-0 font-semibold tabular-nums",
            invoice.status === "PAID" ? "text-muted-foreground" : "text-foreground",
          )}
        >
          {amount}
        </span>
      )}
      <ToneBadge tone={tone} className={cn(SMALL_BADGE, "truncate")}>
        {text}
      </ToneBadge>
    </p>
  );
}

/**
 * Fuß der Karte: belegter Speicherplatz als schmaler Balken (für alle, die hochladen dürfen – wie bisher), am Computer
 * daneben der Hinweis aufs Hineinziehen (am Handy zieht man keine Dateien, dort genügt der Knopf).
 */
export function StorageFooter({ usage }: { usage: StorageUsage }) {
  const percent = Math.min(100, (usage.usedBytes / usage.quotaBytes) * 100);
  const text = `${formatBytes(usage.usedBytes)} von ${formatBytes(usage.quotaBytes)}`;
  return (
    <div className="flex flex-wrap items-center justify-between gap-x-6 gap-y-2 border-t border-foreground/5 px-4 py-3 text-xs text-muted-foreground">
      <div className="flex min-w-0 flex-1 items-center gap-3 md:flex-none">
        <span className="shrink-0 font-medium" id="dokumente-speicher">
          Speicherplatz
        </span>
        <span
          role="meter"
          aria-labelledby="dokumente-speicher"
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={Math.round(percent)}
          aria-valuetext={`${text} belegt (${Math.round(percent)} %)`}
          className="h-1.5 w-40 min-w-10 shrink overflow-hidden rounded-full bg-muted ring-1 ring-foreground/10 ring-inset"
        >
          {/* Ein Hauch Balken ist immer zu sehen, sobald etwas belegt ist. */}
          <span
            className="block h-full rounded-full bg-primary"
            style={{ width: `${usage.usedBytes > 0 ? Math.max(percent, 2) : 0}%` }}
          />
        </span>
        <span className="shrink-0 whitespace-nowrap tabular-nums">{text}</span>
      </div>
      <span className="hidden items-center gap-1.5 md:inline-flex">
        <UploadIcon className="size-3.5" aria-hidden="true" />
        Dateien einfach auf die Seite ziehen – auch mehrere auf einmal.
      </span>
    </div>
  );
}
