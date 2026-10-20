import { Fragment, Suspense } from "react";
import type { Metadata } from "next";
import Link from "next/link";
import { ChartColumnIcon, EyeOffIcon, PlusIcon } from "lucide-react";
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
  FreeShiftsTile,
  HelperHours,
  HelperHoursChart,
  MembersHero,
  MembersStat,
  NextEventsStat,
  NextEventsTile,
  PaymentsTile,
  StatCard,
  TasksTile,
} from "@/modules/dashboard/components/kpi-stats";
import {
  CustomizeDashboard,
  type CustomizeTab,
} from "@/modules/dashboard/components/customize-dashboard";
import { DashboardTabs, type DashboardTab } from "@/modules/dashboard/components/dashboard-tabs";
import { KpiCarousel } from "@/modules/dashboard/components/kpi-carousel";
import { OnboardingCard } from "@/modules/dashboard/components/onboarding-card";
import { Entrance } from "@/modules/dashboard/components/entrance";
import { CardGrid, Group, StudioFrame } from "@/modules/dashboard/components/layout";
import { SOFT_CARD_SURFACE } from "@/components/ui/surface";
import {
  Anniversaries,
  Birthdays,
  LatestNotifications,
  MyShifts,
  MyTasks,
  OpenPayments,
  OpenShifts,
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

/** Gruß nach der Tageszeit in Deutschland (wie „Good morning“ der Vorlage „Vertix“). */
function greeting(now: Date): string {
  const hour = Number(
    new Intl.DateTimeFormat("de-DE", {
      hour: "numeric",
      hourCycle: "h23",
      timeZone: "Europe/Berlin",
    }).format(now),
  );
  if (hour >= 5 && hour < 11) return "Guten Morgen";
  if (hour >= 11 && hour < 18) return "Guten Tag";
  return "Guten Abend";
}

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
  // Große Fassung der Kennzahlen (seit 18.10.2026 Stil der Vorlage „Vertix“ in VereinsFlow-Blau): nur, wenn Mitglieder, Termine
  // und Schichten da sind und die Kennzahlen nicht auf „Klein“ stehen – sonst gleich große Farbkarten im einfachen Raster (mit
  // „Ungelesen“ statt Mitgliederzahl, oder als schmale Reihe ohne Grafiken).
  const studio = Boolean(members && events && shifts) && kpiSize !== "s";
  // Die Summe der offenen Zahlungen steht als erste (blaue) Kachel im Viererblock – nur, solange sie nicht über „Anpassen“
  // ausgeblendet sind. Die Karte mit den einzelnen Rechnungen (und „Bezahlt“) bleibt weiter unten.
  const hiddenOverview = new Set(layout?.tabs.uebersicht?.hidden ?? []);
  const paymentsTile = studio && payments !== null && !hiddenOverview.has("zahlungen");
  const organizer = can(ctx, "tasks:manage");

  // Große Fassung (wie die Vorlage): links die Mitglieder-Karte, in der Mitte vier Kacheln in einer Karte (die erste blau), rechts
  // die Helferstunden. Gemessen wird die Breite des Reiters: ab 66 rem drei Spalten, ab 40 rem zwei (Stunden darunter über die
  // ganze Breite), am Handy alles untereinander.
  // Je Kachel: Schlüssel und Inhalt (`hot`: die erste ist blau).
  const tiles: { key: string; render: (hot: boolean) => React.ReactNode }[] =
    studio && events && shifts
      ? [
          ...(paymentsTile && payments
            ? [
                {
                  key: "zahlungen",
                  render: (hot: boolean) => (
                    <PaymentsTile payments={payments} size={kpiSize} hot={hot} />
                  ),
                },
              ]
            : []),
          {
            key: "termine",
            render: (hot: boolean) => <NextEventsTile events={events} size={kpiSize} hot={hot} />,
          },
          ...(tasks
            ? [
                {
                  key: "aufgaben",
                  render: (hot: boolean) => (
                    <TasksTile tasks={tasks} organizer={organizer} size={kpiSize} hot={hot} />
                  ),
                },
              ]
            : []),
          {
            key: "plaetze",
            render: (hot: boolean) => <FreeShiftsTile shifts={shifts} size={kpiSize} hot={hot} />,
          },
        ]
      : [];
  const studioTop =
    studio && members && shifts ? (
      <div
        role="group"
        aria-label="Kennzahlen"
        className="grid gap-4 @[40rem]/studio:grid-cols-2 @[66rem]/studio:grid-cols-[minmax(0,1.05fr)_minmax(0,1.25fr)_minmax(0,1.1fr)]"
      >
        <Entrance index={0} className="[&>*]:h-full">
          <MembersHero
            members={members}
            size={kpiSize}
            actions={[
              { href: "/mitglieder", label: "Alle Mitglieder", icon: <AREA_ICON.mitglieder /> },
              ...(can(ctx, "members:read")
                ? [{ href: "/mitglieder/statistik", label: "Statistik", icon: <ChartColumnIcon /> }]
                : []),
            ]}
          />
        </Entrance>
        <Entrance index={1} className="[&>*]:h-full">
          <div
            data-kpi-tiles=""
            className={cn(SOFT_CARD_SURFACE, "grid grid-cols-2 gap-2.5 p-2.5")}
          >
            {tiles.map((tile, index) => (
              <div
                key={tile.key}
                className={cn(
                  "min-w-0 [&>*]:h-full",
                  tiles.length % 2 === 1 && index === tiles.length - 1 && "col-span-2",
                )}
              >
                {tile.render(index === 0)}
              </div>
            ))}
          </div>
        </Entrance>
        <Entrance
          index={2}
          className="@[40rem]/studio:col-span-2 @[66rem]/studio:col-span-1 [&>*]:h-full"
        >
          <HelperHoursChart hours={shifts.hours} size={kpiSize} />
        </Entrance>
      </div>
    ) : null;

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
      // In der großen Fassung ordnet `StudioFrame` die Kennzahlen an (siehe `tabContent`); hier steht dann nur das Paar oben.
      kennzahlen: studioTop ?? (
        <KpiCarousel size={kpiSize}>
          {members ? (
            <MembersStat members={members} density={kpiSize} />
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
          {shifts && <FreeShiftsStat shifts={shifts} density={kpiSize} />}
          {shifts && <HelperHours hours={shifts.hours} density={kpiSize} />}
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
                organizer={organizer}
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
    const shown = arranged;
    if (shown.length === 0) {
      return (
        <CompactEmpty card icon={<EyeOffIcon />} accent="slate" title="Alle Karten ausgeblendet">
          Über „Anpassen“ oben blendest du Karten dieses Bereichs wieder ein.
        </CompactEmpty>
      );
    }
    // Große Fassung der Übersicht: Die Kennzahlen stehen über die ganze Breite, die übrigen Karten davor und danach.
    const at = shown.indexOf("kennzahlen");
    if (tab === "uebersicht" && studioTop && at >= 0) {
      const before = shown.slice(0, at);
      const after = shown.slice(at + 1);
      // Gemeinsam für beide Seiten: Steht „Für dich“ vor und nach den Kennzahlen, bekommt die zweite Gruppe eine eigene Kennung.
      const seen = new Set<string>();
      return (
        <StudioFrame
          before={before.length > 0 ? renderBlocks(tab, before, true, seen) : null}
          top={studioTop}
          after={after.length > 0 ? renderBlocks(tab, after, true, seen) : null}
          size={kpiSize}
        />
      );
    }
    return renderBlocks(tab, shown);
  }

  /** Karten in der angegebenen Reihenfolge; aufeinanderfolgende Karten derselben Gruppe unter einer Überschrift. */
  function renderBlocks(
    tab: DashboardTabId,
    shown: string[],
    inStudio = false,
    seen = new Set<string>(),
  ) {
    const available = blocks[tab];
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
          // `grid-cols-1` (= minmax(0, 1fr)): Die Karten dürfen schmaler werden als ihr Inhalt es von selbst wäre – neben der
          // Spalte der Kennzahlen ist weniger Platz.
          "grid grid-cols-1 gap-10",
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
          // Die erste Gruppe behält ihre bekannte Kennung (z. B. „g-fuer-dich“); kommt sie ein zweites Mal vor, eine eigene
          // (an ihrer ersten Karte festgemacht – jede Karte gibt es je Reiter nur einmal, auch über beide Seiten der Kennzahlen).
          const id = seen.has(segment.group)
            ? `g-${segment.group}-${segment.ids[0]}`
            : `g-${segment.group}`;
          seen.add(segment.group);
          const group = (
            <Group key={`${segment.group}-${index}`} id={id} title={GROUP_TITLE[segment.group]}>
              <CardGrid
                items={segment.ids.map((blockId) => ({
                  id: blockId,
                  node: available[blockId],
                  // Unter den Kennzahlen steht „Meine Aufgaben“ über die volle Breite (wie die Liste der Vorlage), außer man hat
                  // sie auf „Klein“ gestellt.
                  wide:
                    sizeOf(tab, blockId) === "l" ||
                    (inStudio && blockId === "aufgaben" && sizeOf(tab, blockId) !== "s"),
                }))}
              />
            </Group>
          );
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
        title={`${greeting(new Date())}, ${ctx.user.firstName}`}
        // Wie die Überschrift der Vorlage „Vertix“: groß, aber nicht fett; Rolle und Datum als ruhige Zeile darunter.
        titleClassName="text-3xl font-semibold tracking-[-0.025em] sm:text-[2.5rem]"
        description={
          <>
            <span>{ctx.roleName}</span>
            <span aria-hidden="true"> · </span>
            <span className="sr-only">, </span>
            {formatDateLong(new Date())}
          </>
        }
        // Am Handy: die Hauptaktion über die volle Breite, die übrigen gleich breit daneben – statt eines Umbruchs irgendwo.
        // Runde Knöpfe wie in der Vorlage (nur auf dem Dashboard).
        actionsClassName="*:rounded-full max-sm:grid max-sm:grid-cols-2 max-sm:[&>*]:w-full max-sm:[&>*:first-child:nth-last-child(odd)]:col-span-2"
        actions={
          <>
            {/* Hauptaktion zuerst (links, am Handy oben) – wie auf den übrigen Seiten; mit leichtem Schein in der Markenfarbe. */}
            {can(ctx, "events:create") && (
              <Button
                asChild
                className="shadow-[0_10px_22px_-12px_var(--color-primary)] hover:shadow-[0_12px_26px_-12px_var(--color-primary)]"
              >
                <Link href="/veranstaltungen/neu">
                  <PlusIcon /> Neue Veranstaltung
                </Link>
              </Button>
            )}
            {/* Grün mit demselben leichten Schein wie die Hauptaktion (Wunsch Luis, 20.10.2026). */}
            {can(ctx, "members:create") && (
              <Button
                asChild
                variant="success"
                className="shadow-[0_10px_22px_-12px_var(--color-success)] hover:shadow-[0_12px_26px_-12px_var(--color-success)]"
              >
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
