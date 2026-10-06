import { formatCalendarDate, formatEuroFromCents, todayCalendarDate } from "@/lib/dates";
import { parseEuroToCents } from "@/lib/money";
import { parseInput } from "@/server/action";
import { recordAudit } from "@/server/audit/audit";
import { lockUntilCommit } from "@/server/db/tenant";
import { validationFailed } from "@/server/errors";
import { auditActor, type TenantContext } from "@/server/tenancy/context-core";
import { assertFinance } from "./access";
import { insertEntry, lockNumbers, LONG_TX, systemCategoryId } from "./ledger";
import { entryNumber, formatSignedEuro } from "./ledger-format";
import { cashCountSchema } from "./ledger-schemas";

/**
 * Kassensturz: Bargeld der Barkasse zählen und mit dem Kassenbuch vergleichen. Stimmt es nicht, wird die Differenz als
 * Buchung „Kassendifferenz“ festgehalten (mit Grund) – danach stimmt das Kassenbuch wieder mit der Kasse überein. Gezählt
 * wird immer „jetzt“ (heute).
 */

/** Scheine und Münzen in Cent – für die Zählhilfe. */
export const DENOMINATIONS = [
  50_000, 20_000, 10_000, 5_000, 2_000, 1_000, 500, 200, 100, 50, 20, 10, 5, 2, 1,
] as const;

export interface CashCountResult {
  differenceCents: number;
  /** Nummer der Buchung „Kassendifferenz“, falls es eine gab. */
  entryLabel: string | null;
}

export async function countCash(ctx: TenantContext, input: unknown): Promise<CashCountResult> {
  assertFinance(ctx, "finance:manage");
  const data = parseInput(cashCountSchema, input);
  const countedCents = parseEuroToCents(data.counted)!;
  const denominations = data.denominations
    ? Object.fromEntries(Object.entries(data.denominations).filter(([, count]) => count > 0))
    : null;
  if (denominations) {
    const sum = Object.entries(denominations).reduce(
      (total, [value, count]) => total + Number(value) * count,
      0,
    );
    if (Object.keys(denominations).some((value) => !DENOMINATIONS.includes(Number(value) as never)))
      throw validationFailed({ counted: ["Die Zählhilfe enthält einen unbekannten Schein."] });
    if (sum !== countedCents) {
      const message = `Die Zählhilfe ergibt ${formatEuroFromCents(sum)} – bitte prüfe den Betrag.`;
      throw validationFailed({ counted: [message] }, message);
    }
  }
  const today = todayCalendarDate();

  return ctx.db.$transaction(async (tx) => {
    const account = await tx.financeAccount.findFirst({
      where: { id: data.accountId, kind: "CASH", archivedAt: null },
      select: { id: true, name: true },
    });
    if (!account) throw validationFailed({ accountId: ["Bitte wähle eine Barkasse."] });
    // Erst die Nummernkreise, dann dieselbe Sperre wie die Prüfung „Barkasse nie im Minus“ – in dieser Reihenfolge sperrt
    // auch jede Buchung (Nummer beim Anlegen, Barkasse beim Festschreiben). So bleibt der Stand stabil, ohne Verklemmung.
    // Alle noch offenen Jahre (aufsteigend): Auch eine gleichzeitige Buchung mit Datum im offenen Vorjahr zählt zum Bestand.
    const settings = await tx.financeSettings.findUnique({
      where: { clubId: ctx.clubId },
      select: { ledgerStartDate: true, closedThrough: true },
    });
    const openFrom = settings?.closedThrough
      ? new Date(settings.closedThrough.getTime() + 86_400_000).getUTCFullYear()
      : (settings?.ledgerStartDate.getUTCFullYear() ?? today.getUTCFullYear());
    for (
      let year = Math.min(openFrom, today.getUTCFullYear());
      year <= today.getUTCFullYear();
      year++
    )
      await lockNumbers(tx, ctx.clubId, "LEDGER", year);
    await lockUntilCommit(tx, ctx.clubId, `cash:${account.id}`);
    const book = await tx.ledgerEntry.aggregate({
      where: { accountId: account.id, bookingDate: { lte: today } },
      _sum: { amountCents: true },
    });
    const bookCents = Number(book._sum.amountCents ?? 0);
    const differenceCents = countedCents - bookCents;
    const note = data.note?.trim() || null;
    if (differenceCents !== 0 && (!note || note.length < 3)) {
      const message = `Die Kasse weicht um ${formatSignedEuro(differenceCents)} ab – bitte schreib kurz, woran es liegen könnte.`;
      throw validationFailed({ note: [message] }, message);
    }

    let entry: { id: string; label: string } | null = null;
    if (differenceCents !== 0) {
      const categoryId = await systemCategoryId(tx, "CASH_DIFFERENCE");
      const created = await insertEntry(tx, ctx, {
        accountId: account.id,
        bookingDate: today,
        kind: "STANDARD",
        description: `Kassendifferenz beim Kassensturz am ${formatCalendarDate(today)}`,
        lines: [{ categoryId, amountCents: differenceCents, note: note!.slice(0, 200) }],
      });
      entry = { id: created.id, label: entryNumber(created.year, created.number) };
      // Der Kassensturz selbst ist der Beleg der Differenz.
      await tx.ledgerAttachment.create({
        data: {
          clubId: ctx.clubId,
          entryId: created.id,
          note: `Kassensturz: gezählt ${formatEuroFromCents(countedCents)}, laut Kassenbuch ${formatEuroFromCents(bookCents)}. ${note}`.slice(
            0,
            500,
          ),
          attachedById: ctx.userId,
        },
      });
    }
    const count = await tx.cashCount.create({
      data: {
        clubId: ctx.clubId,
        accountId: account.id,
        countedOn: today,
        countedCents,
        bookCents,
        differenceCents,
        denominations: denominations ?? undefined,
        note,
        entryId: entry?.id ?? null,
        countedById: ctx.userId,
      },
    });
    await recordAudit(tx, auditActor(ctx), {
      action: "finance.cash_counted",
      entityType: "CashCount",
      entityId: count.id,
      summary:
        differenceCents === 0
          ? `Kassensturz ${account.name}: ${formatEuroFromCents(countedCents)} – stimmt`
          : `Kassensturz ${account.name}: ${formatEuroFromCents(countedCents)}, Differenz ${formatSignedEuro(differenceCents)} (Buchung ${entry!.label})`,
    });
    return { differenceCents, entryLabel: entry?.label ?? null };
  }, LONG_TX);
}

export interface CashCountDto {
  id: string;
  accountName: string;
  countedOn: Date;
  countedCents: number;
  differenceCents: number;
  entryLabel: string | null;
  note: string | null;
}

/** Letzte Kassenstürze (für die Seite „Monatsabschluss“). */
export async function listCashCounts(ctx: TenantContext, take = 10): Promise<CashCountDto[]> {
  assertFinance(ctx, "finance:read");
  const rows = await ctx.db.cashCount.findMany({
    orderBy: [{ countedOn: "desc" }, { countedAt: "desc" }],
    take,
    include: {
      account: { select: { name: true } },
      entry: { select: { year: true, number: true } },
    },
  });
  return rows.map((row) => ({
    id: row.id,
    accountName: row.account.name,
    countedOn: row.countedOn,
    countedCents: row.countedCents,
    differenceCents: row.differenceCents,
    entryLabel: row.entry ? entryNumber(row.entry.year, row.entry.number) : null,
    note: row.note,
  }));
}
