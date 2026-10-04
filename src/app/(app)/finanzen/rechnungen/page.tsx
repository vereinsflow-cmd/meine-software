import type { Metadata } from "next";
import Link from "next/link";
import { DownloadIcon } from "lucide-react";
import { AREA_ICON } from "@/components/shared/area-icons";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { SEGMENT_BAR, segmentItem } from "@/components/ui/segment-styles";
import { EmptyState } from "@/components/shared/empty-state";
import { NoAccess } from "@/components/shared/no-access";
import { Pagination } from "@/components/shared/pagination";
import { TableCard } from "@/components/shared/table-card";
import { formatCalendarDate, formatEuroFromCents, todayCalendarDate } from "@/lib/dates";
import { eventOptions } from "@/lib/event-options";
import { enumParam, pageRequest, param, type RawSearchParams } from "@/lib/search-params";
import { cn } from "@/lib/utils";
import { UploadDialog } from "@/modules/documents/components/document-controls";
import { allowedAccessLevels, listCategories, listUploadEvents } from "@/modules/documents/service";
import { canFinance } from "@/modules/finance/access";
import { FinanceHeader } from "@/modules/finance/components/finance-header";
import { MarkPaidButton } from "@/modules/finance/components/mark-paid-button";
import { dueText, invoiceBaseName } from "@/modules/finance/invoice-format";
import { listInvoices, type InvoiceFilter } from "@/modules/finance/service";
import { env } from "@/server/env";
import { can, scopeOf } from "@/server/permissions/policy";
import { requirePageContext } from "@/server/tenancy/context";

export const metadata: Metadata = { title: "Rechnungen" };

const FILTERS: { value: InvoiceFilter; label: string }[] = [
  { value: "offen", label: "Offen" },
  { value: "bezahlt", label: "Bezahlt" },
  { value: "alle", label: "Alle" },
];

/**
 * Rechnungen, die der Verein bezahlen muss – an einem Ort (vorher nur über „Dokumente“ zu finden). Offene stehen nach
 * Fälligkeit, überfällige rot; „Bezahlt“ (grün, mit Rückgängig) wie auf dem Dashboard. Hochladen gleich als Rechnung.
 */
export default async function InvoicesPage({
  searchParams,
}: {
  searchParams: Promise<RawSearchParams>;
}) {
  const params = await searchParams;
  const ctx = await requirePageContext();
  if (!canFinance(ctx, "finance:read")) return <NoAccess what="die Finanzen" />;
  const stand = enumParam(params, "stand", ["offen", "bezahlt", "alle"] as const) ?? "offen";
  const q = param(params, "q");
  const { page, pageSize } = pageRequest(params, 20);
  const canUpload = canFinance(ctx, "finance:manage") && can(ctx, "documents:upload");
  const [result, categories, events] = await Promise.all([
    listInvoices(ctx, { stand, q, page, pageSize }),
    canUpload ? listCategories(ctx) : Promise.resolve([]),
    canUpload ? listUploadEvents(ctx) : Promise.resolve([]),
  ]);
  const query = (next: InvoiceFilter) =>
    `/finanzen/rechnungen?stand=${next}${q ? `&q=${encodeURIComponent(q)}` : ""}`;

  return (
    <>
      <FinanceHeader
        description={
          result.openTotalCents > 0
            ? `Offen zu bezahlen: ${formatEuroFromCents(result.openTotalCents)}`
            : "Rechnungen, die der Verein bezahlen muss"
        }
        counts={{ "/finanzen/rechnungen": result.overdueCount }}
        actions={
          canUpload ? (
            <UploadDialog
              categories={categories}
              events={eventOptions(events).map(({ value, label }) => ({ id: value, label }))}
              accessLevels={allowedAccessLevels(ctx)}
              maxMb={env.MAX_UPLOAD_MB}
              requireEvent={scopeOf(ctx, "documents:upload") === "DEPARTMENT"}
              invoiceName={invoiceBaseName(todayCalendarDate())}
              invoiceOnly
            />
          ) : undefined
        }
      />

      <div className="mb-4 flex flex-wrap items-center gap-3">
        <nav aria-label="Rechnungen anzeigen" className={SEGMENT_BAR}>
          {FILTERS.map((filter) => (
            <Link
              key={filter.value}
              href={query(filter.value)}
              aria-current={stand === filter.value ? "page" : undefined}
              className={segmentItem(stand === filter.value)}
            >
              {filter.label}
            </Link>
          ))}
        </nav>
        <form
          method="get"
          action="/finanzen/rechnungen"
          role="search"
          className="flex min-w-0 flex-1 gap-2 sm:max-w-sm"
        >
          <input type="hidden" name="stand" value={stand} />
          <Input
            type="search"
            name="q"
            defaultValue={q}
            placeholder="Rechnung suchen …"
            aria-label="Rechnungen durchsuchen"
          />
          <Button type="submit" variant="outline">
            Suchen
          </Button>
        </form>
      </div>

      {result.items.length === 0 ? (
        <EmptyState
          icon={<AREA_ICON.finanzen />}
          title={
            q
              ? "Keine passende Rechnung"
              : stand === "offen"
                ? "Keine offenen Rechnungen"
                : stand === "bezahlt"
                  ? "Noch keine bezahlten Rechnungen"
                  : "Noch keine Rechnungen"
          }
          description={
            q
              ? "Passe die Suche an."
              : stand === "offen"
                ? "Alles bezahlt. Neue Rechnungen lädst du mit „Rechnung hochladen“ hoch."
                : "Rechnungen lädst du hier oder unter „Dokumente“ hoch."
          }
        />
      ) : (
        <>
          {/* Zahl aller überfälligen (nicht nur dieser Seite) – bei einer Suche passt sie nicht zur Liste. */}
          {stand === "offen" && !q && result.overdueCount > 0 && (
            <p className="mb-2 text-sm font-medium text-red-700 dark:text-red-400">
              {result.overdueCount === 1
                ? "1 Rechnung ist überfällig."
                : `${result.overdueCount} Rechnungen sind überfällig.`}
            </p>
          )}
          <TableCard>
            <Table>
              <caption className="sr-only">
                Rechnungen ({FILTERS.find((f) => f.value === stand)!.label})
              </caption>
              <TableHeader>
                <TableRow>
                  <TableHead>Rechnung</TableHead>
                  <TableHead className="text-right">Betrag</TableHead>
                  <TableHead className="hidden md:table-cell">Fällig</TableHead>
                  <TableHead className="hidden md:table-cell">Stand</TableHead>
                  <TableHead className="w-32">
                    <span className="sr-only">Aktionen</span>
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {result.items.map((invoice) => {
                  const due = dueText(invoice.dueInDays);
                  const state =
                    invoice.status === "PAID"
                      ? invoice.paidAt
                        ? `bezahlt am ${formatCalendarDate(todayCalendarDate(invoice.paidAt))}`
                        : "bezahlt"
                      : (due ?? "offen");
                  return (
                    <TableRow key={invoice.id}>
                      <TableCell className="whitespace-normal">
                        {invoice.canOpen ? (
                          <a
                            href={`/api/dokumente/${invoice.documentId}/download`}
                            className="inline-flex items-center gap-1.5 font-medium underline-offset-4 hover:underline"
                          >
                            {invoice.name}
                            <DownloadIcon
                              className="size-3.5 text-muted-foreground"
                              aria-hidden="true"
                            />
                            <span className="sr-only">(herunterladen)</span>
                          </a>
                        ) : (
                          <span className="font-medium">{invoice.name}</span>
                        )}
                        <span className="block text-sm text-muted-foreground">
                          Rechnung vom {formatCalendarDate(invoice.invoiceDate)}
                        </span>
                        <span
                          className={cn(
                            "block text-sm md:hidden",
                            invoice.overdue
                              ? "font-medium text-red-700 dark:text-red-400"
                              : "text-muted-foreground",
                          )}
                        >
                          {state}
                        </span>
                      </TableCell>
                      <TableCell className="text-right font-semibold tabular-nums">
                        {invoice.amountCents === null
                          ? "–"
                          : formatEuroFromCents(invoice.amountCents)}
                      </TableCell>
                      <TableCell className="hidden tabular-nums md:table-cell">
                        {invoice.dueDate ? formatCalendarDate(invoice.dueDate) : "–"}
                      </TableCell>
                      <TableCell
                        className={cn(
                          "hidden md:table-cell",
                          invoice.overdue
                            ? "font-medium text-red-700 dark:text-red-400"
                            : "text-muted-foreground",
                        )}
                      >
                        {state}
                      </TableCell>
                      <TableCell className="text-right">
                        {result.canManage && invoice.status === "OPEN" && (
                          <MarkPaidButton invoiceId={invoice.id} name={invoice.name} compact />
                        )}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </TableCard>
          <Pagination basePath="/finanzen/rechnungen" searchParams={params} {...result} />
        </>
      )}
    </>
  );
}
