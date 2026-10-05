import { formatCalendarDate, startOfBerlinDate, todayCalendarDate } from "@/lib/dates";
import { parseInput } from "@/server/action";
import { recordAudit } from "@/server/audit/audit";
import { badRequest } from "@/server/errors";
import { recomputeClose } from "@/server/finance/close-hash";
import { auditActor, type TenantContext } from "@/server/tenancy/context-core";
import { assertFinance, canFinance } from "./access";
import { getLedgerSetup, LONG_TX, yearSummary, type LedgerSetup } from "./ledger";
import { monthLabel } from "./ledger-format";
import { closePeriodSchema } from "./ledger-schemas";

/**
 * Monatsabschluss: Monat für Monat der Reihe nach festschreiben. Danach lassen sich in diesem Zeitraum keine Buchungen
 * mehr anlegen oder stornieren und keine Belege mehr entfernen – Korrekturen landen im nächsten offenen Monat. Die
 * Datenbank rechnet Kontostände und Prüfsumme selbst (Migration `finance_closing`), der Dienst prüft vorher die
 * Checkliste und erklärt sie.
 */

const DAY = 86_400_000;

const dayAfter = (day: Date) => new Date(day.getTime() + DAY);
/** Beginn eines Kalendertags in Berlin (für Zeitpunkte wie `paidAt`). */
const startOfDay = (day: Date) =>
  startOfBerlinDate(day.getUTCFullYear(), day.getUTCMonth() + 1, day.getUTCDate());

/** „2026-09“ eines Kalendertags. */
const monthKey = (day: Date) =>
  `${day.getUTCFullYear()}-${String(day.getUTCMonth() + 1).padStart(2, "0")}`;

/** Letzter Tag des Monats, in dem `day` liegt (Kalendertag, UTC-Mitternacht). */
export function monthEnd(day: Date): Date {
  return new Date(Date.UTC(day.getUTCFullYear(), day.getUTCMonth() + 1, 0));
}

/** Der nächste noch offene Monat (erster Tag und letzter Tag) – unabhängig davon, ob er schon vorbei ist. */
export function nextOpenMonth(setup: LedgerSetup): { from: Date; through: Date; month: string } {
  const start = setup.closedThrough
    ? new Date(setup.closedThrough.getTime() + DAY)
    : new Date(
        Date.UTC(setup.ledgerStartDate.getUTCFullYear(), setup.ledgerStartDate.getUTCMonth(), 1),
      );
  const from = new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth(), 1));
  return { from, through: monthEnd(from), month: monthKey(from) };
}

export type CheckTone = "ok" | "warning";

export interface CloseCheck {
  key: string;
  tone: CheckTone;
  title: string;
  detail: string;
  href?: string;
  linkLabel?: string;
}

export interface ClosePreview {
  month: string;
  label: string;
  from: Date;
  through: Date;
  /** Abschließen geht erst, wenn der Monat vorbei ist. */
  ended: boolean;
  checks: CloseCheck[];
  /** Der erste Abschluss: Danach lassen sich die Anfangsbestände nicht mehr ändern. */
  firstClose: boolean;
  canManage: boolean;
  incomeCents: number;
  expenseCents: number;
  entryCount: number;
  balances: { accountId: string; name: string; balanceCents: number }[];
}

/** Checkliste und Zahlen des nächsten offenen Monats (für die Seite „Monatsabschluss“). */
export async function closePreview(ctx: TenantContext): Promise<ClosePreview | null> {
  assertFinance(ctx, "finance:read");
  const setup = await getLedgerSetup(ctx);
  if (!setup) return null;
  const { from, through, month } = nextOpenMonth(setup);
  const today = todayCalendarDate();
  const range = { gte: from, lte: through };
  const [missingReceipts, unbookedInvoices, cashAccounts, cashCounts, summary, entryCount, sums] =
    await Promise.all([
      ctx.db.ledgerEntry.count({
        where: {
          bookingDate: range,
          kind: "STANDARD",
          reversedBy: { is: null },
          attachments: { none: {} },
        },
      }),
      ctx.db.invoice.count({
        where: {
          status: "PAID",
          document: { is: { deletedAt: null, archivedAt: null } },
          // Bis zum Monatsende bezahlt (Berliner Zeit), seit Beginn des Kassenbuchs – auch aus früheren, schon abgeschlossenen
          // Monaten: Eine vergessene Zahlung lässt sich im offenen Zeitraum nachbuchen.
          OR: [
            {
              paidAt: { gte: startOfDay(setup.ledgerStartDate), lt: startOfDay(dayAfter(through)) },
            },
            { paidAt: null, invoiceDate: { gte: setup.ledgerStartDate, lte: through } },
          ],
          ledgerLines: { none: { entry: { kind: "STANDARD", reversedBy: { is: null } } } },
        },
      }),
      ctx.db.financeAccount.findMany({
        where: { kind: "CASH", archivedAt: null },
        select: { id: true, name: true },
      }),
      ctx.db.cashCount.findMany({
        where: { countedOn: { gte: from } },
        select: { accountId: true },
      }),
      yearSummary(ctx, from.getUTCFullYear()),
      ctx.db.ledgerEntry.count({ where: { bookingDate: range } }),
      ctx.db.ledgerEntry.groupBy({
        by: ["accountId"],
        where: { bookingDate: { lte: through } },
        _sum: { amountCents: true },
      }),
    ]);
  const accounts = await ctx.db.financeAccount.findMany({
    where: { OR: [{ archivedAt: null }, { id: { in: sums.map((s) => s.accountId) } }] },
    orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
    select: { id: true, name: true },
  });
  const balanceOf = new Map(sums.map((s) => [s.accountId, Number(s._sum.amountCents ?? 0)]));
  const monthSummary = summary.months[from.getUTCMonth()];
  const label = monthLabel(month);
  const counted = new Set(cashCounts.map((c) => c.accountId));
  const firstClose =
    !setup.closedThrough || setup.closedThrough.getTime() < setup.ledgerStartDate.getTime();

  const checks: CloseCheck[] = [
    missingReceipts === 0
      ? {
          key: "receipts",
          tone: "ok",
          title: "Alle Buchungen haben einen Beleg",
          detail: "Zu jeder Einnahme und Ausgabe ist eine Datei oder ein Eigenbeleg angehängt.",
        }
      : {
          key: "receipts",
          tone: "warning",
          title:
            missingReceipts === 1
              ? "1 Buchung ohne Beleg"
              : `${missingReceipts} Buchungen ohne Beleg`,
          detail:
            "Nach dem Abschluss lassen sich Belege noch anhängen – besser vorher, solange alles frisch ist.",
          href: `/finanzen/kassenbuch?monat=${month}&beleg=fehlt`,
          linkLabel: "Belege nachreichen",
        },
    ...cashAccounts.map((account): CloseCheck =>
      counted.has(account.id)
        ? {
            key: `cash-${account.id}`,
            tone: "ok",
            title: `${account.name} gezählt`,
            detail: "Seit Monatsbeginn gab es einen Kassensturz.",
          }
        : {
            key: `cash-${account.id}`,
            tone: "warning",
            title: `${account.name} noch nicht gezählt`,
            detail:
              "Zähl das Bargeld einmal und vergleiche es mit dem Kassenbuch (Kassensturz) – so fällt eine Differenz rechtzeitig auf.",
            href: `/finanzen/kassenbuch?kassensturz=${account.id}`,
            linkLabel: "Kassensturz machen",
          },
    ),
    ...(unbookedInvoices > 0
      ? [
          {
            key: "invoices",
            tone: "warning" as const,
            title:
              unbookedInvoices === 1
                ? "1 bezahlte Rechnung fehlt im Kassenbuch"
                : `${unbookedInvoices} bezahlte Rechnungen fehlen im Kassenbuch`,
            detail:
              "Bezahlt, aber noch nicht gebucht – „Ins Kassenbuch“ bucht sie im offenen Zeitraum nach.",
            href: "/finanzen/rechnungen?stand=bezahlt",
            linkLabel: "Rechnungen buchen",
          },
        ]
      : []),
    // Beim ersten Abschluss: Danach stehen die Anfangsbestände fest.
    ...(firstClose
      ? [
          {
            key: "opening",
            tone: "warning" as const,
            title: "Anfangsbestände prüfen",
            detail:
              "Mit dem ersten Abschluss stehen die Anfangsbestände der Konten fest – stimmen sie mit Kontoauszug und gezählter Kasse überein?",
            href: "/finanzen/kassenbuch",
            linkLabel: "Zum Kassenbuch",
          },
        ]
      : []),
  ];
  // Wer nur ansehen darf (z. B. Kassenprüfer), bekommt keine Links zu Aufgaben des Kassenwarts.
  const canManage = canFinance(ctx, "finance:manage");

  return {
    month,
    firstClose,
    canManage,
    label,
    from,
    through,
    ended: through.getTime() < today.getTime(),
    checks,
    incomeCents: monthSummary?.incomeCents ?? 0,
    expenseCents: monthSummary?.expenseCents ?? 0,
    entryCount,
    balances: accounts.map((account) => ({
      accountId: account.id,
      name: account.name,
      balanceCents: balanceOf.get(account.id) ?? 0,
    })),
  };
}

/**
 * Monat abschließen (immer der nächste offene, nur wenn er vorbei ist). Warnungen der Checkliste halten nicht auf – sie
 * stehen auf der Seite; die harten Regeln prüft die Datenbank.
 */
export async function closePeriod(ctx: TenantContext, input: unknown): Promise<{ label: string }> {
  assertFinance(ctx, "finance:manage");
  const data = parseInput(closePeriodSchema, input);
  const setup = await getLedgerSetup(ctx);
  if (!setup) throw badRequest("Das Kassenbuch ist noch nicht eingerichtet.");
  const { through, month } = nextOpenMonth(setup);
  // Doppelt geklickt oder ein anderer Kassenwart war schneller: „bis …“ muss der nächste offene Monat sein.
  if (data.month !== month)
    throw badRequest(`${monthLabel(data.month)} ist schon abgeschlossen oder noch nicht dran.`);
  const label = monthLabel(month);
  return ctx.db.$transaction(async (tx) => {
    const created = await tx.financePeriodClose.create({
      data: {
        clubId: ctx.clubId,
        closedThrough: through,
        kind: through.getUTCMonth() === 11 ? "YEAR" : "MONTH",
        // Werte setzt die Datenbank (Trigger finance_period_close_before_insert).
        balances: {},
        entryCount: 0,
        contentHash: "",
        note: data.note || null,
        closedById: ctx.userId,
      },
    });
    await recordAudit(tx, auditActor(ctx), {
      action: "finance.period_closed",
      entityType: "FinancePeriodClose",
      entityId: created.id,
      summary: `${label} abgeschlossen (${created.entryCount} Buchungen, bis ${formatCalendarDate(through)})`,
    });
    return { label };
  }, LONG_TX);
}

export interface PeriodCloseDto {
  id: string;
  closedThrough: Date;
  label: string;
  kind: "MONTH" | "YEAR";
  entryCount: number;
  lastNumber: string | null;
  contentHash: string;
  closedAt: Date;
  closedBy: string | null;
  totalCents: number;
  note: string | null;
}

/** Bisherige Abschlüsse, neueste zuerst. */
export async function listPeriodCloses(ctx: TenantContext): Promise<PeriodCloseDto[]> {
  assertFinance(ctx, "finance:read");
  const rows = await ctx.db.financePeriodClose.findMany({ orderBy: { closedThrough: "desc" } });
  const userIds = [...new Set(rows.map((r) => r.closedById).filter((id): id is string => !!id))];
  const people = userIds.length
    ? await ctx.db.clubMembership.findMany({
        where: { userId: { in: userIds } },
        select: { userId: true, user: { select: { firstName: true, lastName: true } } },
      })
    : [];
  const names = new Map(people.map((p) => [p.userId, `${p.user.firstName} ${p.user.lastName}`]));
  return rows.map((row) => ({
    id: row.id,
    closedThrough: row.closedThrough,
    label: monthLabel(monthKey(row.closedThrough)),
    kind: row.kind,
    entryCount: row.entryCount,
    lastNumber: row.lastNumber,
    contentHash: row.contentHash,
    closedAt: row.closedAt,
    closedBy: row.closedById ? (names.get(row.closedById) ?? null) : null,
    totalCents: Object.values((row.balances ?? {}) as Record<string, number>).reduce(
      (sum, cents) => sum + Number(cents),
      0,
    ),
    note: row.note,
  }));
}

/**
 * Abschlüsse nachrechnen (Hinweis für Kassenprüfer): Kontostände und Prüfsumme jedes Abschlusses frisch aus den Buchungen,
 * und jede Prüfsumme muss auf die des Vormonats verweisen. Eine Abweichung hieße, dass jemand an der Datenbank vorbei etwas
 * verändert hat.
 */
export async function verifyPeriodCloses(
  ctx: TenantContext,
): Promise<{ ok: boolean; checked: number }> {
  assertFinance(ctx, "finance:read");
  const rows = await ctx.db.financePeriodClose.findMany({ orderBy: { closedThrough: "asc" } });
  let previous: (typeof rows)[number] | null = null;
  for (const row of rows) {
    // Kette: Der erste noch vorhandene Abschluss darf auf einen schon gelöschten (nach Ablauf der Frist) verweisen.
    if (previous && row.previousHash !== previous.contentHash)
      return { ok: false, checked: rows.length };
    const after =
      previous?.closedThrough ??
      (row.previousHash
        ? new Date(Date.UTC(row.closedThrough.getUTCFullYear(), row.closedThrough.getUTCMonth(), 0))
        : null);
    const stored = (row.balances ?? {}) as Record<string, number>;
    const result = await recomputeClose({
      clubId: ctx.clubId,
      previousHash: row.previousHash,
      after,
      closedThrough: row.closedThrough,
      storedBalances: stored,
    });
    // Kontostände frisch aus den Buchungen: gleich für jedes damalige Konto; später angelegte Konten haben bis dahin 0 €.
    const sameBalances =
      result !== null &&
      Object.entries(stored).every(
        ([id, cents]) => Number(result.balances[id] ?? 0) === Number(cents),
      ) &&
      Object.entries(result.balances).every(([id, cents]) => id in stored || Number(cents) === 0);
    if (!result || result.hash !== row.contentHash || !sameBalances)
      return { ok: false, checked: rows.length };
    previous = row;
  }
  return { ok: true, checked: rows.length };
}

/** Übersicht „Das steht an“: Monat seit dem 10. des Folgemonats nicht abgeschlossen. */
export function overdueClose(setup: LedgerSetup, today: Date = todayCalendarDate()): string | null {
  const { through, month } = nextOpenMonth(setup);
  const dueFrom = new Date(Date.UTC(through.getUTCFullYear(), through.getUTCMonth() + 1, 10));
  return today.getTime() >= dueFrom.getTime() ? month : null;
}
