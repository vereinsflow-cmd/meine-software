import type { Metadata } from "next";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { NoAccess } from "@/components/shared/no-access";
import { TableCard } from "@/components/shared/table-card";
import { formatEuroFromCents } from "@/lib/dates";
import { cn } from "@/lib/utils";
import { canFinance } from "@/modules/finance/access";
import { HIDDEN_SYSTEM_KEYS, type SystemCategoryKey } from "@/modules/finance/default-categories";
import { FinanceHeader } from "@/modules/finance/components/finance-header";
import {
  AddAccountDialog,
  AddCategoryDialog,
  ArchiveButton,
  EditAccountDialog,
  EditCategoryDialog,
} from "@/modules/finance/components/settings-dialogs";
import {
  getLedgerSetup,
  listAccounts,
  listCategories,
  type FinanceCategoryDto,
} from "@/modules/finance/ledger";
import {
  ACCOUNT_KIND_LABEL,
  SPHERE_EXPLANATION,
  SPHERE_LABEL,
} from "@/modules/finance/ledger-format";
import { financeTabCounts } from "@/modules/finance/overview";
import { FeeSettingsForm } from "@/modules/fees/components/fee-settings-form";
import { AGE_RULE_LABEL, PRO_RATA_ENTRY_LABEL, PRO_RATA_EXIT_LABEL } from "@/modules/fees/schemas";
import { getFeeSettings } from "@/modules/fees/service";
import { requirePageContext } from "@/server/tenancy/context";

const FEE_RHYTHM = {
  MONTHLY: "monatlich",
  QUARTERLY: "vierteljährlich",
  HALF_YEARLY: "halbjährlich",
  YEARLY: "jährlich",
} as const;

export const metadata: Metadata = { title: "Konten und Kategorien" };

/**
 * Einstellungen der Finanzen: Konten (anlegen, umbenennen, leer archivieren) und Kategorien (anlegen, umbenennen, Bereich
 * ändern, archivieren) – mit einer Erklärung der steuerlichen Bereiche in Alltagssprache.
 */
export default async function FinanceSettingsPage() {
  const ctx = await requirePageContext();
  if (!canFinance(ctx, "finance:read")) return <NoAccess what="die Finanzen" />;
  const canManage = canFinance(ctx, "finance:manage");
  const [setup, accounts, categories, counts, feeSettings] = await Promise.all([
    getLedgerSetup(ctx),
    listAccounts(ctx, { includeArchived: true }),
    listCategories(ctx),
    financeTabCounts(ctx),
    getFeeSettings(ctx),
  ]);

  if (!setup) {
    return (
      <>
        <FinanceHeader description="Konten und Kategorien" counts={counts} />
        <Card className="max-w-3xl">
          <CardContent>
            <p className="text-sm">Zuerst das Kassenbuch einrichten.</p>
            <Button asChild className="mt-3">
              <Link href="/finanzen/kassenbuch">Zum Kassenbuch</Link>
            </Button>
          </CardContent>
        </Card>
      </>
    );
  }

  const activeAccounts = accounts.filter((account) => !account.archived).length;
  const openingAllowed =
    !setup.closedThrough || setup.closedThrough.getTime() < setup.ledgerStartDate.getTime();
  const visible = categories.filter(
    (c) => !HIDDEN_SYSTEM_KEYS.includes((c.systemKey ?? "") as SystemCategoryKey),
  );
  const groups: { title: string; items: FinanceCategoryDto[] }[] = [
    { title: "Einnahmen", items: visible.filter((c) => c.direction === "INCOME") },
    { title: "Ausgaben", items: visible.filter((c) => c.direction === "EXPENSE") },
    { title: "Einnahme oder Ausgabe", items: visible.filter((c) => c.direction === "BOTH") },
  ];

  return (
    <>
      <FinanceHeader description="Konten und Kategorien" counts={counts} />

      <section aria-labelledby="konten-titel" className="mb-8">
        <div className="mb-3 flex flex-wrap items-end justify-between gap-3">
          <h2 id="konten-titel" className="text-lg font-semibold">
            Konten
          </h2>
          {canManage && <AddAccountDialog openingAllowed={openingAllowed} />}
        </div>
        <TableCard>
          <Table>
            <caption className="sr-only">Konten des Vereins</caption>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead className="hidden sm:table-cell">Art</TableHead>
                <TableHead className="text-right">Kontostand</TableHead>
                {canManage && (
                  <TableHead className="w-40">
                    <span className="sr-only">Aktionen</span>
                  </TableHead>
                )}
              </TableRow>
            </TableHeader>
            <TableBody>
              {accounts.map((account) => (
                <TableRow
                  key={account.id}
                  className={cn(account.archived && "text-muted-foreground")}
                >
                  <TableCell className="whitespace-normal">
                    <span className="block font-medium">{account.name}</span>
                    {account.bankName && (
                      <span className="block text-sm text-muted-foreground">
                        {account.bankName}
                      </span>
                    )}
                    <span className="block text-sm text-muted-foreground sm:hidden">
                      {ACCOUNT_KIND_LABEL[account.kind]}
                    </span>
                    {account.archived && <span className="block text-sm">archiviert</span>}
                  </TableCell>
                  <TableCell className="hidden sm:table-cell">
                    {ACCOUNT_KIND_LABEL[account.kind]}
                  </TableCell>
                  <TableCell className="text-right font-semibold tabular-nums">
                    {formatEuroFromCents(account.balanceCents)}
                  </TableCell>
                  {canManage && (
                    <TableCell className="text-right">
                      <div className="flex items-center justify-end gap-1">
                        <EditAccountDialog account={account} />
                        {/* Archivieren nur leer und nicht das letzte aktive Konto (sonst lehnt der Server ab). */}
                        {(account.archived ||
                          (account.balanceCents === 0 && activeAccounts > 1)) && (
                          <ArchiveButton
                            kind="account"
                            id={account.id}
                            name={account.name}
                            archived={account.archived}
                          />
                        )}
                      </div>
                    </TableCell>
                  )}
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </TableCard>
      </section>

      <section aria-labelledby="kategorien-titel" className="mb-8">
        <div className="mb-3 flex flex-wrap items-end justify-between gap-3">
          <div>
            <h2 id="kategorien-titel" className="text-lg font-semibold">
              Kategorien
            </h2>
            <p className="text-sm text-muted-foreground">
              Vorschläge in Alltagssprache – im Zweifel mit dem Steuerberater abstimmen.
            </p>
          </div>
          {canManage && <AddCategoryDialog />}
        </div>
        <div className="grid gap-6">
          {groups
            .filter((group) => group.items.length > 0)
            .map((group) => (
              <div key={group.title}>
                <h3 className="mb-2 text-sm font-semibold">{group.title}</h3>
                <TableCard>
                  <Table>
                    <caption className="sr-only">Kategorien: {group.title}</caption>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Name</TableHead>
                        <TableHead className="hidden sm:table-cell">Bereich</TableHead>
                        {canManage && (
                          <TableHead className="w-40">
                            <span className="sr-only">Aktionen</span>
                          </TableHead>
                        )}
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {group.items.map((category) => (
                        <TableRow
                          key={category.id}
                          className={cn(category.archived && "text-muted-foreground")}
                        >
                          <TableCell className="whitespace-normal">
                            <span className="block font-medium">{category.name}</span>
                            <span className="block text-sm text-muted-foreground sm:hidden">
                              {SPHERE_LABEL[category.sphere]}
                            </span>
                            {category.archived && <span className="block text-sm">archiviert</span>}
                          </TableCell>
                          <TableCell className="hidden text-sm sm:table-cell">
                            {SPHERE_LABEL[category.sphere]}
                          </TableCell>
                          {canManage && (
                            <TableCell className="text-right">
                              <div className="flex items-center justify-end gap-1">
                                {category.sphere !== "NEUTRAL" && (
                                  <EditCategoryDialog
                                    category={{
                                      id: category.id,
                                      name: category.name,
                                      sphere: category.sphere,
                                      hint: category.hint,
                                    }}
                                  />
                                )}
                                {/* Programm-Kategorien (Beiträge, Spenden …) bleiben aktiv. */}
                                {!category.systemKey && (
                                  <ArchiveButton
                                    kind="category"
                                    id={category.id}
                                    name={category.name}
                                    archived={category.archived}
                                  />
                                )}
                              </div>
                            </TableCell>
                          )}
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </TableCard>
              </div>
            ))}
        </div>
      </section>

      <section aria-labelledby="beitraege-titel" className="mb-8 max-w-3xl">
        <h2 id="beitraege-titel" className="text-lg font-semibold">
          Beiträge
        </h2>
        <p className="mb-3 text-sm text-muted-foreground">
          Wie „Wer zahlt was“ und der Beitragslauf rechnen. Die Beitragsarten selbst stehen unter
          „Beiträge“ → „Beitragsarten“.
        </p>
        <Card>
          <CardContent>
            {canManage ? (
              <FeeSettingsForm
                defaults={{
                  feeInterval: feeSettings.feeInterval,
                  dueDay: String(feeSettings.dueDay),
                  proRataEntry: feeSettings.proRataEntry,
                  proRataExit: feeSettings.proRataExit,
                  ageRule: feeSettings.ageRule,
                  missingBirthDateAsAdult: feeSettings.missingBirthDateAsAdult,
                }}
              />
            ) : (
              <p className="text-sm">
                Abrechnung {FEE_RHYTHM[feeSettings.feeInterval]}, fällig am {feeSettings.dueDay}. ·
                Eintritt {PRO_RATA_ENTRY_LABEL[feeSettings.proRataEntry]} · Austritt{" "}
                {PRO_RATA_EXIT_LABEL[feeSettings.proRataExit]} · Alter:{" "}
                {AGE_RULE_LABEL[feeSettings.ageRule]}
              </p>
            )}
          </CardContent>
        </Card>
      </section>

      <section aria-labelledby="bereiche-titel" className="max-w-3xl">
        <h2 id="bereiche-titel" className="mb-2 text-lg font-semibold">
          Die vier Bereiche – kurz erklärt
        </h2>
        <dl className="grid gap-3 text-sm">
          {(Object.keys(SPHERE_EXPLANATION) as (keyof typeof SPHERE_EXPLANATION)[]).map(
            (sphere) => (
              <div key={sphere}>
                <dt className="font-medium">{SPHERE_LABEL[sphere]}</dt>
                <dd className="text-muted-foreground">{SPHERE_EXPLANATION[sphere]}</dd>
              </div>
            ),
          )}
        </dl>
        <p className="mt-3 text-sm text-muted-foreground">
          Gemeinnützige Vereine trennen ihre Einnahmen nach diesen Bereichen – das braucht später
          der Kassenbericht und die Steuererklärung. Im Zweifel hilft der Steuerberater.
        </p>
      </section>
    </>
  );
}
