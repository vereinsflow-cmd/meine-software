import { formatEuroFromCents } from "@/lib/dates";
import { parseSignedEuroToCents } from "@/lib/money";
import { parseInput } from "@/server/action";
import { recordAudit } from "@/server/audit/audit";
import { type TenantTx } from "@/server/db/tenant";
import { conflict, notFound, validationFailed } from "@/server/errors";
import { auditActor, type TenantContext } from "@/server/tenancy/context-core";
import { assertFinance } from "./access";
import { HIDDEN_SYSTEM_KEYS, type SystemCategoryKey } from "./default-categories";
import { insertEntry, LONG_TX, systemCategoryId } from "./ledger";
import { ACCOUNT_KIND_LABEL, SPHERE_LABEL } from "./ledger-format";
import {
  accountCreateSchema,
  accountUpdateSchema,
  archiveSchema,
  categoryCreateSchema,
  categoryUpdateSchema,
} from "./ledger-schemas";

/**
 * Einstellungen der Finanzen: Konten und Kategorien pflegen. Konten archiviert man nur leer (Kontostand 0); Kategorien
 * behalten ihre Art (Einnahme/Ausgabe). Ein geänderter steuerlicher Bereich gilt für neue Buchungen – frühere behalten
 * ihren (Momentaufnahme in der Buchungszeile).
 */

async function assertAccountNameFree(tx: TenantTx, name: string, exceptId?: string) {
  const taken = await tx.financeAccount.findFirst({
    where: {
      name: { equals: name, mode: "insensitive" },
      ...(exceptId ? { NOT: { id: exceptId } } : {}),
    },
    select: { id: true },
  });
  if (taken) throw validationFailed({ name: ["Ein Konto mit diesem Namen gibt es schon."] });
}

async function assertCategoryNameFree(tx: TenantTx, name: string, exceptId?: string) {
  const taken = await tx.financeCategory.findFirst({
    where: {
      name: { equals: name, mode: "insensitive" },
      ...(exceptId ? { NOT: { id: exceptId } } : {}),
    },
    select: { id: true },
  });
  if (taken) throw validationFailed({ name: ["Eine Kategorie mit diesem Namen gibt es schon."] });
}

/** Neues Konto (z. B. Zweitkonto, Kasse der Jugendabteilung) – mit Anfangsbestand, solange der Beginn offen ist. */
export async function createAccount(ctx: TenantContext, input: unknown): Promise<{ id: string }> {
  assertFinance(ctx, "finance:manage");
  const data = parseInput(accountCreateSchema, input);
  const opening = data.opening ? parseSignedEuroToCents(data.opening)! : 0;
  return ctx.db.$transaction(async (tx) => {
    const settings = await tx.financeSettings.findUnique({ where: { clubId: ctx.clubId } });
    if (!settings) throw conflict("Das Kassenbuch ist noch nicht eingerichtet.");
    const startOpen =
      !settings.closedThrough ||
      settings.closedThrough.getTime() < settings.ledgerStartDate.getTime();
    if (opening !== 0 && !startOpen)
      throw validationFailed({
        opening: [
          "Der Beginn des Kassenbuchs ist abgeschlossen – bring das Geld per Umbuchung oder Einnahme auf das neue Konto.",
        ],
      });
    await assertAccountNameFree(tx, data.name);
    const last = await tx.financeAccount.aggregate({ _max: { sortOrder: true } });
    const account = await tx.financeAccount.create({
      data: {
        clubId: ctx.clubId,
        kind: data.kind,
        name: data.name,
        bankName: data.bankName || null,
        sortOrder: (last._max.sortOrder ?? 0) + 1,
        createdById: ctx.userId,
      },
    });
    if (opening !== 0) {
      await insertEntry(tx, ctx, {
        accountId: account.id,
        bookingDate: settings.ledgerStartDate,
        kind: "OPENING",
        description: `Anfangsbestand ${account.name}`,
        lines: [{ categoryId: await systemCategoryId(tx, "OPENING"), amountCents: opening }],
      });
    }
    await recordAudit(tx, auditActor(ctx), {
      action: "finance.account_created",
      entityType: "FinanceAccount",
      entityId: account.id,
      summary: `${ACCOUNT_KIND_LABEL[account.kind]} „${account.name}“ angelegt${opening ? ` (Anfangsbestand ${formatEuroFromCents(opening)})` : ""}`,
    });
    return { id: account.id };
  }, LONG_TX);
}

export async function updateAccount(ctx: TenantContext, input: unknown): Promise<void> {
  assertFinance(ctx, "finance:manage");
  const data = parseInput(accountUpdateSchema, input);
  await ctx.db.$transaction(async (tx) => {
    const account = await tx.financeAccount.findFirst({ where: { id: data.id } });
    if (!account) throw notFound("Das Konto");
    await assertAccountNameFree(tx, data.name, account.id);
    await tx.financeAccount.update({
      where: { id: account.id },
      data: { name: data.name, bankName: data.bankName || null },
    });
    await recordAudit(tx, auditActor(ctx), {
      action: "finance.account_updated",
      entityType: "FinanceAccount",
      entityId: account.id,
      summary: `Konto „${account.name}“ geändert`,
      changes: {
        ...(account.name !== data.name ? { name: { from: account.name, to: data.name } } : {}),
        ...((account.bankName ?? null) !== (data.bankName || null)
          ? { bank: { from: account.bankName, to: data.bankName || null } }
          : {}),
      },
    });
  });
}

/** Archivieren (nur bei Kontostand 0 und wenn ein anderes Konto übrig bleibt) bzw. wieder aktivieren. */
export async function archiveAccount(ctx: TenantContext, input: unknown): Promise<void> {
  assertFinance(ctx, "finance:manage");
  const data = parseInput(archiveSchema, input);
  await ctx.db.$transaction(async (tx) => {
    const account = await tx.financeAccount.findFirst({ where: { id: data.id } });
    if (!account) throw notFound("Das Konto");
    if (data.archived === (account.archivedAt !== null)) return;
    if (data.archived) {
      const balance = await tx.ledgerEntry.aggregate({
        where: { accountId: account.id },
        _sum: { amountCents: true },
      });
      const cents = Number(balance._sum.amountCents ?? 0);
      if (cents !== 0)
        throw conflict(
          `Auf „${account.name}“ sind noch ${formatEuroFromCents(cents)} – bring den Betrag erst per Umbuchung auf ein anderes Konto.`,
        );
      const others = await tx.financeAccount.count({
        where: { archivedAt: null, NOT: { id: account.id } },
      });
      if (others === 0) throw conflict("Ein Konto muss aktiv bleiben.");
    }
    await tx.financeAccount.update({
      where: { id: account.id },
      data: { archivedAt: data.archived ? new Date() : null },
    });
    await recordAudit(tx, auditActor(ctx), {
      action: data.archived ? "finance.account_archived" : "finance.account_restored",
      entityType: "FinanceAccount",
      entityId: account.id,
      summary: `Konto „${account.name}“ ${data.archived ? "archiviert" : "wieder aktiviert"}`,
    });
  });
}

export async function createCategory(ctx: TenantContext, input: unknown): Promise<{ id: string }> {
  assertFinance(ctx, "finance:manage");
  const data = parseInput(categoryCreateSchema, input);
  return ctx.db.$transaction(async (tx) => {
    await assertCategoryNameFree(tx, data.name);
    const last = await tx.financeCategory.aggregate({ _max: { sortOrder: true } });
    const category = await tx.financeCategory.create({
      data: {
        clubId: ctx.clubId,
        name: data.name,
        direction: data.direction,
        sphere: data.sphere,
        hint: data.hint || null,
        sortOrder: (last._max.sortOrder ?? 0) + 1,
      },
    });
    await recordAudit(tx, auditActor(ctx), {
      action: "finance.category_created",
      entityType: "FinanceCategory",
      entityId: category.id,
      summary: `Kategorie „${category.name}“ angelegt (${data.direction === "INCOME" ? "Einnahme" : "Ausgabe"}, ${SPHERE_LABEL[data.sphere]})`,
    });
    return { id: category.id };
  });
}

/** Programm-Kategorien, die man nicht ändert (Umbuchung, Anfangsbestand). */
const isHidden = (systemKey: string | null) =>
  HIDDEN_SYSTEM_KEYS.includes((systemKey ?? "") as SystemCategoryKey);

export async function updateCategory(ctx: TenantContext, input: unknown): Promise<void> {
  assertFinance(ctx, "finance:manage");
  const data = parseInput(categoryUpdateSchema, input);
  await ctx.db.$transaction(async (tx) => {
    const category = await tx.financeCategory.findFirst({ where: { id: data.id } });
    if (!category || isHidden(category.systemKey)) throw notFound("Die Kategorie");
    await assertCategoryNameFree(tx, data.name, category.id);
    await tx.financeCategory.update({
      where: { id: category.id },
      data: { name: data.name, sphere: data.sphere, hint: data.hint || null },
    });
    await recordAudit(tx, auditActor(ctx), {
      action: "finance.category_updated",
      entityType: "FinanceCategory",
      entityId: category.id,
      summary: `Kategorie „${category.name}“ geändert`,
      changes: {
        ...(category.name !== data.name ? { name: { from: category.name, to: data.name } } : {}),
        ...(category.sphere !== data.sphere
          ? { bereich: { from: SPHERE_LABEL[category.sphere], to: SPHERE_LABEL[data.sphere] } }
          : {}),
      },
    });
  });
}

/** Archivieren: nicht mehr wählbar, bisherige Buchungen bleiben. Programm-Kategorien (Beiträge, Spenden …) bleiben aktiv. */
export async function archiveCategory(ctx: TenantContext, input: unknown): Promise<void> {
  assertFinance(ctx, "finance:manage");
  const data = parseInput(archiveSchema, input);
  await ctx.db.$transaction(async (tx) => {
    const category = await tx.financeCategory.findFirst({ where: { id: data.id } });
    if (!category || isHidden(category.systemKey)) throw notFound("Die Kategorie");
    if (data.archived && category.systemKey)
      throw conflict(
        "Diese Kategorie braucht das Programm (z. B. für Beiträge oder Spenden) – sie bleibt aktiv.",
      );
    if (data.archived === (category.archivedAt !== null)) return;
    await tx.financeCategory.update({
      where: { id: category.id },
      data: { archivedAt: data.archived ? new Date() : null },
    });
    await recordAudit(tx, auditActor(ctx), {
      action: data.archived ? "finance.category_archived" : "finance.category_restored",
      entityType: "FinanceCategory",
      entityId: category.id,
      summary: `Kategorie „${category.name}“ ${data.archived ? "archiviert" : "wieder aktiviert"}`,
    });
  });
}
