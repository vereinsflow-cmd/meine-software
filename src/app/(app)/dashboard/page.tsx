import { Fragment, Suspense } from "react";
import type { Metadata } from "next";
import Link from "next/link";
import { EyeOffIcon, PlusIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { AREA_ICON } from "@/components/shared/area-icons";
import { CompactEmpty } from "@/components/shared/compact-empty";
import { PageHeader } from "@/components/shared/page-header";
import { PageStack } from "@/components/shared/page-section";
import { param, type RawSearchParams } from "@/lib/search-params";
import { getAnalytics } from "@/modules/dashboard/analytics";
import { Analytics, AnalyticsSkeleton } from "@/modules/dashboard/components/analytics";
import {
  FreeShiftsStat,
  HelperHours,
  MembersStat,
  NextEventsStat,
  StatCard,
} from "@/modules/dashboard/components/kpi-stats";
import {
  CustomizeDashboard,
  type CustomizeTab,
} from "@/modules/dashboard/components/customize-dashboard";
import { DashboardTabs, type DashboardTab } from "@/modules/dashboard/components/dashboard-tabs";
import { KpiCarousel } from "@/modules/dashboard/components/kpi-carousel";
import { OnboardingCard } from "@/modules/dashboard/components/onboarding-card";
import { CardGrid, Group } from "@/modules/dashboard/components/layout";
import {
  Anniversaries,
  Birthdays,
  LatestNotifications,
  MyShifts,
  MyTasks,
  OpenPayments,
  OpenShifts,
  PaymentsTile,
  RecentActivity,
  StaffingWarnings,
  UpcomingEvents,
} from "@/modules/dashboard/components/widgets";
import {
  GROUP_TITLE,
  arrangeBlocks,
  blockLabel,
  blockSize,
  orderedBlocks,
  segmentBlocks,
} from "@/modules/dashboard/layout-prefs";
import { getDashboardLayout } from "@/modules/dashboard/layout-service";
import { getOnboarding } from "@/modules/dashboard/onboarding";
import { getDashboard } from "@/modules/dashboard/service";
import { SetupFrameSync } from "@/modules/setup/components/setup-frame";
import {
  DASHBOARD_TABS,
  availableTabs,
  resolveTab,
  type DashboardTabId,
} from "@/modules/dashboard/tabs";
import { can } from "@/server/permissions/policy";
import { formatDateLong } from "@/lib/dates";
import { cn } from "@/lib/utils";
import { requirePageContext } from "@/server/tenancy/context";

export const metadata: Metadata = { title: "Dashboard" };

/**
 * Das Dashboard in vier Reitern (Aufteilung und Begründung: `modules/dashboard/tabs.ts`). Die Seite bleibt EINE Seite – der
 * Reiterwechsel geschieht im Browser (`DashboardTabs`), die Seitenleiste zeigt weiter nur „Dashboard“. Der Server berechnet
 * wie bisher nur, was die Rolle sehen darf; Reiter ohne Inhalt gibt es nicht. Die Diagramme laden per `Suspense` nach.
 *
 * Jede Person kann ihr Dashboard selbst einstellen („Anpassen“): Karten je Reiter ein- und ausblenden, umsortieren und in
 * der Größe ändern – klein, mittel, groß (`modules/dashboard/layout-prefs.ts`, gespeichert je Person und Verein). Ohne eigene
 * Einstellung gilt die Standard-Ansicht (alle „Mittel“).
 */
export default async function DashboardPage({
  searchParams,
}: {
  searchParams: Promise<RawSearchParams>;
}) {
  const [ctx, params] = await Promise.all([requirePageContext(), searchParams]);
  // Lässt sich die eigene Einstellung nicht lesen (etwa weil ein laufender Server die neue Spalte noch nicht kennt), gilt die
  // Standard-Ansicht – das Dashboard als Startseite soll daran nie scheitern.
  const [data, layout, onboarding] = await Promise.all([
    getDashboard(ctx),
    getDashboardLayout(ctx).catch(() => null),
    getOnboarding(ctx),
  ]);
  const {
    members,
    events,
    shifts,
    tasks,
    notifications,
    birthdays,
    anniversaries,
    activity,
    payments,
  } = data;

  // Einmal berechnen, von mehreren Reitern verwendet. Das `catch` verhindert eine „unbehandelte Ablehnung“, falls kein
  // Reiter die Daten abholt; die Reiter selbst bekommen einen Fehler weiterhin zu sehen.
  const analytics = getAnalytics(ctx);
  analytics.catch(() => undefined);

  /** Eigene Größe einer Karte („Anpassen“); ohne Einstellung „Mittel“. */
  const sizeOf = (tab: DashboardTabId, id: string) => blockSize(layout?.tabs[tab], id);
  const kpiSize = sizeOf("uebersicht", "kennzahlen");
  // Kachelraster der Kennzahlen (Entwurf 4): nur, wenn alle vier Karten da sind – mit „Ungelesen“ statt Mitgliederzahl oder mit
  // weniger Karten stehen sie gleich groß nebeneinander; bei „Klein“ als schmale Reihe ohne Grafiken.
  const bento = Boolean(members && events && shifts) && kpiSize !== "s";
  // Im Kachelraster stehen die Offenen Zahlungen als fünfte Kachel oben (Entwurf 4: Geld, das drängt, nicht weit unten) – nur,
  // solange weder sie noch die Kennzahlen über „Anpassen“ ausgeblendet sind. Sonst bleiben sie eine eigene Karte.
  const hiddenOverview = new Set(layout?.tabs.uebersicht?.hidden ?? []);
  const paymentsInKpis =
    bento &&
    payments !== null &&
    !hiddenOverview.has("zahlungen") &&
    !hiddenOverview.has("kennzahlen");

  // Die Karten je Reiter, die die Rolle sehen darf – Reihenfolge und Sichtbarkeit bestimmt danach die eigene Einstellung.
  const blocks: Record<DashboardTabId, Record<string, React.ReactNode>> = {
    uebersicht: {
      // „Erste Schritte“ nur für den Vereinsadministrator, solange noch etwas offen ist.
      ...(onboarding
        ? {
            "erste-schritte": (
              <OnboardingCard steps={onboarding} size={sizeOf("uebersicht", "erste-schritte")} />
            ),
          }
        : {}),
      kennzahlen: (
        <KpiCarousel
          layout={bento ? "bento" : "grid"}
          size={kpiSize}
          lastFromTablet={paymentsInKpis}
        >
          {members ? (
            <MembersStat members={members} size={bento ? "hero" : "regular"} density={kpiSize} />
          ) : (
            <StatCard
              density={kpiSize}
              label="Ungelesen"
              accent="blue" // Ungelesenes ist im ganzen Verein blau (Glocke, Punkt, „Neu“)
              value={notifications.unread}
              hint={notifications.unread === 1 ? "Benachrichtigung" : "Benachrichtigungen"}
              href="/benachrichtigungen"
              icon={<AREA_ICON.benachrichtigungen />}
            />
          )}
          {events && <NextEventsStat events={events} density={kpiSize} />}
          {/* Mit Zahlungen Spalte für Spalte (rechts der Stapel Helferplätze über Zahlungen), sonst Zeile für Zeile –
              Aufteilung in `modules/dashboard/kpi-layout.ts`. */}
          {shifts && paymentsInKpis && <HelperHours hours={shifts.hours} density={kpiSize} />}
          {shifts && <FreeShiftsStat shifts={shifts} density={kpiSize} />}
          {shifts && !paymentsInKpis && <HelperHours hours={shifts.hours} density={kpiSize} />}
          {paymentsInKpis && payments && <PaymentsTile payments={payments} />}
        </KpiCarousel>
      ),
      // Offene Zahlungen nur für Berechtigte (Vereinsadministrator, Vorstand) – vor „Für dich“, weil Fristen drängen.
      ...(payments
        ? {
            zahlungen: (
              <OpenPayments payments={payments} size={sizeOf("uebersicht", "zahlungen")} />
            ),
          }
        : {}),
      ...(tasks
        ? {
            aufgaben: (
              <MyTasks
                tasks={tasks}
                organizer={can(ctx, "tasks:manage")}
                size={sizeOf("uebersicht", "aufgaben")}
              />
            ),
          }
        : {}),
      ...(shifts
        ? { einsaetze: <MyShifts shifts={shifts} size={sizeOf("uebersicht", "einsaetze")} /> }
        : {}),
      benachrichtigungen: (
        <LatestNotifications
          notifications={notifications}
          size={sizeOf("uebersicht", "benachrichtigungen")}
        />
      ),
    },
    termine: {
      ...(events
        ? {
            veranstaltungen: (
              <UpcomingEvents events={events} size={sizeOf("termine", "veranstaltungen")} />
            ),
          }
        : {}),
      ...(shifts
        ? { schichten: <OpenShifts shifts={shifts} size={sizeOf("termine", "schichten")} /> }
        : {}),
      auswertungen: (
        <Suspense fallback={<AnalyticsSkeleton />}>
          <Analytics
            data={analytics}
            size={sizeOf("termine", "auswertungen")}
            topics={["events", "hours"]}
            description="Veranstaltungen und Helferstunden im Zeitverlauf"
          />
        </Suspense>
      ),
    },
    mitglieder: {
      ...(birthdays
        ? {
            geburtstage: (
              <Birthdays birthdays={birthdays} size={sizeOf("mitglieder", "geburtstage")} />
            ),
          }
        : {}),
      // Runde Mitgliedsjubiläen (Ehrungen) – nur, wer Mitglieder vereinsweit oder der eigenen Abteilungen sieht.
      ...(anniversaries
        ? {
            jubilaeen: (
              <Anniversaries
                anniversaries={anniversaries}
                size={sizeOf("mitglieder", "jubilaeen")}
              />
            ),
          }
        : {}),
      ...(members
        ? {
            auswertungen: (
              <Suspense fallback={<AnalyticsSkeleton />}>
                <Analytics
                  data={analytics}
                  size={sizeOf("mitglieder", "auswertungen")}
                  topics={["members"]}
                  description="Verteilung und Entwicklung der Mitglieder"
                />
              </Suspense>
            ),
          }
        : {}),
    },
    aktivitaet: {
      ...(activity
        ? {
            aktivitaet: (
              <RecentActivity entries={activity} size={sizeOf("aktivitaet", "aktivitaet")} />
            ),
          }
        : {}),
      ...(tasks
        ? {
            auswertungen: (
              <Suspense fallback={<AnalyticsSkeleton />}>
                <Analytics
                  data={analytics}
                  size={sizeOf("aktivitaet", "auswertungen")}
                  topics={["tasks"]}
                  description="Aufgaben nach Status"
                />
              </Suspense>
            ),
          }
        : {}),
    },
  };

  /** Inhalt eines Reiters: Karten in eigener Reihenfolge; Karten derselben Gruppe unter einer Überschrift. */
  function tabContent(tab: DashboardTabId) {
    const available = blocks[tab];
    const { shown: arranged } = arrangeBlocks(tab, Object.keys(available), layout?.tabs[tab]);
    // Steht „Offene Zahlungen“ schon im Kachelraster, als Karte darunter nur am Handy (dort fehlt die Kachel im Karussell) –
    // direkt nach den Kennzahlen.
    const inKpis = tab === "uebersicht" && paymentsInKpis;
    const shown = inKpis
      ? arranged.flatMap((id) =>
          id === "zahlungen" ? [] : id === "kennzahlen" ? [id, "zahlungen"] : [id],
        )
      : arranged;
    if (shown.length === 0) {
      return (
        <CompactEmpty card icon={<EyeOffIcon />} accent="slate" title="Alle Karten ausgeblendet">
          Über „Anpassen“ oben blendest du Karten dieses Bereichs wieder ein.
        </CompactEmpty>
      );
    }
    const seen = new Set<string>();
    const segments = segmentBlocks(tab, shown);
    // Eine einzelne Liste (z. B. Geburtstage) und die Auswertungen: ab 1280 px nebeneinander – Liste ein Drittel, Diagramm
    // zwei Drittel –, statt eine fast leere, breite Karte über einem Diagramm. Gibt es keine Auswertung (Rolle), wird der
    // Platz nicht leer gehalten (`has-[…:empty]`).
    // Steht eine der beiden auf „Groß“, bekommt jede die volle Breite.
    const pair =
      segments.length === 2 &&
      segments.some((segment) => segment.kind === "single" && segment.id === "auswertungen") &&
      segments.every((segment) => segment.kind === "single" || segment.ids.length === 1) &&
      shown.every((id) => sizeOf(tab, id) !== "l");
    return (
      <div
        className={cn(
          "grid gap-10",
          pair &&
            "xl:grid-cols-3 xl:items-start xl:gap-7 xl:has-[>[data-analytics]:empty]:grid-cols-1",
        )}
      >
        {segments.map((segment, index) => {
          if (segment.kind === "single") {
            const content = <Fragment key={segment.id}>{available[segment.id]}</Fragment>;
            return pair ? (
              // Oben bündig mit der Karte daneben (die steht unter einer Gruppenüberschrift)
              <div key={segment.id} data-analytics="" className="min-w-0 xl:col-span-2 xl:pt-9">
                {content}
              </div>
            ) : (
              content
            );
          }
          // Die erste Gruppe behält ihre bekannte Kennung (z. B. „g-fuer-dich“); kommt sie ein zweites Mal vor, eine eigene.
          const id = seen.has(segment.group) ? `g-${segment.group}-${index}` : `g-${segment.group}`;
          seen.add(segment.group);
          const group = (
            <Group key={`${segment.group}-${index}`} id={id} title={GROUP_TITLE[segment.group]}>
              <CardGrid
                items={segment.ids.map((blockId) => ({
                  id: blockId,
                  node: available[blockId],
                  wide: sizeOf(tab, blockId) === "l",
                }))}
              />
            </Group>
          );
          // Die Karte „Offene Zahlungen“ neben der Kachel im Raster: nur am Handy sichtbar (siehe oben)
          if (inKpis && segment.group === "finanzen") {
            return (
              <div key={`${segment.group}-${index}`} className="sm:hidden">
                {group}
              </div>
            );
          }
          return pair ? (
            <div key={`${segment.group}-${index}`} className="min-w-0">
              {group}
            </div>
          ) : (
            group
          );
        })}
      </div>
    );
  }

  const available = availableTabs(data);
  const shownTabs = DASHBOARD_TABS.filter((tab) => available.includes(tab.id));
  const tabs: DashboardTab[] = shownTabs.map((tab) => ({ ...tab, content: tabContent(tab.id) }));

  // Für das Fenster „Anpassen“: je Reiter die erlaubten Karten in der aktuellen Reihenfolge, mit Sichtbarkeit.
  const customize: CustomizeTab[] = shownTabs.map((tab) => {
    const prefs = layout?.tabs[tab.id];
    const hidden = new Set(prefs?.hidden ?? []);
    return {
      id: tab.id,
      label: tab.label,
      blocks: orderedBlocks(tab.id, Object.keys(blocks[tab.id]), prefs).map((id) => ({
        id,
        label: blockLabel(tab.id, id),
        visible: !hidden.has(id),
        size: blockSize(prefs, id),
      })),
    };
  });

  return (
    <PageStack>
      {/* Wer hier ankommt, ist nicht (mehr) in der Einrichtung – steht noch deren Rahmen, wird er ersetzt. */}
      <SetupFrameSync locked={false} />
      <PageHeader
        inline
        align="center"
        title={`Willkommen, ${ctx.user.firstName}`}
        // Seit 17.10.2026 (Entwurf 4) etwas kleiner als zuvor und ohne Schild: Rolle und Datum als ruhige Zeile darunter – wie die
        // Untertitel der übrigen Seiten.
        titleClassName="text-3xl font-bold tracking-[-0.025em] sm:text-4xl"
        description={
          <>
            <span>{ctx.roleName}</span>
            <span aria-hidden="true"> · </span>
            <span className="sr-only">, </span>
            {formatDateLong(new Date())}
          </>
        }
        // Am Handy: die Hauptaktion über die volle Breite, die übrigen gleich breit daneben – statt eines Umbruchs irgendwo.
        actionsClassName="max-sm:grid max-sm:grid-cols-2 max-sm:[&>*]:w-full max-sm:[&>*:first-child:nth-last-child(odd)]:col-span-2"
        actions={
          <>
            {/* Hauptaktion zuerst (links, am Handy oben) – wie auf den übrigen Seiten. */}
            {can(ctx, "events:create") && (
              <Button asChild>
                <Link href="/veranstaltungen/neu">
                  <PlusIcon /> Neue Veranstaltung
                </Link>
              </Button>
            )}
            {can(ctx, "members:create") && (
              <Button asChild variant="outline">
                <Link href="/mitglieder/neu">
                  <PlusIcon /> Neues Mitglied
                </Link>
              </Button>
            )}
            {!can(ctx, "events:create") && can(ctx, "events:read") && (
              <Button asChild variant="outline">
                <Link href="/kalender">
                  <AREA_ICON.kalender /> Kalender
                </Link>
              </Button>
            )}
            <CustomizeDashboard tabs={customize} />
          </>
        }
      />

      {/* Der Hinweis auf unbesetzte Schichten steht über den Reitern: Wichtiges soll nicht hinter einem Reiter verschwinden. */}
      {shifts && <StaffingWarnings warnings={shifts.warnings} />}

      <DashboardTabs tabs={tabs} initial={resolveTab(param(params, "tab"), available)} />
    </PageStack>
  );
}
