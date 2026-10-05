import type { Metadata } from "next";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { AREA_ICON } from "@/components/shared/area-icons";
import { EmptyState } from "@/components/shared/empty-state";
import { NoAccess } from "@/components/shared/no-access";
import { formatCalendarDate, toDateInputValue, todayCalendarDate } from "@/lib/dates";
import { canFinance } from "@/modules/finance/access";
import { FinanceHeader } from "@/modules/finance/components/finance-header";
import { financeTabCounts } from "@/modules/finance/overview";
import {
  CreateFamilyDialog,
  EndFamilyMemberDialog,
  FamilyActions,
  RemoveFamilyMemberButton,
} from "@/modules/fees/components/family-dialogs";
import { FeesNav } from "@/modules/fees/components/fees-nav";
import { familyFormOptions, listFamilies, type FamilyMemberDto } from "@/modules/fees/families";
import { requirePageContext } from "@/server/tenancy/context";

export const metadata: Metadata = { title: "Familien" };

/** „seit 01.01.2026“, „ab 01.11.2026“, „01.01.–30.11.2026“ (bis einschließlich). */
function rangeText(member: FamilyMemberDto, today: Date): string {
  const from = formatCalendarDate(member.validFrom);
  if (member.validTo) return `${from} bis ${formatCalendarDate(member.validTo)}`;
  return member.validFrom.getTime() > today.getTime() ? `ab ${from}` : `seit ${from}`;
}

/**
 * Familien (Etappe 6): feste Gruppen, die statt der einzelnen Grundbeiträge einen Familienbeitrag zahlen – an einen
 * Zahler. Je Familie: Familienbeitrag, Zahler und die Mitglieder mit Zeitraum. Wer die Familie verlässt, wird
 * ausgetragen (bis); so bleiben frühere Zeiträume richtig. Aufgelöste Familien stehen unten.
 */
export default async function FamiliesPage() {
  const ctx = await requirePageContext();
  if (!canFinance(ctx, "finance:read")) return <NoAccess what="die Finanzen" />;
  const canManage = canFinance(ctx, "finance:manage");
  const [families, options, counts] = await Promise.all([
    listFamilies(ctx),
    canManage ? familyFormOptions(ctx) : Promise.resolve(null),
    financeTabCounts(ctx),
  ]);
  const todayDate = todayCalendarDate();
  const today = toDateInputValue(todayDate);
  const firstOfMonth = `${today.slice(0, 7)}-01`;
  const active = families.filter((f) => !f.dissolved);
  const dissolved = families.filter((f) => f.dissolved);
  const noFeeType = options !== null && options.feeTypes.length === 0;

  return (
    <>
      <FinanceHeader
        description="Beiträge · Familien"
        counts={counts}
        actions={
          options && !noFeeType ? (
            <CreateFamilyDialog options={options} firstOfMonth={firstOfMonth} />
          ) : undefined
        }
      />
      <FeesNav />

      {families.length === 0 ? (
        <EmptyState
          icon={<AREA_ICON.finanzen />}
          title={noFeeType ? "Noch kein Familienbeitrag" : "Noch keine Familien"}
          description={
            noFeeType
              ? "Lege zuerst unter „Beitragsarten“ einen Familienbeitrag an – danach kannst du hier Familien bilden."
              : "Eine Familie zahlt einen Familienbeitrag statt der einzelnen Grundbeiträge – an einen Zahler, zum Beispiel einen Elternteil."
          }
          action={
            noFeeType ? (
              <Button asChild>
                <Link href="/finanzen/beitraege/arten">Zu den Beitragsarten</Link>
              </Button>
            ) : undefined
          }
        />
      ) : (
        <div className="grid gap-8">
          {active.length > 0 && (
            <section aria-label="Familien" className="grid gap-4 lg:grid-cols-2">
              {active.map((family) => {
                const ongoing = family.members.filter((m) => m.open);
                const former = family.members.filter((m) => !m.open);
                return (
                  <Card key={family.id} id={`familie-${family.id}`} className="scroll-mt-24">
                    <CardHeader className="flex flex-row items-start justify-between gap-3">
                      <div className="grid gap-1">
                        <CardTitle role="heading" aria-level={2}>
                          {family.name}
                        </CardTitle>
                        <p className="text-sm text-muted-foreground">
                          {family.feeType.name}: {family.feeType.rateText}, ab{" "}
                          {family.feeType.minMembers} zahlenden Mitgliedern
                        </p>
                      </div>
                      {options && (
                        <FamilyActions
                          family={{
                            id: family.id,
                            name: family.name,
                            feeTypeId: family.feeType.id,
                            feeTypeName: family.feeType.name,
                            payerMemberId: family.payer.id,
                            payerName: family.payer.name,
                            memberIds: ongoing.map((m) => m.memberId),
                          }}
                          options={options}
                          today={today}
                        />
                      )}
                    </CardHeader>
                    <CardContent className="grid gap-3 text-sm">
                      {family.endsOn && (
                        <p>
                          Wird zum {formatCalendarDate(family.endsOn)} aufgelöst – bis dahin zahlt
                          sie den Familienbeitrag.
                        </p>
                      )}
                      {family.feeType.archived && (
                        <p className="text-amber-700 dark:text-amber-400">
                          Der Familienbeitrag ist archiviert – bis ein anderer gewählt ist, zahlt
                          jedes Mitglied einzeln.
                        </p>
                      )}
                      <p>
                        <span className="text-muted-foreground">Zahler: </span>
                        <Link
                          href={`/mitglieder/${family.payer.id}`}
                          className="font-medium underline-offset-4 hover:underline"
                        >
                          {family.payer.name}
                        </Link>
                        {family.payer.inactive && (
                          <span className="text-amber-700 dark:text-amber-400">
                            {" "}
                            – archiviert oder gelöscht, bitte einen neuen Zahler wählen
                          </span>
                        )}
                      </p>
                      <ul className="grid gap-1.5" aria-label={`Mitglieder von ${family.name}`}>
                        {ongoing.map((member) => (
                          <li key={member.id} className="flex items-start justify-between gap-2">
                            <span>
                              <Link
                                href={`/mitglieder/${member.memberId}`}
                                className="underline-offset-4 hover:underline"
                              >
                                {member.name}
                              </Link>
                              <span className="block text-xs text-muted-foreground">
                                {rangeText(member, todayDate)}
                              </span>
                            </span>
                            {options && (
                              <span className="flex shrink-0 gap-1">
                                {member.removable ? (
                                  <RemoveFamilyMemberButton id={member.id} name={member.name} />
                                ) : (
                                  <EndFamilyMemberDialog
                                    id={member.id}
                                    name={member.name}
                                    familyName={family.name}
                                    today={today}
                                  />
                                )}
                              </span>
                            )}
                          </li>
                        ))}
                      </ul>
                      {ongoing.length < family.feeType.minMembers && (
                        <p className="text-muted-foreground">
                          Weniger als {family.feeType.minMembers} Mitglieder – der Familienbeitrag
                          gilt erst, wenn genug dabei sind.
                        </p>
                      )}
                      {former.length > 0 && (
                        <p className="text-muted-foreground">
                          Früher dabei:{" "}
                          {former.map((m) => `${m.name} (${rangeText(m, todayDate)})`).join(", ")}
                        </p>
                      )}
                    </CardContent>
                  </Card>
                );
              })}
            </section>
          )}

          {dissolved.length > 0 && (
            <section aria-labelledby="aufgeloest-titel" className="max-w-3xl">
              <h2 id="aufgeloest-titel" className="mb-2 text-lg font-semibold">
                Aufgelöst
              </h2>
              <ul className="grid gap-1 text-sm">
                {dissolved.map((family) => {
                  const last = family.members
                    .map((m) => m.validTo?.getTime() ?? 0)
                    .reduce((a, b) => Math.max(a, b), 0);
                  return (
                    <li
                      key={family.id}
                      id={`familie-${family.id}`}
                      className="flex scroll-mt-24 items-start justify-between gap-2 text-muted-foreground"
                    >
                      <span>
                        <span className="font-medium text-foreground">{family.name}</span>
                        {last > 0 && ` – bis ${formatCalendarDate(new Date(last))}`}
                        {family.members.length > 0 &&
                          ` (${[...new Set(family.members.map((m) => m.name))].join(", ")})`}
                        {family.payer.inactive && (
                          <span className="block text-amber-700 dark:text-amber-400">
                            Zahler {family.payer.name} ist archiviert oder gelöscht – für frühere
                            Zeiträume bitte einen neuen Zahler wählen.
                          </span>
                        )}
                      </span>
                      {options && (
                        <FamilyActions
                          dissolved
                          family={{
                            id: family.id,
                            name: family.name,
                            feeTypeId: family.feeType.id,
                            feeTypeName: family.feeType.name,
                            payerMemberId: family.payer.id,
                            payerName: family.payer.name,
                            memberIds: [],
                          }}
                          options={options}
                          today={today}
                        />
                      )}
                    </li>
                  );
                })}
              </ul>
            </section>
          )}

          <p className="max-w-3xl text-sm text-muted-foreground">
            Der Familienbeitrag gilt an jedem Tag, an dem genug Familienmitglieder einen
            Grundbeitrag zahlen würden – sonst zahlt jedes einzeln. Zusatzbeiträge der Abteilungen
            bleiben bei den Mitgliedern; sie zahlt ebenfalls der Zahler der Familie, solange beim
            Mitglied kein anderer eingestellt ist.
          </p>
        </div>
      )}
    </>
  );
}
