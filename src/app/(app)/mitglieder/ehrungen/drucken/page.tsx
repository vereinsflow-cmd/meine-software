import type { Metadata } from "next";
import Link from "next/link";
import { AwardIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { BackLink } from "@/components/shared/back-link";
import { EmptyState } from "@/components/shared/empty-state";
import { NoAccess } from "@/components/shared/no-access";
import { PageHeader } from "@/components/shared/page-header";
import { PageStack } from "@/components/shared/page-section";
import { PrintButton } from "@/components/shared/print-button";
import { ANNIVERSARY_YEAR_SPAN, referenceYear } from "@/lib/anniversaries";
import { formatDateTime } from "@/lib/dates";
import { buildPrintPageStyle } from "@/lib/print";
import { intParam, type RawSearchParams } from "@/lib/search-params";
import { canSeeAnniversaries, listAnniversaries } from "@/modules/members/anniversaries";
import { AnniversarySheet } from "@/modules/members/components/anniversary-sheet";
import { requirePageContext } from "@/server/tenancy/context";

export const metadata: Metadata = { title: "Ehrungen drucken" };

/**
 * Druckansicht der Ehrungen eines Jahres – nach dem Vorbild „Helferplan drucken“ und „Aushang drucken“: Bedienelemente sind
 * `print:hidden`, beim Drucken bleibt nur das Blatt. `@page` setzt A4 hoch mit wiederkehrender Kopf- und Fußzeile
 * (Vereinsname, „Ehrungen 2026“, Erstellungsdatum, Seitenzahlen). Das Blatt steht als weiße Papiervorschau da, auch dunkel.
 */
export default async function PrintAnniversariesPage({
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
  const generatedAtLabel = `${formatDateTime(new Date())} Uhr`;
  const pageStyle = buildPrintPageStyle({
    clubName: ctx.club.name,
    documentTitle: `Ehrungen ${year}`,
    generatedAtLabel,
    orientation: "hoch",
  });

  return (
    <PageStack className="print:block">
      <PageStack className="mx-auto w-full max-w-3xl print:hidden">
        <BackLink href={`/mitglieder/ehrungen?jahr=${year}`}>Ehrungen</BackLink>
        <PageHeader
          title="Ehrungen drucken"
          description={`Eine schlichte Liste für ${year} – mit Namen, Mitgliedsnummer, Eintritt und Abteilungen, ohne Kontaktdaten.`}
          actions={overview.total > 0 ? <PrintButton /> : undefined}
        />
      </PageStack>

      {/* Ab hier der eigentliche Ausdruck in einer eigenen Hülle mit `id` (Tests unterscheiden ihn so von der übrigen Seite). */}
      <div id="ehrungen-ausdruck">
        <style id="ehrungen-seitenstil">{pageStyle}</style>
        {overview.total === 0 ? (
          <div className="mx-auto max-w-3xl">
            <EmptyState
              icon={<AwardIcon />}
              title="Nichts zum Drucken"
              description={`Im Jahr ${year} hat niemand ein rundes Mitgliedsjubiläum.`}
              action={
                <Button asChild variant="outline">
                  <Link href={`/mitglieder/ehrungen?jahr=${year}`}>Zu den Ehrungen</Link>
                </Button>
              }
            />
          </div>
        ) : (
          <AnniversarySheet
            overview={overview}
            clubName={ctx.club.name}
            generatedAtLabel={generatedAtLabel}
          />
        )}
      </div>
    </PageStack>
  );
}
