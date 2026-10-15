import type { Metadata } from "next";
import Link from "next/link";
import { DownloadIcon } from "lucide-react";
import { AREA_ICON } from "@/components/shared/area-icons";
import { BackLink } from "@/components/shared/back-link";
import { EmptyState } from "@/components/shared/empty-state";
import { FilterFields, FilterToggle } from "@/components/shared/filter-toggle";
import { NoAccess } from "@/components/shared/no-access";
import { PageHeader } from "@/components/shared/page-header";
import { PageStack } from "@/components/shared/page-section";
import { TableCard } from "@/components/shared/table-card";
import { Button } from "@/components/ui/button";
import { NativeSelect } from "@/components/ui/native-select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { EventType } from "@/generated/prisma/enums";
import { formatNumber, formatPercent } from "@/lib/charts/geometry";
import { formatDate } from "@/lib/dates";
import { EVENT_TYPE_LABEL, EVENT_TYPE_PLURAL_LABEL } from "@/lib/labels";
import { buildQuery, type RawSearchParams } from "@/lib/search-params";
import { attendanceFilterOptions, attendanceStats } from "@/modules/events/attendance";
import {
  ATTENDANCE_PERIOD_KEYS,
  ATTENDANCE_PERIODS,
  ATTENDANCE_RETENTION_MONTHS,
  attendanceFilterQuery,
  attendanceFiltersFromParams,
} from "@/modules/events/attendance-schemas";
import { can } from "@/server/permissions/policy";
import { requirePageContext } from "@/server/tenancy/context";

export const metadata: Metadata = { title: "Anwesenheit auswerten" };

/** Nur Werte aus der eigenen Auswahl übernehmen – unbekannte oder fremde Kennungen fallen still weg. */
const known = (value: string | undefined, options: readonly { id: string }[]) =>
  value && options.some((option) => option.id === value) ? value : undefined;

/**
 * Auswertung der Anwesenheit: je Person anwesend, entschuldigt, gefehlt und die Quote – gefiltert nach Abteilung, Gruppe
 * oder Terminserie, Zeitraum und Art (Standard: Training). Abteilungsleiter sehen nur ihre Abteilungen; das filtert der
 * Dienst schon in der Abfrage.
 */
export default async function AttendanceStatsPage({
  searchParams,
}: {
  searchParams: Promise<RawSearchParams>;
}) {
  const params = await searchParams;
  const ctx = await requirePageContext();
  if (!can(ctx, "events:manage_participants"))
    return <NoAccess what="die Auswertung der Anwesenheit" />;

  const options = await attendanceFilterOptions(ctx);
  const parsed = attendanceFiltersFromParams(params);
  const filters = {
    ...parsed,
    departmentId: known(parsed.departmentId, options.departments),
    groupId: known(parsed.groupId, options.groups),
    seriesId: known(parsed.seriesId, options.series),
  };
  const { departmentId, groupId, seriesId, period, type } = filters;
  const stats = await attendanceStats(ctx, filters);
  const query = attendanceFilterQuery(filters);
  const active = Object.values(query).filter(Boolean).length;
  // Mehrzahl: gemeint sind alle Termine dieser Art im Zeitraum („Trainings vom … bis …“), nicht ein einzelner.
  const typeLabel = type ? EVENT_TYPE_PLURAL_LABEL[type] : "Termine";
  const recordedLabel =
    type === "TRAINING"
      ? stats.recordedEvents === 1
        ? "Training"
        : "Trainings"
      : stats.recordedEvents === 1
        ? "Termin"
        : "Termine";
  const lastDay = new Date(stats.range.to.getTime() - 1);

  return (
    <PageStack>
      <BackLink href="/veranstaltungen">Alle Veranstaltungen</BackLink>
      <PageHeader
        title="Anwesenheit"
        description={`${typeLabel} vom ${formatDate(stats.range.from)} bis ${formatDate(lastDay)}`}
        actions={
          stats.rows.length > 0 && (
            <Button asChild variant="outline">
              <a href={`/api/veranstaltungen/anwesenheit/export${buildQuery({}, query)}`} download>
                <DownloadIcon /> Export
              </a>
            </Button>
          )
        }
      />

      <form
        key={JSON.stringify(params)}
        method="get"
        action="/veranstaltungen/anwesenheit"
        role="search"
        aria-label="Auswertung filtern"
        className="flex flex-wrap items-center gap-2 sm:gap-3"
      >
        <FilterToggle id="anwesenheit-filter" active={active} />
        <FilterFields id="anwesenheit-filter" className="w-full">
          <NativeSelect
            name="zeitraum"
            defaultValue={period}
            aria-label="Zeitraum"
            className="sm:w-44"
          >
            {ATTENDANCE_PERIOD_KEYS.map((key) => (
              <option key={key} value={key}>
                {ATTENDANCE_PERIODS[key]}
              </option>
            ))}
          </NativeSelect>
          <NativeSelect
            name="art"
            defaultValue={type ?? "alle"}
            aria-label="Art"
            className="sm:w-40"
          >
            {/* „Alle …“ zuerst wie in den übrigen Filtern; die Vorgabe bleibt Training (`defaultValue`). */}
            <option value="alle">Alle Arten</option>
            {Object.values(EventType).map((value) => (
              <option key={value} value={value}>
                {EVENT_TYPE_LABEL[value]}
              </option>
            ))}
          </NativeSelect>
          {options.departments.length > 1 && (
            <NativeSelect
              name="abteilung"
              defaultValue={departmentId ?? ""}
              aria-label="Abteilung"
              className="sm:w-48"
            >
              <option value="">Alle Abteilungen</option>
              {options.departments.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.name}
                </option>
              ))}
            </NativeSelect>
          )}
          {options.groups.length > 0 && (
            <NativeSelect
              name="gruppe"
              defaultValue={groupId ?? ""}
              aria-label="Gruppe"
              className="sm:w-56"
            >
              <option value="">Alle Gruppen</option>
              {options.groups.map((g) => (
                <option key={g.id} value={g.id}>
                  {g.departmentName ? `${g.name} (${g.departmentName})` : g.name}
                </option>
              ))}
            </NativeSelect>
          )}
          {options.series.length > 0 && (
            <NativeSelect
              name="serie"
              defaultValue={seriesId ?? ""}
              aria-label="Terminserie"
              className="sm:w-64"
            >
              <option value="">Alle Terminserien</option>
              {options.series.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.label}
                </option>
              ))}
            </NativeSelect>
          )}
          <div className="flex gap-2">
            <Button type="submit" variant="outline">
              Filtern
            </Button>
            {active > 0 && (
              <Button asChild variant="ghost">
                <Link href="/veranstaltungen/anwesenheit">Zurücksetzen</Link>
              </Button>
            )}
          </div>
        </FilterFields>
      </form>

      {stats.rows.length === 0 ? (
        <EmptyState
          icon={<AREA_ICON.auswertungen />}
          title="Keine Anwesenheit erfasst"
          description={
            active > 0
              ? "Für diese Auswahl ist nichts erfasst. Passe Zeitraum oder Filter an."
              : "Auf der Seite eines Trainings steht „Anwesenheit erfassen“ – ab einer Stunde vor Beginn. Danach erscheint hier, wer wie oft da war."
          }
        />
      ) : (
        <>
          <p className="text-sm text-muted-foreground">
            {stats.recordedEvents} {recordedLabel} erfasst
            {stats.averagePresent !== null &&
              ` · im Schnitt ${formatNumber(stats.averagePresent, 1)} anwesend`}
          </p>
          <TableCard>
            <Table stack>
              <caption className="sr-only">Anwesenheit je Person</caption>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead className="text-right">Anwesend</TableHead>
                  <TableHead className="text-right">Entschuldigt</TableHead>
                  <TableHead className="text-right">Gefehlt</TableHead>
                  <TableHead className="text-right">Quote</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {stats.rows.map((row) => (
                  <TableRow key={row.memberId}>
                    <TableCell className="font-medium whitespace-normal">{row.name}</TableCell>
                    <TableCell label="Anwesend" className="text-right tabular-nums">
                      {row.present}
                    </TableCell>
                    <TableCell label="Entschuldigt" className="text-right tabular-nums">
                      {row.excused}
                    </TableCell>
                    <TableCell label="Gefehlt" className="text-right tabular-nums">
                      {row.absent}
                    </TableCell>
                    <TableCell label="Quote" className="text-right tabular-nums">
                      {row.rate === null ? "–" : formatPercent(row.rate)}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </TableCard>
          <p className="text-xs text-muted-foreground">
            Die Quote zählt, wie oft jemand von seinen erfassten Terminen da war. Anwesenheiten
            werden {ATTENDANCE_RETENTION_MONTHS} Monate nach dem Termin automatisch gelöscht.
          </p>
        </>
      )}
    </PageStack>
  );
}
