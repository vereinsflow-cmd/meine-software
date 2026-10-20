import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { Suspense } from "react";
import {
  AwardIcon,
  DownloadIcon,
  InboxIcon,
  PlusIcon,
  SearchIcon,
  UploadIcon,
  XIcon,
} from "lucide-react";
import { BUTTON_ACCENT } from "@/components/shared/accent";
import { AREA_ICON } from "@/components/shared/area-icons";
import { EmptyState } from "@/components/shared/empty-state";
import { FilterFields, FilterToggle } from "@/components/shared/filter-toggle";
import { MoreActions } from "@/components/shared/more-actions";
import { NoAccess } from "@/components/shared/no-access";
import { PageHeader } from "@/components/shared/page-header";
import { PageStack } from "@/components/shared/page-section";
import { Pagination } from "@/components/shared/pagination";
import { SortLinks } from "@/components/shared/sort-link";
import { Button } from "@/components/ui/button";
import { DropdownMenuItem } from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { NativeSelect } from "@/components/ui/native-select";
import { SOFT_CARD_SURFACE } from "@/components/ui/surface";
import { MemberStatus } from "@/generated/prisma/enums";
import { MEMBER_STATUS_LABEL } from "@/lib/labels";
import {
  buildQuery,
  enumParam,
  pageRequest,
  param,
  type RawSearchParams,
} from "@/lib/search-params";
import { cn } from "@/lib/utils";
import { getMemberFee } from "@/modules/fees/service";
import { canSeeAnniversaries } from "@/modules/members/anniversaries";
import { MemberDetailPanel } from "@/modules/members/components/member-detail-panel";
import { MemberList } from "@/modules/members/components/member-list";
import { MemberDetailSkeleton } from "@/modules/members/components/member-list-skeleton";
import { getMember, listDepartmentOptions, listMembers } from "@/modules/members/service";
import { MEMBER_SORT_FIELDS, type MemberSortField, type MemberView } from "@/modules/members/types";
import { countPendingApplications } from "@/modules/membership-applications/service";
import { isAppError } from "@/server/errors";
import { logUnexpectedError } from "@/server/log";
import { can } from "@/server/permissions/policy";
import { requirePageContext, type TenantContext } from "@/server/tenancy/context";

export const metadata: Metadata = { title: "Mitglieder" };

const BASE = "/mitglieder";
const LIST_ID = "mitglieder-liste";
const FILTER_ID = "mitglieder-filter";
const DETAIL_ID = "mitglied-detail";

/** Die Liste rollt am Computer in sich – 50 Einträge je Seite statt 20 wie in Tabellen (`?pageSize=` bis 100 geht weiter). */
const PAGE_SIZE = 50;

const VIEWS = {
  aktiv: "active",
  archiv: "archived",
  papierkorb: "trash",
} as const satisfies Record<string, MemberView>;

/** Dieselben Sortierungen wie früher die Spaltenköpfe der Tabelle. */
const SORT_FIELDS = [
  { field: "name", label: "Name" },
  { field: "memberNumber", label: "Nr." },
  { field: "status", label: "Status" },
  { field: "joinedAt", label: "Eintritt" },
] as const satisfies readonly { field: MemberSortField; label: string }[];

/**
 * Mitgliederliste als „Liste mit Detailbereich“ (seit 20.10.2026, Entwurf C – Wunsch Luis): links eine schmale Namensliste
 * (`MemberList`) mit Suche, Filtern, Sortierung und Seitenwahl, rechts das ausgewählte Mitglied (`MemberDetailPanel`,
 * `?id=…`, sonst das erste der Seite). Am Handy (unter `lg`) nur die Liste – ein Tipp öffnet die Seite des Mitglieds.
 * Alles über URL-Parameter (ohne Skript bedienbar, teilbar, Zurück-Taste); die Seite liest nur. Das Detail lädt in
 * `<Suspense>` nach – die Liste wartet nicht darauf.
 */
export default async function MembersPage({
  searchParams,
}: {
  searchParams: Promise<RawSearchParams>;
}) {
  const params = await searchParams;
  const ctx = await requirePageContext();
  if (!can(ctx, "members:read")) return <NoAccess what="die Mitgliederverwaltung" />;

  const canArchive = can(ctx, "members:archive");
  const canDelete = can(ctx, "members:delete");
  const ansicht =
    enumParam(params, "ansicht", ["aktiv", "archiv", "papierkorb"] as const) ?? "aktiv";
  const view =
    (ansicht === "archiv" && !canArchive) || (ansicht === "papierkorb" && !canDelete)
      ? "active"
      : VIEWS[ansicht];
  const sort = enumParam(params, "sort", MEMBER_SORT_FIELDS) ?? "name";
  const dir = param(params, "dir") === "desc" ? "desc" : "asc";
  const q = param(params, "q");
  const status = enumParam(params, "status", Object.values(MemberStatus));
  const departmentId = param(params, "abteilung");
  const requestedId = param(params, "id");

  const [result, departments, pendingApplications] = await Promise.all([
    listMembers(ctx, {
      q,
      status,
      departmentId,
      view,
      sort,
      dir,
      request: pageRequest(params, PAGE_SIZE),
    }),
    listDepartmentOptions(ctx, "members:update"),
    countPendingApplications(ctx), // `null` ohne Recht – dann gibt es den Knopf „Anträge“ nicht
  ]);
  // Seite hinter der letzten (z. B. alter Rückweg `?von=`, nachdem Mitglieder weggefallen sind): zur letzten Seite statt
  // „Noch keine Mitglieder“ ohne Seitenwahl.
  if (result.page > result.pageCount && result.total > 0) {
    redirect(`${BASE}${buildQuery(params, { page: result.pageCount, id: undefined })}`);
  }

  // Gewählt ist immer ein Mitglied aus genau dieser Liste: Sie ist schon auf den Verein, die Leserechte, die Ansicht und die
  // Filter beschränkt. Ein `?id=` eines fremden, nicht sichtbaren oder nicht passenden Mitglieds verrät so nichts; dann ist
  // das erste der Seite gewählt. (`getMemberFee` prüft selbst nur das Finanz-Leserecht – deshalb erst nach dieser Auswahl.)
  const selected = result.items.find((member) => member.id === requestedId) ?? result.items[0];
  const colorOf = new Map(departments.map((d) => [d.id, d.color]));
  // Diese Liste mit einem bestimmten Mitglied im Detail – auch der Rückweg aus seinem Profil (`?von=`, siehe [id]/page.tsx):
  // Suche, Filter, Sortierung, Seite und Auswahl bleiben so erhalten.
  const listHref = (id: string) => `${BASE}${buildQuery(params, { id, von: undefined })}`;
  const profileHref = (id: string) => `${BASE}/${id}${buildQuery({}, { von: listHref(id) })}`;
  const activeFilters = [status, departmentId, view !== "active"].filter(Boolean).length;
  const filtered = Boolean(q || activeFilters);
  // Was gerade gilt – steht bei aktiver Suche oder aktiven Filtern auch bei zugeklappten Feldern über der Liste.
  const filterSummary = [
    q && `„${q}“`,
    status && MEMBER_STATUS_LABEL[status],
    departmentId &&
      (departments.find((department) => department.id === departmentId)?.name ?? "Abteilung"),
    view === "archived" ? "Archiv" : view === "trash" ? "Papierkorb" : null,
  ]
    .filter(Boolean)
    .join(" · ");
  const hasItems = result.items.length > 0;
  // Nichts gefunden in der aktiven Liste? Ausgetretene stehen im Archiv – dorthin führt ein Knopf mit derselben Suche.
  const offerArchive = Boolean(q) && view === "active" && canArchive;
  // Schlüssel für Formular und Liste: Beide bauen sich bei anderen Filtern oder einer anderen Seite neu auf (Felder zeigen die
  // neuen Werte, die Liste beginnt oben) – nicht aber, wenn nur ein anderes Mitglied gewählt wird.
  const listKey = JSON.stringify({ ...params, id: undefined });

  // Nebenknöpfe getönt nach ihrer Bedeutung (20.10.2026): Anträge orange (warten auf Bearbeitung), Import blau (Daten kommen
  // herein), Export türkis (Daten gehen hinaus), Statistik violett (Auswertung), Ehrungen gold.
  const secondary: {
    label: string;
    href: string;
    icon: React.ReactNode;
    className: string;
    /** Datei-Download (kein Seitenwechsel) – ein schlichtes `<a>` statt `Link`. */
    download?: boolean;
  }[] = [
    ...(pendingApplications !== null
      ? [
          {
            label: `Anträge${pendingApplications > 0 ? ` (${pendingApplications})` : ""}`,
            href: "/mitglieder/antraege",
            icon: <InboxIcon />,
            className: BUTTON_ACCENT.orange,
          },
        ]
      : []),
    ...(can(ctx, "members:import")
      ? [
          {
            label: "Import",
            href: "/mitglieder/import",
            icon: <UploadIcon />,
            className: BUTTON_ACCENT.blue,
          },
        ]
      : []),
    ...(can(ctx, "members:export")
      ? [
          {
            label: "Export",
            // Mit den aktuellen Filtern (Status, Abteilung, Ansicht) – wie bisher ohne Suche, Sortierung und Seite.
            href: `/api/members/export${buildQuery(params, { q: undefined, sort: undefined, dir: undefined, page: undefined, pageSize: undefined, id: undefined })}`,
            icon: <DownloadIcon />,
            className: BUTTON_ACCENT.teal,
            download: true,
          },
        ]
      : []),
    {
      label: "Statistik",
      href: "/mitglieder/statistik",
      icon: <AREA_ICON.auswertungen />,
      className: BUTTON_ACCENT.violet,
    },
    // Runde Mitgliedsjubiläen – für alle, die Mitglieder vereinsweit oder ihrer Abteilungen sehen
    ...(canSeeAnniversaries(ctx)
      ? [
          {
            label: "Ehrungen",
            href: "/mitglieder/ehrungen",
            icon: <AwardIcon />,
            className: BUTTON_ACCENT.amber,
          },
        ]
      : []),
  ];

  return (
    <PageStack>
      <PageHeader
        title="Mitglieder"
        description={`${result.total} ${result.total === 1 ? "Eintrag" : "Einträge"}${filtered ? " (gefiltert)" : ""}`}
        actions={
          <>
            {/* Grün wie auf dem Dashboard (Wunsch Luis, 20.10.2026) */}
            {can(ctx, "members:create") && (
              <Button asChild variant="success">
                <Link href="/mitglieder/neu">
                  <PlusIcon /> Neues Mitglied
                </Link>
              </Button>
            )}
            {/* Am Handy stecken die Nebenknöpfe im Menü „Weitere Aktionen“ – so beginnt die Liste zwei Knopfzeilen früher. */}
            {secondary.map((action) => (
              <Button
                key={action.label}
                asChild
                variant="outline"
                className={cn(action.className, "max-sm:hidden")}
              >
                {action.download ? (
                  <a href={action.href}>
                    {action.icon} {action.label}
                  </a>
                ) : (
                  <Link href={action.href}>
                    {action.icon} {action.label}
                  </Link>
                )}
              </Button>
            ))}
            <div className="sm:hidden">
              <MoreActions>
                {secondary.map((action) => (
                  <DropdownMenuItem key={action.label} asChild>
                    {action.download ? (
                      <a href={action.href}>
                        {action.icon} {action.label}
                      </a>
                    ) : (
                      <Link href={action.href}>
                        {action.icon} {action.label}
                      </Link>
                    )}
                  </DropdownMenuItem>
                ))}
              </MoreActions>
            </div>
          </>
        }
      />

      {/* Am Computer füllen Liste und Detail die Höhe des Fensters; beide rollen in sich. Ohne Treffer: eine Karte über die
          ganze Breite mit Suche und Hinweis. */}
      <div
        className={cn(
          "grid grid-cols-[minmax(0,1fr)] gap-6",
          hasItems &&
            "lg:h-[calc(100dvh-var(--app-header-height)-10rem)] lg:min-h-[34rem] lg:grid-cols-[minmax(18rem,21rem)_minmax(0,1fr)]",
        )}
      >
        <section
          aria-labelledby="mitgliederliste-titel"
          className={cn(SOFT_CARD_SURFACE, "flex flex-col lg:min-h-0 lg:overflow-hidden")}
        >
          <h2 id="mitgliederliste-titel" className="sr-only">
            Mitgliederliste
          </h2>
          {/* Suche und „Filter“ (klappt Status, Abteilung und Ansicht auf) – Aufbau siehe filter-toggle.tsx. */}
          <form
            key={listKey}
            method="get"
            action={BASE}
            role="search"
            className={cn(
              "grid grid-cols-[minmax(0,1fr)_auto] gap-2 p-3",
              !hasItems && "sm:max-w-xl",
            )}
          >
            <div className="relative">
              <SearchIcon
                aria-hidden="true"
                className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground"
              />
              {/* Der Platzhalter nennt, wonach gesucht wird – kurz genug, dass er auch neben „Filter 1“ ganz zu lesen ist. Dafür
                  belegt das Löschkreuz von Chrome und Safari im leeren Feld keinen Platz (es erscheint erst mit Text). */}
              <Input
                type="search"
                name="q"
                defaultValue={q}
                placeholder="Name, Nr., E-Mail …"
                aria-label="Mitglieder durchsuchen"
                className="pl-9 [&:placeholder-shown::-webkit-search-cancel-button]:hidden"
              />
            </div>
            <FilterToggle id={FILTER_ID} active={activeFilters} always />
            <FilterFields id={FILTER_ID} always>
              <NativeSelect
                name="status"
                defaultValue={status ?? ""}
                aria-label="Nach Status filtern"
              >
                <option value="">Alle Status</option>
                {Object.values(MemberStatus).map((value) => (
                  <option key={value} value={value}>
                    {MEMBER_STATUS_LABEL[value]}
                  </option>
                ))}
              </NativeSelect>
              <NativeSelect
                name="abteilung"
                defaultValue={departmentId ?? ""}
                aria-label="Nach Abteilung filtern"
              >
                <option value="">Alle Abteilungen</option>
                {departments.map((department) => (
                  <option key={department.id} value={department.id}>
                    {department.name}
                  </option>
                ))}
              </NativeSelect>
              {canArchive && (
                <NativeSelect name="ansicht" defaultValue={ansicht} aria-label="Ansicht wählen">
                  <option value="aktiv">Aktive Liste</option>
                  <option value="archiv">Archiv</option>
                  {canDelete && <option value="papierkorb">Papierkorb</option>}
                </NativeSelect>
              )}
              <Button type="submit" variant="outline">
                Filtern
              </Button>
            </FilterFields>
            {/* „Zurücksetzen“ auch bei zugeklappten Feldern – daneben, was gerade gefiltert ist. Ohne Treffer bietet der
                Leerzustand darunter dasselbe an. */}
            {filtered && hasItems && (
              <div className="col-span-full flex min-w-0 items-center justify-between gap-2">
                <p className="min-w-0 truncate text-sm text-muted-foreground" title={filterSummary}>
                  <span className="sr-only">Gefiltert: </span>
                  {filterSummary}
                </p>
                <Button asChild variant="ghost" size="sm" className="-mr-1 shrink-0">
                  <Link href={BASE}>
                    <XIcon /> Zurücksetzen
                  </Link>
                </Button>
              </div>
            )}
            <input type="hidden" name="sort" value={sort} />
            <input type="hidden" name="dir" value={dir} />
            {/* Ein gewähltes Mitglied bleibt gewählt, solange es nach dem Filtern noch in der Liste steht. */}
            {selected && selected.id === requestedId && (
              <input type="hidden" name="id" value={selected.id} />
            )}
          </form>

          {hasItems ? (
            <>
              {/* Tastatur: Der Detailbereich steht im Quelltext hinter allen Zeilen – dieser Sprunglink (erst bei Fokus
                  sichtbar, nur am Computer, wo es das Detail gibt) erspart bis zu 50 Tab-Schritte. */}
              {selected && (
                <a
                  href={`#${DETAIL_ID}`}
                  className="sr-only focus:not-sr-only focus:mx-3 focus:mb-2 focus:inline-block focus:rounded-md focus:bg-primary focus:px-3 focus:py-1.5 focus:text-sm focus:font-medium focus:text-primary-foreground max-lg:hidden"
                >
                  Zum ausgewählten Mitglied
                </a>
              )}
              <SortLinks
                fields={SORT_FIELDS}
                basePath={BASE}
                searchParams={params}
                currentSort={sort}
                currentDir={dir}
                className="px-3 pb-1.5"
              />
              <MemberList
                key={listKey}
                id={LIST_ID}
                items={result.items}
                sort={sort}
                selectedId={selected?.id ?? null}
                selectHref={listHref}
                profileHref={profileHref}
                colorOf={colorOf}
              />
              <Pagination
                basePath={BASE}
                searchParams={params}
                {...result}
                compact
                className="border-t border-foreground/5 px-3 py-2"
              />
            </>
          ) : (
            <EmptyState
              icon={<AREA_ICON.mitglieder />}
              title={
                q
                  ? `Keine Mitglieder zu „${q}“ gefunden`
                  : filtered
                    ? "Keine passenden Mitglieder"
                    : "Noch keine Mitglieder"
              }
              description={
                offerArchive
                  ? "Ausgetretene Mitglieder stehen im Archiv. Oder passe die Suche und die Filter an."
                  : filtered
                    ? "Passe die Suche oder die Filter an."
                    : "Lege das erste Mitglied an oder importiere eine vorhandene Mitgliederliste als CSV-Datei."
              }
              action={
                filtered ? (
                  <div className="flex flex-wrap justify-center gap-2">
                    {offerArchive && (
                      <Button asChild>
                        <Link href={`${BASE}${buildQuery({ q, ansicht: "archiv" }, {})}`}>
                          Im Archiv suchen
                        </Link>
                      </Button>
                    )}
                    <Button asChild variant={offerArchive ? "outline" : "default"}>
                      <Link href={BASE}>{q ? "Suche zurücksetzen" : "Filter zurücksetzen"}</Link>
                    </Button>
                  </div>
                ) : can(ctx, "members:create") ? (
                  <Button asChild>
                    <Link href="/mitglieder/neu">Mitglied anlegen</Link>
                  </Button>
                ) : undefined
              }
              // In der Karte der Liste: ohne eigene Kartenfläche.
              className="bg-transparent pt-8 pb-12 shadow-none ring-0"
            />
          )}
        </section>

        {/* Ohne `key`: Beim Wechsel des Mitglieds bleibt das bisherige Detail stehen, bis das neue da ist (kein Aufblitzen). */}
        {selected && (
          <Suspense
            fallback={
              <MemberDetailSkeleton label="Mitglied wird geladen …" className="max-lg:hidden" />
            }
          >
            <SelectedMemberDetail
              ctx={ctx}
              memberId={selected.id}
              colorOf={colorOf}
              profileHref={profileHref(selected.id)}
            />
          </Suspense>
        )}
      </div>
    </PageStack>
  );
}

/**
 * Detailbereich des gewählten Mitglieds (ab `lg`; am Handy ausgeblendet). Lädt für genau dieses eine Mitglied aus der Liste
 * dieselben Angaben wie seine Seite (`getMember`, `getMemberFee`) – nur lesend.
 */
async function SelectedMemberDetail({
  ctx,
  memberId,
  colorOf,
  profileHref,
}: {
  ctx: TenantContext;
  memberId: string;
  colorOf: ReadonlyMap<string, string | null>;
  profileHref: string;
}) {
  const [member, fee] = await Promise.all([
    getMember(ctx, memberId).catch((error: unknown) => {
      // Zwischen Liste und Detail gelöscht o. Ä.: kein Detail statt Fehlerseite.
      if (isAppError(error) && (error.code === "NOT_FOUND" || error.code === "FORBIDDEN"))
        return null;
      throw error;
    }),
    // Ein Fehler in der Beitragsrechnung kostet nur die Zeile „Beitrag“, nicht Liste und Detail.
    getMemberFee(ctx, memberId).catch((error: unknown) => {
      if (!isAppError(error)) logUnexpectedError("mitglieder-detail-beitrag", error);
      return null;
    }),
  ]);
  if (!member)
    return (
      <div
        className={cn(
          SOFT_CARD_SURFACE,
          "grid place-items-center p-10 text-sm text-muted-foreground max-lg:hidden",
        )}
      >
        Wähle links ein Mitglied aus.
      </div>
    );
  return (
    <MemberDetailPanel
      member={member}
      fee={fee}
      colorOf={colorOf}
      profileHref={profileHref}
      className="max-lg:hidden"
    />
  );
}
