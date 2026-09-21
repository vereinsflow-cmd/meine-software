import type { Metadata } from "next";
import Link from "next/link";
import { ChevronLeftIcon, ClockIcon } from "lucide-react";
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
import { EmptyState } from "@/components/shared/empty-state";
import { NoAccess } from "@/components/shared/no-access";
import { PageHeader } from "@/components/shared/page-header";
import { berlinParts, formatDuration } from "@/lib/dates";
import { intParam, type RawSearchParams } from "@/lib/search-params";
import { getHoursOverview } from "@/modules/shifts/service";
import { can } from "@/server/permissions/policy";
import { requirePageContext } from "@/server/tenancy/context";

export const metadata: Metadata = { title: "Helferstunden" };

export default async function HoursPage({
  searchParams,
}: {
  searchParams: Promise<RawSearchParams>;
}) {
  const params = await searchParams;
  const ctx = await requirePageContext();
  if (!can(ctx, "shifts:read")) return <NoAccess what="die Helferstunden" />;

  const currentYear = berlinParts(new Date()).year;
  const year = intParam(params, "jahr", currentYear, 2000, currentYear + 1);
  const { rows, totalMinutes, scope } = await getHoursOverview(ctx, year);
  const years = Array.from({ length: 6 }, (_, i) => currentYear - i);

  return (
    <>
      <p className="mb-3">
        <Link
          href="/helferplanung"
          className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
        >
          <ChevronLeftIcon className="size-4" aria-hidden="true" /> Helferplanung
        </Link>
      </p>
      <PageHeader
        title="Helferstunden"
        description={
          scope === "ALL"
            ? `Dokumentierte Einsatzzeiten ${year} – insgesamt ${formatDuration(totalMinutes)}.`
            : `Deine dokumentierten Einsatzzeiten ${year} – insgesamt ${formatDuration(totalMinutes)}.`
        }
      />
      <form key={JSON.stringify(params)} method="get" className="mb-4 flex items-end gap-2">
        <div className="grid gap-1.5">
          <label htmlFor="jahr" className="text-sm font-medium">
            Jahr
          </label>
          <NativeSelect id="jahr" name="jahr" defaultValue={String(year)} className="w-32">
            {years.map((y) => (
              <option key={y} value={y}>
                {y}
              </option>
            ))}
          </NativeSelect>
        </div>
        <Button type="submit">Anzeigen</Button>
      </form>

      {rows.length === 0 ? (
        <EmptyState
          icon={<ClockIcon />}
          title="Keine Stunden dokumentiert"
          description="Nach einer Veranstaltung erfassen Veranstalter die tatsächlich geleisteten Helferstunden. Sie erscheinen dann hier."
        />
      ) : (
        <div className="overflow-x-auto rounded-xl border">
          <Table>
            <caption className="sr-only">Helferstunden {year}</caption>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead className="text-right">Einsätze</TableHead>
                <TableHead className="text-right">Stunden</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((row) => (
                <TableRow key={row.memberId}>
                  <TableCell className="font-medium">{row.name}</TableCell>
                  <TableCell className="text-right tabular-nums">{row.shifts}</TableCell>
                  <TableCell className="text-right tabular-nums">
                    {formatDuration(row.minutes)}
                  </TableCell>
                </TableRow>
              ))}
              <TableRow className="bg-muted/50 font-semibold">
                <TableCell>Gesamt</TableCell>
                <TableCell className="text-right tabular-nums">
                  {rows.reduce((sum, r) => sum + r.shifts, 0)}
                </TableCell>
                <TableCell className="text-right tabular-nums">
                  {formatDuration(totalMinutes)}
                </TableCell>
              </TableRow>
            </TableBody>
          </Table>
        </div>
      )}
    </>
  );
}
