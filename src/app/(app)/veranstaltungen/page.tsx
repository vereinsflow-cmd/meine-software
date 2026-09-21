import type { Metadata } from "next";
import Link from "next/link";
import { CalendarDaysIcon, CalendarIcon, PlusIcon } from "lucide-react";
import { EventStatus, EventType } from "@/generated/prisma/enums";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { NativeSelect } from "@/components/ui/native-select";
import { EmptyState } from "@/components/shared/empty-state";
import { NoAccess } from "@/components/shared/no-access";
import { PageHeader } from "@/components/shared/page-header";
import { Pagination } from "@/components/shared/pagination";
import { EVENT_STATUS_LABEL, EVENT_TYPE_LABEL } from "@/lib/labels";
import { enumParam, pageRequest, param, type RawSearchParams } from "@/lib/search-params";
import { EventListItemView } from "@/modules/events/components/event-list-item";
import { getEventFormOptions, listEvents } from "@/modules/events/service";
import { can } from "@/server/permissions/policy";
import { requirePageContext } from "@/server/tenancy/context";

export const metadata: Metadata = { title: "Veranstaltungen" };

const PERIODS = { kommend: "upcoming", vergangen: "past", alle: "all" } as const;

export default async function EventsPage({
  searchParams,
}: {
  searchParams: Promise<RawSearchParams>;
}) {
  const params = await searchParams;
  const ctx = await requirePageContext();
  if (!can(ctx, "events:read")) return <NoAccess what="die Veranstaltungen" />;

  const zeitraum =
    enumParam(params, "zeitraum", ["kommend", "vergangen", "alle"] as const) ?? "kommend";
  const q = param(params, "q");
  const status = enumParam(params, "status", Object.values(EventStatus));
  const type = enumParam(params, "art", Object.values(EventType));
  const departmentId = param(params, "abteilung");

  const [result, options] = await Promise.all([
    listEvents(ctx, {
      q,
      status,
      type,
      departmentId,
      period: PERIODS[zeitraum],
      request: pageRequest(params, 15),
    }),
    getEventFormOptions(ctx),
  ]);
  const filtered = Boolean(q || status || type || departmentId || zeitraum !== "kommend");
  const canSeeArchive = can(ctx, "events:archive");

  return (
    <>
      <PageHeader
        title="Veranstaltungen"
        description={`${result.total} ${result.total === 1 ? "Veranstaltung" : "Veranstaltungen"}${filtered ? " (gefiltert)" : ""}`}
        actions={
          <>
            {can(ctx, "events:create") && (
              <Button asChild>
                <Link href="/veranstaltungen/neu">
                  <PlusIcon /> Neue Veranstaltung
                </Link>
              </Button>
            )}
            <Button asChild variant="outline">
              <Link href="/kalender">
                <CalendarIcon /> Kalender
              </Link>
            </Button>
          </>
        }
      />

      <form
        key={JSON.stringify(params)}
        method="get"
        action="/veranstaltungen"
        role="search"
        className="mb-4 grid gap-2 sm:grid-cols-2 lg:grid-cols-[minmax(0,2fr)_1fr_1fr_1fr_1fr_auto]"
      >
        <Input
          type="search"
          name="q"
          defaultValue={q}
          placeholder="Titel oder Ort suchen …"
          aria-label="Veranstaltungen durchsuchen"
        />
        <NativeSelect name="zeitraum" defaultValue={zeitraum} aria-label="Zeitraum">
          <option value="kommend">Kommende</option>
          <option value="vergangen">Vergangene</option>
          <option value="alle">Alle</option>
        </NativeSelect>
        <NativeSelect name="art" defaultValue={type ?? ""} aria-label="Nach Art filtern">
          <option value="">Alle Arten</option>
          {Object.values(EventType).map((value) => (
            <option key={value} value={value}>
              {EVENT_TYPE_LABEL[value]}
            </option>
          ))}
        </NativeSelect>
        <NativeSelect
          name="abteilung"
          defaultValue={departmentId ?? ""}
          aria-label="Nach Abteilung filtern"
        >
          <option value="">Alle Abteilungen</option>
          {options.departments.map((d) => (
            <option key={d.id} value={d.id}>
              {d.name}
            </option>
          ))}
        </NativeSelect>
        <NativeSelect name="status" defaultValue={status ?? ""} aria-label="Nach Status filtern">
          <option value="">Alle Status</option>
          {Object.values(EventStatus)
            .filter((s) => s !== "ARCHIVED" || canSeeArchive)
            .map((value) => (
              <option key={value} value={value}>
                {EVENT_STATUS_LABEL[value]}
              </option>
            ))}
        </NativeSelect>
        <div className="flex gap-2">
          <Button type="submit">Filtern</Button>
          {filtered && (
            <Button asChild variant="ghost">
              <Link href="/veranstaltungen">Zurücksetzen</Link>
            </Button>
          )}
        </div>
      </form>

      {result.items.length === 0 ? (
        <EmptyState
          icon={<CalendarDaysIcon />}
          title={filtered ? "Keine passenden Veranstaltungen" : "Keine kommenden Veranstaltungen"}
          description={
            filtered
              ? "Passe die Suche oder die Filter an."
              : "Sobald Veranstaltungen veröffentlicht werden, erscheinen sie hier."
          }
          action={
            !filtered && can(ctx, "events:create") ? (
              <Button asChild>
                <Link href="/veranstaltungen/neu">Veranstaltung erstellen</Link>
              </Button>
            ) : undefined
          }
        />
      ) : (
        <>
          <ul className="grid gap-3">
            {result.items.map((event) => (
              <EventListItemView key={event.id} event={event} />
            ))}
          </ul>
          <Pagination basePath="/veranstaltungen" searchParams={params} {...result} />
        </>
      )}
    </>
  );
}
