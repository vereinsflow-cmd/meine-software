import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { ReceiptTextIcon, SearchIcon, XIcon } from "lucide-react";
import { AREA_ICON } from "@/components/shared/area-icons";
import { EmptyState } from "@/components/shared/empty-state";
import { FilterChips, type FilterChip } from "@/components/shared/filter-chips";
import { NoAccess } from "@/components/shared/no-access";
import { PageHeader } from "@/components/shared/page-header";
import { PageStack } from "@/components/shared/page-section";
import { Pagination } from "@/components/shared/pagination";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { SOFT_CARD_SURFACE } from "@/components/ui/surface";
import { todayCalendarDate } from "@/lib/dates";
import { eventOptions } from "@/lib/event-options";
import {
  buildQuery,
  enumParam,
  pageRequest,
  param,
  type RawSearchParams,
} from "@/lib/search-params";
import { cn } from "@/lib/utils";
import { UploadDialog } from "@/modules/documents/components/document-controls";
import { DocumentList, StorageFooter } from "@/modules/documents/components/document-list";
import {
  CATEGORY_DOT,
  DOCUMENT_LIST_HEADING_ID,
  categoryAccent,
  categoryAccents,
} from "@/modules/documents/display";
import {
  allowedAccessLevels,
  countDocuments,
  getStorageUsage,
  listCategories,
  listDocuments,
  listUploadEvents,
} from "@/modules/documents/service";
import { canFinance } from "@/modules/finance/access";
import { invoiceBaseName } from "@/modules/finance/invoice-format";
import { invoiceReadingEnabled } from "@/modules/finance/invoice-reader";
import { env } from "@/server/env";
import { can, scopeOf } from "@/server/permissions/policy";
import { requirePageContext } from "@/server/tenancy/context";

export const metadata: Metadata = { title: "Dokumente" };

const BASE = "/dokumente";
const PAGE_SIZE = 15;

/**
 * Dokumente als „Ruhige Liste“ (seit 20.10.2026, Entwurf A – Wunsch Luis): eine Karte mit Suche, Filterknöpfen mit Anzahl
 * („Alle 3 · Rechnungen 3 · Offene Rechnungen 2“), darunter eine gleich hohe Zeile je Dokument (`DocumentList`) und im Fuß der
 * belegte Speicherplatz. Hochladen über den Knopf oder durch Ziehen auf die Seite (`UploadDialog`), Bearbeiten und Löschen im
 * Menü „…“ jeder Zeile.
 *
 * Alles über URL-Parameter (ohne Skript bedienbar, teilbar, Zurück-Taste): `q` (Suche), `kategorie`, `rechnungen=alle|offen`
 * (nur mit `finance:read`), `veranstaltung` (von der Veranstaltungsseite) und `page`. Ein Filterknopf ersetzt den anderen
 * (Kategorie bzw. Rechnungen); Suche und Veranstaltung bleiben dabei stehen. Die Seite liest nur.
 */
export default async function DocumentsPage({
  searchParams,
}: {
  searchParams: Promise<RawSearchParams>;
}) {
  const params = await searchParams;
  const ctx = await requirePageContext();
  if (!can(ctx, "documents:read")) return <NoAccess what="die Dokumente" />;

  const q = param(params, "q");
  const category = param(params, "kategorie");
  const eventId = param(params, "veranstaltung");
  const canUpload = can(ctx, "documents:upload");
  // Rechnungen: Betrag und Zahlungsstand sehen nur Berechtigte; erfassen und als bezahlt markieren, wer sie verwaltet.
  const financeRead = canFinance(ctx, "finance:read");
  const financeManage = canFinance(ctx, "finance:manage");
  const invoices = financeRead
    ? enumParam(params, "rechnungen", ["offen", "alle"] as const)
    : undefined;
  const accessLevels = allowedAccessLevels(ctx);
  const [result, counts, categories, usage, events] = await Promise.all([
    listDocuments(ctx, {
      q,
      category,
      eventId,
      invoices: invoices === "offen" ? "open" : invoices === "alle" ? "all" : undefined,
      request: pageRequest(params, PAGE_SIZE),
    }),
    countDocuments(ctx, { q, eventId }),
    // Alle sichtbaren Kategorien, unabhängig von der Suche: feste Farben der Kategorien und Vorschläge beim Hochladen.
    listCategories(ctx),
    canUpload ? getStorageUsage(ctx) : Promise.resolve(null),
    canUpload ? listUploadEvents(ctx) : Promise.resolve([]),
  ]);
  // Seite hinter der letzten (z. B. nach dem Löschen der letzten Einträge dort): zur letzten Seite statt „Noch keine Dokumente“.
  if (result.page > result.pageCount && result.total > 0) {
    redirect(`${BASE}${buildQuery(params, { page: result.pageCount })}`);
  }
  const filtered = Boolean(q || category || eventId || invoices);
  const accents = categoryAccents(categories);

  // Ein Knopf ersetzt den anderen (Kategorie bzw. Rechnungen) und beginnt wieder auf Seite 1; Suche und Veranstaltung bleiben.
  const chipHref = (changes: Record<string, string | undefined>) =>
    `${BASE}${buildQuery(params, { kategorie: undefined, rechnungen: undefined, page: undefined, ...changes })}`;
  const categoryChips = counts.categories.some((entry) => entry.name === category)
    ? counts.categories
    : // Gewählte Kategorie ohne Treffer zur Suche: steht trotzdem da (mit 0), sonst sähe man nicht, was gerade gilt.
      [...counts.categories, ...(category ? [{ name: category, count: 0 }] : [])];
  const chips: FilterChip[] = [
    {
      key: "alle",
      label: "Alle",
      count: counts.total,
      href: chipHref({}),
      active: !category && !invoices,
    },
    ...categoryChips.map((entry) => ({
      key: `kategorie:${entry.name}`,
      label: entry.name,
      count: entry.count,
      href: chipHref({ kategorie: entry.name }),
      active: category === entry.name,
      dot: CATEGORY_DOT[categoryAccent(entry.name, accents)],
    })),
    // Rechnungen (vorher die Auswahl „Alle Dokumente / Nur Rechnungen / Nur offene Rechnungen“) – nur mit `finance:read`,
    // und nur, wenn es welche gibt oder der Filter gerade gilt.
    ...(counts.invoices && (counts.invoices.all > 0 || invoices === "alle")
      ? [
          {
            key: "rechnungen:alle",
            label: "Alle Rechnungen",
            count: counts.invoices.all,
            href: chipHref({ rechnungen: "alle" }),
            active: invoices === "alle",
            icon: <ReceiptTextIcon />,
          },
        ]
      : []),
    ...(counts.invoices && (counts.invoices.open > 0 || invoices === "offen")
      ? [
          {
            key: "rechnungen:offen",
            label: "Offene Rechnungen",
            count: counts.invoices.open,
            href: chipHref({ rechnungen: "offen" }),
            active: invoices === "offen",
            icon: <ReceiptTextIcon />,
          },
        ]
      : []),
  ];
  const showChips = counts.total > 0 || Boolean(category || invoices);

  return (
    <PageStack>
      <PageHeader
        title="Dokumente"
        description="Satzung, Protokolle, Formulare und weitere Unterlagen deines Vereins."
        actions={
          canUpload ? (
            <UploadDialog
              categories={categories}
              events={eventOptions(events).map(({ value, label }) => ({ id: value, label }))}
              accessLevels={accessLevels}
              maxMb={env.MAX_UPLOAD_MB}
              requireEvent={scopeOf(ctx, "documents:upload") === "DEPARTMENT"}
              defaultEventId={eventId}
              invoiceName={financeManage ? invoiceBaseName(todayCalendarDate()) : null}
              invoiceReading={financeManage && invoiceReadingEnabled()}
            />
          ) : undefined
        }
      />

      {eventId && (
        <p className="text-sm text-muted-foreground">
          Es werden nur Dokumente zu einer Veranstaltung angezeigt.{" "}
          <Link href={`/veranstaltungen/${eventId}`} className="underline underline-offset-4">
            Zur Veranstaltung
          </Link>
        </p>
      )}

      <section
        aria-labelledby={DOCUMENT_LIST_HEADING_ID}
        className={cn(SOFT_CARD_SURFACE, "overflow-hidden")}
      >
        {/* Fokussierbar (nicht per Tab): Nach dem Löschen des letzten Eintrags landet der Fokus hier statt am Seitenanfang. */}
        <h2 id={DOCUMENT_LIST_HEADING_ID} tabIndex={-1} className="sr-only">
          Dokumente, neueste zuerst
        </h2>

        {/* Kopf: Suche (Eingabetaste sucht) und die Filterknöpfe mit echten Anzahlen. Die Spalte ist höchstens so breit wie
            die Karte (`minmax(0,1fr)`) – sonst schöbe eine lange Kategorie auf ihrem Knopf Suchfeld und Knöpfe am Handy über
            den Kartenrand hinaus, wo `overflow-hidden` sie abschneidet. */}
        <div className="grid grid-cols-[minmax(0,1fr)] gap-3 border-b border-foreground/5 p-3 sm:p-4">
          <div className="flex flex-wrap items-center gap-2">
            <form
              key={JSON.stringify(params)}
              method="get"
              action={BASE}
              role="search"
              className="relative min-w-0 flex-1 basis-56 sm:max-w-sm"
            >
              {category && <input type="hidden" name="kategorie" value={category} />}
              {invoices && <input type="hidden" name="rechnungen" value={invoices} />}
              {eventId && <input type="hidden" name="veranstaltung" value={eventId} />}
              <SearchIcon
                aria-hidden="true"
                className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground"
              />
              {/* Das Löschkreuz von Chrome und Safari erscheint erst mit Text (im leeren Feld belegt es keinen Platz). */}
              <Input
                type="search"
                name="q"
                defaultValue={q}
                placeholder="Dokument oder Kategorie suchen …"
                aria-label="Dokumente durchsuchen"
                className="pl-9 [&:placeholder-shown::-webkit-search-cancel-button]:hidden"
              />
            </form>
            {/* Ohne Treffer bietet der Leerzustand darunter dasselbe an („Filter zurücksetzen“). */}
            {filtered && result.items.length > 0 && (
              <Button asChild variant="ghost" size="sm">
                <Link href={BASE}>
                  <XIcon /> Zurücksetzen
                </Link>
              </Button>
            )}
          </div>
          {showChips && <FilterChips label="Dokumente filtern" chips={chips} />}
        </div>

        {result.items.length === 0 ? (
          <EmptyState
            icon={<AREA_ICON.dokumente />}
            title={filtered ? "Keine passenden Dokumente" : "Noch keine Dokumente"}
            description={
              filtered
                ? "Passe die Suche oder den Filter an."
                : canUpload
                  ? "Lade das erste Dokument hoch – z. B. die Satzung. Du kannst Dateien auch einfach hierher ziehen."
                  : "Sobald dein Verein Dokumente bereitstellt, findest du sie hier."
            }
            action={
              filtered ? (
                <Button asChild>
                  <Link href={BASE}>Filter zurücksetzen</Link>
                </Button>
              ) : undefined
            }
            // In der Karte der Liste: ohne eigene Kartenfläche.
            className="bg-transparent pt-8 pb-12 shadow-none ring-0"
          />
        ) : (
          <>
            <DocumentList
              items={result.items}
              financeManage={financeManage}
              accessLevels={accessLevels}
              accents={accents}
            />
            {result.pageCount > 1 && (
              <Pagination
                basePath={BASE}
                searchParams={params}
                {...result}
                className="mt-0 border-t border-foreground/5 px-4 py-3"
              />
            )}
          </>
        )}

        {usage && <StorageFooter usage={usage} />}
      </section>
    </PageStack>
  );
}
