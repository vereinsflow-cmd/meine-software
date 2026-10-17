import type { Metadata } from "next";
import Link from "next/link";
import { UsersIcon } from "lucide-react";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { SEGMENT_BAR, segmentItem } from "@/components/ui/segment-styles";
import { BackLink } from "@/components/shared/back-link";
import { EmptyState } from "@/components/shared/empty-state";
import { NoAccess } from "@/components/shared/no-access";
import { PageStack } from "@/components/shared/page-section";
import { ToneBadge, type Tone } from "@/components/shared/status-badge";
import { TableCard } from "@/components/shared/table-card";
import { formatEuroFromCents, todayCalendarDate } from "@/lib/dates";
import { buildQuery, param, type RawSearchParams } from "@/lib/search-params";
import { cn } from "@/lib/utils";
import {
  DonorAddressButton,
  type DonorDialogDonor,
} from "@/modules/donations/components/donor-dialogs";
import { DonorRowActions } from "@/modules/donations/components/donor-row-actions";
import { donationYears, YearSwitch } from "@/modules/donations/components/year-switch";
import type { DonorReceiptState } from "@/modules/donations/receipt-status";
import { listDonors, type DonorRowDto } from "@/modules/donations/service";
import { canFinance } from "@/modules/finance/access";
import { FinanceHeader } from "@/modules/finance/components/finance-header";
import { getLedgerSetup } from "@/modules/finance/ledger";
import { financeTabCounts } from "@/modules/finance/overview";
import { requirePageContext } from "@/server/tenancy/context";

export const metadata: Metadata = { title: "Spender" };

const BASE = "/finanzen/spenden/spender";

const RECEIPT_STATE: Record<DonorReceiptState, { label: string; tone: Tone; explanation: string }> =
  {
    MISSING: {
      label: "fehlt",
      tone: "warning",
      explanation: "Für mindestens eine Spende fehlt noch die Zuwendungsbestätigung.",
    },
    ISSUED: {
      label: "erstellt",
      tone: "success",
      explanation: "Die nötigen Zuwendungsbestätigungen sind erstellt.",
    },
    NOT_NEEDED: {
      label: "nicht nötig",
      tone: "neutral",
      explanation: "Für die Spenden in diesem Jahr ist keine Zuwendungsbestätigung nötig.",
    },
  };

/** „Industriestraße 4, 12345 Musterstadt“ (+ Land, wenn nicht Deutschland). */
function addressLines(donor: DonorRowDto): string[] {
  const place = [donor.postalCode, donor.city].filter(Boolean).join(" ");
  return [donor.street, place, donor.country && donor.country !== "DE" ? donor.country : null]
    .map((part) => part?.trim() ?? "")
    .filter((part) => part !== "");
}

/** Was „Anschrift ändern“ über einen Spender braucht (nur das – nicht die ganze Zeile in den Browser). */
function dialogDonor(donor: DonorRowDto): DonorDialogDonor {
  const { id, kind, name, street, postalCode, city, country } = donor;
  return { id, kind, name, street, postalCode, city, country };
}

/**
 * Spender eines Jahres (mit `?alle=1` alle, auch ohne Spenden im Jahr): Summe, Anzahl, Stand der Bestätigungen und alles, was
 * über sie gespeichert ist (Anschrift, Sperre – zugleich die Auskunft für externe Spender). Mitglieder ändert man beim
 * Mitglied; andere Spender über „⋯“ → „Anschrift ändern“ bzw. „Adresse eintragen“ unter „Adresse fehlt“. `?bearbeiten=<id>`
 * (Ziel von „Adresse eintragen“ im Cockpit) stellt diesen Spender nach oben, hebt ihn hervor und öffnet „Anschrift ändern“
 * gleich. Am Handy gestapelt (`<Table stack>`): jeder Spender eine kleine Karte.
 */
export default async function DonorsPage({
  searchParams,
}: {
  searchParams: Promise<RawSearchParams>;
}) {
  const params = await searchParams;
  const ctx = await requirePageContext();
  if (!canFinance(ctx, "finance:read")) return <NoAccess what="die Finanzen" />;
  const canManage = canFinance(ctx, "finance:manage");
  const today = todayCalendarDate();
  const all = param(params, "alle") === "1";
  const editId = param(params, "bearbeiten");
  const [setup, counts] = await Promise.all([getLedgerSetup(ctx), financeTabCounts(ctx)]);
  const { years, year } = donationYears(
    setup?.ledgerStartDate ?? null,
    today,
    param(params, "jahr"),
  );
  const list = await listDonors(ctx, { year, all: all || Boolean(editId) });
  // Ein Spender aus „Adresse eintragen“ steht oben, auch wenn er sonst weiter unten käme.
  const donors = editId
    ? [
        ...list.donors.filter((donor) => donor.id === editId),
        ...list.donors.filter((donor) => donor.id !== editId && (all || donor.count > 0)),
      ]
    : list.donors;
  const currentYear = year === today.getUTCFullYear();
  const yearHref = (target: number) =>
    `${BASE}${buildQuery(params, { jahr: target === today.getUTCFullYear() ? undefined : target, bearbeiten: undefined })}`;
  const donationsHref = (donor: DonorRowDto) =>
    `/finanzen/spenden/alle?${currentYear ? "" : `jahr=${year}&`}q=${encodeURIComponent(donor.name)}`;
  const totalCents = donors.reduce((sum, donor) => sum + donor.totalCents, 0);

  return (
    <PageStack>
      <BackLink href={currentYear ? "/finanzen/spenden" : `/finanzen/spenden?jahr=${year}`}>
        Spenden {year}
      </BackLink>
      <FinanceHeader
        description={`Spender ${year}`}
        counts={counts}
        actions={
          years.length > 1 ? <YearSwitch years={years} current={year} href={yearHref} /> : undefined
        }
      />

      <nav aria-label="Welche Spender" className={cn(SEGMENT_BAR, "self-start")}>
        <Link
          href={`${BASE}${buildQuery(params, { alle: undefined, bearbeiten: undefined })}`}
          aria-current={!all ? "page" : undefined}
          className={segmentItem(!all)}
        >
          Mit Spenden in {year}
        </Link>
        <Link
          href={`${BASE}${buildQuery(params, { alle: 1, bearbeiten: undefined })}`}
          aria-current={all ? "page" : undefined}
          className={segmentItem(all)}
        >
          Alle Spender
        </Link>
      </nav>

      {donors.length === 0 ? (
        <EmptyState
          icon={<UsersIcon />}
          title={all ? "Noch keine Spender" : `Keine Spender in ${year}`}
          description={
            all
              ? "Spender entstehen mit der ersten Spende – als Mitglied oder als andere Person, Firma oder Stiftung."
              : "Unter „Alle Spender“ stehen auch die aus früheren Jahren."
          }
        />
      ) : (
        <div>
          <p className="mb-2 text-sm text-muted-foreground tabular-nums">
            {donors.length === 1 ? "1 Spender" : `${donors.length} Spender`} · zusammen{" "}
            {formatEuroFromCents(totalCents)} in {year}
          </p>
          <TableCard>
            <Table stack>
              <caption className="sr-only">Spender {year}, nach Summe der Spenden geordnet</caption>
              <TableHeader>
                <TableRow>
                  <TableHead scope="col">Spender</TableHead>
                  <TableHead scope="col">Anschrift</TableHead>
                  <TableHead scope="col">Bestätigung</TableHead>
                  <TableHead scope="col" className="text-right">
                    Spenden {year}
                  </TableHead>
                  {canManage && (
                    <TableHead scope="col" className="w-12">
                      <span className="sr-only">Aktionen</span>
                    </TableHead>
                  )}
                </TableRow>
              </TableHeader>
              <TableBody>
                {donors.map((donor) => {
                  const lines = addressLines(donor);
                  const state = donor.receiptState ? RECEIPT_STATE[donor.receiptState] : null;
                  const highlighted = donor.id === editId;
                  return (
                    <TableRow
                      key={donor.id}
                      id={`spender-${donor.id}`}
                      className={cn(
                        donor.restricted && "text-muted-foreground",
                        highlighted && "bg-primary/5 ring-1 ring-primary/40 ring-inset",
                      )}
                    >
                      <TableCell className="align-top whitespace-normal">
                        <p className="font-medium break-words text-foreground">{donor.name}</p>
                        <p className="text-xs text-muted-foreground">{donor.typeLabel}</p>
                        {donor.restrictedReason && (
                          <p className="text-xs break-words text-muted-foreground">
                            Gesperrt: {donor.restrictedReason}
                          </p>
                        )}
                      </TableCell>
                      <TableCell label="Anschrift" className="align-top whitespace-normal">
                        <Address donor={donor} lines={lines} />
                      </TableCell>
                      <TableCell label="Bestätigung" className="align-top">
                        {state ? (
                          <ToneBadge tone={state.tone}>
                            <span title={state.explanation}>{state.label}</span>
                            <span className="sr-only">. {state.explanation}</span>
                          </ToneBadge>
                        ) : (
                          <span className="text-sm text-muted-foreground">keine Spende</span>
                        )}
                      </TableCell>
                      <TableCell
                        label={`Spenden ${year}`}
                        className="text-right align-top whitespace-nowrap tabular-nums"
                      >
                        <span className="block font-semibold">
                          {formatEuroFromCents(donor.totalCents)}
                        </span>
                        <span className="block text-xs text-muted-foreground">
                          {donor.count === 1 ? "1 Spende" : `${donor.count} Spenden`}
                        </span>
                      </TableCell>
                      {canManage && (
                        <TableCell className="text-right align-top max-md:mt-1">
                          <DonorRowActions
                            openEdit={highlighted}
                            donor={{
                              ...dialogDonor(donor),
                              memberEditHref: donor.memberId ? donor.editHref : null,
                              donationsHref: donor.count > 0 ? donationsHref(donor) : null,
                              actions: donor.actions,
                            }}
                          />
                        </TableCell>
                      )}
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </TableCard>
        </div>
      )}
      <p className="max-w-3xl text-sm text-muted-foreground">
        Name und Anschrift eines Mitglieds kommen aus dem Mitglied – du änderst sie dort.
        Spenderdaten werden 10 Jahre aufbewahrt; ein Spender ohne Spenden lässt sich löschen, sonst
        sperren.
      </p>
    </PageStack>
  );
}

/**
 * Anschrift in Zeilen – oder rot „Adresse fehlt“ mit „Adresse eintragen“: bei Mitgliedern ein Link zum Mitglied, bei
 * anderen Spendern das Fenster „Anschrift ändern“ (nur mit `finance:manage`).
 */
function Address({ donor, lines }: { donor: DonorRowDto; lines: string[] }) {
  if (donor.addressComplete)
    return (
      <span className="block break-words">
        {lines.map((line) => (
          <span key={line} className="block">
            {line}
          </span>
        ))}
      </span>
    );
  return (
    <span className="block">
      {lines.length > 0 && <span className="block break-words">{lines.join(", ")}</span>}
      <span className="block font-medium text-red-700 dark:text-red-400">Adresse fehlt</span>
      {donor.memberId && !donor.restricted ? (
        <Link
          href={donor.editHref}
          className="text-sm font-medium text-primary underline-offset-4 hover:underline"
        >
          Adresse eintragen<span className="sr-only"> für {donor.name}</span>
        </Link>
      ) : (
        donor.actions.edit && <DonorAddressButton donor={dialogDonor(donor)} />
      )}
    </span>
  );
}
