import "server-only";
import { formatDate } from "@/lib/dates";
import { SEARCH_REGISTRY } from "@/lib/search/registry";
import type { EntitySearchResult, SearchResultItem } from "@/lib/search/types";
import { eventVisibilityWhere, searchWhere as eventSearchWhere } from "@/modules/events/service";
import { memberReadScope, searchWhere as memberSearchWhere } from "@/modules/members/service";
import {
  searchWhere as documentSearchWhere,
  visibleWhere as documentVisibleWhere,
} from "@/modules/documents/service";
import { can } from "@/server/permissions/policy";
import type { TenantContext } from "@/server/tenancy/context-core";

/**
 * Backend der zentralen Suche (Strg/⌘+K). Zwei unabhängige Quellen, beide über bestehende
 * Berechtigungsprimitiven gefiltert – die Suche ist bewusst nur ein durchsichtiges Fenster auf
 * Daten/Aktionen, die ohnehin schon geprüft sind, nie ein zweiter Rechteweg.
 */
const ENTITY_SEARCH_LIMIT_PER_CATEGORY = 5;
const ENTITY_SEARCH_MIN_QUERY_LENGTH = 2;

/** Statische Aktionen/Seiten, gefiltert wie NavDefinition in nav.tsx (`visible()`). Rein, keine Datenbank. */
export function getStaticSearchEntries(
  ctx: TenantContext,
  options: { isPlatformAdmin: boolean },
): SearchResultItem[] {
  return SEARCH_REGISTRY.filter((entry) => {
    if (entry.platformAdminOnly) return options.isPlatformAdmin;
    if (!entry.permission) return true;
    const scope = ctx.permissions.get(entry.permission);
    if (!scope) return false;
    return !(entry.notOwnOnly && scope === "OWN");
  }).map((entry) => ({
    id: entry.id,
    category: entry.category,
    title: entry.title,
    description: entry.description,
    href: entry.href,
    iconKey: entry.iconKey,
    keywords: entry.keywords,
  }));
}

/** Lebende Datensätze (Mitglieder/Veranstaltungen/Dokumente); leer für sehr kurze Anfragen. */
export async function searchEntities(
  ctx: TenantContext,
  query: string,
): Promise<EntitySearchResult> {
  const q = query.trim();
  if (q.length < ENTITY_SEARCH_MIN_QUERY_LENGTH) {
    return { mitglieder: [], veranstaltungen: [], dokumente: [] };
  }

  const [mitglieder, veranstaltungen, dokumente] = await Promise.all([
    can(ctx, "members:read")
      ? ctx.db.member.findMany({
          where: { AND: [memberReadScope(ctx) ?? {}, memberSearchWhere(ctx, q)] },
          select: { id: true, firstName: true, lastName: true, memberNumber: true },
          orderBy: [{ lastName: "asc" }, { firstName: "asc" }],
          take: ENTITY_SEARCH_LIMIT_PER_CATEGORY,
        })
      : Promise.resolve([]),
    can(ctx, "events:read")
      ? ctx.db.event.findMany({
          where: { AND: [eventVisibilityWhere(ctx), eventSearchWhere(q)] },
          select: { id: true, title: true, startsAt: true, locationName: true },
          orderBy: { startsAt: "asc" },
          take: ENTITY_SEARCH_LIMIT_PER_CATEGORY,
        })
      : Promise.resolve([]),
    can(ctx, "documents:read")
      ? ctx.db.document.findMany({
          where: { AND: [documentVisibleWhere(ctx), documentSearchWhere(q)] },
          select: { id: true, name: true, category: true },
          orderBy: [{ createdAt: "desc" }, { id: "desc" }],
          take: ENTITY_SEARCH_LIMIT_PER_CATEGORY,
        })
      : Promise.resolve([]),
  ]);

  return {
    mitglieder: mitglieder.map((member) => ({
      id: `member:${member.id}`,
      category: "mitglieder",
      title: `${member.firstName} ${member.lastName}`,
      description: member.memberNumber
        ? `Mitglied Nr. ${member.memberNumber}`
        : "Mitgliederdetails",
      href: `/mitglieder/${member.id}`,
      iconKey: "mitglied",
    })),
    veranstaltungen: veranstaltungen.map((event) => ({
      id: `event:${event.id}`,
      category: "veranstaltungen",
      title: event.title,
      description: [formatDate(event.startsAt), event.locationName].filter(Boolean).join(" · "),
      href: `/veranstaltungen/${event.id}`,
      iconKey: "veranstaltungen",
    })),
    dokumente: dokumente.map((document) => ({
      id: `document:${document.id}`,
      category: "dokumente",
      title: document.name,
      description: document.category ?? "Dokument",
      // Kein eigenes Detail-/Deep-Link-Ziel (siehe dokumente/page.tsx) – die Dokumentenliste
      // unterstützt aber schon eine Textsuche über denselben Parameter.
      href: `/dokumente?q=${encodeURIComponent(document.name)}`,
      iconKey: "dokument",
    })),
  };
}
