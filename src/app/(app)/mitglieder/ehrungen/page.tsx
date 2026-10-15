import type { Metadata } from "next";
import Link from "next/link";
import { AwardIcon, DownloadIcon, PrinterIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { NativeSelect } from "@/components/ui/native-select";
import { BackLink } from "@/components/shared/back-link";
import { EmptyState } from "@/components/shared/empty-state";
import { NoAccess } from "@/components/shared/no-access";
import { PageHeader } from "@/components/shared/page-header";
import { PageStack } from "@/components/shared/page-section";
import {
  ANNIVERSARY_LEVELS,
  ANNIVERSARY_YEAR_SPAN,
  anniversaryYearChoices,
  levelsText,
  referenceYear,
} from "@/lib/anniversaries";
import { intParam, type RawSearchParams } from "@/lib/search-params";
import { canSeeAnniversaries, listAnniversaries } from "@/modules/members/anniversaries";
import { AnniversaryList } from "@/modules/members/components/anniversary-list";
import { can } from "@/server/permissions/policy";
import { requirePageContext } from "@/server/tenancy/context";

export const metadata: Metadata = { title: "Ehrungen" };

/**
 * Ehrungen: Wer im gewählten Jahr ein rundes Mitgliedsjubiläum hat (10, 25, 40, 50, 60, 70, 75 Jahre), je Stufe eine Tabelle.
 * Rechnung und Regeln (29. Februar, Austritt vor dem Jubiläum …) in `src/lib/anniversaries.ts`, Berechtigung und Daten in
 * `modules/members/anniversaries.ts`. Die Jahresauswahl ist ein schlichtes GET-Formular – sie geht auch vor dem Laden der
 * Skripte. Drucken führt zu einer eigenen, sauberen Druckansicht; die CSV-Datei gibt es nur mit dem Recht zum Exportieren.
 */
export default async function AnniversariesPage({
  searchParams,
}: {
  searchParams: Promise<RawSearchParams>;
}) {
  const [ctx, params] = await Promise.all([requirePageContext(), searchParams]);
  if (!canSeeAnniversaries(ctx)) return <NoAccess what="die Ehrungen" />;

  const currentYear = referenceYear();
  const year = intParam(
    params,
    "jahr",
    currentYear,
    currentYear - ANNIVERSARY_YEAR_SPAN,
    currentYear + ANNIVERSARY_YEAR_SPAN,
  );
  const overview = await listAnniversaries(ctx, { year });
  const years = anniversaryYearChoices(currentYear);
  const levels = levelsText(ANNIVERSARY_LEVELS, "oder");
  const own = overview.scope === "DEPARTMENT";
  const missing = overview.withoutJoinDate;

  return (
    <PageStack>
      <BackLink href="/mitglieder">Alle Mitglieder</BackLink>
      <PageHeader
        title="Ehrungen"
        description={`Wer im gewählten Jahr ${levels} Jahre Mitglied ist – gezählt ab dem Eintrittsdatum.${own ? " Du siehst die Mitglieder deiner Abteilungen." : ""}`}
        actions={
          overview.total > 0 ? (
            <>
              <Button asChild>
                <Link href={`/mitglieder/ehrungen/drucken?jahr=${year}`}>
                  <PrinterIcon /> Liste drucken
                </Link>
              </Button>
              {/* Datei-Download: ein gewöhnlicher Link (wie „Export“ in der Mitgliederliste), kein Seitenwechsel im Browser */}
              {can(ctx, "members:export") && (
                <Button asChild variant="outline">
                  <a href={`/mitglieder/ehrungen/export?jahr=${year}`}>
                    <DownloadIcon /> Export
                  </a>
                </Button>
              )}
            </>
          ) : undefined
        }
      />

      <div className="flex flex-col gap-2">
        <form
          key={year}
          method="get"
          action="/mitglieder/ehrungen"
          aria-label="Jahr wählen"
          className="flex items-end gap-2"
        >
          <div className="grid gap-1.5">
            <label htmlFor="ehrungen-jahr" className="text-sm font-medium">
              Jahr
            </label>
            <NativeSelect
              id="ehrungen-jahr"
              name="jahr"
              defaultValue={String(year)}
              className="w-32"
            >
              {years.map((y) => (
                <option key={y} value={y}>
                  {y}
                </option>
              ))}
            </NativeSelect>
          </div>
          <Button type="submit" variant="outline">
            Anzeigen
          </Button>
        </form>
        {missing > 0 && (
          <p className="text-sm text-muted-foreground">
            Bei {missing === 1 ? "einem Mitglied" : `${missing} Mitgliedern`}
            {own ? " deiner Abteilungen" : ""} fehlt das Eintrittsdatum –{" "}
            {missing === 1 ? "es kann" : "sie können"} hier nicht erscheinen.
          </p>
        )}
      </div>

      {overview.total === 0 ? (
        <EmptyState
          icon={<AwardIcon />}
          title={`Keine Jubiläen im Jahr ${year}`}
          description={`Im Jahr ${year} ist niemand${own ? " aus deinen Abteilungen" : ""} ${levels} Jahre Mitglied. Ausgetretene, archivierte und gesperrte Mitglieder zählen nicht.`}
          action={
            year < currentYear + ANNIVERSARY_YEAR_SPAN ? (
              <Button asChild variant="outline">
                <Link href={`/mitglieder/ehrungen?jahr=${year + 1}`}>Jahr {year + 1} ansehen</Link>
              </Button>
            ) : undefined
          }
        />
      ) : (
        <AnniversaryList groups={overview.groups} />
      )}
    </PageStack>
  );
}
