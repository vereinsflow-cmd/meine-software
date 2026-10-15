import {
  formatCalendarDate,
  formatEuroFromCents,
  toDateInputValue,
  todayCalendarDate,
} from "@/lib/dates";
import type { TenantContext } from "@/server/tenancy/context-core";
import { assertFinance, canFinance } from "./access";
import { dueText } from "./invoice-format";
import {
  balanceHistory,
  getLedgerSetup,
  listAccounts,
  missingReceiptCount,
  yearSummary,
  type FinanceAccountDto,
  type LedgerSetup,
  type YearSummary,
} from "./ledger";
import { overdueClose } from "./closing";
import { monthLabel } from "./ledger-format";
import { getDonationsPage } from "@/modules/donations/service";
import { feeRunDue } from "@/modules/fees/run";
import { whoPays } from "@/modules/fees/service";
import { getOpenPayments, unbookedPaidInvoiceCount, type OpenPayments } from "./service";

/**
 * Daten der Finanz-Übersicht („Cockpit“): Kennzahlen, Monatszahlen, „Das steht an“, Konten und Ausgaben je Abteilung.
 * Jeder Bereich der Finanzen trägt seine Aufgaben zu „Das steht an“ bei (Rechnungen jetzt; Beiträge, Bank, Lastschrift,
 * Abschluss folgen mit ihren Ausbaustufen).
 */

export type DueTone = "danger" | "warning" | "neutral" | "success";

export interface DueItem {
  key: string;
  /** Kleiner = wichtiger (Sortierung). */
  urgency: number;
  title: string;
  detail: string;
  /** Kurzer Status in der Zeile („seit 3 Tagen überfällig“). */
  statusText?: string;
  tone: DueTone;
  href: string;
  actionLabel: string;
  /** Unter „Demnächst“ statt oben (nichts zu tun, nur zur Kenntnis). */
  later?: boolean;
  /** Reine Info (z. B. „Bescheid gültig bis …“) – zählt nicht als Punkt „für dich“. */
  info?: boolean;
}

export interface DepartmentSpending {
  departmentId: string;
  name: string;
  expenseCents: number;
  incomeCents: number;
}

export interface FinanceOverview {
  setup: LedgerSetup | null;
  canManage: boolean;
  accounts: FinanceAccountDto[];
  totalBalanceCents: number;
  balancePoints: { month: string; balanceCents: number }[];
  year: YearSummary | null;
  /** Kumulierter Überschuss je Monat (für den Kurs der Kennzahl). */
  surplusPoints: number[];
  /**
   * Spenden des Jahres – dieselben Zahlen wie die Seite „Spenden“ (`getDonationsPage`): alle nicht stornierten Spenden
   * (Geld, Sach, Aufwand) und Spenden-Buchungen ohne Spender. `donors`: verschiedene Spender; `withoutEntryCents`: davon
   * Sach- und Aufwandsspenden, die nicht im Kassenbuch stehen („Überschuss“ zählt nur Gebuchtes).
   */
  donations: {
    totalCents: number;
    count: number;
    donors: number;
    cumulative: number[];
    withoutEntryCents: number;
  };
  departments: DepartmentSpending[];
  payments: OpenPayments;
  due: DueItem[];
}

/** Einnahmen und Ausgaben je Abteilung im Jahr (Storno zählt dorthin, wohin das Original gehörte). */
async function departmentSpending(ctx: TenantContext, year: number): Promise<DepartmentSpending[]> {
  const from = new Date(Date.UTC(year, 0, 1));
  const to = new Date(Date.UTC(year, 11, 31));
  const lines = await ctx.db.ledgerLine.findMany({
    where: {
      bookingDate: { gte: from, lte: to },
      sphere: { not: "NEUTRAL" },
      departmentId: { not: null },
    },
    select: {
      amountCents: true,
      departmentId: true,
      department: { select: { name: true } },
      entry: { select: { kind: true } },
    },
  });
  const departments = new Map<string, DepartmentSpending>();
  for (const line of lines) {
    if (!line.departmentId || !line.department) continue;
    const direction = line.entry.kind === "REVERSAL" ? -line.amountCents : line.amountCents;
    const entry = departments.get(line.departmentId) ?? {
      departmentId: line.departmentId,
      name: line.department.name,
      expenseCents: 0,
      incomeCents: 0,
    };
    if (direction > 0) entry.incomeCents += line.amountCents;
    else entry.expenseCents -= line.amountCents;
    departments.set(line.departmentId, entry);
  }
  return [...departments.values()]
    .filter((d) => d.expenseCents > 0 || d.incomeCents > 0)
    .sort((a, b) => b.expenseCents - a.expenseCents || a.name.localeCompare(b.name, "de"));
}

/** Violette Karte und Punkte zum Bescheid: aus `getDonationsPage` (eine Quelle mit der Seite „Spenden“). */
async function donationOverview(
  ctx: TenantContext,
  year: number,
): Promise<{ donations: FinanceOverview["donations"]; due: DueItem[] }> {
  const page = await getDonationsPage(ctx, year);
  const { kpi, tax } = page;
  const due: DueItem[] = [];
  // Nur der Bescheid – mitten im Jahr keine weiteren Spenden-Punkte auf der Übersicht (kein Rauschen). Dringlichkeit auf
  // der Skala der Übersicht (10 = überfällige Rechnung, 20 = Abschluss, 40 = Belege).
  if (tax.state === "EXPIRED" || tax.state === "EXPIRING") {
    const item = page.due.find(
      (d) => d.key === (tax.state === "EXPIRED" ? "tax-expired" : "tax-expiring"),
    );
    if (item) due.push({ ...item, urgency: tax.state === "EXPIRED" ? 15 : 45 });
  }
  return {
    donations: {
      totalCents: kpi.totalCents,
      count: kpi.count,
      donors: kpi.donorCount,
      cumulative: kpi.cumulative,
      withoutEntryCents: kpi.byKind.IN_KIND + kpi.byKind.EXPENSE_WAIVER,
    },
    due,
  };
}

/** Rechnungen: überfällige oben (dringend), bald fällige unter „Demnächst“. */
function invoiceItems(payments: OpenPayments, canManage: boolean): DueItem[] {
  const items: DueItem[] = [];
  for (const invoice of payments.items) {
    if (invoice.amountCents === null) continue;
    const amount = formatEuroFromCents(invoice.amountCents);
    if (invoice.overdue) {
      items.push({
        key: `invoice-${invoice.id}`,
        urgency: 10 + (invoice.dueInDays ?? 0) / 100, // ältere Überfällige zuerst
        title: `„${invoice.name}“ bezahlen`,
        detail: `${amount}, war am ${formatCalendarDate(invoice.dueDate)} fällig –`,
        statusText: dueText(invoice.dueInDays) ?? undefined,
        tone: "danger",
        href: "/finanzen/rechnungen?stand=offen",
        actionLabel: canManage ? "Rechnung ansehen" : "Ansehen",
      });
    } else if (invoice.dueInDays !== null && invoice.dueInDays <= 14) {
      items.push({
        key: `invoice-${invoice.id}`,
        urgency: 60 + invoice.dueInDays,
        title: `„${invoice.name}“ bezahlen`,
        detail: `${amount}, fällig am ${formatCalendarDate(invoice.dueDate)}`,
        statusText:
          invoice.dueInDays === 0
            ? "(heute)"
            : invoice.dueInDays === 1
              ? "(morgen)"
              : `(in ${invoice.dueInDays} Tagen)`,
        tone: "neutral",
        href: "/finanzen/rechnungen?stand=offen",
        actionLabel: "Rechnung ansehen",
        later: true,
      });
    }
  }
  return items;
}

export async function getFinanceOverview(ctx: TenantContext): Promise<FinanceOverview> {
  assertFinance(ctx, "finance:read");
  const canManage = canFinance(ctx, "finance:manage");
  const thisYear = todayCalendarDate().getUTCFullYear();
  const [setup, payments, fees, runDue] = await Promise.all([
    getLedgerSetup(ctx),
    getOpenPayments(ctx, { limit: 20 }),
    whoPays(ctx),
    feeRunDue(ctx),
  ]);
  const due: DueItem[] = invoiceItems(payments, canManage);
  // Beitragslauf: für den laufenden Zeitraum noch keiner – bzw. der nächste beginnt in höchstens drei Wochen.
  if (runDue && canManage)
    due.push({
      key: "fee-run",
      urgency: runDue.next ? 60 : 30,
      title: `Beitragslauf ${runDue.period.label} ist bereit`,
      detail: "Erst prüfen, dann die Vorschau ansehen, dann die Beiträge erstellen.",
      tone: runDue.next ? "neutral" : "warning",
      href: `/finanzen/beitraege/lauf?zeitraum=${toDateInputValue(runDue.period.start)}`,
      actionLabel: "Vorschau ansehen",
      later: runDue.next,
    });
  // Beiträge: Hinweise der Vorschau (ohne Geburtsdatum, keine passende Beitragsart …), bevor Geld angefordert wird.
  // Nur, was sich beheben lässt (ein Geburtstag im Zeitraum ist bloß ein Hinweis, keine Aufgabe).
  const actionable = new Set([
    "NO_BIRTH_DATE",
    "NO_BIRTH_DATE_SKIPPED",
    "NO_FEE_TYPE",
    "NO_JOIN_DATE",
    "LEFT_WITHOUT_DATE",
    "PAYER_NOT_MEMBER",
    "FAMILY_NOT_APPLIED",
  ]);
  // Je Mitglied bzw. Familie einmal gezählt.
  const feeWarnings = new Set(
    fees.warnings
      .filter((w) => actionable.has(w.code))
      .map((w) => (w.familyId ? `f:${w.familyId}` : `m:${w.memberId}`)),
  ).size;
  if (fees.feeTypeCount > 0 && feeWarnings > 0)
    due.push({
      key: "fee-warnings",
      urgency: 35,
      title:
        feeWarnings === 1
          ? "Beiträge: 1 Hinweis prüfen"
          : `Beiträge: ${feeWarnings} Hinweise prüfen`,
      detail:
        "Zum Beispiel fehlt ein Geburtsdatum, es passt keine Beitragsart oder ein Familienbeitrag greift nicht.",
      tone: "warning",
      href: "/finanzen/beitraege",
      actionLabel: "Hinweise ansehen",
    });

  if (!setup) {
    due.push({
      key: "setup",
      urgency: 50,
      title: "Kassenbuch einrichten",
      detail:
        "Girokonto und Barkasse mit Anfangsbestand anlegen – danach siehst du hier Kontostände und Zahlen.",
      tone: "neutral",
      href: "/finanzen/kassenbuch",
      actionLabel: canManage ? "Jetzt einrichten" : "Ansehen",
    });
    return {
      setup: null,
      canManage,
      accounts: [],
      totalBalanceCents: 0,
      balancePoints: [],
      year: null,
      surplusPoints: [],
      donations: { totalCents: 0, count: 0, donors: 0, cumulative: [], withoutEntryCents: 0 },
      departments: [],
      payments,
      due: due.sort((a, b) => a.urgency - b.urgency),
    };
  }

  const [
    accounts,
    balancePoints,
    year,
    departments,
    donationInfo,
    missingReceipts,
    unbookedInvoices,
  ] = await Promise.all([
    listAccounts(ctx),
    balanceHistory(ctx, 12),
    yearSummary(ctx, thisYear),
    departmentSpending(ctx, thisYear),
    donationOverview(ctx, thisYear),
    missingReceiptCount(ctx),
    // Seit Beginn des Kassenbuchs – auch Zahlungen aus abgeschlossenen Monaten (die bucht „Ins Kassenbuch“ im offenen Zeitraum).
    unbookedPaidInvoiceCount(ctx, setup.ledgerStartDate),
  ]);
  due.push(...donationInfo.due);
  if (unbookedInvoices > 0)
    due.push({
      key: "invoices-unbooked",
      urgency: 30,
      title:
        unbookedInvoices === 1
          ? "1 bezahlte Rechnung ins Kassenbuch übernehmen"
          : `${unbookedInvoices} bezahlte Rechnungen ins Kassenbuch übernehmen`,
      detail: "Bezahlt, aber noch nicht gebucht – ein Klick, die Rechnung hängt dann als Beleg an.",
      tone: "neutral",
      href: "/finanzen/rechnungen?stand=bezahlt",
      actionLabel: canManage ? "Rechnungen buchen" : "Ansehen",
    });
  const closeMonth = overdueClose(setup);
  if (closeMonth)
    due.push({
      key: "close",
      urgency: 20,
      title: `${monthLabel(closeMonth)} abschließen`,
      detail:
        "Der Monat ist vorbei: Checkliste durchgehen und festschreiben – danach bleibt er, wie er ist.",
      tone: "warning",
      href: "/finanzen/abschluss",
      actionLabel: canManage ? "Zum Monatsabschluss" : "Ansehen",
    });
  if (missingReceipts > 0)
    due.push({
      key: "receipts-missing",
      urgency: 40,
      title:
        missingReceipts === 1 ? "1 Buchung ohne Beleg" : `${missingReceipts} Buchungen ohne Beleg`,
      detail: "Zu jeder Einnahme und Ausgabe gehört ein Beleg – ein Foto der Quittung genügt.",
      tone: "warning",
      href: "/finanzen/kassenbuch?beleg=fehlt",
      actionLabel: canManage ? "Belege nachreichen" : "Ansehen",
    });
  const surplusPoints: number[] = [];
  year.months.reduce((sum, month) => {
    const next = sum + month.incomeCents - month.expenseCents;
    surplusPoints.push(next);
    return next;
  }, 0);

  return {
    setup,
    canManage,
    accounts,
    totalBalanceCents: accounts.reduce((sum, a) => sum + a.balanceCents, 0),
    balancePoints,
    year,
    surplusPoints,
    donations: donationInfo.donations,
    departments,
    payments,
    due: due.sort((a, b) => a.urgency - b.urgency),
  };
}

/** Kleine Zahlen an der Leiste der Finanzen (auf jeder Finanzseite gleich): überfällige Rechnungen. */
export async function financeTabCounts(
  ctx: TenantContext,
): Promise<Partial<Record<string, number>>> {
  if (!canFinance(ctx, "finance:read")) return {};
  const [overdue, setup] = await Promise.all([
    ctx.db.invoice.count({
      where: {
        status: "OPEN",
        dueDate: { lt: todayCalendarDate() },
        document: { is: { deletedAt: null, archivedAt: null } },
      },
    }),
    getLedgerSetup(ctx),
  ]);
  return {
    "/finanzen/rechnungen": overdue,
    // Ein Monat, der seit dem 10. des Folgemonats auf den Abschluss wartet.
    "/finanzen/abschluss": setup && overdueClose(setup) ? 1 : 0,
  };
}
