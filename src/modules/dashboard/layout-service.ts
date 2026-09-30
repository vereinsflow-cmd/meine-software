import { Prisma } from "@/generated/prisma/client";
import type { TenantContext } from "@/server/tenancy/context-core";
import { parseDashboardLayout, type DashboardLayout } from "./layout-prefs";
import type { DashboardTabId } from "./tabs";

/** Eigene Anordnung des Dashboards (je Person und Verein); `null` = Standard-Ansicht der Rolle. */
export async function getDashboardLayout(ctx: TenantContext): Promise<DashboardLayout | null> {
  const row = await ctx.db.clubMembership.findFirst({
    where: { id: ctx.membershipId },
    select: { dashboardLayout: true },
  });
  return parseDashboardLayout(row?.dashboardLayout ?? null);
}

/** Blendet eine Karte in der eigenen Einstellung aus (z. B. „Erste Schritte“ per Knopf auf der Karte). */
export async function hideDashboardBlock(
  ctx: TenantContext,
  tab: DashboardTabId,
  block: string,
): Promise<void> {
  const layout = (await getDashboardLayout(ctx)) ?? { v: 1, tabs: {} };
  const prefs = layout.tabs[tab] ?? { order: [], hidden: [] };
  const next = parseDashboardLayout({
    ...layout,
    tabs: { ...layout.tabs, [tab]: { ...prefs, hidden: [...prefs.hidden, block] } },
  });
  await saveDashboardLayout(ctx, next);
}

/**
 * Speichert die eigene Anordnung – nur an der eigenen Mitgliedschaft in diesem Verein (der Tenant-Client grenzt zusätzlich
 * auf den Verein ein). `null` stellt die Standard-Ansicht wieder her. Kein Protokolleintrag: reine Ansichtssache.
 */
export async function saveDashboardLayout(
  ctx: TenantContext,
  layout: DashboardLayout | null,
): Promise<void> {
  await ctx.db.clubMembership.updateMany({
    where: { id: ctx.membershipId },
    // Nur Zeichenketten, Listen und Objekte (vom Schema geprüft) – als JSON speicherbar.
    data: {
      dashboardLayout:
        layout === null ? Prisma.DbNull : (layout as unknown as Prisma.InputJsonObject),
    },
  });
}
