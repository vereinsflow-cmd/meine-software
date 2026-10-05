import type { Metadata } from "next";
import { Card, CardContent } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { EmptyState } from "@/components/shared/empty-state";
import { AREA_ICON } from "@/components/shared/area-icons";
import { NoAccess } from "@/components/shared/no-access";
import { TableCard } from "@/components/shared/table-card";
import { formatCalendarDate, toDateInputValue, todayCalendarDate } from "@/lib/dates";
import { cn } from "@/lib/utils";
import { canFinance } from "@/modules/finance/access";
import { FinanceHeader } from "@/modules/finance/components/finance-header";
import { financeTabCounts } from "@/modules/finance/overview";
import { CreateFeeTypeDialog, FeeTypeActions } from "@/modules/fees/components/fee-type-dialogs";
import { FeesNav } from "@/modules/fees/components/fees-nav";
import { FEE_INTERVAL_LABEL, FEE_KIND_LABEL } from "@/modules/fees/schemas";
import {
  getFeeSettings,
  listFeeDepartments,
  listFeeTypes,
  rateText,
  type FeeTypeDto,
} from "@/modules/fees/service";
import { requirePageContext } from "@/server/tenancy/context";

export const metadata: Metadata = { title: "Beitragsarten" };

/** Gilt noch kein Betrag – dann steht der erste künftige schon im Betragstext. */
const noRateYet = (type: FeeTypeDto) => !type.rates.some((rate) => rate.current);

/**
 * Beitragsarten: Grundbeiträge in der Reihenfolge, in der sie geprüft werden (die erste passende gilt), darunter
 * Familienbeiträge, Zusatzbeiträge und Aufnahmegebühr. Jede Zeile sagt in Alltagssprache, für wen sie gilt und was sie kostet; Beträge
 * ändern sich nur „ab einem Tag“ – frühere Zeiträume bleiben, wie sie waren.
 */
export default async function FeeTypesPage() {
  const ctx = await requirePageContext();
  if (!canFinance(ctx, "finance:read")) return <NoAccess what="die Finanzen" />;
  const canManage = canFinance(ctx, "finance:manage");
  const [types, settings, departments, counts] = await Promise.all([
    listFeeTypes(ctx),
    getFeeSettings(ctx),
    canManage ? listFeeDepartments(ctx) : Promise.resolve([]),
    financeTabCounts(ctx),
  ]);
  const today = toDateInputValue(todayCalendarDate());
  const departmentOptions = departments.map((d) => ({ value: d.id, label: d.name }));
  const base = types.filter((t) => t.kind === "BASE" && !t.archived);
  const groups: { key: string; title: string; hint: string; items: FeeTypeDto[] }[] = [
    {
      key: "grund",
      title: "Grundbeiträge",
      hint: "Von oben nach unten geprüft – die erste passende Beitragsart gilt. Ehrenmitglieder ohne eigene Beitragsart sind beitragsfrei.",
      items: base,
    },
    {
      key: "familie",
      title: "Familienbeiträge",
      hint: "Gelten für die Familien, die unter „Familien“ angelegt sind – statt der Grundbeiträge ihrer Mitglieder.",
      items: types.filter((t) => t.kind === "FAMILY" && !t.archived),
    },
    {
      key: "zusatz",
      title: "Zusatzbeiträge und Aufnahmegebühr",
      hint: "Zusatzbeiträge zahlen die Mitglieder einer Abteilung zusätzlich zum Grundbeitrag.",
      items: types.filter(
        (t) => (t.kind === "ADDITIONAL" || t.kind === "ADMISSION") && !t.archived,
      ),
    },
    {
      key: "archiv",
      title: "Archiviert",
      hint: "Werden nicht mehr berechnet.",
      items: types.filter((t) => t.archived),
    },
  ];

  return (
    <>
      <FinanceHeader
        description={`Beiträge · Beitragslauf ${FEE_INTERVAL_LABEL[settings.feeInterval].replace(/^im /, "je ")}`}
        counts={counts}
        actions={
          canManage ? (
            <CreateFeeTypeDialog departments={departmentOptions} today={today} />
          ) : undefined
        }
      />
      <FeesNav />

      {types.length === 0 ? (
        <EmptyState
          icon={<AREA_ICON.finanzen />}
          title="Noch keine Beitragsarten"
          description={
            canManage
              ? "Lege die Beiträge aus eurer Beitragsordnung an – zum Beispiel „Erwachsene“, „Jugend bis 17 Jahre“ und „Passive“."
              : "Die Beitragsarten legt der Kassenwart an."
          }
        />
      ) : (
        <div className="grid gap-8">
          {groups
            .filter((group) => group.items.length > 0)
            .map((group) => (
              <section key={group.key} aria-labelledby={`gruppe-${group.key}`}>
                <h2 id={`gruppe-${group.key}`} className="text-lg font-semibold">
                  {group.title}
                </h2>
                <p className="mb-3 text-sm text-muted-foreground">{group.hint}</p>
                <TableCard>
                  <Table>
                    <caption className="sr-only">{group.title}</caption>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Beitragsart</TableHead>
                        <TableHead className="hidden md:table-cell">Betrag</TableHead>
                        {canManage && (
                          <TableHead className="w-12">
                            <span className="sr-only">Aktionen</span>
                          </TableHead>
                        )}
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {group.items.map((type, index) => (
                        <TableRow
                          key={type.id}
                          className={cn(type.archived && "text-muted-foreground")}
                        >
                          <TableCell className="align-top whitespace-normal">
                            <span className="block font-medium">
                              {type.kind === "BASE" && !type.archived && (
                                <span className="mr-1.5 text-muted-foreground tabular-nums">
                                  {index + 1}.
                                </span>
                              )}
                              {type.name}
                            </span>
                            <span className="block text-sm text-muted-foreground">
                              {type.kind === "BASE" || type.kind === "FAMILY"
                                ? type.ruleText
                                : `${FEE_KIND_LABEL[type.kind]} · ${type.ruleText}`}
                            </span>
                            <span className="block text-sm md:hidden">{type.rateText}</span>
                            {type.rates
                              .filter(
                                (rate) =>
                                  rate.future &&
                                  !(noRateYet(type) && rate.id === type.rates[0]?.id),
                              )
                              .map((rate) => (
                                <span
                                  key={rate.id}
                                  className="block text-sm text-muted-foreground md:hidden"
                                >
                                  ab {formatCalendarDate(rate.validFrom)}:{" "}
                                  {rateText(rate, settings.feeInterval)}
                                </span>
                              ))}
                            {type.description && (
                              <span className="block text-sm text-muted-foreground">
                                {type.description}
                              </span>
                            )}
                          </TableCell>
                          <TableCell className="hidden align-top whitespace-normal md:table-cell">
                            <span className="block font-medium">{type.rateText}</span>
                            {type.rates
                              .filter(
                                (rate) =>
                                  rate.future &&
                                  !(noRateYet(type) && rate.id === type.rates[0]?.id),
                              )
                              .map((rate) => (
                                <span key={rate.id} className="block text-sm text-muted-foreground">
                                  ab {formatCalendarDate(rate.validFrom)}:{" "}
                                  {rateText(rate, settings.feeInterval)}
                                </span>
                              ))}
                          </TableCell>
                          {canManage && (
                            <TableCell className="text-right align-top">
                              <FeeTypeActions
                                type={{
                                  id: type.id,
                                  name: type.name,
                                  kind: type.kind,
                                  departmentId: type.department?.id ?? null,
                                  statuses: type.statuses,
                                  minAge: type.minAge,
                                  maxAge: type.maxAge,
                                  familyMinMembers: type.familyMinMembers,
                                  description: type.description,
                                  archived: type.archived,
                                  removableRates:
                                    type.rates.length > 1
                                      ? type.rates
                                          .filter((rate) => rate.removable)
                                          .map((rate) => ({
                                            id: rate.id,
                                            label: formatCalendarDate(rate.validFrom),
                                          }))
                                      : [],
                                  currentInterval:
                                    (type.rates.find((rate) => rate.current) ?? type.rates[0])
                                      ?.interval ?? "MONTHLY",
                                  currentAmountCents:
                                    (type.rates.find((rate) => rate.current) ?? type.rates[0])
                                      ?.amountCents ?? null,
                                }}
                                departments={departmentOptions}
                                today={today}
                                canMoveUp={type.kind === "BASE" && !type.archived && index > 0}
                                canMoveDown={
                                  type.kind === "BASE" && !type.archived && index < base.length - 1
                                }
                              />
                            </TableCell>
                          )}
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </TableCard>
              </section>
            ))}
          {!settings.stored && (
            <Card className="max-w-3xl">
              <CardContent className="text-sm text-muted-foreground">
                Rhythmus, Fälligkeit und die Regeln bei Eintritt und Austritt stellst du ein, sobald
                das Kassenbuch eingerichtet ist (Konten und Kategorien).
              </CardContent>
            </Card>
          )}
        </div>
      )}
    </>
  );
}
